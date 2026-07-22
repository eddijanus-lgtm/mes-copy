import { useState, useEffect } from "react";
import { api } from "../api/client.js";

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.get("/alarms").then((d) => {
      setAlarms(Array.isArray(d) ? d : []);
    }).catch(() => setAlarms([])).finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? alarms : alarms.filter((a) => (a.severity||"").toLowerCase() === filter.toLowerCase());

  function sevClass(sev) {
    const s = (sev||"").toLowerCase();
    if (s === "info") return "bg-status-bg-info text-status-info";
    if (s === "warning") return "bg-status-bg-warning text-status-warning";
    if (s === "error" || s === "critical") return "bg-status-bg-error text-status-error";
    return "";
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Alarme</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Ubersicht aller Alarme</p>
        </div>

        <div className="flex gap-1.5" role="group">
          {["all","info","warning","error","critical"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${filter === s ? "bg-brand-primary text-white" : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"}`} >
              {s}
            </button>
          ))}
        </div>

        {loading && <p className="text-center text-neutral-400 py-12 text-sm">Laden...</p>}

        {!loading && filtered.length === 0 && <p className="text-center text-neutral-400 py-12 text-sm">Keine Alarme</p>}

        {filtered.length > 0 && (
          <div className="bg-white rounded-lg shadow-card border border-neutral-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Machine</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Nachricht</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Schweregrad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-mono text-neutral-500">{(a.id||"").substring(0, 8)}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{a.machineId || "-"}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{a.message || a.description || "-"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${sevClass(a.severity)}`}>
                        {a.severity ? a.severity.charAt(0).toUpperCase() + a.severity.slice(1) : "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
