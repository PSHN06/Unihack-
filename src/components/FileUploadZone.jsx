/**
 * FileUploadZone.jsx
 * Drag-and-drop + click-to-browse file upload zone.
 * Supports: .pdf, .json, .csv
 * Also renders a JSON paste panel for quick demo payloads.
 */

import { useCallback, useRef, useState } from "react";
import {
  Upload, FileJson, FileText, AlertCircle,
  CheckCircle2, Loader2, X, ChevronDown, ChevronUp,
} from "lucide-react";

const ACCEPTED_TYPES = {
  "application/pdf":  { label: "PDF Datasheet", ext: ".pdf",  icon: FileText },
  "application/json": { label: "JSON Payload",  ext: ".json", icon: FileJson },
  "text/csv":         { label: "CSV Specs",      ext: ".csv",  icon: FileText },
};

const DEMO_PAYLOAD = {
  product_name: "Stainless Steel Full-Bore Ball Valve",
  description:  "Industrial 316 SS ball valve for high-pressure steam and chemical service.",
  "Body Material":    "316 Stainless Steel",
  "Seat Material":    "PTFE",
  "Max Pressure":     "1000 PSI",
  "Max Temperature":  "200 °C",
  "Port Size":        "1/2 inch",
  "End Connection":   "Threaded NPT",
  "Bore Size":        "12.7 mm",
  "Cv Value":         "24.0",
  "Actuation":        "Manual lever",
  "Standards":        "ASME B16.34, CE, RoHS",
  "Weight":           "0.65 kg",
};

