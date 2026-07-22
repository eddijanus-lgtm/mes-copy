import { useState, useEffect } from "react";
import StatCard from "../components/StatCard";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canDeleteMachines, canManageMachines } from "../utils/roles.js";

export default function MachinesPage() {
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", type: "CNC", location: "" });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const canManage = canManageMachines(user);
  const canDelete = canDeleteMachines(user);

  useEffect(() => {
    api.get("/machines").then((d) => {
      setMachines(Array.isArray(d) ? d : []);
    }).catch(() => setMachines([]));
  }, []);

  function handleDelete(id) {
    if (!confirm("Station wirklich loeschen?")) return;
    setError("");
    api.del("/machines/" + id).then(() => {
      setMachines((prev) => prev.filter((m) => m.id !== id));
    }).catch((requestError) => setError(requestError.message));
  }

  function handleEdit(m) {
    setShowModal(true);
    setForm({ id: m.id, name: m.name || m.machineName || "", type: m.type || "CNC", location: m.location || "" });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const endpoint = form.id ? "/machines/" + form.id : "/machines";
    const save = form.id ? api.patch : api.post;
    save(endpoint, { name: form.name, type: form.type || "CNC", location: form.location || "" }).then(() => {
      refreshList();
      setShowModal(false);
      setForm({ id: null, name: "", type: "CNC", location: "" });
    }).catch((requestError) => setError(requestError.message));
  }

  function refreshList() {
    api.get("/machines").then((d) => {
      setMachines(Array.isArray(d) ? d : []);
    }).catch(() => setMachines([]));
  }

  const onlineCount = machines.filter((m) => ["online", "running"].includes(m.status)).length;

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Machine Status</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Verwaltung aller Stationen</p>
        </div>

        {/* Status-Karten */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Alle" value={String(machines.length)} icon="" />
          <StatCard label="Online" value={String(onlineCount)} icon="✅" />
          <StatCard label="Offline" value={String(machines.length - onlineCount)} icon="⚠️" />
        </div>

        {/* Toolbar */}
        <div className="flex justify-end">
          {canManage && (
          <button onClick={() => setShowModal(true)} className="bg-brand-primary text-white font-medium px-5 py-2.5 rounded-lg text-sm hover:bg-[var(--color-brand-primary-dark)] transition-colors">
            + Neue Station
          </button>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

        {/* Suche */}
        <input
          type="text"
          placeholder="Stationen durchsuchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
        />

        {/* Tabelle */}
        {machines.filter((m) => !search || (m.name||"").toLowerCase().includes(search.toLowerCase())).length > 0 ? (
          <div className="bg-white rounded-lg shadow-card border border-neutral-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Typ</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  {canManage && <th className="px-5 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">Aktionen</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {machines.filter((m) => !search || (m.name||"").toLowerCase().includes(search.toLowerCase())).map((m, i) => {
                  const statusOk = ["online", "running"].includes(m.status);
                  return (
                    <tr key={m.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3.5 text-xs font-mono text-neutral-500">{(m.id||"").substring(0, 8)}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-2 text-sm text-neutral-800">
                          <span className={`w-2 h-2 rounded-full ${statusOk ? "bg-status-success" : "bg-status-error"}`} />
                          {m.name || m.machineName || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-neutral-600">{m.type || "CNC"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${statusOk ? "bg-status-bg-success text-status-success" : "bg-status-bg-error text-status-error"}` }>
                          {m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : "-"}
                        </span>
                      </td>
                      {canManage && <td className="px-5 py-3.5 text-right">
                        <button onClick={() => handleEdit(m)} className="mx-1 px-3 py-1.5 text-xs font-medium text-neutral-dark bg-neutral-stroke rounded-md hover:bg-neutral-border transition-colors">
                          Edit
                        </button>
                        {canDelete && (
                        <button onClick={() => handleDelete(m.id)} className="ml-2 px-3 py-1.5 text-xs font-medium text-white bg-status-error rounded-md hover:bg-[var(--color-status-error-dark)] transition-colors">
                          ×
                        </button>
                        )}
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-neutral-400 py-12 text-sm">Keine Stationen gefunden</p>
        )}

        {/* Modal */}
        {showModal && (
          <div onClick={() => setShowModal(false)} className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">{form.id ? "Station bearbeiten" : "Neue Station"}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required           className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Typ</label>
                    <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                    <option value="CNC">CNC</option>
                    <option value="PLC">PLC</option>
                    <option value="Roboter">Roboter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Standort</label>
                  <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => { setShowModal(false); setForm({ id: null, name: "", type: "CNC", location: "" }); }} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
                    Abbrechen
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors">
                    Speichern
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
