import { useState, useEffect } from "react";
import { api } from "../api/client.js";

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState("shifts");
  const [shifts, setShifts] = useState([]);
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", type: "day", start_time: "06:00", end_time: "14:00", date: new Date().toISOString().split("T")[0], manager_name: "" });

  useEffect(() => { loadShifts(); }, []);
  
  useEffect(() => {
    setLoading(true);
    if (activeTab === "shifts") loadShifts();
    if (activeTab === "reports") loadReports();
    setLoading(false);
  }, [activeTab]);

  async function loadShifts() {
    try { const s = await api.get("/shifts"); setShifts(Array.isArray(s) ? s : []); } catch {}
  }
  
  async function loadReports() {
    try { const r = await api.get("/shifts/reports"); setReports(Array.isArray(r) ? r : []); } catch {}
  }

  async function loadSummary(date) {
    try { const s = await api.get(`/shifts/summary/${date}`); if (s) setSummary(s); } catch {}
  }

  async function createShift(e) {
    e.preventDefault();
    try { const s = await api.post("/shifts", form); loadShifts(); setForm({ ...form, id: s.id }); } catch {}
  }

  async function closeShift(id) {
    try { await api.post(`/shifts/${id}/close`); loadShifts(); } catch {}
  }

  async function generateReport(shiftId, date) {
    try { const r = await api.post(`/shifts/reports/generate/${shiftId}?date=${date}`); setReports(prev => [r, ...prev]); } catch {}
  }

  async function finalizeReport(id) {
    try { await api.post(`/shifts/reports/${id}/finalize`); loadReports(); } catch {}
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Schichtmanagement</h1>

      <div className="flex gap-2 mb-4 border-b">
        {[["shifts", "Schichten"], ["reports", "Berichte"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 font-medium ${activeTab === key ? "border-b-2 border-blue-500" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>

      {loading && <p className="text-gray-400">Laden...</p>}

      {activeTab === "shifts" && !loading && (
        <div>
          <form onSubmit={createShift} className="mb-6 p-4 bg-white shadow-sm border rounded-lg space-y-3">
            <h3 className="font-medium mb-2">Neue Schicht anlegen</h3>
            <input type="text" placeholder="Schichtname" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border px-2 py-1 rounded w-full">
              {["day", "night", "swing"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <input type="text" placeholder="Uhrzeit Start (hh:mm)" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <input type="text" placeholder="Uhrzeit Ende (hh:mm)" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Erstellen</button>
          </form>

          {shifts.length === 0 ? <p className="text-gray-400">Keine Schichten angelegt.</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left">Datum</th><th className="px-4 py-2 text-left">Schicht</th><th className="px-4 py-2 text-left">Typ</th><th className="px-4 py-2 text-left">Zeit</th><th className="px-4 py-2 text-center">Aktion</th></tr></thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{s.date}</td>
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2"><span className="capitalize text-xs px-2 py-1 rounded bg-gray-100">{s.type}</span></td>
                    <td className="px-4 py-2 text-xs">{s.start_time} - {s.end_time}</td>
                    <td className="px-4 py-2">
                      {!s.closed && (
                        <button onClick={() => closeShift(s.id)} className="text-sm px-2 py-1 bg-green-50 rounded hover:bg-green-100 text-green-600">Schließen</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "reports" && !loading && (
        <div className="space-y-4">
          {reports.length === 0 ? <p className="text-gray-400">Keine Berichte erstellt.</p> : reports.map(r => (
            <div key={r.id} className="bg-white p-4 shadow-sm border rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium">{r.date}</h3>
                  <p className="text-xs text-gray-500">{r.shift_name || "Keine Schicht"} • {r.shift_start} - {r.shift_end}</p>
                </div>
                {r.finalized ? (
                  <span className="text-green-600 text-xs font-medium">Finalisiert</span>
                ) : (
                  <button onClick={() => finalizeReport(r.id)} className="text-xs px-2 py-1 bg-blue-50 rounded hover:bg-blue-100">Finalisieren</button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Auftraege</div>
                  <div className="font-bold">{r.total_orders}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Erfolgreich</div>
                  <div className="font-bold text-green-600">{r.completed_orders}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">OEE</div>
                  <div className="font-bold text-blue-600">{r.oee_total}%</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Durchsatz</div>
                  <div className="font-bold">{r.throughput_units}</div>
                </div>
              </div>

              {r.oee_availability && (
                <div className="flex gap-2 text-xs text-gray-600 mb-2">
                  <span>A: {r.oee_availability}%</span> • <span>P: {r.oee_performance}%</span> • <span>Q: {r.oee_quality}%</span>
                </div>
              )}

              <p className="text-xs text-gray-500">Downtime: {r.total_downtime_minutes || 0} min • Manager: {r.manager_name || "N/A"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
