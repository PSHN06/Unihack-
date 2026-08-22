/**
 * ExportPanel.jsx
 * One-click export panel for enriched PIM data.
 * Supports: Full JSON, Normalized CSV, ETIM Feature Sheet, Compliance Report.
 * Also shows a summary scorecard of classification quality.
 */

import { useState } from "react";
import {
  Download, FileJson, FileText, Shield, Package,
  CheckCircle2, AlertCircle, XCircle, Copy, Check,
  ExternalLink, BarChart3, Tag, Layers,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function buildNormalizedCSV(pimData) {
  const specs = pimData?.specifications?.normalized ?? {};
  const raw   = pimData?.specifications?.raw        ?? {};
  const headers = ["Attribute","Raw Value","SI Value","SI Unit","Imperial Value","Imperial Unit","Dual Label","Dimension","Confidence"];
  const rows = Object.keys(specs).map(k => {
    const n = specs[k];
    if (typeof n !== "object") return [k, raw[k] ?? "", n, "", "", "", "", "", ""].join(",");
    return [
      k, raw[k] ?? "", n.si_value ?? "", n.si_unit ?? "",
      n.imperial_value ?? "", n.imperial_unit ?? "",
      n.dual_label ?? "", n.dimension ?? "",
      n.confidence != null ? `${Math.round(n.confidence * 100)}%` : "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

function buildETIMSheet(pimData) {
  const etim = pimData?.classification?.etim ?? {};
  const features = etim.features ?? [];
  const header = [
    `ETIM Class: ${etim.class_name ?? ""} (${etim.class_code ?? ""})`,
    `Version: ${etim.version ?? "9.0"}`,
    `Confidence: ${Math.round((etim.confidence ?? 0) * 100)}%`,
    "",
    "Feature Code,Feature Name,Data Type,Unit,Extracted Value",
  ];
  const rows = features.map(f =>
    [f.code, f.name, f.data_type, f.unit ?? "", f.value ?? ""].map(v =>
      `"${String(v).replace(/"/g, '""')}"`).join(",")
  );
  return [...header, ...rows].join("\n");
}

function buildComplianceReport(pimData) {
  const comp = pimData?.compliance ?? {};
  const flags = comp.flags ?? [];
  const lines = [
    `COMPLIANCE AUDIT REPORT`,
    `Generated: ${new Date().toISOString()}`,
    `Overall Status: ${comp.overall_status ?? "UNKNOWN"}`,
    "",
    ...flags.map(f =>
      `${f.standard}\n  Status: ${f.status}\n  Note: ${f.note}\n  Confidence: ${Math.round((f.confidence ?? 0) * 100)}%\n`
    ),
  ];
  return lines.join("\n");
}

// ── Export button ─────────────────────────────────────────────────────────────
function ExportButton({ icon: Icon, label, sublabel, color, onClick, disabled }) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    onClick();
    setClicked(true);
    setTimeout(() => setClicked(false), 1800);
  };

  const clrMap = {
    indigo: { bg: "bg-indigo-600/10 hover:bg-indigo-600/20 border-indigo-700/40 hover:border-indigo-500/60",
               icon: "text-indigo-400", text: "text-indigo-300" },
    cyan:   { bg: "bg-cyan-600/10   hover:bg-cyan-600/20   border-cyan-700/40   hover:border-cyan-500/60",
               icon: "text-cyan-400",   text: "text-cyan-300"   },
    green:  { bg: "bg-green-600/10  hover:bg-green-600/20  border-green-700/40  hover:border-green-500/60",
               icon: "text-green-400",  text: "text-green-300"  },
    amber:  { bg: "bg-amber-600/10  hover:bg-amber-600/20  border-amber-700/40  hover:border-amber-500/60",
               icon: "text-amber-400",  text: "text-amber-300"  },
  };
  const clr = clrMap[color] || clrMap.indigo;

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        group flex items-center gap-4 p-4 rounded-2xl border transition-all
        text-left w-full
        ${disabled ? "opacity-40 cursor-not-allowed bg-slate-800/30 border-slate-800"
        : `cursor-pointer ${clr.bg}`}
      `}
    >
      <div className={`p-3 rounded-xl bg-black/20 ${disabled ? "text-slate-600" : clr.icon} transition-colors`}>
        {clicked
          ? <Check className="w-5 h-5 text-green-400" />
          : <Icon  className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${disabled ? "text-slate-600" : "text-white"}`}>
          {clicked ? "Downloaded!" : label}
        </p>
        <p className={`text-xs mt-0.5 ${disabled ? "text-slate-700" : "text-slate-500"}`}>
          {sublabel}
        </p>
      </div>
      {!disabled && !clicked && (
        <Download className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors shrink-0" />
      )}
    </button>
  );
}

// ── Quality scorecard ─────────────────────────────────────────────────────────
function QualityScorecard({ pimData }) {
  if (!pimData) return null;

  const q      = pimData.quality ?? {};
  const unspsc = pimData.classification?.unspsc ?? {};
  const etim   = pimData.classification?.etim   ?? {};
  const comp   = pimData.compliance ?? {};

  const overallConf = q.overall_confidence ?? 0;
  const pct         = Math.round(overallConf * 100);

  const compStatus  = comp.overall_status ?? "UNKNOWN";
  const compColor   = compStatus === "PASS"   ? "text-green-400"
                    : compStatus === "REVIEW" ? "text-amber-400"
                    : "text-red-400";

  const meter = pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-300">Classification Quality</h4>
      </div>

      {/* Overall score */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Overall Confidence</span>
          <span className={`font-bold ${pct >= 90 ? "text-green-400" : pct >= 60 ? "text-amber-400" : "text-red-400"}`}>
            {pct}%
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div className={`${meter} h-2 rounded-full transition-all duration-700`}
            style={{ width: `${pct}%` }} />
        </div>
        <p className="text-slate-600 text-xs">Resolution: {q.resolution_path ?? "—"}</p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "UNSPSC", value: unspsc.code || "—", sub: unspsc.commodity_name, icon: Tag,    color: "text-indigo-300" },
          { label: "ETIM",   value: etim.class_code || "—", sub: etim.class_name,   icon: Layers, color: "text-cyan-300"   },
          { label: "Attributes", value: q.attribute_count ?? 0, sub: `${q.normalized_count ?? 0} normalized`, icon: Package, color: "text-violet-300" },
          { label: "Compliance", value: compStatus, sub: `${(comp.flags ?? []).length} checks`, icon: Shield, color: compColor },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900/40 rounded-xl p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-slate-500 text-xs">{label}</span>
            </div>
            <p className={`font-bold font-mono text-sm ${color}`}>{value}</p>
            {sub && <p className="text-slate-600 text-xs truncate">{sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Copy JSON snippet ─────────────────────────────────────────────────────────
function JsonPreview({ pimData }) {
  const [copied, setCopied] = useState(false);
  const snippet = JSON.stringify({
    product: pimData?.product ?? {},
    classification: pimData?.classification ?? {},
  }, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(pimData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative">
      <pre className="bg-slate-900/80 rounded-xl p-4 text-xs text-slate-400 font-mono
        overflow-auto max-h-48 border border-slate-800">
        {snippet.slice(0, 600)}{snippet.length > 600 ? "\n  … (truncated)" : ""}
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5
          bg-slate-700/80 hover:bg-slate-600 rounded-lg text-xs text-slate-300
          transition-colors"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied!" : "Copy All"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
export default function ExportPanel({ pimData, jobId }) {
  const hasData = !!pimData;

  const exports = [
    {
      icon:     FileJson,
      label:    "Full PIM JSON",
      sublabel: "Complete enriched payload with all phases",
      color:    "indigo",
      onClick:  () => downloadBlob(
        JSON.stringify(pimData, null, 2),
        `pim_export_${jobId || "result"}.json`,
        "application/json"
      ),
    },
    {
      icon:     FileText,
      label:    "Normalized Specs CSV",
      sublabel: "Raw vs. normalized attributes with dual units",
      color:    "cyan",
      onClick:  () => downloadBlob(
        buildNormalizedCSV(pimData),
        `normalized_specs_${jobId || "result"}.csv`,
        "text/csv"
      ),
    },
    {
      icon:     Layers,
      label:    "ETIM Feature Sheet",
      sublabel: "ETIM class features and extracted values",
      color:    "green",
      onClick:  () => downloadBlob(
        buildETIMSheet(pimData),
        `etim_features_${jobId || "result"}.csv`,
        "text/csv"
      ),
    },
    {
      icon:     Shield,
      label:    "Compliance Report",
      sublabel: "RoHS, REACH, CE, PED audit summary",
      color:    "amber",
      onClick:  () => downloadBlob(
        buildComplianceReport(pimData),
        `compliance_report_${jobId || "result"}.txt`,
        "text/plain"
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Quality scorecard */}
      {hasData && <QualityScorecard pimData={pimData} />}

      {/* Export buttons */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
          Download Exports
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {exports.map(e => (
            <ExportButton key={e.label} {...e} disabled={!hasData} />
          ))}
        </div>
      </div>

      {/* JSON Preview */}
      {hasData && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Payload Preview
          </h4>
          <JsonPreview pimData={pimData} />
        </div>
      )}

      {!hasData && (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <div className="p-4 bg-slate-800/50 rounded-2xl">
            <Package className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-slate-500 text-sm">
            Run the pipeline to unlock exports
          </p>
        </div>
      )}
    </div>
  );
}
