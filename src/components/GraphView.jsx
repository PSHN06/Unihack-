import { GitBranch, Link } from "lucide-react";

export default function GraphView({ taxonomyData, relatedParts }) {
  if (!taxonomyData?.unspsc && (!relatedParts || relatedParts.length === 0)) {
    return (
      <div className="text-center py-12 text-slate-400">
        Run the pipeline to generate graph and taxonomy links.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* UNSPSC Node */}
        {taxonomyData?.unspsc && (
          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600 shrink-0">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">UNSPSC Node</p>
              <p className="font-mono text-slate-800 font-bold">{taxonomyData.unspsc.code}</p>
              <p className="text-sm text-slate-500 mt-1">{taxonomyData.unspsc.commodity_name}</p>
            </div>
          </div>
        )}

        {/* ETIM Node */}
        {taxonomyData?.etim && (
          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-start gap-4">
            <div className="p-3 bg-cyan-50 rounded-xl text-cyan-600 shrink-0">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">ETIM Node</p>
              <p className="font-mono text-slate-800 font-bold">{taxonomyData.etim.class_code}</p>
              <p className="text-sm text-slate-500 mt-1">{taxonomyData.etim.class_name}</p>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Link className="w-4 h-4 text-blue-500" />
          Related Entities (ChromaDB RAG)
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(relatedParts || []).map((part, i) => (
            <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors cursor-default group">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{part.title}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200">
                  {part.part_number}
                </span>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2">{part.description}</p>
              <div className="mt-3 flex items-center justify-between">
                 <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">Distance: {part.distance.toFixed(3)}</span>
                 <span className="text-xs font-medium text-blue-500">{part.category}</span>
              </div>
            </div>
          ))}
          {(!relatedParts || relatedParts.length === 0) && (
            <div className="col-span-2 p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center text-slate-500 text-sm">
              No related parts found in the vector database.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
