/**
 * PipelineStepper.jsx
 * Real-time phase tracking component with animated progress bars,
 * status indicators, and elapsed time tracking.
 */

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2, Circle, AlertCircle, Loader2,
  Cpu, Network, FileText, ShieldCheck, Package,
} from "lucide-react";

const PHASE_META = [
  {
    n: 1, label: "Raw Data Extraction",
    desc: "Parses input, extracts attributes, normalizes UOMs",
    icon: FileText,
    color: "violet",
  },
  {
    n: 2, label: "Graph RAG Enrichment",
    desc: "Links entities, identifies related parts & taxonomy",
    icon: Network,
    color: "blue",
  },
  {
    n: 3, label: "Content Synthesis",
    desc: "Generates B2B titles, descriptions, and keyword sets",
    icon: Cpu,
    color: "cyan",
  },
  {
    n: 4, label: "Compliance Audit",
    desc: "Checks RoHS, REACH, CE marking, PED applicability",
    icon: ShieldCheck,
    color: "green",
  },
  {
    n: 5, label: "PIM Export Formatting",
    desc: "Assembles final structured commerce-ready payload",
    icon: Package,
    color: "amber",
  },
];

const COLOR_MAP = {
  violet: { ring: "ring-violet-500", bg: "bg-violet-500", text: "text-violet-400", glow: "shadow-violet-500/30" },
  blue:   { ring: "ring-blue-500",   bg: "bg-blue-500",   text: "text-blue-400",   glow: "shadow-blue-500/30"   },
  cyan:   { ring: "ring-cyan-500",   bg: "bg-cyan-500",   text: "text-cyan-400",   glow: "shadow-cyan-500/30"   },
  green:  { ring: "ring-green-500",  bg: "bg-green-500",  text: "text-green-400",  glow: "shadow-green-500/30"  },
  amber:  { ring: "ring-amber-500",  bg: "bg-amber-500",  text: "text-amber-400",  glow: "shadow-amber-500/30"  },
};

function PhaseIcon({ meta, status }) {
  const clr   = COLOR_MAP[meta.color];
  const Icon  = meta.icon;
  const base  = "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500";

  if (status === "complete") return (
    <div className={`${base} bg-green-600/20 ring-1 ring-green-500`}>
      <CheckCircle2 className="w-5 h-5 text-green-400" />
    </div>
  );
  if (status === "running") return (
    <div className={`${base} ${clr.bg}/20 ring-2 ${clr.ring} shadow-lg ${clr.glow} animate-pulse`}>
      <Icon className={`w-5 h-5 ${clr.text}`} />
    </div>
  );
  if (status === "error") return (
    <div className={`${base} bg-red-600/20 ring-1 ring-red-500`}>
      <AlertCircle className="w-5 h-5 text-red-400" />
    </div>
  );
  // pending
  return (
    <div className={`${base} bg-slate-800 ring-1 ring-slate-700`}>
      <Icon className="w-5 h-5 text-slate-600" />
    </div>
  );
}

function ElapsedTimer({ running }) {
  const [secs, setSecs] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (running) {
      setSecs(0);
      ref.current = setInterval(() => setSecs(s => s + 1), 1000);
    } else {
      clearInterval(ref.current);
    }
    return () => clearInterval(ref.current);
  }, [running]);

  if (!running) return null;
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return <span className="text-xs text-slate-500 font-mono">{m}:{s}</span>;
}

// ─────────────────────────────────────────────
export default function PipelineStepper({ phases = {}, jobStatus = "idle" }) {
  const isRunning = jobStatus === "processing";
  const isDone    = jobStatus === "complete";
  const isFailed  = jobStatus === "failed";

  const completedCount = Object.values(phases).filter(p => p?.status === "complete").length;
  const overallPct     = Math.round((completedCount / 5) * 100);

  return (
    <div className="w-full space-y-4">
      {/* Overall progress bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
          {isDone    && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          {isFailed  && <AlertCircle  className="w-4 h-4 text-red-400" />}
          <span className="text-sm font-medium text-slate-300">
            {isRunning ? "Pipeline running…"
            : isDone   ? "Pipeline complete"
            : isFailed ? "Pipeline failed"
            :            "Waiting for input"}
          </span>
          <ElapsedTimer running={isRunning} />
        </div>
        <span className="text-sm font-mono text-slate-400">{overallPct}%</span>
      </div>

      <div className="w-full bg-slate-800 rounded-full h-1.5 mb-5">
        <div
          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full
            transition-all duration-700 ease-out"
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* Phase rows */}
      <div className="space-y-2">
        {PHASE_META.map((meta, idx) => {
          const phase  = phases[meta.n] || {};
          const status = phase.status || "pending";
          const prog   = phase.progress || 0;
          const msg    = phase.message  || "";
          const clr    = COLOR_MAP[meta.color];
          const isAct  = status === "running";

          return (
            <div
              key={meta.n}
              className={`
                relative overflow-hidden rounded-2xl p-4 border transition-all duration-300
                ${isAct
                  ? `bg-slate-800/80 border-${meta.color}-500/30`
                  : status === "complete"
                    ? "bg-slate-800/50 border-green-900/30"
                    : "bg-slate-900/40 border-slate-800"}
              `}
            >
              {/* Background progress fill for active phase */}
              {isAct && (
                <div
                  className={`absolute inset-0 ${clr.bg}/5 transition-all duration-500`}
                  style={{ width: `${prog}%` }}
                />
              )}

              <div className="relative flex items-start gap-4">
                <PhaseIcon meta={meta} status={status} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-widest ${clr.text}`}>
                        Phase {meta.n}
                      </span>
                      {status === "complete" && (
                        <span className="text-xs px-2 py-0.5 bg-green-900/40 text-green-400 rounded-full">
                          Done
                        </span>
                      )}
                      {status === "error" && (
                        <span className="text-xs px-2 py-0.5 bg-red-900/40 text-red-400 rounded-full">
                          Error
                        </span>
                      )}
                    </div>
                    {isAct && (
                      <span className="text-xs font-mono text-slate-400">{prog}%</span>
                    )}
                  </div>

                  <p className={`font-semibold mt-0.5 transition-colors
                    ${status === "complete" ? "text-slate-300"
                    : isAct ? "text-white"
                    : "text-slate-500"}`}>
                    {meta.label}
                  </p>

                  <p className="text-slate-500 text-xs mt-0.5">
                    {isAct && msg ? msg : meta.desc}
                  </p>

                  {/* Phase-level progress bar */}
                  {isAct && (
                    <div className="mt-2 w-full bg-slate-700/50 rounded-full h-1">
                      <div
                        className={`${clr.bg} h-1 rounded-full transition-all duration-500`}
                        style={{ width: `${prog}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
