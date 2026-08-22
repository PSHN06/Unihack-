/**
 * App.jsx – UniHack 2026 Product Intelligence Workbench
 * Full HITL PIM governance UI integrating all pipeline components.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Zap, LayoutGrid, GitBranch, ShieldCheck, Download, X } from "lucide-react";

import FileUploadZone        from "./components/FileUploadZone";
import PipelineStepper       from "./components/PipelineStepper";
import AttributeValidationGrid from "./components/AttributeValidationGrid";
import GraphView             from "./components/GraphView";
import ExportPanel           from "./components/ExportPanel";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const NAV_TABS = [
  { id: "pipeline",    label: "Pipeline",    icon: Zap         },
  { id: "attributes",  label: "Attributes",  icon: LayoutGrid  },
  { id: "graph",       label: "Graph / Taxonomy", icon: GitBranch },
  { id: "compliance",  label: "Compliance",  icon: ShieldCheck },
  { id: "export",      label: "Export",      icon: Download    },
];

export default function App() {
  const [tab,       setTab]       = useState("pipeline");
  const [jobId,     setJobId]     = useState(null);
  const [jobStatus, setJobStatus] = useState("idle");   // idle | queued | processing | complete | failed
  const [phases,    setPhases]    = useState({});
  const [pimData,   setPimData]   = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast,     setToast]     = useState(null);

  const esRef = useRef(null);

  // ── Toast helper ─────────────────────────────────────────────────────────────
  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Submit handler ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async ({ type, formData, payload }) => {
    setIsLoading(true);
    setPhases({});
    setPimData(null);
    setJobId(null);
    setJobStatus("queued");
    setTab("pipeline");

    try {
      let res;
      if (type === "file") {
        res = await fetch(`${API_BASE}/api/pipeline/process/upload`, {
          method: "POST", body: formData,
        });
      } else {
        res = await fetch(`${API_BASE}/api/pipeline/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_name: payload.product_name || "Unknown Product",
            description:  payload.description  || "",
            specs:        Object.fromEntries(
              Object.entries(payload).filter(([k]) =>
                !["product_name","description"].includes(k))
            ),
          }),
        });
      }

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setJobId(data.job_id);
      openStream(data.job_id);
    } catch (err) {
      showToast(`Failed to start pipeline: ${err.message}`, "error");
      setJobStatus("failed");
      setIsLoading(false);
    }
  }, []);

  // ── SSE stream ────────────────────────────────────────────────────────────────
  const openStream = useCallback((id) => {
    esRef.current?.close();

    const es = new EventSource(`${API_BASE}/api/pipeline/stream/${id}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "started") {
          setJobStatus("processing");
        }
        if (event.type === "phase_update") {
          setPhases(prev => ({
            ...prev,
            [event.phase]: {
              phase:    event.phase,
              label:    event.label,
              status:   event.status,
              progress: event.progress,
              message:  event.message,
            },
          }));
        }
        if (event.type === "complete") {
          setJobStatus("complete");
          setIsLoading(false);
          es.close();
          fetchResults(id);
          showToast("Pipeline complete! All phases passed.", "success");
        }
        if (event.type === "error") {
          setJobStatus("failed");
          setIsLoading(false);
          showToast(`Pipeline error: ${event.message}`, "error");
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE closed by server – normal after completion
      setIsLoading(false);
      es.close();
    };
  }, []);

  const fetchResults = async (id) => {
    try {
      const res  = await fetch(`${API_BASE}/api/pipeline/results/${id}`);
      const data = await res.json();
      setPimData(data);
    } catch (err) {
      showToast(`Could not fetch results: ${err.message}`, "error");
    }
  };

  useEffect(() => () => esRef.current?.close(), []);

  // ── Derived data ──────────────────────────────────────────────────────────────
  const rawSpecs        = pimData?.specifications?.raw        ?? {};
  const normalizedSpecs = pimData?.specifications?.normalized ?? {};
  const taxonomyData    = pimData?.classification             ?? {};
  const relatedParts    = pimData?.related_parts              ?? [];
  const complianceData  = pimData?.compliance                 ?? null;

  // Badge counts for tabs
  const tabBadge = {
    compliance: complianceData?.flags?.filter(f => f.status === "REVIEW").length || null,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 rounded-xl ring-1 ring-indigo-500/30">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Product Intelligence Workbench
              </h1>
              <p className="text-xs text-slate-500">UniHack 2026 · AI-Powered Industrial PIM</p>
            </div>
          </div>

          {jobId && (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse
                ${jobStatus === "processing" ? "bg-indigo-400"
                : jobStatus === "complete"   ? "bg-green-400"
                : jobStatus === "failed"     ? "bg-red-400"
                : "bg-slate-600"}`} />
              <span className="text-xs text-slate-500 font-mono">
                {jobId.slice(0, 12)}…
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-20 right-6 z-50 flex items-center gap-3 px-4 py-3
          rounded-2xl shadow-xl border text-sm font-medium transition-all
          ${toast.type === "success" ? "bg-green-900/90 border-green-700 text-green-200"
          : toast.type === "error"   ? "bg-red-900/90   border-red-700   text-red-200"
          :                            "bg-slate-800/90  border-slate-700 text-slate-200"}`}>
          {toast.msg}
          <button onClick={() => setToast(null)}>
            <X className="w-4 h-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">

          {/* LEFT: Upload + Pipeline */}
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
                1 · Ingest Product Data
              </h2>
              <FileUploadZone onSubmit={handleSubmit} isLoading={isLoading} />
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
                2 · AI Pipeline
              </h2>
              <PipelineStepper phases={phases} jobStatus={jobStatus} />
            </div>
          </div>

          {/* RIGHT: Tabbed results workbench */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
              3 · Governance Workbench
            </h2>

            {/* Tab nav */}
            <div className="flex gap-1 p-1 bg-slate-900/60 rounded-2xl mb-5 flex-wrap">
              {NAV_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs
                    font-semibold transition-all relative
                    ${tab === id
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {tabBadge[id] && (
                    <span className={`absolute -top-1 -right-1 w-4 h-4 flex items-center
                      justify-center rounded-full text-xs font-bold
                      ${tab === id ? "bg-amber-400 text-slate-900" : "bg-amber-500 text-white"}`}>
                      {tabBadge[id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="bg-slate-900/30 rounded-2xl p-5 border border-slate-800/60 min-h-96">
              {tab === "pipeline" && (
                <div className="space-y-4">
                  {!jobId && (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                      <div className="p-5 bg-slate-800/50 rounded-3xl">
                        <Zap className="w-10 h-10 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-slate-400 font-medium">No job running</p>
                        <p className="text-slate-600 text-sm mt-1">
                          Upload a datasheet or paste JSON to start the pipeline
                        </p>
                      </div>
                    </div>
                  )}
                  {jobId && pimData && (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-green-400 flex items-center gap-2">
                        ✓ Pipeline complete
                      </p>
                      <div className="p-4 bg-slate-800/50 rounded-xl space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Product Title</span>
                          <span className="text-white font-medium text-right max-w-xs">
                            {pimData.product?.short_title ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">UNSPSC</span>
                          <span className="font-mono text-indigo-300">
                            {pimData.classification?.unspsc?.code ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">ETIM Class</span>
                          <span className="font-mono text-cyan-300">
                            {pimData.classification?.etim?.class_code ?? "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Confidence</span>
                          <span className={`font-bold ${
                            (pimData.quality?.overall_confidence ?? 0) >= 0.9 ? "text-green-400"
                            : (pimData.quality?.overall_confidence ?? 0) >= 0.6 ? "text-amber-400"
                            : "text-red-400"}`}>
                            {Math.round((pimData.quality?.overall_confidence ?? 0) * 100)}%
                          </span>
                        </div>
                      </div>

                      {pimData.product?.feature_bullets?.length > 0 && (
                        <div className="p-4 bg-slate-800/30 rounded-xl space-y-1.5">
                          <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-2">
                            Feature Bullets
                          </p>
                          {pimData.product.feature_bullets.map((b, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                              <span className="text-indigo-400 mt-0.5">✓</span> {b}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab === "attributes" && (
                <AttributeValidationGrid
                  rawSpecs={rawSpecs}
                  normalizedSpecs={normalizedSpecs}
                />
              )}

              {tab === "graph" && (
                <GraphView
                  taxonomyData={taxonomyData}
                  relatedParts={relatedParts}
                />
              )}

              {tab === "compliance" && (
                <div className="space-y-3">
                  {!complianceData && (
                    <p className="text-slate-600 text-sm py-8 text-center">
                      Run the pipeline to view compliance results.
                    </p>
                  )}
                  {complianceData && (
                    <>
                      <div className={`flex items-center gap-3 p-4 rounded-xl border
                        ${complianceData.overall_status === "PASS"
                          ? "bg-green-900/20 border-green-700/40"
                          : "bg-amber-900/20 border-amber-700/40"}`}>
                        <span className="text-2xl">
                          {complianceData.overall_status === "PASS" ? "✅" : "⚠️"}
                        </span>
                        <div>
                          <p className={`font-bold ${complianceData.overall_status === "PASS"
                            ? "text-green-300" : "text-amber-300"}`}>
                            Overall: {complianceData.overall_status}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {complianceData.flags?.length} standards checked
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {(complianceData.flags ?? []).map((f, i) => (
                          <div key={i}
                            className={`p-4 rounded-xl border text-sm
                              ${f.status === "PASS"  || f.status === "EXEMPT"
                                ? "bg-green-900/10 border-green-900/30"
                              : f.status === "REVIEW"
                                ? "bg-amber-900/10 border-amber-900/30"
                                : "bg-red-900/10   border-red-900/30"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-200">{f.standard}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                                ${f.status === "PASS" || f.status === "EXEMPT"
                                  ? "bg-green-900/50 text-green-300"
                                : f.status === "REVIEW"
                                  ? "bg-amber-900/50 text-amber-300"
                                  : "bg-red-900/50 text-red-300"}`}>
                                {f.status}
                              </span>
                            </div>
                            <p className="text-slate-400 text-xs">{f.note}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === "export" && (
                <ExportPanel pimData={pimData} jobId={jobId} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
