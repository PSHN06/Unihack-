# UniHack 2026 – Integration & Deployment Guide
## AI-Powered Product Intelligence for Industrial Commerce

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER / CLIENT                         │
│                                                                 │
│  FileUploadZone ──► PipelineStepper (SSE live updates)         │
│  AttributeValidationGrid │ GraphView │ ExportPanel             │
└──────────────────────────┬──────────────────────────────────────┘
                           │  REST + SSE (EventSource)
┌──────────────────────────▼──────────────────────────────────────┐
│                  FastAPI  backend/app.py  :8000                  │
│                                                                 │
│  POST /api/pipeline/process      → enqueue job                 │
│  GET  /api/pipeline/stream/{id}  → SSE phase events            │
│  GET  /api/pipeline/results/{id} → full PIM JSON               │
└──────────────┬────────────────────┬────────────────────────────┘
               │                    │
   ┌───────────▼──────┐   ┌────────▼────────────────────────────┐
   │ uom_normalizer   │   │  taxonomy_engine                    │
   │ (deterministic)  │   │  fast-path keywords → Gemini gemini-2.5-pro   │
   └──────────────────┘   └─────────────────────────────────────┘
               │
   ┌───────────▼──────────────────────────────────────────────────┐
   │  Gemini gemini-2.5-pro  (Phase 3: content synthesis)                  │
   └──────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | ≥ 3.11 | `python3 --version` |
| Node.js | ≥ 20 LTS | `node --version` |
| npm | ≥ 10 | `npm --version` |
| Gemini API Key | — | https://aistudio.google.com/ |

---

