"""
backend/app.py
--------------
FastAPI middleware layer for the UniHack 2026 AI-Powered Product Intelligence Pipeline.

Endpoints:
  POST /api/pipeline/process           – Submit file/JSON for processing
  GET  /api/pipeline/stream/{job_id}   – SSE live phase progress stream
  GET  /api/pipeline/results/{job_id}  – Full enriched PIM JSON
  GET  /api/pipeline/jobs              – List all jobs + statuses
  DELETE /api/pipeline/jobs/{job_id}   – Cancel/remove a job

Run with:
  uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
"""

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

import google.generativeai as genai
from fastapi import (
    BackgroundTasks, FastAPI, File, Form, HTTPException,
    Request, UploadFile, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# Add pipeline directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "pipeline"))

from uom_normalizer   import normalize_spec_dict
from taxonomy_engine  import classify as classify_taxonomy

# ─────────────────────────────────────────────
# 1. CONFIG & STARTUP
# ─────────────────────────────────────────────

UPLOAD_DIR = Path("/tmp/unihack_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024   # 20 MB

# ─────────────────────────────────────────────
# 2. JOB STORE  (in-memory; swap for Redis in prod)
# ─────────────────────────────────────────────

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

class JobRecord:
    def __init__(self, job_id: str, payload: dict):
        self.job_id     = job_id
        self.payload    = payload
        self.status     = JobStatus.QUEUED
        self.created_at = time.time()
        self.updated_at = time.time()
        self.phases: dict[int, dict] = {
            i: {"phase": i, "label": PHASE_LABELS[i],
                "status": PhaseStatus.PENDING, "progress": 0,
                "message": "", "result": None}
            for i in range(1, 6)
        }
        self.result:   Optional[dict] = None
        self.error:    Optional[str]  = None
        self._events:  asyncio.Queue  = asyncio.Queue()

    def push_event(self, event: dict):
        self.updated_at = time.time()
        self._events.put_nowait(event)

    async def event_stream(self) -> AsyncGenerator[str, None]:
        """Yields SSE-formatted strings until job completes."""
        while True:
            try:
                event = await asyncio.wait_for(self._events.get(), timeout=30.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("complete", "error"):
                    break
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"


_JOBS: dict[str, JobRecord] = {}


# ─────────────────────────────────────────────
# 3. PIPELINE EXECUTION (async background task)
# ─────────────────────────────────────────────

async def _phase_update(job: JobRecord, phase_num: int,
                        status: PhaseStatus, progress: int,
                        message: str = "", result: Any = None):
    job.phases[phase_num]["status"]   = status
    job.phases[phase_num]["progress"] = progress
    job.phases[phase_num]["message"]  = message
    if result is not None:
        job.phases[phase_num]["result"] = result

    event = {
        "type":    "phase_update",
        "job_id":  job.job_id,
        "phase":   phase_num,
        "label":   PHASE_LABELS[phase_num],
        "status":  status.value,
        "progress":progress,
        "message": message,
        "timestamp": time.time(),
    }
    job.push_event(event)


# ── Phase 1: Raw Extraction ────────────────────────────────────────────────────
async def _run_phase1(job: JobRecord) -> dict:
    await _phase_update(job, 1, PhaseStatus.RUNNING, 10, "Parsing raw input…")
    await asyncio.sleep(0.3)  # simulate I/O

    raw = job.payload
    raw_text = raw.get("product_name", "") + " " + raw.get("description", "")

    # Extract all string-valued keys as spec candidates
    specs_raw = {k: str(v) for k, v in raw.items()
                 if k not in ("product_name", "description", "file_content")
                 and isinstance(v, (str, int, float))}

    # If file_content provided (e.g. parsed PDF text), run simple key: value extract
    if "file_content" in raw:
        extracted = _extract_kv_from_text(raw["file_content"])
        specs_raw.update(extracted)

    await _phase_update(job, 1, PhaseStatus.RUNNING, 60, "Normalizing UOMs…")
    normalized_specs = normalize_spec_dict(specs_raw)

    result = {
        "raw_text":         raw_text,
        "specs_raw":        specs_raw,
        "normalized_specs": normalized_specs,
        "attribute_count":  len(specs_raw),
    }
    await _phase_update(job, 1, PhaseStatus.COMPLETE, 100, "Extraction complete.", result)
    return result


def _extract_kv_from_text(text: str) -> dict[str, str]:
    """Heuristic key: value extraction from free-form text / datasheet."""
    import re
    result = {}
    # Pattern: "Label: Value" or "Label – Value"
    for m in re.finditer(r'^([A-Za-z][A-Za-z\s/()]{2,40})[\s]*[:\-–]\s*(.+)$',
                         text, re.MULTILINE):
        key = m.group(1).strip()
        val = m.group(2).strip()
        if len(val) < 200:
            result[key] = val
    return result


# ── Phase 2: Graph RAG ────────────────────────────────────────────────────────
async def _run_phase2(job: JobRecord, phase1: dict) -> dict:
    await _phase_update(job, 2, PhaseStatus.RUNNING, 10, "Running taxonomy classification…")
    await asyncio.sleep(0.2)

    product_text = phase1["raw_text"]
    spec_text    = {k: v["raw_text"] if isinstance(v, dict) else str(v)
                    for k, v in phase1["specs_raw"].items()}

    taxonomy = classify_taxonomy(product_text, spec_text,
                                 api_key=os.environ.get("ANTHROPIC_API_KEY"))

    await _phase_update(job, 2, PhaseStatus.RUNNING, 60, "Building entity relationships…")
    await asyncio.sleep(0.3)

    # Simulate graph RAG related-parts discovery
    related_parts = _mock_related_parts(product_text)

    result = {
        "taxonomy":      taxonomy.to_dict(),
        "related_parts": related_parts,
    }
    await _phase_update(job, 2, PhaseStatus.COMPLETE, 100, "Graph RAG complete.", result)
    return result


def _mock_related_parts(product_text: str) -> list[dict]:
    """Deterministic mock for related-parts graph. Replace with real RAG."""
    text = product_text.lower()
    if "ball valve" in text:
        return [
            {"type": "accessory", "name": "Pneumatic Actuator",       "part_no": "ACT-PA-100"},
            {"type": "accessory", "name": "PTFE Seat Replacement Kit", "part_no": "KIT-PTFE-01"},
            {"type": "alternative","name": "Stainless Gate Valve 1/2\"","part_no": "GV-SS-050"},
            {"type": "parent",    "name": "Industrial Valve Family",   "part_no": "FAM-IVAL"},
        ]
    if "pump" in text:
        return [
            {"type": "accessory", "name": "Mechanical Seal Kit",      "part_no": "SEAL-MK-02"},
            {"type": "accessory", "name": "Impeller Replacement",      "part_no": "IMP-R-03"},
        ]
    return []


# ── Phase 3: Content Engine ───────────────────────────────────────────────────
async def _run_phase3(job: JobRecord, phase1: dict, phase2: dict) -> dict:
    await _phase_update(job, 3, PhaseStatus.RUNNING, 10, "Synthesizing product content…")

    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

    specs_summary = "\n".join(
        f"  {k}: {v['dual_label'] if isinstance(v, dict) and 'dual_label' in v else v}"
        for k, v in phase1["normalized_specs"].items()
    )
    taxonomy_name = (
        phase2["taxonomy"].get("unspsc", {}).get("commodity_name", "")
        or phase2["taxonomy"].get("etim", {}).get("class_name", "")
    )

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
  "feature_bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>", "<bullet 4>", "<bullet 5>"],
  "search_keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>", "<kw6>"]
}}
Return ONLY the JSON, no prose."""

    await _phase_update(job, 3, PhaseStatus.RUNNING, 40, "Calling content LLM…")

    try:
        model = genai.GenerativeModel("gemini-2.5-pro")
        response = model.generate_content(prompt)
        raw = response.text.strip()
        raw = raw.lstrip("```json").rstrip("```").strip()
        content = json.loads(raw)
    except Exception as e:
        content = {
            "short_title":    phase1["raw_text"][:60],
            "meta_title":     phase1["raw_text"][:60],
            "short_desc":     "Industrial-grade product for critical applications.",
            "long_desc":      "Premium quality component engineered for reliability.",
            "feature_bullets":["Durable construction", "Wide compatibility"],
            "search_keywords":[],
            "error":          str(e),
        }

    await _phase_update(job, 3, PhaseStatus.COMPLETE, 100, "Content synthesis complete.", content)
    return content


# ── Phase 4: Compliance Audit ─────────────────────────────────────────────────
async def _run_phase4(job: JobRecord, phase1: dict) -> dict:
    await _phase_update(job, 4, PhaseStatus.RUNNING, 20, "Running compliance checks…")
    await asyncio.sleep(0.4)

    specs_raw = phase1.get("specs_raw", {})
    flags: list[dict] = []

    material = " ".join(str(v) for v in specs_raw.values()).lower()

    # ROHS check
    hazardous = ["lead", "mercury", "cadmium", "hexavalent chromium", "pbb", "pbde"]
    rohs_pass = not any(h in material for h in hazardous)
    flags.append({
        "standard": "RoHS 3 (EU 2015/863)",
        "status":   "PASS" if rohs_pass else "REVIEW",
        "note":     "No restricted substances detected." if rohs_pass
                    else "Potential restricted substance in material spec.",
        "confidence": 0.80,
    })

    # REACH check
    flags.append({
        "standard": "REACH (SVHC list)",
        "status":   "REVIEW",
        "note":     "SVHC screening requires material SDS verification.",
        "confidence": 0.70,
    })

    # CE marking inference
    has_ce = "ce" in material or "ce mark" in material
    flags.append({
        "standard": "CE Marking",
        "status":   "PASS" if has_ce else "MISSING",
        "note":     "CE marking declared." if has_ce
                    else "CE marking not found – confirm with supplier.",
        "confidence": 0.75,
    })

    # Pressure Equipment Directive
    pressure_vals = [v for k, v in phase1.get("normalized_specs", {}).items()
                     if isinstance(v, dict) and v.get("dimension") == "pressure"]
    if pressure_vals:
        max_pa = max(v.get("si_value", 0) for v in pressure_vals)
        ped_applicable = max_pa > 500_000  # > 5 bar
        flags.append({
            "standard": "PED 2014/68/EU",
            "status":   "APPLICABLE" if ped_applicable else "EXEMPT",
            "note":     f"Max pressure {max_pa/1e5:.1f} bar – PED Category assessment required."
                        if ped_applicable else "Operating pressure below PED threshold.",
            "confidence": 0.88,
        })

    overall = "PASS" if all(f["status"] in ("PASS","EXEMPT") for f in flags) else "REVIEW"
    result = {"flags": flags, "overall_status": overall, "audit_timestamp": time.time()}
    await _phase_update(job, 4, PhaseStatus.COMPLETE, 100, "Compliance audit complete.", result)
    return result


# ── Phase 5: PIM Export ───────────────────────────────────────────────────────
async def _run_phase5(job: JobRecord, p1: dict, p2: dict, p3: dict, p4: dict) -> dict:
    await _phase_update(job, 5, PhaseStatus.RUNNING, 30, "Formatting PIM payload…")
    await asyncio.sleep(0.2)

    taxonomy = p2.get("taxonomy", {})
    unspsc   = taxonomy.get("unspsc") or {}
    etim     = taxonomy.get("etim")   or {}

    pim = {
        "schema_version":   "2.0.0",
        "export_timestamp": time.time(),
        "product": {
            "id":           f"PROD-{job.job_id[:8].upper()}",
            "short_title":  p3.get("short_title", ""),
            "meta_title":   p3.get("meta_title",  ""),
            "short_desc":   p3.get("short_desc",  ""),
            "long_desc":    p3.get("long_desc",   ""),
            "feature_bullets": p3.get("feature_bullets", []),
            "search_keywords": p3.get("search_keywords", []),
        },
        "classification": {
            "unspsc": {
                "code":      unspsc.get("commodity_code", ""),
                "name":      unspsc.get("commodity_name", ""),
                "hierarchy": (
                    f"{unspsc.get('segment_code','')} › "
                    f"{unspsc.get('family_code','')} › "
                    f"{unspsc.get('class_code','')} › "
                    f"{unspsc.get('commodity_code','')}"
                ),
                "confidence": unspsc.get("confidence", 0),
            },
            "etim": {
                "class_code": etim.get("class_code", ""),
                "class_name": etim.get("class_name", ""),
                "version":    etim.get("version",    "9.0"),
                "confidence": etim.get("confidence", 0),
                "features":   etim.get("features",   []),
            },
        },
        "specifications": {
            "raw":        p1.get("specs_raw", {}),
            "normalized": p1.get("normalized_specs", {}),
        },
        "related_parts": p2.get("related_parts", []),
        "compliance":    p4,
        "quality": {
            "overall_confidence": taxonomy.get("overall_confidence", 0),
            "resolution_path":    taxonomy.get("resolution_path", ""),
            "attribute_count":    p1.get("attribute_count", 0),
            "normalized_count":   sum(
                1 for v in p1.get("normalized_specs", {}).values()
                if isinstance(v, dict) and v.get("confidence", 0) > 0.5
            ),
        },
    }

    await _phase_update(job, 5, PhaseStatus.COMPLETE, 100, "PIM export ready.", pim)
    return pim


# ── Full Pipeline Orchestrator ─────────────────────────────────────────────────
async def _run_pipeline(job_id: str):
    job = _JOBS.get(job_id)
    if not job:
        return

    job.status = JobStatus.PROCESSING
    job.push_event({"type": "started", "job_id": job_id, "timestamp": time.time()})

    try:
        p1 = await _run_phase1(job)
        p2 = await _run_phase2(job, p1)
        p3 = await _run_phase3(job, p1, p2)
        p4 = await _run_phase4(job, p1)
        p5 = await _run_phase5(job, p1, p2, p3, p4)

        job.result = p5
        job.status = JobStatus.COMPLETE
        job.push_event({"type": "complete", "job_id": job_id,
                        "timestamp": time.time(), "result_summary": {
                            "unspsc_code": p5["classification"]["unspsc"]["code"],
                            "etim_code":   p5["classification"]["etim"]["class_code"],
                            "confidence":  p5["quality"]["overall_confidence"],
                        }})
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.error  = traceback.format_exc()
        job.push_event({"type": "error", "job_id": job_id,
                        "message": str(exc), "timestamp": time.time()})


# ─────────────────────────────────────────────
# 4. FASTAPI APP
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("UniHack 2026 Pipeline API ready")
    yield
    print("Shutting down")

app = FastAPI(
    title="UniHack 2026 – Product Intelligence API",
    version="1.0.0",
    description="AI-powered industrial MDM/PIM enrichment pipeline.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to frontend origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# 5. REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────

class ProcessJsonRequest(BaseModel):
    product_name: str = Field(..., description="Short product name or part number")
    description:  str = Field("", description="Optional longer description")
    specs:        dict[str, Any] = Field(default_factory=dict,
                                         description="Key-value specification pairs")

class JobSummaryResponse(BaseModel):
    job_id:     str
    status:     JobStatus
    created_at: float
    updated_at: float
    phases:     list[dict]


# ─────────────────────────────────────────────
# 6. ENDPOINTS
# ─────────────────────────────────────────────

# ── POST /api/pipeline/process  (JSON body) ────────────────────────────────────
@app.post("/api/pipeline/process", status_code=status.HTTP_202_ACCEPTED)
async def process_json(
    request:          ProcessJsonRequest,
    background_tasks: BackgroundTasks,
):
    """Submit a JSON product payload for enrichment."""
    job_id = str(uuid.uuid4())
    payload = {
        "product_name": request.product_name,
        "description":  request.description,
        **request.specs,
    }
    job = JobRecord(job_id, payload)
    _JOBS[job_id] = job
    background_tasks.add_task(_run_pipeline, job_id)
    return {"job_id": job_id, "status": "queued",
            "stream_url": f"/api/pipeline/stream/{job_id}",
            "result_url": f"/api/pipeline/results/{job_id}"}


# ── POST /api/pipeline/process/upload  (file upload) ─────────────────────────
@app.post("/api/pipeline/process/upload", status_code=status.HTTP_202_ACCEPTED)
async def process_upload(
    background_tasks: BackgroundTasks,
    file:             UploadFile = File(...),
    product_name:     str        = Form(""),
):
    """Accept a PDF, CSV, or JSON file upload and enqueue for enrichment."""
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit")

    # Persist file
    ext      = Path(file.filename or "upload").suffix.lower()
    saved_to = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"
    saved_to.write_bytes(content)

    # Parse file content into payload
    payload = _parse_file_to_payload(saved_to, content, ext, product_name)

    job_id = str(uuid.uuid4())
    job    = JobRecord(job_id, payload)
    _JOBS[job_id] = job
    background_tasks.add_task(_run_pipeline, job_id)
    return {"job_id": job_id, "status": "queued", "filename": file.filename,
            "stream_url": f"/api/pipeline/stream/{job_id}",
            "result_url": f"/api/pipeline/results/{job_id}"}


def _parse_file_to_payload(path: Path, content: bytes, ext: str, name: str) -> dict:
    """Extract a normalized payload dict from an uploaded file."""
    payload: dict = {"product_name": name or path.stem}

    if ext == ".json":
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                payload.update(data)
        except Exception:
            payload["file_content"] = content.decode("utf-8", errors="replace")

    elif ext == ".csv":
        import csv, io
        reader = csv.DictReader(io.StringIO(content.decode("utf-8", errors="replace")))
        rows   = list(reader)
        if rows:
            # Use first row as spec source
            payload.update(rows[0])
        payload["_all_rows"] = rows

    elif ext == ".pdf":
        # Best-effort text extraction via pdfminer / pypdf fallback
        try:
            import pdfminer.high_level as pdfm
            import io as _io
            text = pdfm.extract_text(_io.BytesIO(content))
            payload["file_content"] = text
        except ImportError:
            payload["file_content"] = "[PDF text extraction unavailable – install pdfminer.six]"

    else:
        payload["file_content"] = content.decode("utf-8", errors="replace")

    return payload


# ── GET /api/pipeline/stream/{job_id}  (SSE) ─────────────────────────────────
@app.get("/api/pipeline/stream/{job_id}")
async def stream_progress(job_id: str, request: Request):
    """Server-Sent Events stream of real-time pipeline phase updates."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    async def _generator():
        async for chunk in job.event_stream():
            if await request.is_disconnected():
                break
            yield chunk

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":              "no-cache",
            "X-Accel-Buffering":          "no",
            "Access-Control-Allow-Origin":"*",
        },
    )


