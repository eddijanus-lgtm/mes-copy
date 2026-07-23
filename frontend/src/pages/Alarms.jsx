import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import { useToasts } from "../providers/ToastProvider.jsx";

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [ackFilter, setAckFilter] = useState("all");
  const [selected, setSelected] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const toast = useToasts();

  useEffect(() => {
    setLoading(true);
    api.get("/alarms").then((d) => {
      setAlarms(Array.isArray(d) ? d : []);
    }).catch(() => setAlarms([])).finally(() => setLoading(false));
  }, []);

  const filtered = alarms.filter((a) => {
    const sevMatch = filter === "all" || (a.severity || "").toLowerCase() === filter.toLowerCase();
    const ackMatch = ackFilter === "all"
      ? true
      : ackFilter === "acknowledged"
        ? a.acknowledged
        : !a.acknowledged;
    return sevMatch && ackMatch;
  });

  const activeCount = alarms.filter((a) => !a.acknowledged).length;

  function sevClass(sev) {
    const s = (sev || "").toLowerCase();
    if (s === "info") return "bg-status-bg-info text-status-info";
    if (s === "warning") return "bg-status-bg-warning text-status-warning";
    if (s === "error" || s === "critical") return "bg-status-bg-error text-status-error";
    return "";
  }

  const allSelected = filtered.length > 0 && filtered.every((a) => selected[a.id]);
  const selCount = Object.keys(selected).length;

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected({});
    else {
      const obj = {};
      filtered.forEach((a) => { obj[a.id] = true; });
      setSelected(obj);
    }
  }

  async function handleAcknowledge(id) {
    try {
      await api.post(`/alarms/${id}/acknowledge`);
      setAlarms((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a
        )
      );
      if (selected[id]) {
        const next = { ...selected };
        delete next[id];
        setSelected(next);
      }
      toast.addToast({ type: "info", message: "Alarm bestatigt" });
    } catch {
      toast.addToast({ type: "error", message: "Alarm kann nicht bestätigt werden" });
    }
  }

  async function handleBulkAcknowledge() {
    setBulkLoading(true);
    const ids = Object.keys(selected);
    try {
      await api.post("/alarms/bulk/acknowledge", ids);
      setAlarms((prev) =>
        prev.map((a) =>
          ids.includes(a.id) ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a
        )
      );
      setSelected({});
      toast.addToast({ type: "info", message: `${ids.length} Alarme bestatigt` });
    } catch {
      toast.addToast({ type: "error", message: "Alarme konnen nicht bestätigt werden" });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    setBulkLoading(true);
    const ids = Object.keys(selected);
    try {
      await api.delete("/alarms/bulk", { data: ids });
      setAlarms((prev) => prev.filter((a) => !ids.includes(a.id)));
      setSelected({});
      toast.addToast({ type: "info", message: `${ids.length} Alarme geloscht` });
    } catch {
      toast.addToast({ type: "error", message: "Alarme konnten nicht gelöscht werden" });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleExportCsv() {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("severity", filter);
      if (ackFilter !== "all") params.set("acknowledged", ackFilter === "acknowledged" ? "true" : "false");
      const res = await api.get(`/alarms/export/csv?${params.toString()}`);
      const blob = new Blob([res], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `alarms-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.addToast({ type: "info", message: "CSV-Export gestartet" });
    } catch {
      toast.addToast({ type: "error", message: "CSV-Export fehlgeschlagen" });
    }
  }

  function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleString("de-DE");
  }

  const canBulkAck = selCount > 0 && filtered.some((a) => !a.acknowledged);
  const canBulkDelete = selCount > 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Alarme</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Ubersicht aller Alarme {activeCount > 0 && <span>({activeCount} offen)</span>}
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            className="px-4 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            CSV Export
          </button>
        </div>

        <div className="flex gap-1.5 flex-wrap" role="group">
          {["all", "info", "warning", "error", "critical"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${filter === s ? "bg-brand-primary text-white" : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 flex-wrap" role="group">
          {[
            { key: "all", label: "Alle" },
            { key: "open", label: "Offen" },
            { key: "acknowledged", label: "Bestatigt" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setAckFilter(s.key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${ackFilter === s.key ? "bg-brand-primary text-white" : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {canBulkAck && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkAcknowledge}
              disabled={bulkLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {bulkLoading ? "..." : `Bestatigen (${selCount})`}
            </button>
          </div>
        )}

        {canBulkDelete && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {bulkLoading ? "..." : `Loschen (${selCount})`}
            </button>
          </div>
        )}

        {loading && <p className="text-center text-neutral-400 py-12 text-sm">Laden...</p>}

        {!loading && filtered.length === 0 && <p className="text-center text-neutral-400 py-12 text-sm">Keine Alarme</p>}

        {filtered.length > 0 && (
          <div className="bg-white rounded-lg shadow-card border border-neutral-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-neutral-300 text-brand-primary focus:ring-brand-primary"
                    />
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Machine</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Nachricht</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Schweregrad</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Bestatigt am</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((a) => (
                  <tr key={a.id} className={`hover:bg-neutral-50 transition-colors ${a.acknowledged ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={!!selected[a.id]}
                        onChange={() => toggleSelect(a.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-brand-primary focus:ring-brand-primary"
                      />
                    </td>
                    <td className="px-5 py-3.5 text-xs font-mono text-neutral-500">{(a.id || "").substring(0, 8)}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{a.machineId || "-"}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{a.message || a.description || "-"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${sevClass(a.severity)}`}>
                        {a.severity ? a.severity.charAt(0).toUpperCase() + a.severity.slice(1) : "-"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-neutral-500">{formatDate(a.acknowledged_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      {!a.acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(a.id)}
                          className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-md text-xs font-semibold hover:bg-brand-primary/20 transition-colors"
                        >
                          Bestatigen
                        </button>
                      )}
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
