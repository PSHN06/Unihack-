import { useState, useCallback, useRef, useEffect } from "react";
import { Zap, LayoutGrid, GitBranch, ShieldCheck, Download, X, Search, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

import FileUploadZone        from "./components/FileUploadZone";
import PipelineStepper       from "./components/PipelineStepper";
import AttributeValidationGrid from "./components/AttributeValidationGrid";
import GraphView             from "./components/GraphView";
import ExportPanel           from "./components/ExportPanel";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const NAV_TABS = [
  { id: "pipeline",    label: "Pipeline",    icon: Zap         },
  { id: "attributes",  label: "Attributes",  icon: LayoutGrid  },
  { id: "graph",       label: "Graph",       icon: GitBranch },
  { id: "compliance",  label: "Compliance",  icon: ShieldCheck },
  { id: "export",      label: "Export",      icon: Download    },
];

export default function App() {
  const [tab,       setTab]       = useState("pipeline");
  const [jobId,     setJobId]     = useState(null);
  const [jobStatus, setJobStatus] = useState("idle");
  const [phases,    setPhases]    = useState({});
  const [pimData,   setPimData]   = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast,     setToast]     = useState(null);
  const [activeTopNav, setActiveTopNav] = useState("Workspace");

  // Chat Copilot State
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatting, setIsChatting] = useState(false);

  const esRef = useRef(null);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

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

  const rawSpecs        = pimData?.specifications?.raw        ?? {};
  const normalizedSpecs = pimData?.specifications?.normalized ?? {};
  const taxonomyData    = pimData?.classification             ?? {};
  const relatedParts    = pimData?.related_parts              ?? [];
  const complianceData  = pimData?.compliance                 ?? null;

  const tabBadge = {
    compliance: complianceData?.flags?.filter(f => f.status === "REVIEW").length || null,
  };

  const handleChatSubmit = async (e) => {
    if (e.key === "Enter" && chatInput.trim()) {
      if (!jobId || !pimData) {
        showToast("Please process a datasheet first before chatting.", "error");
        return;
      }
      
      const userMessage = chatInput.trim();
      setChatInput("");
      setChatMessages(prev => [...prev, { role: "user", text: userMessage }]);
      setIsChatting(true);

      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, message: userMessage })
        });
        
        if (!res.ok) throw new Error("Failed to get answer");
        const data = await res.json();
        
        setChatMessages(prev => [...prev, { role: "ai", text: data.answer }]);
      } catch (err) {
        setChatMessages(prev => [...prev, { role: "ai", text: "Sorry, I encountered an error answering your question." }]);
        showToast("Copilot error: " + err.message, "error");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-200">
      
      {/* ── Top Floating Navigation ── */}
      <div className="pt-6 pb-2 px-8 flex justify-between items-center max-w-[1400px] mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">unihack</span>
        </div>
        
        <div className="flex items-center gap-1 bg-white p-1 rounded-full shadow-sm border border-slate-200">
          {["Workspace", "Catalog", "Taxonomy", "Reports", "Settings"].map((nav) => (
            <button 
              key={nav}
              onClick={() => setActiveTopNav(nav)}
              className={`px-5 py-2 text-sm font-medium rounded-full transition-all ${activeTopNav === nav ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {nav}
            </button>
          ))}
        </div>
        
        <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
           {/* Avatar Placeholder */}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-8 py-8">
        
        {/* Large Header */}
        <div className="flex items-center gap-4 mb-10">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-900">
            {activeTopNav === "Workspace" ? "Intelligence Workspace" : activeTopNav}
          </h1>
          {jobId && activeTopNav === "Workspace" && (
            <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
              <span className={`w-2 h-2 rounded-full animate-pulse
                ${jobStatus === "processing" ? "bg-blue-500"
                : jobStatus === "complete"   ? "bg-emerald-500"
                : jobStatus === "failed"     ? "bg-rose-500"
                : "bg-slate-400"}`} />
              <span className="text-xs text-slate-500 font-mono">
                {jobId.slice(0, 8)}
              </span>
            </div>
          )}
        </div>

        {activeTopNav !== "Workspace" ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[2rem] shadow-soft border border-slate-100 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-slate-300" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-800 mb-2">{activeTopNav} Dashboard</h2>
            <p className="text-slate-500 max-w-md">
              This module is currently under development. The core AI Pipeline is fully functional inside the <strong>Workspace</strong> tab!
            </p>
          </div>
        ) : (
          /* ── Main Dashboard Grid ── */
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">

            {/* LEFT COLUMN: Pipeline Control */}
          <div className="space-y-6">
            
            {/* Upload Card */}
            <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-slate-100 relative overflow-hidden">
              {/* Subtle background gradient blob */}
              <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
              
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" /> 
                Data Ingestion
              </h2>
              <FileUploadZone onSubmit={handleSubmit} isLoading={isLoading} />
            </div>

            {/* Pipeline Status Card */}
            <div className="bg-white rounded-[2rem] p-6 shadow-soft border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Pipeline Execution</h2>
              <PipelineStepper phases={phases} jobStatus={jobStatus} />
            </div>
          </div>

          {/* RIGHT COLUMN: Results / Governance */}
          <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 flex flex-col overflow-hidden relative">
            
            {/* Interactive Search Bar overlay style */}
            <div className="px-8 pt-8 pb-4 relative">
               <div className="relative group">
                 <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                 </div>
                 <input 
                   type="text" 
                   placeholder={jobId ? "Ask the Copilot about this product (e.g. 'Why did RoHS fail?')" : "Process a product to chat with the AI Copilot"} 
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   onKeyDown={handleChatSubmit}
                   disabled={!jobId}
                   className="w-full pl-11 pr-4 py-3 bg-blue-50/50 border border-blue-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all text-slate-700 placeholder:text-slate-400 disabled:opacity-50"
                 />
                 <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded shadow-sm border border-slate-200 uppercase tracking-widest">Enter to send</span>
                 </div>
               </div>

               {/* Chat Messages Overlay/Expansion */}
               {chatMessages.length > 0 && (
                 <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[300px] overflow-y-auto space-y-4 shadow-inner">
                   {chatMessages.map((msg, idx) => (
                     <div key={idx} className={`flex gap-3 text-sm ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold ${msg.role === "user" ? "bg-slate-200 text-slate-600" : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white"}`}>
                          {msg.role === "user" ? "U" : <Sparkles className="w-4 h-4" />}
                        </div>
                        <div className={`p-3 rounded-2xl max-w-[80%] ${msg.role === "user" ? "bg-blue-500 text-white rounded-tr-none" : "bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm"}`}>
                          <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }} />
                        </div>
                     </div>
                   ))}
                   {isChatting && chatMessages[chatMessages.length - 1]?.role === "user" && (
                     <div className="flex gap-3 text-sm flex-row">
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white animate-pulse">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-400 rounded-tl-none shadow-sm flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-75"></span>
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-150"></span>
                        </div>
                     </div>
                   )}
                 </div>
               )}
            </div>

            {/* Light Pill Tabs */}
            <div className="px-8 flex gap-2 border-b border-slate-100 pb-4 overflow-x-auto">
              {NAV_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all relative whitespace-nowrap
                    ${tab === id
                      ? "bg-blue-50 text-blue-700 border border-blue-100"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {tabBadge[id] && (
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ml-1
                      ${tab === id ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                      {tabBadge[id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 p-8 bg-slate-50/30">
              {tab === "pipeline" && (
                <div className="h-full flex flex-col justify-center">
                  {!jobId && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                        <LayoutGrid className="w-8 h-8 text-blue-300" />
                      </div>
                      <h3 className="text-lg font-medium text-slate-800">Workspace Empty</h3>
                      <p className="text-slate-500 mt-2 max-w-sm">
                        Upload a datasheet or paste a payload on the left to begin the product intelligence pipeline.
                      </p>
                    </div>
                  )}
                  {jobId && pimData && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-800">Pipeline Complete</h3>
                          <p className="text-sm text-slate-500">Successfully generated structured product intelligence.</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Generated Title</p>
                          <p className="text-slate-800 font-medium">{pimData.product?.short_title ?? "—"}</p>
                        </div>
                        <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Confidence Score</p>
                          <p className={`text-2xl font-bold ${
                            (pimData.quality?.overall_confidence ?? 0) >= 0.9 ? "text-emerald-500"
                            : (pimData.quality?.overall_confidence ?? 0) >= 0.6 ? "text-amber-500"
                            : "text-rose-500"}`}>
                            {Math.round((pimData.quality?.overall_confidence ?? 0) * 100)}%
                          </p>
                        </div>
                        <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">UNSPSC Class</p>
                          <p className="font-mono text-blue-600">{pimData.classification?.unspsc?.code ?? "—"}</p>
                          <p className="text-sm text-slate-500 truncate">{pimData.classification?.unspsc?.commodity_name}</p>
                        </div>
                        <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">ETIM Class</p>
                          <p className="font-mono text-cyan-600">{pimData.classification?.etim?.class_code ?? "—"}</p>
                          <p className="text-sm text-slate-500 truncate">{pimData.classification?.etim?.class_name}</p>
                        </div>
                      </div>

                      {pimData.product?.feature_bullets?.length > 0 && (
                        <div className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-3">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Feature Bullets</p>
                          <ul className="space-y-2">
                            {pimData.product.feature_bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                {b}
                              </li>
                            ))}
                          </ul>
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
                <div className="space-y-4 max-w-3xl">
                  {!complianceData && (
                    <div className="text-center py-12 text-slate-400">Run the pipeline to view compliance results.</div>
                  )}
                  {complianceData && (
                    <>
                      <div className={`flex items-center gap-4 p-5 rounded-2xl border
                        ${complianceData.overall_status === "PASS"
                          ? "bg-emerald-50 border-emerald-100"
                          : "bg-amber-50 border-amber-100"}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${complianceData.overall_status === "PASS" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                          {complianceData.overall_status === "PASS" ? <ShieldCheck className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="text-sm text-slate-500 font-medium">Overall Status</p>
                          <p className={`text-xl font-bold ${complianceData.overall_status === "PASS" ? "text-emerald-700" : "text-amber-700"}`}>
                            {complianceData.overall_status}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 mt-6">
                        {(complianceData.flags ?? []).map((f, i) => (
                          <div key={i}
                            className={`p-5 rounded-2xl border bg-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4
                              ${f.status === "PASS"  || f.status === "EXEMPT"
                                ? "border-emerald-100"
                              : f.status === "REVIEW"
                                ? "border-amber-100"
                                : "border-rose-100"}`}>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-slate-800">{f.standard}</span>
                              </div>
                              <p className="text-slate-500 text-sm">{f.note}</p>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full shrink-0 text-center
                              ${f.status === "PASS" || f.status === "EXEMPT"
                                ? "bg-emerald-100 text-emerald-700"
                              : f.status === "REVIEW"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"}`}>
                              {f.status}
                            </span>
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
        )}
      </main>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4
          rounded-2xl shadow-xl border text-sm font-medium transition-all animate-in slide-in-from-bottom-5
          ${toast.type === "success" ? "bg-white border-emerald-100 text-slate-800"
          : toast.type === "error"   ? "bg-rose-500 border-rose-600 text-white"
          :                            "bg-slate-800 border-slate-700 text-white"}`}>
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {toast.type === "error" && <AlertCircle className="w-5 h-5 text-white" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2">
            <X className="w-4 h-4 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}
    </div>
  );
}
