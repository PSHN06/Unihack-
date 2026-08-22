import { Download, Code } from "lucide-react";

export default function ExportPanel({ pimData, jobId }) {
  if (!pimData) {
    return (
      <div className="text-center py-12 text-slate-400">
        Run the pipeline to generate an export payload.
      </div>
    );
  }

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pimData, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `pim_export_${jobId}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">PIM Export Payload</h3>
          <p className="text-sm text-slate-500">Commerce-ready JSON tailored for standard PIM/MDM systems.</p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm shadow-blue-500/20"
        >
          <Download className="w-4 h-4" />
          Download JSON
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-800 shadow-inner">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
            <Code className="w-3.5 h-3.5" />
            payload.json
          </div>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          </div>
        </div>
        <pre className="p-5 text-sm font-mono text-blue-300 overflow-auto max-h-[500px] custom-scrollbar selection:bg-blue-500/30">
          <code dangerouslySetInnerHTML={{
             __html: JSON.stringify(pimData, null, 2)
              .replace(/"(.*?)":/g, '<span class="text-blue-300">"$1"</span>:')
              .replace(/: "(.*?)"/g, ': <span class="text-emerald-300">"$1"</span>')
              .replace(/: ([0-9.]+)/g, ': <span class="text-amber-300">$1</span>')
              .replace(/: (true|false)/g, ': <span class="text-rose-300">$1</span>')
          }} />
        </pre>
      </div>
    </div>
  );
}
