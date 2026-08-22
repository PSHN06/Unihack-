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

# Global Semaphore to prevent LLM rate limiting (Upgrade 4)
LLM_SEMAPHORE = asyncio.Semaphore(3)

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
