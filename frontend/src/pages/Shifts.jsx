import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import PageInfo from "../components/PageInfo.jsx";

export default function ShiftsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("shifts");
  const [shifts, setShifts] = useState([]);
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", type: "day", start_time: "06:00", end_time: "14:00", date: new Date().toISOString().split("T")[0], manager_name: "" });

  useEffect(() => { loadShifts(); }, []);

  useEffect(() => {
    setLoading(true);
    if (activeTab === "shifts") loadShifts();
    if (activeTab === "reports") loadReports();
    setLoading(false);
  }, [activeTab]);

  async function loadShifts() { try { const s = await api.get("/shifts"); setShifts(Array.isArray(s) ? s : []); } catch (requestError) { setError(requestError.message); } }
  async function loadReports() { try { const r = await api.get("/shifts/reports"); setReports(Array.isArray(r) ? r : []); } catch (requestError) { setError(requestError.message); } }
  async function loadSummary(date) { try { const s = await api.get(`/shifts/summary/${date}`); if (s) setSummary(s); } catch (requestError) { setError(requestError.message); } }

  async function createShift(e) {
    e.preventDefault();
    try { const s = await api.post("/shifts", form); await loadShifts(); setForm({ ...form, id: s.id }); } catch (requestError) { setError(requestError.message); }
  }

  async function closeShift(id) { try { await api.post(`/shifts/${id}/close`); await loadShifts(); } catch (requestError) { setError(requestError.message); } }

  async function generateReport(shiftId, date) { try { const r = await api.post(`/shifts/reports/generate/${shiftId}?date=${date}`); setReports(prev => [r, ...prev]); setActiveTab("reports"); } catch (requestError) { setError(requestError.message); } }

  async function finalizeReport(id) { try { await api.post(`/shifts/reports/${id}/finalize`); await loadReports(); } catch (requestError) { setError(requestError.message); } }

  const shiftTypeLabels = { day: t("shifts.day"), night: t("shifts.night"), swing: t("shifts.swing") };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 inline-flex items-center">{t("shifts.title")}<PageInfo page="shifts" /></h1>

      <div className="flex gap-2 mb-4 border-b">
        {[["shifts", t("shifts.shifts")], ["reports", t("shifts.reports")]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 font-medium ${activeTab === key ? "border-b-2 border-blue-500" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

      {loading && <p className="text-gray-400">{t("common.loading")}</p>}

      {activeTab === "shifts" && !loading && (
        <div>
          <form onSubmit={createShift} className="mb-6 p-4 bg-white shadow-sm border rounded-lg space-y-3">
            <h3 className="font-medium mb-2">{t("shifts.newShift")}</h3>
            <input type="text" required placeholder={t("shifts.shiftName")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border px-2 py-1 rounded w-full">{["day", "night", "swing"].map(t => <option key={t} value={t}>{shiftTypeLabels[t]}</option>)}</select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <input type="text" placeholder={t("shifts.startTimePlaceholder")} value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <input type="text" placeholder={t("shifts.endTimePlaceholder")} value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="border px-2 py-1 rounded w-full" />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{t("shifts.create")}</button>
          </form>

          {shifts.length === 0 ? <p className="text-gray-400">{t("shifts.noShifts")}</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left">{t("shifts.columnDate")}</th><th className="px-4 py-2 text-left">{t("shifts.columnShift")}</th><th className="px-4 py-2 text-left">{t("shifts.columnType")}</th><th className="px-4 py-2 text-left">{t("shifts.columnTime")}</th><th className="px-4 py-2 text-center">{t("shifts.columnAction")}</th></tr></thead>
              <tbody>{shifts.map(s => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{s.date}</td>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2"><span className="capitalize text-xs px-2 py-1 rounded bg-gray-100">{shiftTypeLabels[s.type] || s.type}</span></td>
                  <td className="px-4 py-2 text-xs">{s.start_time} - {s.end_time}</td>
                  <td className="px-4 py-2 flex gap-2">{!s.closed && <button onClick={() => closeShift(s.id)} className="text-sm px-2 py-1 bg-green-50 rounded hover:bg-green-100 text-green-600">{t("shifts.closeShift")}</button>}<button onClick={() => generateReport(s.id, s.date)} className="text-sm px-2 py-1 bg-blue-50 rounded hover:bg-blue-100 text-blue-700">{t("shifts.generateReport")}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "reports" && !loading && (
        <div className="space-y-4">
          {reports.length === 0 ? <p className="text-gray-400">{t("shifts.noReports")}</p> : reports.map(r => (
            <div key={r.id} className="bg-white p-4 shadow-sm border rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div><h3 className="font-medium">{r.date}</h3><p className="text-xs text-gray-500">{r.shift_name || t("shifts.noShiftName")} • {r.shift_start} - {r.shift_end}</p></div>
                {r.finalized ? <span className="text-green-600 text-xs font-medium">{t("shifts.finalized")}</span> : <button onClick={() => finalizeReport(r.id)} className="text-xs px-2 py-1 bg-blue-50 rounded hover:bg-blue-100">{t("shifts.finalize")}</button>}
              </div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="text-center p-2 bg-gray-50 rounded"><div className="text-xs text-gray-500">{t("shifts.orders")}</div><div className="font-bold">{r.total_orders}</div></div>
                <div className="text-center p-2 bg-gray-50 rounded"><div className="text-xs text-gray-500">{t("shifts.successful")}</div><div className="font-bold text-green-600">{r.completed_orders}</div></div>
                <div className="text-center p-2 bg-gray-50 rounded"><div className="text-xs text-gray-500">{t("shifts.oee")}</div><div className="font-bold text-blue-600">{r.oee_total}%</div></div>
                <div className="text-center p-2 bg-gray-50 rounded"><div className="text-xs text-gray-500">{t("shifts.throughput")}</div><div className="font-bold">{r.throughput_units}</div></div>
              </div>
              {r.oee_availability && <div className="flex gap-2 text-xs text-gray-600 mb-2"><span>A: {r.oee_availability}%</span> • <span>P: {r.oee_performance}%</span> • <span>Q: {r.oee_quality}%</span></div>}
              <p className="text-xs text-gray-500">{t("shifts.downtime")}: {r.total_downtime_minutes || 0} min • {t("shifts.managerLabel")}: {r.manager_name || t("shifts.notAvailable")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
