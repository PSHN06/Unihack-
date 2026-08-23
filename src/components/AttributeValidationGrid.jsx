export default function AttributeValidationGrid({ rawSpecs, normalizedSpecs }) {
  const keys = Array.from(new Set([...Object.keys(rawSpecs || {}), ...Object.keys(normalizedSpecs || {})]));
  if (keys.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        Run the pipeline to extract attributes.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-4 font-semibold">Attribute Name</th>
              <th className="px-6 py-4 font-semibold">Extracted Value</th>
              <th className="px-6 py-4 font-semibold">Normalized Standard</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {keys.map((k) => {
              const raw = rawSpecs[k] || "—";
              const normObj = normalizedSpecs[k];
              const isNormalized = !!normObj?.dual_label;
              const normLabel = isNormalized ? normObj.dual_label : "—";
              const isChange = isNormalized && raw !== normLabel;

              return (
                <tr key={k} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-200">{k}</td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{raw}</td>
                  <td className="px-6 py-3">
                    {isChange ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800 font-mono text-xs font-semibold shadow-sm">
                        <span className="text-blue-400 dark:text-blue-500">✨</span> {normLabel}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">{normLabel}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
