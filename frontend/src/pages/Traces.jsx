import { useState, useEffect } from "react";
import { api } from "../api/client.js";

export default function TracesPage() {
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.get("/traces").then((d) => {
      setTraces(Array.isArray(d) ? d : []);
    }).catch(() => setTraces([])).finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? traces : traces.filter((t) => (t.category||"").toLowerCase() === filter.toLowerCase());

  function catClass(c) {
    if (c === "production") return "bg-status-bg-success text-status-success";
    if (c === "temperature") return "bg-status-bg-info text-status-info";
    if (c === "pressure") return "bg-status-bg-warning text-status-warning";
    if (c === "material") return "bg-accent-lilac-bg text-brand-lilac";
    if (c === "op_input") return "bg-brand-primary/10 text-brand-primary";
    return "";
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Process Traces</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Erfassungsdaten aller Stationen</p>
        </div>

        <div className="flex gap-1.5" role="group">
          {["all","production","temperature","pressure","material"].map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`px-3.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${filter === c ? "bg-brand-primary text-white" : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"}`}>
              {c === "all" ? "Alle" : c}
            </button>
          ))}
        </div>

        {loading && <p className="text-center text-neutral-400 py-12 text-sm">Laden...</p>}

        {!loading && filtered.length === 0 && <p className="text-center text-neutral-400 py-12 text-sm">Keine Traces</p>}

        {filtered.length > 0 && (
          <div className="bg-white rounded-lg shadow-card border border-neutral-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Machine</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Kategorie</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Zeitstempel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((t) => {
                  const ts = t.collected_at ? new Date(t.collected_at).toLocaleString("de-DE") : (t.timestamp ? new Date(t.timestamp).toLocaleString("de-DE") : "-");
                  return (
                    <tr key={t.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-3.5 text-xs font-mono text-neutral-500">{(t.id||"").substring(0, 8)}</td>
                      <td className="px-5 py-3.5 text-sm text-neutral-700">{t.machineId || "-"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${catClass(t.category)}`}>
                          {t.category ? t.category.charAt(0).toUpperCase() + t.category.slice(1) : "-"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-neutral-600">{ts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
