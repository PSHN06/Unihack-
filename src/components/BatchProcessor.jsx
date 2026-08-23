import { useState, useRef, useCallback } from "react";
import { Upload, Play, Download, CheckCircle, AlertCircle, Loader2, FileText, Zap, X, Eye, EyeOff } from "lucide-react";

const API = "http://localhost:8000";

export default function BatchProcessor() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | processing | complete | error
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, mock_used: false });
  const [recentRows, setRecentRows] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [showLiveFeed, setShowLiveFeed] = useState(true);
  const esRef = useRef(null);
  const fileRef = useRef(null);

  const reset = () => {
    setFile(null); setBatchId(null); setStatus("idle");
    setProgress({ done: 0, total: 0, errors: 0, mock_used: false }); setRecentRows([]); setErrorMsg("");
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0];
    if (f && f.name.endsWith(".csv")) setFile(f);
    else setErrorMsg("Please drop a .csv file.");
  }, []);

  const startBatch = async () => {
    if (!file) return;
    setStatus("uploading"); setErrorMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/api/batch/process`, { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Upload failed"); }
      const { batch_id, total } = await res.json();
      setBatchId(batch_id);
      setProgress({ done: 0, total, errors: 0, mock_used: false });
      setStatus("processing");

      // Open SSE stream
      const es = new EventSource(`${API}/api/batch/stream/${batch_id}`);
      esRef.current = es;

      es.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "progress") {
          setProgress(p => ({ ...p, done: event.done, total: event.total, mock_used: event.mock_used || p.mock_used }));
          if (event.row) {
            setRecentRows(prev => [event.row, ...prev].slice(0, 8));
          }
        } else if (event.type === "heartbeat") {
          setProgress(p => ({ ...p, done: event.done, total: event.total }));
        } else if (event.type === "complete") {
          setProgress(p => ({ ...p, done: event.done, errors: event.errors }));
          setStatus("complete");
          es.close();
        }
      };
      es.onerror = () => {
        // Fallback to polling if SSE fails
        es.close();
        pollStatus(batch_id);
      };
    } catch (err) {
      setStatus("error"); setErrorMsg(err.message);
    }
  };

  const pollStatus = async (id) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/batch/status/${id}`);
        const data = await res.json();
        setProgress(p => ({ ...p, done: data.done, total: data.total, errors: data.errors, mock_used: data.mock_used || p.mock_used }));
        if (data.last_row && Object.keys(data.last_row).length > 0) {
          setRecentRows(prev => [data.last_row, ...prev].slice(0, 8));
        }
        if (data.status === "complete") {
          clearInterval(interval);
          setStatus("complete");
        }
      } catch { clearInterval(interval); }
    }, 2000);
  };

  const downloadResult = () => {
    if (!batchId) return;
    window.open(`${API}/api/batch/download/${batchId}`, "_blank");
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Batch Enrichment</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload the input CSV → AI enriches every row → Download 252-column output
          </p>
        </div>
        {status !== "idle" && (
          <button onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
            <X className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Upload Zone */}
      {status === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
            ${dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"}`}
        >
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onDrop} />
          <div className="flex flex-col items-center gap-3">
            <div className={`p-4 rounded-2xl ${dragging ? "bg-blue-100" : "bg-slate-100"} transition-colors`}>
              <Upload className={`w-8 h-8 ${dragging ? "text-blue-500" : "text-slate-400"}`} />
            </div>
            <div>
              <p className="font-semibold text-slate-700">Drop your Input CSV here</p>
              <p className="text-sm text-slate-400 mt-1">
                Expects: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">Mfg_Part_Num, Part_Desc, E1_Brand, Unilog_Brand, DIB_Brand, Part_Manuf</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* File Selected */}
      {status === "idle" && file && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-lg">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-medium text-slate-800 text-sm">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            onClick={startBatch}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Zap className="w-4 h-4" /> Start Enrichment
          </button>
        </div>
      )}

      {/* Upload / Starting */}
      {status === "uploading" && (
        <div className="p-6 bg-white border border-slate-200 rounded-2xl flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <p className="text-slate-700 font-medium">Uploading CSV and starting enrichment job…</p>
        </div>
      )}

      {/* Processing Progress */}
      {(status === "processing" || status === "complete") && (
        <div className="space-y-4">
          {/* Progress bar card */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {status === "processing" ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                )}
                <span className="font-semibold text-slate-800">
                  {status === "processing" ? "Enriching rows…" : "Enrichment Complete!"}
                </span>
              </div>
              <span className="text-sm font-mono font-bold text-slate-600">
                {progress.done} / {progress.total} rows &nbsp;·&nbsp; {pct}%
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${status === "complete" ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {progress.errors > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {progress.errors} rows failed — they are skipped in the output
              </p>
            )}

            {progress.mock_used && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 mt-4">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800">API Quota Exhausted</p>
                  <p className="text-sm text-amber-700 mt-1">
                    The free-tier daily LLM limit was reached during this batch. To ensure your pipeline completes, the remaining rows have been filled with mock data. Please provide a paid API key or wait 24 hours to process more live rows.
                  </p>
                </div>
              </div>
            )}

            {status === "complete" && (
              <button
                onClick={downloadResult}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
              >
                <Download className="w-5 h-5" />
                Download Enriched Output ({progress.done} rows, 252 columns)
              </button>
            )}
          </div>

          {/* Live row feed */}
          {recentRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-slate-700">Live Feed — Last processed rows</span>
                </div>
                <button
                  onClick={() => setShowLiveFeed(!showLiveFeed)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover transition-colors"
                >
                  {showLiveFeed ? <><EyeOff className="w-3.5 h-3.5" /> Hide</> : <><Eye className="w-3.5 h-3.5" /> Show</>}
                </button>
              </div>
              
              {showLiveFeed && (
                <div className="overflow-y-auto max-h-96 w-full">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 font-mono text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Part Number</th>
                        <th className="px-5 py-3 font-mono text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Brand / Manufacturer</th>
                        <th className="px-5 py-3 font-mono text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Invoice Desc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentRows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 text-xs align-top w-1/3">
                            <p className="font-semibold text-slate-800 truncate">{row.Mfg_Part_Num}</p>
                            <p className="text-slate-400 truncate mt-0.5">{row.Part_Desc?.slice(0, 40)}…</p>
                          </td>
                          <td className="px-5 py-3 text-xs align-top w-1/3">
                            <p className="font-semibold text-blue-700 truncate">{row.BRAND_NAME}</p>
                            <p className="text-slate-400 truncate mt-0.5">{row.MANUFACTURER_NAME}</p>
                          </td>
                          <td className="px-5 py-3 text-xs align-top w-1/3">
                            <p className="font-mono font-bold text-emerald-700 truncate">{row.INVOICE_DESC}</p>
                            <p className="text-slate-400 truncate text-[10px] mt-0.5">{row.Classpath?.split(">").pop()}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="p-5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700">Enrichment failed</p>
            <p className="text-sm text-red-500 mt-1">{errorMsg}</p>
            <button onClick={reset} className="mt-3 text-xs text-red-600 underline">Try again</button>
          </div>
        </div>
      )}

      {/* Info footer */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Input Format", value: "6-column CSV", sub: "Mfg_Part_Num · Part_Desc · Brands · Manuf" },
          { label: "AI Model", value: "Gemini 3.6 Flash", sub: "One enrichment call per row" },
          { label: "Output Format", value: "252-column CSV", sub: "Exact Unilog Delivery Format schema" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="p-4 bg-white border border-slate-100 rounded-xl">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="font-bold text-slate-800 mt-1">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