// ─────────────────────────────────────────────
export default function FileUploadZone({ onSubmit, isLoading }) {
  const [dragging, setDragging]     = useState(false);
  const [file, setFile]             = useState(null);
  const [error, setError]           = useState("");
  const [tab, setTab]               = useState("file");   // "file" | "json"
  const [jsonText, setJsonText]     = useState(JSON.stringify(DEMO_PAYLOAD, null, 2));
  const [jsonError, setJsonError]   = useState("");
  const [showDemo, setShowDemo]     = useState(false);
  const inputRef = useRef(null);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragOver  = useCallback(e => { e.preventDefault(); setDragging(true);  }, []);
  const handleDragLeave = useCallback(e => { e.preventDefault(); setDragging(false); }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    validateAndSetFile(dropped);
  }, []);

  const handleFileInput = useCallback(e => {
    validateAndSetFile(e.target.files[0]);
  }, []);

  const validateAndSetFile = (f) => {
    setError("");
    if (!f) return;
    if (!ACCEPTED_TYPES[f.type] && !f.name.match(/\.(pdf|json|csv)$/i)) {
      setError("Unsupported file type. Please upload a PDF, JSON, or CSV file.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("File exceeds 20 MB limit.");
      return;
    }
    setFile(f);
  };

  const clearFile = () => { setFile(null); setError(""); };

  // ── Submit handlers ────────────────────────────────────────────────────────
  const handleFileSubmit = () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("product_name", file.name.replace(/\.[^.]+$/, ""));
    onSubmit({ type: "file", formData });
  };

  const handleJsonSubmit = () => {
    setJsonError("");
    try {
      const parsed = JSON.parse(jsonText);
      onSubmit({ type: "json", payload: parsed });
    } catch {
      setJsonError("Invalid JSON – please check your syntax.");
    }
  };

  const loadDemo = () => {
    setJsonText(JSON.stringify(DEMO_PAYLOAD, null, 2));
    setTab("json");
  };

  // ── File type icon ─────────────────────────────────────────────────────────
  const FileIcon = file
    ? (ACCEPTED_TYPES[file.type]?.icon ?? FileText)
    : Upload;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl mb-4">
        {[["file", "Upload File"], ["json", "Paste JSON"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all
              ${tab === id
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── FILE TAB ── */}
      {tab === "file" && (
        <div className="space-y-4">
          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                relative flex flex-col items-center justify-center gap-4
                border-2 border-dashed rounded-2xl p-12 cursor-pointer
                transition-all duration-200 group
                ${dragging
                  ? "border-indigo-400 bg-indigo-900/30 scale-[1.01]"
                  : "border-slate-600 hover:border-indigo-500 hover:bg-slate-800/40"}
              `}
            >
              <div className={`p-4 rounded-2xl transition-colors
                ${dragging ? "bg-indigo-600/30" : "bg-slate-700/50 group-hover:bg-indigo-600/20"}`}>
                <Upload className={`w-8 h-8 transition-colors
                  ${dragging ? "text-indigo-300" : "text-slate-400 group-hover:text-indigo-400"}`} />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">
                  {dragging ? "Drop your file here" : "Drag & drop your file here"}
                </p>
                <p className="text-slate-400 text-sm mt-1">or click to browse</p>
                <p className="text-slate-500 text-xs mt-3">
                  Supports PDF datasheets, JSON specs, CSV tables · Max 20 MB
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                {Object.values(ACCEPTED_TYPES).map(({ label, ext }) => (
                  <span key={ext}
                    className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                    {ext}
                  </span>
                ))}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.json,.csv"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div className="flex items-center gap-4 p-5 bg-slate-800/60 border border-slate-600 rounded-2xl">
              <div className="p-3 bg-indigo-600/20 rounded-xl">
                <FileIcon className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{file.name}</p>
                <p className="text-slate-400 text-sm">
                  {(file.size / 1024).toFixed(1)} KB ·{" "}
                  {ACCEPTED_TYPES[file.type]?.label ?? "File"}
                </p>
              </div>
              <button onClick={clearFile}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleFileSubmit}
            disabled={!file || isLoading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700
              disabled:text-slate-500 text-white font-semibold rounded-xl transition-all
              flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isLoading ? "Processing…" : "Run AI Pipeline →"}
          </button>
        </div>
      )}

      {/* ── JSON TAB ── */}
      {tab === "json" && (
        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setJsonError(""); }}
              rows={14}
              spellCheck={false}
              className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-4
                text-slate-200 text-sm font-mono resize-none focus:outline-none
                focus:border-indigo-500 transition-colors"
              placeholder='{ "product_name": "...", "Body Material": "316 SS", ... }'
            />
            <button
              onClick={loadDemo}
              className="absolute top-3 right-3 px-3 py-1 bg-slate-700 hover:bg-slate-600
                text-slate-300 text-xs rounded-lg transition-colors"
            >
              Load Demo
            </button>
          </div>

          {jsonError && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">{jsonError}</p>
            </div>
          )}

          {/* Demo payload preview toggle */}
          <button
            onClick={() => setShowDemo(s => !s)}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            {showDemo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showDemo ? "Hide" : "Show"} sample industrial payloads
          </button>

          {showDemo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Ball Valve",         payload: DEMO_PAYLOAD },
                { label: "Pressure Transmitter", payload: {
                    product_name: "Industrial Pressure Transmitter",
                    "Measuring Range": "0-100 bar",
                    "Output Signal":   "4-20 mA",
                    "Supply Voltage":  "24 VDC",
                    "Connection":      "1/2 NPT",
                    "Accuracy":        "±0.5%",
                    "Housing":         "316 SS IP67",
                  }},
              ].map(({ label, payload }) => (
                <button
                  key={label}
                  onClick={() => setJsonText(JSON.stringify(payload, null, 2))}
                  className="p-4 bg-slate-800 hover:bg-slate-700 border border-slate-600
                    hover:border-indigo-500 rounded-xl text-left transition-all group"
                >
                  <p className="text-white font-medium text-sm group-hover:text-indigo-300 transition-colors">
                    {label}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    {Object.keys(payload).length - 2} spec attributes
                  </p>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleJsonSubmit}
            disabled={isLoading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700
              disabled:text-slate-500 text-white font-semibold rounded-xl transition-all
              flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isLoading ? "Processing…" : "Run AI Pipeline →"}
          </button>
        </div>
      )}
    </div>
  );
}
