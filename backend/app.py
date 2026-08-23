from __future__ import annotations
import asyncio
import json
import os
import sys
import time
import uuid
import traceback
from contextlib import asynccontextmanager
from enum import Enum
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from dotenv import load_dotenv
load_dotenv()

import google.generativeai as genai

key = os.environ.get("GEMINI_API_KEY")
if key:
    genai.configure(api_key=key)

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import select

# Local pipeline imports
sys.path.insert(0, str(Path(__file__).parent.parent / "pipeline"))
from uom_normalizer import normalize_spec_dict
from taxonomy_engine import classify as classify_taxonomy
from rag_engine import find_related
from vision_parser import parse_pdf
from backend.db import create_db_and_tables, get_session, Job as DBJob
from batch_enricher import (
    parse_input_csv, enrich_row_async, rows_to_csv_bytes,
    _configure_genai as _batch_configure_genai, OUTPUT_HEADERS
)

# Global Semaphore to prevent LLM rate limiting (Upgrade 4)
LLM_SEMAPHORE = asyncio.Semaphore(3)

# In-memory store for batch jobs: job_id -> {status, total, done, rows, stream_queue}
_BATCH_JOBS: dict[str, dict] = {}

UPLOAD_DIR = Path("/tmp/unihack_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class PhaseStatus(str, Enum):
    PENDING    = "pending"
    RUNNING    = "running"
    COMPLETE   = "complete"
    ERROR      = "error"
    SKIPPED    = "skipped"

class JobStatus(str, Enum):
    QUEUED     = "queued"
    PROCESSING = "processing"
    COMPLETE   = "complete"
    FAILED     = "failed"

PHASE_LABELS = {
    1: "Raw Data Extraction",
    2: "Graph RAG Enrichment",
    3: "Content Synthesis",
    4: "Compliance Audit",
    5: "PIM Export Formatting",
}

class JobStreamManager:
    """Manages the in-memory asyncio Queue for SSE streaming"""
    def __init__(self, job_id: str):
        self.job_id = job_id
        self._events = asyncio.Queue()
        
    def push_event(self, event: dict):
        self._events.put_nowait(event)
        
    async def event_stream(self) -> AsyncGenerator[str, None]:
        while True:
            try:
                event = await asyncio.wait_for(self._events.get(), timeout=30.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("complete", "error"):
                    break
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"

_STREAMS: dict[str, JobStreamManager] = {}

async def _phase_update(job_id: str, phase_num: int, status: PhaseStatus, progress: int, message: str = "", result: Any = None):
    # Persist state to SQLite (Upgrade 3)
    with get_session() as session:
        db_job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
        if db_job:
            phases = json.loads(db_job.phases_json)
            phases[str(phase_num)]["status"] = status.value
            phases[str(phase_num)]["progress"] = progress
            phases[str(phase_num)]["message"] = message
            if result is not None:
                phases[str(phase_num)]["result"] = result
            db_job.phases_json = json.dumps(phases)
            db_job.updated_at = time.time()
            session.add(db_job)
            session.commit()
    
    # Push live event to in-memory stream for SSE clients
    if job_id in _STREAMS:
        event = {
            "type": "phase_update", "job_id": job_id, "phase": phase_num, "label": PHASE_LABELS[phase_num],
            "status": status.value, "progress": progress, "message": message, "timestamp": time.time(),
        }
        _STREAMS[job_id].push_event(event)


async def _run_phase1(job_id: str, payload: dict) -> dict:
    await _phase_update(job_id, 1, PhaseStatus.RUNNING, 10, "Parsing raw input…")
    raw_text = payload.get("product_name", "") + " " + payload.get("description", "")
    specs_raw = {k: str(v) for k, v in payload.items() if k not in ("product_name", "description", "file_content") and isinstance(v, (str, int, float))}
    
    if "file_content" in payload:
        import re
        text = payload["file_content"]
        for m in re.finditer(r'^([A-Za-z][A-Za-z\s/()]{2,40})[\s]*[:\-–]\s*(.+)$', text, re.MULTILINE):
            key, val = m.group(1).strip(), m.group(2).strip()
            if len(val) < 200: specs_raw[key] = val
            
    await _phase_update(job_id, 1, PhaseStatus.RUNNING, 60, "Normalizing UOMs…")
    normalized_specs = normalize_spec_dict(specs_raw)
    
    result = {"raw_text": raw_text, "specs_raw": specs_raw, "normalized_specs": normalized_specs, "attribute_count": len(specs_raw)}
    await _phase_update(job_id, 1, PhaseStatus.COMPLETE, 100, "Extraction complete.", result)
    return result


async def _run_phase2(job_id: str, phase1: dict) -> dict:
    await _phase_update(job_id, 2, PhaseStatus.RUNNING, 10, "Running taxonomy classification…")
    product_text = phase1["raw_text"]
    spec_text = {k: v["raw_text"] if isinstance(v, dict) else str(v) for k, v in phase1["specs_raw"].items()}
    
    async with LLM_SEMAPHORE:
        taxonomy = classify_taxonomy(product_text, spec_text, api_key=os.environ.get("GEMINI_API_KEY"))
    
    await _phase_update(job_id, 2, PhaseStatus.RUNNING, 60, "Building entity relationships from ChromaDB…")
    # Upgrade 1: Real RAG Search
    related_parts = find_related(product_text, phase1["specs_raw"])
    
    result = {"taxonomy": taxonomy.to_dict(), "related_parts": related_parts}
    await _phase_update(job_id, 2, PhaseStatus.COMPLETE, 100, "Graph RAG complete.", result)
    return result


async def _run_phase3(job_id: str, phase1: dict, phase2: dict) -> dict:
    await _phase_update(job_id, 3, PhaseStatus.RUNNING, 10, "Synthesizing product content…")
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
    
    specs_summary = "\n".join(f"  {k}: {v['dual_label'] if isinstance(v, dict) and 'dual_label' in v else v}" for k, v in phase1["normalized_specs"].items())
    taxonomy_name = phase2["taxonomy"].get("unspsc", {}).get("commodity_name", "") or phase2["taxonomy"].get("etim", {}).get("class_name", "")
    
    prompt = f"""You are a technical content writer for an industrial B2B catalog.
Product: {phase1['raw_text']}
UNSPSC Class: {taxonomy_name}
Specifications:
{specs_summary}

Generate a JSON object with:
{{
  "short_title":    "<concise 5–8 word product title>",
  "meta_title":     "<SEO title ≤60 chars>",
  "short_desc":     "<1–2 sentence product overview>",
  "long_desc":      "<rich 80–120 word B2B catalog description>",
  "feature_bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "search_keywords": ["<kw1>", "<kw2>", "<kw3>"]
}}
Return ONLY the JSON, no prose."""
    
    await _phase_update(job_id, 3, PhaseStatus.RUNNING, 40, "Calling content LLM…")
    try:
        model = genai.GenerativeModel("gemini-3.6-flash")
        async with LLM_SEMAPHORE:
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
        content = json.loads(response.text.strip())
    except Exception as e:
        content = {"error": str(e)}
        
    await _phase_update(job_id, 3, PhaseStatus.COMPLETE, 100, "Content synthesis complete.", content)
    return content


async def _run_phase4(job_id: str, phase1: dict) -> dict:
    await _phase_update(job_id, 4, PhaseStatus.RUNNING, 20, "Running intelligent compliance checks…")
    
    prompt = f"""You are an industrial compliance auditor. Analyze the following specs and determine compliance for RoHS 3, REACH, CE Marking, and PED 2014/68/EU.
Specs: {json.dumps(phase1.get("specs_raw", {}))}
Understand context: e.g. "lead-free solder" should PASS RoHS.
Return ONLY structured JSON:
{{
  "flags": [
    {{ "standard": "<name>", "status": "PASS|FAIL|REVIEW|EXEMPT|APPLICABLE", "note": "<reason>", "confidence": 0.95 }}
  ],
  "overall_status": "PASS|REVIEW|FAIL"
}}"""
    try:
        model = genai.GenerativeModel("gemini-3.6-flash")
        async with LLM_SEMAPHORE:
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
        result = json.loads(response.text.strip())
    except Exception as e:
        result = {"flags": [], "overall_status": "REVIEW", "error": str(e)}

    result["audit_timestamp"] = time.time()
    await _phase_update(job_id, 4, PhaseStatus.COMPLETE, 100, "Compliance audit complete.", result)
    return result


async def _run_phase5(job_id: str, p1: dict, p2: dict, p3: dict, p4: dict) -> dict:
    await _phase_update(job_id, 5, PhaseStatus.RUNNING, 30, "Formatting PIM payload…")
    taxonomy = p2.get("taxonomy", {})
    unspsc = taxonomy.get("unspsc") or {}
    etim = taxonomy.get("etim") or {}
    
    pim = {
        "schema_version": "2.0.0", "export_timestamp": time.time(),
        "product": {
            "id": f"PROD-{job_id[:8].upper()}", "short_title": p3.get("short_title", ""),
            "meta_title": p3.get("meta_title", ""), "short_desc": p3.get("short_desc", ""),
            "long_desc": p3.get("long_desc", ""), "feature_bullets": p3.get("feature_bullets", []),
            "search_keywords": p3.get("search_keywords", []),
        },
        "classification": {"unspsc": unspsc, "etim": etim},
        "specifications": {"raw": p1.get("specs_raw", {}), "normalized": p1.get("normalized_specs", {})},
        "related_parts": p2.get("related_parts", []), "compliance": p4, "quality": {"overall_confidence": taxonomy.get("overall_confidence", 0)}
    }
    await _phase_update(job_id, 5, PhaseStatus.COMPLETE, 100, "PIM export ready.", pim)
    return pim


async def _run_pipeline(job_id: str, payload: dict):
    with get_session() as session:
        db_job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
        if not db_job: return
        db_job.status = JobStatus.PROCESSING.value
        session.add(db_job)
        session.commit()
    
    if job_id in _STREAMS:
        _STREAMS[job_id].push_event({"type": "started", "job_id": job_id, "timestamp": time.time()})
        
    try:
        p1 = await _run_phase1(job_id, payload)
        p2 = await _run_phase2(job_id, p1)
        p3 = await _run_phase3(job_id, p1, p2)
        p4 = await _run_phase4(job_id, p1)
        p5 = await _run_phase5(job_id, p1, p2, p3, p4)
        
        with get_session() as session:
            db_job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
            db_job.result_json = json.dumps(p5)
            db_job.status = JobStatus.COMPLETE.value
            session.add(db_job)
            session.commit()
        
        if job_id in _STREAMS:
            _STREAMS[job_id].push_event({"type": "complete", "job_id": job_id, "timestamp": time.time(), "result_summary": {"confidence": p5["quality"]["overall_confidence"]}})
    except Exception as exc:
        with get_session() as session:
            db_job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
            db_job.status = JobStatus.FAILED.value
            db_job.error = traceback.format_exc()
            session.add(db_job)
            session.commit()
        if job_id in _STREAMS:
            _STREAMS[job_id].push_event({"type": "error", "job_id": job_id, "message": str(exc), "timestamp": time.time()})


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    print("UniHack 2026 Pipeline API ready")
    yield
    print("Shutting down")

app = FastAPI(title="UniHack 2026", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class ProcessJsonRequest(BaseModel):
    product_name: str
    description: str = ""
    specs: dict[str, Any] = Field(default_factory=dict)

def _init_db_job(job_id: str, payload: dict):
    phases = {str(i): {"phase": i, "label": PHASE_LABELS[i], "status": PhaseStatus.PENDING.value, "progress": 0, "message": "", "result": None} for i in range(1, 6)}
    job = DBJob(job_id=job_id, status=JobStatus.QUEUED.value, created_at=time.time(), updated_at=time.time(), payload_json=json.dumps(payload), phases_json=json.dumps(phases))
    with get_session() as session:
        session.add(job)
        session.commit()
    _STREAMS[job_id] = JobStreamManager(job_id)

@app.post("/api/pipeline/process")
async def process_json(req: ProcessJsonRequest, bt: BackgroundTasks):
    job_id = str(uuid.uuid4())
    payload = {"product_name": req.product_name, "description": req.description, **req.specs}
    _init_db_job(job_id, payload)
    bt.add_task(_run_pipeline, job_id, payload)
    return {"job_id": job_id, "status": "queued"}

@app.post("/api/pipeline/process/upload")
async def process_upload(bt: BackgroundTasks, file: UploadFile = File(...), product_name: str = Form("")):
    content = await file.read()
    ext = Path(file.filename or "up").suffix.lower()
    
    payload = {"product_name": product_name or Path(file.filename or "").stem}
    if ext == ".pdf":
        payload.update(parse_pdf(content))  # Upgrade 2: Vision Parser
    elif ext == ".json":
        try: payload.update(json.loads(content))
        except: payload["file_content"] = content.decode(errors="replace")
    else:
        payload["file_content"] = content.decode(errors="replace")
        
    job_id = str(uuid.uuid4())
    _init_db_job(job_id, payload)
    bt.add_task(_run_pipeline, job_id, payload)
    return {"job_id": job_id, "status": "queued", "filename": file.filename}

@app.get("/api/pipeline/stream/{job_id}")
async def stream_progress(job_id: str, request: Request):
    if job_id not in _STREAMS:
        with get_session() as session:
            db_job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
            if not db_job: raise HTTPException(404)
            if db_job.status in (JobStatus.COMPLETE.value, JobStatus.FAILED.value):
                async def _done(): yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                return StreamingResponse(_done(), media_type="text/event-stream")
        _STREAMS[job_id] = JobStreamManager(job_id)

    async def _generator():
        async for chunk in _STREAMS[job_id].event_stream():
            if await request.is_disconnected(): break
            yield chunk
            
    return StreamingResponse(_generator(), media_type="text/event-stream")

@app.get("/api/pipeline/results/{job_id}")
async def get_results(job_id: str):
    with get_session() as session:
        job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
        if not job: raise HTTPException(404)
        if job.status == JobStatus.FAILED.value: raise HTTPException(500, detail={"error": job.error})
        if job.status != JobStatus.COMPLETE.value: raise HTTPException(202, detail={"status": job.status, "phases": json.loads(job.phases_json)})
        return JSONResponse(json.loads(job.result_json))

@app.get("/api/pipeline/jobs")
async def list_jobs():
    with get_session() as session:
        jobs = session.exec(select(DBJob)).all()
        return [{"job_id": j.job_id, "status": j.status, "created_at": j.created_at, "updated_at": j.updated_at, "phases": list(json.loads(j.phases_json).values())} for j in sorted(jobs, key=lambda x: x.created_at, reverse=True)]

@app.get("/api/pipeline/jobs/history")
async def list_jobs_history(offset: int = Query(0), limit: int = Query(50)):
    with get_session() as session:
        jobs = session.exec(select(DBJob).order_by(DBJob.created_at.desc()).offset(offset).limit(limit)).all()
        return [{"job_id": j.job_id, "status": j.status, "created_at": j.created_at, "updated_at": j.updated_at} for j in jobs]

@app.delete("/api/pipeline/jobs/{job_id}")
async def delete_job(job_id: str):
    with get_session() as session:
        job = session.exec(select(DBJob).where(DBJob.job_id == job_id)).first()
        if job:
            session.delete(job)
            session.commit()
    if job_id in _STREAMS: del _STREAMS[job_id]

class ChatRequest(BaseModel):
    job_id: str
    message: str

@app.post("/api/chat")
async def chat_with_data(req: ChatRequest):
    with get_session() as session:
        job = session.exec(select(DBJob).where(DBJob.job_id == req.job_id)).first()
        if not job or not job.result_json:
            raise HTTPException(status_code=400, detail="Job not found or not complete.")
        
        pim_data = json.loads(job.result_json)
        
    prompt = f"""You are a helpful Data Copilot for an industrial PIM system.
The user is asking a question about the following product data:
{json.dumps(pim_data, indent=2)[:8000]}  # Trim to avoid max context if too huge, though Gemini handles large contexts well

User Question: {req.message}

Answer concisely, accurately, and politely based on the product data provided above. Use Markdown formatting. If the data does not contain the answer, say so."""
    
    try:
        # Use dedicated Copilot key if available, else fall back to main key
        copilot_key = os.environ.get("GEMINI_COPILOT_API_KEY") or os.environ.get("GEMINI_API_KEY")
        
        import google.generativeai as _genai
        _genai.configure(api_key=copilot_key)
        
        # Use gemini-3.6-flash for Copilot — much higher free-tier quota
        model = _genai.GenerativeModel("gemini-3.6-flash")
        async with LLM_SEMAPHORE:
            response = await asyncio.to_thread(model.generate_content, prompt)
            
        return {"answer": response.text.strip()}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    with get_session() as session:
        count = len(session.exec(select(DBJob)).all())
    return {"status": "ok", "jobs": count, "gemini_key_set": bool(os.environ.get("GEMINI_API_KEY"))}


# ─────────────────────────────────────────────────────────────────────────────
# BATCH ENRICHMENT ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

async def _run_batch_job(batch_id: str, input_rows: list, api_key: str):
    """Background coroutine: enriches each row and streams progress events."""
    job = _BATCH_JOBS[batch_id]
    primary_key = api_key or os.environ.get("GEMINI_API_KEY", "")
    fallback_key = os.environ.get("GEMINI_COPILOT_API_KEY", "")
    current_key = primary_key
    model = _batch_configure_genai(current_key)
    
    # Semaphore: 1 parallel call to respect free-tier rate limits
    sem = asyncio.Semaphore(1)
    output_rows = []
    errors = []

    for idx, row in enumerate(input_rows):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                enriched = await enrich_row_async(row, model=model, semaphore=sem)
                output_rows.append(enriched)
                job["done"] = idx + 1
                job["last_row"] = {
                    k: enriched.get(k, "") for k in
                    ["Mfg_Part_Num", "Part_Desc", "MANUFACTURER_NAME", "BRAND_NAME",
                     "Classpath", "SHORT_DESC", "INVOICE_DESC"]
                }
                if job["queue"]:
                    job["queue"].put_nowait({"type": "progress", "done": idx + 1,
                                              "total": job["total"], "row": job["last_row"]})
                # Free tier is 15 RPM, so sleep 4.1 seconds between requests
                await asyncio.sleep(4.1)
                break
            except Exception as e:
                err_str = str(e)
                print(f"ERROR ON ROW {idx} ATTEMPT {attempt}: {err_str}")
                if "Quota exceeded" in err_str or "429" in err_str:
                    if current_key == primary_key and fallback_key:
                        print("Primary key quota exceeded! Switching to fallback key...")
                        current_key = fallback_key
                        model = _batch_configure_genai(current_key)
                        await asyncio.sleep(2)
                        continue
                
                if attempt == max_retries - 1:
                    if "Quota exceeded" in err_str or "429" in err_str:
                        print("Both keys out of quota! Using mock fallback row...")
                        enriched = {
                            "Mfg_Part_Num": row.get("Mfg_Part_Num", "MOCK-123"),
                            "Part_Desc": row.get("Part_Desc", "Mock Description"),
                            "MANUFACTURER_NAME": "Mock Manuf (Quota Reached)",
                            "BRAND_NAME": "Mock Brand",
                            "Classpath": "Mock>Category>Path",
                            "SHORT_DESC": "Mock short description due to API quota limits.",
                            "INVOICE_DESC": "MOCK INVOICE DESC",
                        }
                        from pipeline.batch_enricher import OUTPUT_HEADERS
                        for h in OUTPUT_HEADERS:
                            if h not in enriched:
                                enriched[h] = ""
                        output_rows.append(enriched)
                        job["done"] = idx + 1
                        job["last_row"] = enriched
                        job["mock_used"] = True
                        if job["queue"]:
                            job["queue"].put_nowait({"type": "progress", "done": idx + 1, "total": job["total"], "row": job["last_row"], "mock_used": True})
                    else:
                        errors.append({"row": idx, "error": err_str})
                        job["done"] = idx + 1
                else:
                    await asyncio.sleep(10)  # wait 10s and retry

    job["status"] = "complete"
    job["csv_bytes"] = rows_to_csv_bytes(output_rows)
    job["errors"] = errors
    if job["queue"]:
        job["queue"].put_nowait({"type": "complete", "done": job["done"],
                                  "total": job["total"], "errors": len(errors)})


@app.post("/api/batch/process")
async def batch_process(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a CSV file and start batch enrichment job."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    file_bytes = await file.read()
    input_rows = parse_input_csv(file_bytes)
    if not input_rows:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no valid rows.")

    batch_id = str(uuid.uuid4())
    _BATCH_JOBS[batch_id] = {
        "status": "processing",
        "total": len(input_rows),
        "done": 0,
        "last_row": {},
        "csv_bytes": None,
        "errors": [],
        "queue": asyncio.Queue(),
    }

    api_key = os.environ.get("GEMINI_API_KEY", "")
    background_tasks.add_task(_run_batch_job, batch_id, input_rows, api_key)
    return {"batch_id": batch_id, "total": len(input_rows)}


@app.get("/api/batch/stream/{batch_id}")
async def batch_stream(batch_id: str):
    """SSE endpoint streaming live progress for a batch job."""
    job = _BATCH_JOBS.get(batch_id)
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found.")

    async def event_generator():
        q = job["queue"]
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=60.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("complete", "error"):
                    break
            except asyncio.TimeoutError:
                # Send heartbeat
                yield f"data: {json.dumps({'type': 'heartbeat', 'done': job['done'], 'total': job['total']})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                              headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/batch/status/{batch_id}")
async def batch_status(batch_id: str):
    """Poll-based status check for a batch job."""
    job = _BATCH_JOBS.get(batch_id)
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found.")
    return {
        "status": job["status"],
        "total": job["total"],
        "done": job["done"],
        "last_row": job.get("last_row", {}),
        "errors": len(job.get("errors", [])),
        "ready": job["csv_bytes"] is not None,
        "mock_used": job.get("mock_used", False)
    }


@app.get("/api/batch/download/{batch_id}")
async def batch_download(batch_id: str):
    """Download the enriched CSV for a completed batch job."""
    job = _BATCH_JOBS.get(batch_id)
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found.")
    if job["csv_bytes"] is None:
        raise HTTPException(status_code=202, detail="Job still processing.")

    return StreamingResponse(
        iter([job["csv_bytes"]]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="enriched_output_{batch_id[:8]}.csv"'},
    )

