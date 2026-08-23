import { GitBranch, Link as LinkIcon, Network } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";

export default function GraphView({ taxonomyData, relatedParts }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 450 });

  const isDarkMode = typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width } = entries[0].contentRect;
        setDimensions({ width, height: 450 });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!taxonomyData?.unspsc && (!relatedParts || relatedParts.length === 0)) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        Run the pipeline to generate graph and taxonomy links.
      </div>
    );
  }

  const graphData = useMemo(() => {
    const nodes = [];
    const links = [];

    // Central Input Node
    nodes.push({ id: "input", name: "Input Product", group: "input", val: 14, color: "#f97316" });

    // UNSPSC Node
    if (taxonomyData?.unspsc) {
      nodes.push({ 
        id: "unspsc", 
        name: taxonomyData.unspsc.commodity_name || "UNSPSC", 
        code: taxonomyData.unspsc.commodity_code,
        group: "taxonomy", 
        val: 10, 
        color: "#3b82f6" 
      });
      links.push({ source: "input", target: "unspsc" });
    }

    // ETIM Node
    if (taxonomyData?.etim) {
      nodes.push({ 
        id: "etim", 
        name: taxonomyData.etim.class_name || "ETIM", 
        code: taxonomyData.etim.class_code,
        group: "taxonomy", 
        val: 10, 
        color: "#06b6d4" 
      });
      links.push({ source: "input", target: "etim" });
    }

    // Related Parts
    if (relatedParts && relatedParts.length > 0) {
      relatedParts.forEach((part, i) => {
        const partId = `part_${i}`;
        nodes.push({ 
          id: partId, 
          name: part.part_number, 
          title: part.title,
          group: "rag", 
          val: 7, 
          color: "#8b5cf6" 
        });
        
        // Link them to UNSPSC if available (representing semantic connection), else direct
        if (taxonomyData?.unspsc) {
          links.push({ source: "unspsc", target: partId });
        } else {
          links.push({ source: "input", target: partId });
        }
      });
    }

    return { nodes, links };
  }, [taxonomyData, relatedParts]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Network className="w-5 h-5 text-orange-500" />
          Interactive Knowledge Graph
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
          Drag nodes to explore relations
        </span>
      </div>

      <div 
        ref={containerRef} 
        className="w-full h-[450px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-inner relative cursor-crosshair"
      >
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel={(node) => `${node.name}${node.code ? ` (${node.code})` : ''}`}
          nodeRelSize={1}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name || '';
            const fontSize = Math.max(12 / globalScale, 2);
            ctx.font = `${fontSize}px Sans-Serif`;
            
            // Draw Node Circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color;
            ctx.fill();

            // Draw Label text below node
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = isDarkMode ? '#cbd5e1' : '#475569';
            ctx.fillText(label, node.x, node.y + node.val + (4 / globalScale));
          }}
          linkColor={() => 'rgba(156, 163, 175, 0.5)'}
          linkWidth={1.5}
          backgroundColor="transparent"
          d3VelocityDecay={0.2}
          cooldownTicks={100}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-medium px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm w-max mx-auto mt-[-10px] relative z-10">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#f97316]"></span>
          <span className="text-slate-600 dark:text-slate-400">Input Product</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#3b82f6]"></span>
          <span className="text-slate-600 dark:text-slate-400">UNSPSC Node</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#06b6d4]"></span>
          <span className="text-slate-600 dark:text-slate-400">ETIM Node</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#8b5cf6]"></span>
          <span className="text-slate-600 dark:text-slate-400">Related RAG Entity</span>
        </div>
      </div>

      {/* Cards for detail view below the graph */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {taxonomyData?.unspsc && (
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex items-start gap-4">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">UNSPSC Node</p>
              <p className="font-mono text-slate-800 dark:text-slate-200 font-bold text-sm">{taxonomyData.unspsc.commodity_code}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{taxonomyData.unspsc.commodity_name}</p>
            </div>
          </div>
        )}

        {taxonomyData?.etim && (
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex items-start gap-4">
            <div className="p-2 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg text-cyan-600 dark:text-cyan-400 shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">ETIM Node</p>
              <p className="font-mono text-slate-800 dark:text-slate-200 font-bold text-sm">{taxonomyData.etim.class_code}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{taxonomyData.etim.class_name}</p>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-purple-500" />
          Related Entities Detail
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(relatedParts || []).map((part, i) => (
            <div key={i} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:border-purple-300 dark:hover:border-slate-600 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">{part.title}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700">
                  {part.part_number}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{part.description}</p>
              <div className="mt-3 flex items-center justify-between">
                 <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded">Distance: {part.distance.toFixed(3)}</span>
                 <span className="text-xs font-medium text-purple-500 dark:text-purple-400">{part.category}</span>
              </div>
            </div>
          ))}
          {(!relatedParts || relatedParts.length === 0) && (
            <div className="col-span-2 p-6 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 border-dashed rounded-xl text-center text-slate-500 dark:text-slate-400 text-sm">
              No related parts found in the vector database.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