# ── GET /api/pipeline/results/{job_id} ────────────────────────────────────────
@app.get("/api/pipeline/results/{job_id}")
async def get_results(job_id: str):
    """Return the full enriched PIM payload for a completed job."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    if job.status == JobStatus.FAILED:
        raise HTTPException(500, detail={"error": "Pipeline failed", "trace": job.error})
    if job.status != JobStatus.COMPLETE:
        raise HTTPException(202, detail={"status": job.status, "phases": job.phases})
    return JSONResponse(job.result)


# ── GET /api/pipeline/jobs ────────────────────────────────────────────────────
@app.get("/api/pipeline/jobs")
async def list_jobs():
    """List all jobs with their current status and phase summary."""
    return [
        {
            "job_id":     j.job_id,
            "status":     j.status,
            "created_at": j.created_at,
            "updated_at": j.updated_at,
            "phases":     list(j.phases.values()),
        }
        for j in sorted(_JOBS.values(), key=lambda x: x.created_at, reverse=True)
    ]


# ── DELETE /api/pipeline/jobs/{job_id} ────────────────────────────────────────
@app.delete("/api/pipeline/jobs/{job_id}", status_code=204)
async def delete_job(job_id: str):
    """Remove a job from the store."""
    if job_id not in _JOBS:
        raise HTTPException(404, f"Job {job_id} not found")
    del _JOBS[job_id]


# ── GET /health ────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "jobs": len(_JOBS),
            "gemini_key_set": bool(os.environ.get("GEMINI_API_KEY"))}