## 1. Clone & Install

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
npm install
```

---

## 2. Environment Variables

```bash
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=AIzaSy...
```

The API key is used by:
- `taxonomy_engine.py`  – LLM taxonomy classification (slow path)
- `backend/app.py` Phase 3 – Gemini content synthesis

---

## 3. Start the Backend

```bash
# From project root:
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
🚀 UniHack 2026 Pipeline API ready
INFO:     Application startup complete.
```

Verify:
```bash
curl http://localhost:8000/health
# → {"status":"ok","jobs":0,"gemini_key_set":true}
```

---

## 4. Start the Frontend

```bash
# In a separate terminal, from project root:
npm run dev
```

Open: **http://localhost:5173**

> The Vite dev server proxies `/api/*` to `http://localhost:8000` automatically
> via `vite.config.js`, so no CORS issues during development.

---

## 5. Manual API Test (curl)

### Submit a JSON payload

```bash
curl -X POST http://localhost:8000/api/pipeline/process \
  -H "Content-Type: application/json" \
  -d '{
    "product_name": "Stainless Steel Full-Bore Ball Valve",
    "description": "316 SS ball valve for steam and chemical service",
    "specs": {
      "Body Material":   "316 Stainless Steel",
      "Seat Material":   "PTFE",
      "Max Pressure":    "1000 PSI",
      "Max Temperature": "200 °C",
      "Port Size":       "1/2 inch",
      "End Connection":  "Threaded NPT",
      "Standards":       "ASME B16.34, CE, RoHS",
      "Weight":          "0.65 kg"
    }
  }'
```

Response:
```json
{
  "job_id": "a1b2c3d4-...",
  "status": "queued",
  "stream_url": "/api/pipeline/stream/a1b2c3d4-...",
  "result_url": "/api/pipeline/results/a1b2c3d4-..."
}
```

### Stream phase events

```bash
curl -N http://localhost:8000/api/pipeline/stream/a1b2c3d4-...
```

Events stream in real-time:
```
data: {"type":"started","job_id":"a1b2c3d4","timestamp":1720000000}

data: {"type":"phase_update","phase":1,"label":"Raw Data Extraction","status":"running","progress":10,...}
data: {"type":"phase_update","phase":1,"status":"complete","progress":100,...}
data: {"type":"phase_update","phase":2,"status":"running",...}
...
data: {"type":"complete","job_id":"a1b2c3d4","result_summary":{...}}
```

### Fetch full results

```bash
curl http://localhost:8000/api/pipeline/results/a1b2c3d4-... | python3 -m json.tool
```

### Upload a file

```bash
curl -X POST http://localhost:8000/api/pipeline/process/upload \
  -F "file=@/path/to/datasheet.pdf" \
  -F "product_name=Ball Valve Datasheet"
```

---

## 6. Run Tests

```bash
# Unit tests (no server required):
python3 tests/test_integration.py --unit

# End-to-end API tests (server must be running):
python3 tests/test_integration.py --e2e

# All tests:
python3 tests/test_integration.py
```

---

## 7. Production Build

```bash
# Build optimised frontend bundle
npm run build
# → dist/ directory

# Serve backend + static files with a production ASGI server:
pip install gunicorn
gunicorn backend.app:app -k uvicorn.workers.UvicornWorker \
  --workers 2 --bind 0.0.0.0:8000
```

---

## 8. Expected PIM Output Schema

```json
{
  "schema_version": "2.0.0",
  "product": {
    "id":              "PROD-A1B2C3D4",
    "short_title":     "316 SS Full-Bore Ball Valve ½\" NPT",
    "meta_title":      "Stainless Steel Ball Valve 1000 PSI | ASME B16.34",
    "short_desc":      "Industrial-grade 316 SS ball valve rated to 1000 PSI...",
    "long_desc":       "...",
    "feature_bullets": ["Full-bore design minimises pressure drop", "..."],
    "search_keywords": ["ball valve", "316 stainless", "NPT", "..."]
  },
  "classification": {
    "unspsc": {
      "code":       "40151501",
      "name":       "Ball valves",
      "hierarchy":  "40 › 4015 › 401515 › 40151501",
      "confidence": 0.92
    },
    "etim": {
      "class_code": "EC002714",
      "class_name": "Ball valve",
      "version":    "9.0",
      "confidence": 0.92,
      "features":   [
        { "code": "EF002157", "name": "Nominal diameter",       "value": "12.7", "unit": "mm" },
        { "code": "EF000040", "name": "Max. operating pressure","value": "68.9", "unit": "bar" }
      ]
    }
  },
  "specifications": {
    "raw":        { "Max Pressure": "1000 PSI", "Port Size": "1/2 inch", "..." },
    "normalized": {
      "Max Pressure": {
        "raw_text":       "1000 PSI",
        "dimension":      "pressure",
        "si_value":       6894757.0,
        "si_unit":        "Pa",
        "imperial_value": 1000.0,
        "imperial_unit":  "PSI",
        "dual_label":     "6.895e+06 Pa / 1000 PSI",
        "confidence":     0.98
      }
    }
  },
  "related_parts": [
    { "type": "accessory",  "name": "Pneumatic Actuator",        "part_no": "ACT-PA-100" },
    { "type": "alternative","name": "Stainless Gate Valve 1/2\"", "part_no": "GV-SS-050"  }
  ],
  "compliance": {
    "flags": [
      { "standard": "RoHS 3", "status": "PASS",   "confidence": 0.8  },
      { "standard": "CE",     "status": "PASS",   "confidence": 0.75 },
      { "standard": "PED",    "status": "APPLICABLE", "confidence": 0.88 }
    ],
    "overall_status": "REVIEW"
  },
  "quality": {
    "overall_confidence": 0.92,
    "resolution_path":    "deterministic",
    "attribute_count":    8,
    "normalized_count":   6
  }
}
```

---

## 9. Hackathon Demo Script (5-minute run-through)

1. **Open** http://localhost:5173
2. **Click** "Paste JSON" tab → click "Load Demo" (Ball Valve pre-loaded)
3. **Click** "Run AI Pipeline →"
4. Watch **Phase 1–5** animate in real time on the left panel
5. Click **Attributes** tab → show dual-unit normalized grid, edit a cell live
6. Click **Graph / Taxonomy** tab → reveal UNSPSC breadcrumb + ETIM features
7. Click **Compliance** tab → show RoHS PASS, PED APPLICABLE flags
8. Click **Export** tab → download Full PIM JSON, show quality scorecard

---

## 10. Scoring Rubric Coverage

| Criterion | Implementation |
|-----------|----------------|
| Input Flexibility | JSON body, file upload (PDF/CSV/JSON), free-text paste |
| UOM Normalization | `uom_normalizer.py` – 60+ units, dual SI+Imperial, tolerance parsing |
| Taxonomy Mapping | `taxonomy_engine.py` – UNSPSC v25 + ETIM 9.0, hybrid deterministic+LLM |
| AI Enrichment | Gemini gemini-2.5-pro for content synthesis + taxonomy slow-path |
| Streaming UX | SSE phase events, animated stepper, per-phase progress bars |
| HITL Governance | Inline cell editing, confidence color coding, 4 export formats |
| Compliance | RoHS, REACH, CE, PED automated checks with confidence scores |
| Graph RAG | Related parts (accessories / alternatives / parent family) graph |
| Export | Full PIM JSON, Normalized CSV, ETIM Feature Sheet, Compliance Report |
| Test Coverage | 25 unit tests (all pass), E2E smoke suite |
