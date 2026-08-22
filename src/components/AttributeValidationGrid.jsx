/**
 * AttributeValidationGrid.jsx
 * Side-by-side editable comparison grid: Raw vs. Normalized specs.
 * Features:
 *  - Confidence score color coding (Green ≥90%, Amber 60–90%, Red <60%)
 *  - Inline cell editing with save/discard
 *  - Dimension type badges
 *  - Sort / filter controls
 *  - Export to CSV
 */

import { useState, useMemo, useCallback } from "react";
import {
  CheckCircle2, AlertCircle, XCircle, Edit3, Check,
  X, ChevronUp, ChevronDown, Search, Download, RefreshCw,
} from "lucide-react";

// ── Confidence badge ───────────────────────────────────────────────────────────
function ConfidenceBadge({ score }) {
  if (score === undefined || score === null) return null;
  const pct = Math.round(score * 100);

  if (pct >= 90) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
      font-semibold bg-green-900/50 text-green-300 border border-green-700/50">
      <CheckCircle2 className="w-3 h-3" /> {pct}%
    </span>
  );
  if (pct >= 60) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
      font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
      <AlertCircle className="w-3 h-3" /> {pct}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
      font-semibold bg-red-900/50 text-red-300 border border-red-700/50">
      <XCircle className="w-3 h-3" /> {pct}%
    </span>
  );
}

// ── Dimension badge ────────────────────────────────────────────────────────────
const DIM_COLORS = {
  pressure:    "bg-blue-900/50 text-blue-300",
  temperature: "bg-orange-900/50 text-orange-300",
  length:      "bg-purple-900/50 text-purple-300",
  voltage:     "bg-yellow-900/50 text-yellow-300",
  flow_rate:   "bg-cyan-900/50 text-cyan-300",
  weight:      "bg-pink-900/50 text-pink-300",
  torque:      "bg-indigo-900/50 text-indigo-300",
  frequency:   "bg-teal-900/50 text-teal-300",
};

