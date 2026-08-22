/**
 * GraphView.jsx
 * Interactive relationship graph showing:
 *  - Taxonomy hierarchy (UNSPSC segment → family → class → commodity)
 *  - Related parts/accessories/alternatives from Graph RAG
 *  - ETIM class features
 *
 * Rendered as a visual SVG node-link diagram (pure React, no D3 dependency).
 */

import { useState } from "react";
import {
  Box, Package, Wrench, GitBranch, Layers,
  Tag, ChevronRight, ExternalLink, Info, CheckCircle2,
} from "lucide-react";

// ── Color map by relationship type ────────────────────────────────────────────
const REL_STYLES = {
  parent:      { color: "#6366f1", label: "Parent Family",  icon: Layers  },
  accessory:   { color: "#22d3ee", label: "Accessory",      icon: Wrench  },
  alternative: { color: "#f59e0b", label: "Alternative",    icon: GitBranch },
  default:     { color: "#64748b", label: "Related",        icon: Box     },
};

// ── Taxonomy breadcrumb ────────────────────────────────────────────────────────
function TaxonomyTree({ unspsc, etim }) {
  if (!unspsc && !etim) return (
    <div className="flex items-center gap-2 text-slate-600 text-sm py-4">
      <Info className="w-4 h-4" />
      No taxonomy data available yet.
    </div>
  );

  const levels = unspsc ? [
    { code: unspsc.segment_code,   name: unspsc.segment_name,   label: "Segment" },
    { code: unspsc.family_code,    name: unspsc.family_name,    label: "Family"  },
    { code: unspsc.class_code,     name: unspsc.class_name,     label: "Class"   },
    { code: unspsc.commodity_code, name: unspsc.commodity_name, label: "Commodity" },
  ] : [];

  return (
    <div className="space-y-4">
      {/* UNSPSC Hierarchy */}
      {levels.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              UNSPSC v25
            </span>
            {unspsc?.confidence && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                ${unspsc.confidence >= 0.9 ? "bg-green-900/50 text-green-300"
                : unspsc.confidence >= 0.6 ? "bg-amber-900/50 text-amber-300"
                : "bg-red-900/50 text-red-300"}`}>
                {Math.round(unspsc.confidence * 100)}% confidence
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {levels.map((lvl, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600" />}
                <span className="group relative">
                  <span className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5
                    transition-all cursor-default
                    ${i === levels.length - 1
                      ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/30"
                      : "bg-slate-800 text-slate-400 border border-slate-700"}
                  `}>
                    <Tag className="w-3 h-3" />
                    {lvl.name || "–"}
                  </span>
                  {/* Tooltip */}
                  <span className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-slate-900
                    border border-slate-700 rounded text-xs text-slate-300 whitespace-nowrap
                    opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {lvl.label}: {lvl.code}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ETIM Classification */}
      {etim && (
        <div className="pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              ETIM {etim.version || "9.0"}
            </span>
            {etim.confidence && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                ${etim.confidence >= 0.9 ? "bg-green-900/50 text-green-300"
                : etim.confidence >= 0.6 ? "bg-amber-900/50 text-amber-300"
                : "bg-red-900/50 text-red-300"}`}>
                {Math.round(etim.confidence * 100)}% confidence
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl mb-3">
            <div className="p-2 bg-cyan-600/20 rounded-lg">
              <Package className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">{etim.class_name}</p>
              <p className="text-slate-500 text-xs font-mono">{etim.class_code}</p>
            </div>
          </div>

          {/* ETIM Features */}
          {etim.features?.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Classification Features ({etim.features.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {etim.features.map((feat, i) => (
                  <div key={i}
                    className={`flex items-center justify-between p-2.5 rounded-lg text-xs
                      border transition-colors
                      ${feat.value
                        ? "bg-slate-800/60 border-slate-700"
                        : "bg-slate-900/40 border-slate-800 opacity-60"}`}
                  >
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${feat.value ? "text-slate-200" : "text-slate-500"}`}>
                        {feat.name}
                      </p>
                      <p className="text-slate-600 font-mono text-xs">{feat.code}</p>
                    </div>
                    {feat.value ? (
                      <span className="ml-2 px-2 py-0.5 bg-cyan-900/40 text-cyan-300
                        rounded font-mono text-xs shrink-0">
                        {feat.value} {feat.unit}
                      </span>
                    ) : (
                      <span className="ml-2 text-slate-700 text-xs shrink-0">
                        {feat.data_type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Related Parts Graph ────────────────────────────────────────────────────────
function RelatedPartsGraph({ parts = [] }) {
  const [selected, setSelected] = useState(null);

  if (parts.length === 0) return (
    <div className="flex items-center gap-2 text-slate-600 text-sm py-4">
      <Info className="w-4 h-4" />
      No related parts discovered.
    </div>
  );

  // Group by type
  const grouped = parts.reduce((acc, p) => {
    (acc[p.type] = acc[p.type] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Central node */}
      <div className="flex flex-col items-center py-2">
        <div className="px-5 py-3 bg-indigo-600/20 border-2 border-indigo-500 rounded-2xl
          text-center shadow-lg shadow-indigo-500/20">
          <Package className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
          <p className="text-white font-semibold text-sm">This Product</p>
        </div>
        <div className="w-px h-6 bg-slate-700" />
      </div>

      {/* Relationship groups */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([type, items]) => {
          const style = REL_STYLES[type] || REL_STYLES.default;
          const Icon  = style.icon;
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px flex-1 bg-slate-800" />
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: style.color }}>
                  <Icon className="w-3.5 h-3.5" /> {style.label}
                </span>
                <div className="h-px flex-1 bg-slate-800" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((part, i) => (
                  <button
                    key={i}
                    onClick={() => setSelected(selected?.part_no === part.part_no ? null : part)}
                    className={`
                      group flex items-center gap-3 p-3 rounded-xl border text-left
                      transition-all cursor-pointer
                      ${selected?.part_no === part.part_no
                        ? "border-opacity-80 bg-opacity-20"
                        : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"}
                    `}
                    style={selected?.part_no === part.part_no
                      ? { borderColor: style.color + "80", backgroundColor: style.color + "18" }
                      : {}}
                  >
                    <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: style.color + "20" }}>
                      <Icon className="w-4 h-4" style={{ color: style.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-200 text-sm font-medium truncate group-hover:text-white
                        transition-colors">{part.name}</p>
                      <p className="text-slate-600 text-xs font-mono">{part.part_no}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected part detail */}
      {selected && (
        <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-white">{selected.name}</p>
            <button onClick={() => setSelected(null)}
              className="p-1 text-slate-600 hover:text-slate-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>Part No: <span className="font-mono text-slate-200">{selected.part_no}</span></span>
            <span>Type: <span className="text-slate-200 capitalize">{selected.type}</span></span>
          </div>
          <button className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300
            text-xs transition-colors">
            <ExternalLink className="w-3 h-3" /> View in catalog
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
export default function GraphView({ taxonomyData = {}, relatedParts = [] }) {
  const [activeTab, setActiveTab] = useState("taxonomy");

  const tabs = [
    { id: "taxonomy", label: "Taxonomy Tree", badge: null },
    { id: "graph",    label: "Related Parts", badge: relatedParts.length || null },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg
              text-sm font-medium transition-all
              ${activeTab === tab.id
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"}`}
          >
            {tab.label}
            {tab.badge !== null && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold
                ${activeTab === tab.id ? "bg-white/20" : "bg-slate-700 text-slate-300"}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-slate-900/40 rounded-2xl p-4 border border-slate-800 min-h-48">
        {activeTab === "taxonomy" && (
          <TaxonomyTree
            unspsc={taxonomyData?.unspsc}
            etim={taxonomyData?.etim}
          />
        )}
        {activeTab === "graph" && (
          <RelatedPartsGraph parts={relatedParts} />
        )}
      </div>
    </div>
  );
}
