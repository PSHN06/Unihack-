import { useCallback, useRef, useState } from "react";
import {
  Upload, FileJson, FileText, AlertCircle,
  CheckCircle2, Loader2, X, ChevronDown, ChevronUp, FileSpreadsheet
} from "lucide-react";

const ACCEPTED_TYPES = {
  "application/pdf":  { label: "PDF Datasheet", ext: ".pdf",  icon: FileText },
  "application/json": { label: "JSON Payload",  ext: ".json", icon: FileJson },
  "text/csv":         { label: "CSV Specs",      ext: ".csv",  icon: FileSpreadsheet },
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

export default function FileUploadZone({ onSubmit, isLoading }) {
  const [dragging, setDragging]     = useState(false);
  const [file, setFile]             = useState(null);
  const [error, setError]           = useState("");
  const [tab, setTab]               = useState("file");
  const [jsonText, setJsonText]     = useState(JSON.stringify(DEMO_PAYLOAD, null, 2));
  const [jsonError, setJsonError]   = useState("");
  const [showDemo, setShowDemo]     = useState(false);
  const inputRef = useRef(null);

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

  const FileIcon = file
    ? (ACCEPTED_TYPES[file.type]?.icon ?? FileText)
    : Upload;

  return (
    <div className="w-full">
      {/* Light Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
        {[["file", "Upload File"], ["json", "Paste JSON"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all
              ${tab === id
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm border border-slate-200/50 dark:border-slate-600/50"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"}`}
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
                border-2 border-dashed rounded-2xl p-10 cursor-pointer
                transition-all duration-200 group bg-slate-50 dark:bg-slate-900/50
                ${dragging
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]"
                  : "border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"}
              `}
            >
              <div className={`p-4 rounded-full transition-colors
                ${dragging ? "bg-blue-100 dark:bg-blue-900/40" : "bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 group-hover:bg-blue-50 dark:group-hover:bg-slate-700"}`}>
                <Upload className={`w-6 h-6 transition-colors
                  ${dragging ? "text-blue-500" : "text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400"}`} />
              </div>
              <div className="text-center">
                <p className="text-slate-700 dark:text-slate-300 font-medium text-sm">
                  {dragging ? "Drop your file here" : "Click or drag file to upload"}
                </p>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-2">
                  Supports PDF, JSON, CSV (Max 20 MB)
                </p>
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
            <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm rounded-2xl">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
                <FileIcon className="w-6 h-6 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 dark:text-slate-200 font-medium truncate text-sm">{file.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB ·{" "}
                  {ACCEPTED_TYPES[file.type]?.label ?? "File"}
                </p>
              </div>
              <button onClick={clearFile}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <p className="text-rose-600 dark:text-rose-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleFileSubmit}
            disabled={!file || isLoading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 
              disabled:from-slate-200 disabled:to-slate-200 dark:disabled:from-slate-800 dark:disabled:to-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600
              text-white font-medium rounded-xl transition-all shadow-md shadow-blue-500/20
              flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isLoading ? "Processing…" : "Analyze Document"}
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
              rows={12}
              spellCheck={false}
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4
                text-slate-700 dark:text-slate-300 text-sm font-mono resize-none focus:outline-none
                focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-500 transition-all"
              placeholder='{ "product_name": "...", "Body Material": "316 SS", ... }'
            />
          </div>

          {jsonError && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <p className="text-rose-600 dark:text-rose-400 text-sm">{jsonError}</p>
            </div>
          )}

          <button
            onClick={() => setShowDemo(s => !s)}
            className="flex items-center gap-2 text-blue-500 hover:text-blue-600 font-medium text-xs transition-colors"
          >
            {showDemo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDemo ? "Hide templates" : "View template payloads"}
          </button>

          {showDemo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
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
                  className="p-3 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800
                    hover:border-blue-200 dark:hover:border-slate-600 rounded-xl text-left transition-all group shadow-sm"
                >
                  <p className="text-slate-800 dark:text-slate-200 font-medium text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {label}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                    {Object.keys(payload).length - 2} spec attributes
                  </p>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleJsonSubmit}
            disabled={isLoading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 
              disabled:from-slate-200 disabled:to-slate-200 dark:disabled:from-slate-800 dark:disabled:to-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600
              text-white font-medium rounded-xl transition-all shadow-md shadow-blue-500/20
              flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isLoading ? "Processing…" : "Analyze Payload"}
          </button>
        </div>
      )}
    </div>
  );
}