function DimBadge({ dim }) {
  if (!dim || dim === "unknown") return null;
  const cls = DIM_COLORS[dim] || "bg-slate-700/50 text-slate-400";
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-mono uppercase ${cls}`}>
      {dim.replace("_", " ")}
    </span>
  );
}

// ── Editable cell ──────────────────────────────────────────────────────────────
function EditableCell({ value, onSave, className = "" }) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(value);

  const save = () => { onSave(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (!editing) return (
    <div
      className={`group flex items-center gap-2 cursor-pointer ${className}`}
      onClick={() => setEditing(true)}
    >
      <span className="flex-1 truncate">{value || "—"}</span>
      <Edit3 className="w-3 h-3 text-slate-600 group-hover:text-indigo-400
        opacity-0 group-hover:opacity-100 transition-all shrink-0" />
    </div>
  );

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
        className="flex-1 bg-indigo-900/40 border border-indigo-500 rounded px-2 py-0.5
          text-white text-sm focus:outline-none"
      />
      <button onClick={save}   className="p-1 text-green-400 hover:text-green-300"><Check className="w-3 h-3" /></button>
      <button onClick={cancel} className="p-1 text-slate-500 hover:text-red-400"><X    className="w-3 h-3" /></button>
    </div>
  );
}

// ─────────────────────────────────────────────
export default function AttributeValidationGrid({ rawSpecs = {}, normalizedSpecs = {}, onSpecUpdate }) {
  const [sortKey,    setSortKey]    = useState("attribute");
  const [sortDir,    setSortDir]    = useState("asc");
  const [filter,     setFilter]     = useState("");
  const [confFilter, setConfFilter] = useState("all");  // "all" | "high" | "med" | "low"
  const [localSpecs, setLocalSpecs] = useState(normalizedSpecs);

  // Merge raw + normalized into row array
  const rows = useMemo(() => {
    const allKeys = new Set([...Object.keys(rawSpecs), ...Object.keys(localSpecs)]);
    return Array.from(allKeys).map(key => {
      const raw  = rawSpecs[key];
      const norm = localSpecs[key];
      const conf = typeof norm === "object" ? (norm?.confidence ?? null) : null;
      return { key, raw, norm, conf };
    });
  }, [rawSpecs, localSpecs]);

  // Filter
  const filtered = useMemo(() => {
    let r = rows;
    if (filter) {
      const q = filter.toLowerCase();
      r = r.filter(row => row.key.toLowerCase().includes(q) ||
        String(row.raw).toLowerCase().includes(q));
    }
    if (confFilter !== "all") {
      r = r.filter(row => {
        const c = row.conf ?? 0;
        if (confFilter === "high") return c >= 0.9;
        if (confFilter === "med")  return c >= 0.6 && c < 0.9;
        if (confFilter === "low")  return c < 0.6;
        return true;
      });
    }
    return r;
  }, [rows, filter, confFilter]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "attribute") return dir * a.key.localeCompare(b.key);
      if (sortKey === "confidence") return dir * ((a.conf ?? -1) - (b.conf ?? -1));
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = useCallback(key => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp   className="w-3 h-3 text-indigo-400" />
      : <ChevronDown className="w-3 h-3 text-indigo-400" />;
  };

  // Cell edit handler
  const handleEdit = useCallback((key, field, value) => {
    setLocalSpecs(prev => {
      const updated = { ...prev, [key]: typeof prev[key] === "object"
        ? { ...prev[key], [field]: value }
        : { raw_text: value } };
      onSpecUpdate?.(updated);
      return updated;
    });
  }, [onSpecUpdate]);

  // Export to CSV
  const exportCSV = () => {
    const headers = ["Attribute", "Raw Value", "Normalized (SI)", "Dual Label", "Dimension", "Confidence"];
    const csvRows = sorted.map(row => {
      const n = row.norm;
      return [
        row.key,
        row.raw,
        typeof n === "object" ? `${n.si_value ?? ""} ${n.si_unit ?? ""}` : String(n ?? ""),
        typeof n === "object" ? (n.dual_label ?? "") : "",
        typeof n === "object" ? (n.dimension ?? "") : "",
        typeof n === "object" ? (n.confidence ?? "") : "",
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    });
    const csv  = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url;
    a.download = "normalized_specs.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const stats = useMemo(() => ({
    total: rows.length,
    high:  rows.filter(r => (r.conf ?? 0) >= 0.9).length,
    med:   rows.filter(r => (r.conf ?? 0) >= 0.6 && (r.conf ?? 0) < 0.9).length,
    low:   rows.filter(r => (r.conf ?? 0) > 0 && (r.conf ?? 0) < 0.6).length,
    unparsed: rows.filter(r => !r.conf).length,
  }), [rows]);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total",    val: stats.total,    cls: "text-white" },
          { label: "≥90%",     val: stats.high,     cls: "text-green-400" },
          { label: "60–90%",   val: stats.med,      cls: "text-amber-400" },
          { label: "<60%",     val: stats.low + stats.unparsed, cls: "text-red-400" },
        ].map(({ label, val, cls }) => (
          <div key={label} className="bg-slate-800/60 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${cls}`}>{val}</p>
            <p className="text-slate-500 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter attributes…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2
              text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none
              focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex gap-1.5 p-1 bg-slate-800/60 rounded-xl">
          {[["all","All"], ["high","≥90%"], ["med","60–90%"], ["low","<60%"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setConfFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${confFilter === id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"}`}
            >{label}</button>
          ))}
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600
            text-slate-300 hover:text-white text-xs rounded-xl transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/80 border-b border-slate-700">
              <th
                onClick={() => toggleSort("attribute")}
                className="text-left px-4 py-3 text-slate-400 font-medium cursor-pointer
                  hover:text-slate-200 transition-colors select-none"
              >
                <div className="flex items-center gap-1.5">
                  Attribute <SortIcon col="attribute" />
                </div>
              </th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium w-1/4">
                Raw Value
              </th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium w-1/3">
                Normalized (Dual-Unit)
              </th>
              <th
                onClick={() => toggleSort("confidence")}
                className="text-left px-4 py-3 text-slate-400 font-medium cursor-pointer
                  hover:text-slate-200 transition-colors select-none"
              >
                <div className="flex items-center gap-1.5">
                  Confidence <SortIcon col="confidence" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-600">
                  No attributes match the current filter.
                </td>
              </tr>
            )}
            {sorted.map(({ key, raw, norm }) => {
              const isObj  = typeof norm === "object" && norm !== null;
              const dual   = isObj ? norm.dual_label  : (norm ?? "");
              const dim    = isObj ? norm.dimension    : null;
              const conf   = isObj ? norm.confidence   : null;
              const edited = isObj && norm._edited;

              return (
                <tr
                  key={key}
                  className={`
                    transition-colors hover:bg-slate-800/30
                    ${edited ? "bg-indigo-950/30" : ""}
                  `}
                >
                  {/* Attribute name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200">{key}</span>
                      {edited && (
                        <span className="text-xs px-1.5 bg-indigo-900/50 text-indigo-400 rounded">
                          edited
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Raw value */}
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                    {String(raw ?? "—")}
                  </td>

                  {/* Normalized + editable */}
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <EditableCell
                        value={String(dual ?? "—")}
                        onSave={v => handleEdit(key, "dual_label", v)}
                        className="text-slate-200 font-mono text-xs"
                      />
                      {dim && <DimBadge dim={dim} />}
                    </div>
                  </td>

                  {/* Confidence */}
                  <td className="px-4 py-3">
                    <ConfidenceBadge score={conf} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-slate-600 text-xs text-right">
        Showing {sorted.length} of {rows.length} attributes · Click any value to edit
      </p>
    </div>
  );
}
