import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2, AlertCircle, Loader2,
  Cpu, Network, FileText, ShieldCheck, Package,
} from "lucide-react";

const PHASE_META = [
  { n: 1, label: "Data Extraction",      icon: FileText,    color: "blue" },
  { n: 2, label: "Graph RAG Enrichment", icon: Network,     color: "indigo" },
  { n: 3, label: "Content Synthesis",    icon: Cpu,         color: "cyan" },
  { n: 4, label: "Compliance Audit",     icon: ShieldCheck, color: "emerald" },
  { n: 5, label: "PIM Formatting",       icon: Package,     color: "amber" },
];

const COLOR_MAP = {
  blue:    { ring: "ring-blue-200",    bg: "bg-blue-50",    text: "text-blue-600",    fill: "bg-blue-500",    border: "border-blue-100" },
  indigo:  { ring: "ring-indigo-200",  bg: "bg-indigo-50",  text: "text-indigo-600",  fill: "bg-indigo-500",  border: "border-indigo-100" },
  cyan:    { ring: "ring-cyan-200",    bg: "bg-cyan-50",    text: "text-cyan-600",    fill: "bg-cyan-500",    border: "border-cyan-100" },
  emerald: { ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-600", fill: "bg-emerald-500", border: "border-emerald-100" },
  amber:   { ring: "ring-amber-200",   bg: "bg-amber-50",   text: "text-amber-600",   fill: "bg-amber-500",   border: "border-amber-100" },
};

function PhaseIcon({ meta, status }) {
  const clr   = COLOR_MAP[meta.color];
  const Icon  = meta.icon;
  const base  = "w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 shrink-0";

  if (status === "complete") return (
    <div className={`${base} bg-emerald-50 border border-emerald-100 text-emerald-500`}>
      <CheckCircle2 className="w-5 h-5" />
    </div>
  );
  if (status === "running") return (
    <div className={`${base} ${clr.bg} ring-2 ${clr.ring} shadow-md shadow-${meta.color}-500/20 animate-pulse`}>
      <Icon className={`w-5 h-5 ${clr.text}`} />
    </div>
  );
  if (status === "error") return (
    <div className={`${base} bg-rose-50 border border-rose-100 text-rose-500`}>
      <AlertCircle className="w-5 h-5" />
    </div>
  );
  
  return (
    <div className={`${base} bg-slate-50 border border-slate-200 text-slate-400`}>
      <Icon className="w-5 h-5" />
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
  return <span className="text-xs text-blue-500 font-mono font-medium px-2 py-0.5 bg-blue-50 rounded-md">{m}:{s}</span>;
}

export default function PipelineStepper({ phases = {}, jobStatus = "idle" }) {
  const isRunning = jobStatus === "processing";
  const isDone    = jobStatus === "complete";
  const isFailed  = jobStatus === "failed";

  const completedCount = Object.values(phases).filter(p => p?.status === "complete").length;
  const overallPct     = Math.round((completedCount / 5) * 100);

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          {isDone    && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {isFailed  && <AlertCircle  className="w-4 h-4 text-rose-500" />}
          <span className="text-sm font-semibold text-slate-700">
            {isRunning ? "Pipeline active…"
            : isDone   ? "Pipeline complete"
            : isFailed ? "Pipeline failed"
            :            "Waiting for document"}
          </span>
          <ElapsedTimer running={isRunning} />
        </div>
        <span className="text-sm font-bold text-slate-500">{overallPct}%</span>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-2 mb-6 shadow-inner overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-400 to-indigo-500 h-2 rounded-full
            transition-all duration-700 ease-out relative"
          style={{ width: `${overallPct}%` }}
        >
          {isRunning && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
        </div>
      </div>

      <div className="space-y-3">
        {PHASE_META.map((meta) => {
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
                relative overflow-hidden rounded-2xl p-3 border transition-all duration-300 flex gap-4 items-center
                ${isAct
                  ? `bg-white border-${meta.color}-200 shadow-sm shadow-${meta.color}-100`
                  : status === "complete"
                    ? "bg-white border-slate-100 shadow-sm"
                    : "bg-slate-50/50 border-slate-100/50 opacity-70"}
              `}
            >
              <PhaseIcon meta={meta} status={status} />

              <div className="flex-1 min-w-0 py-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className={`font-semibold text-sm transition-colors
                    ${status === "complete" ? "text-slate-700"
                    : isAct ? "text-slate-900"
                    : "text-slate-500"}`}>
                    {meta.label}
                  </p>
                  
                  {isAct && (
                    <span className="text-xs font-bold text-slate-400">{prog}%</span>
                  )}
                  {status === "complete" && (
                     <span className="text-[10px] uppercase font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">Done</span>
                  )}
                </div>

                <p className="text-slate-500 text-xs truncate">
                  {status === "complete" ? "Completed successfully" : isAct && msg ? msg : "Waiting"}
                </p>

                {isAct && (
                  <div className="mt-2.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`${clr.fill} h-1.5 rounded-full transition-all duration-500 relative`}
                      style={{ width: `${prog}%` }}
                    >
                       <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
