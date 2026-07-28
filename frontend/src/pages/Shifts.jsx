import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import PageHeader from "../design-system/components/PageHeader.jsx";
import Tabs from "../design-system/components/Tabs.jsx";
import { useTranslation } from "../i18n/I18nProvider.jsx";

export default function ShiftsPage() {
  const { t } = useTranslation();
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
    <div className="mes-page p-6 max-w-7xl mx-auto">
      <PageHeader
        className="mb-6"
        title={t("shifts.title")}
        description={t("shifts.subtitle")}
        titleAccessory={<PageInfo page="shifts" />}
      />

      <Tabs
        className="mb-5"
        ariaLabel={t("shifts.title")}
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: "shifts", label: t("shifts.shifts_tab") },
          { value: "reports", label: t("shifts.reports_tab") },
        ]}
      />

      {loading && <p className="text-neutral-400">{t("common.loading")}</p>}

      {activeTab === "shifts" && !loading && (
        <div>
          <form onSubmit={createShift} className="mes-panel mes-form-panel mes-form-grid mb-6">
            <h3 className="font-medium mb-2">{t("shifts.new_shift")}</h3>
            <label>
              <span>{t("shifts.shift_name")}</span>
              <input type="text" placeholder={t("shifts.shift_name")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <span>{t("shifts.shift_type")}</span>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="day">{t("shifts.day")}</option>
                <option value="night">{t("shifts.night")}</option>
                <option value="swing">{t("shifts.swing")}</option>
              </select>
            </label>
            <label>
              <span>{t("shifts.date")}</span>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              <span>{t("shifts.manager")}</span>
              <input type="text" placeholder={t("shifts.manager")} value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} />
            </label>
            <label>
              <span>{t("shifts.begin")}</span>
              <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </label>
            <label>
              <span>{t("shifts.end")}</span>
              <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </label>
            <div className="mes-form-actions">
              <button type="submit" className="mes-primary-button">{t("shifts.create_shift")}</button>
            </div>
          </form>

          {shifts.length === 0 ? <p className="text-neutral-400">{t("shifts.no_shifts")}</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-neutral-50 border-b"><tr><th className="px-4 py-2 text-left">{t("shifts.date")}</th><th className="px-4 py-2 text-left">{t("shifts.shift")}</th><th className="px-4 py-2 text-left">{t("shifts.type")}</th><th className="px-4 py-2 text-left">{t("shifts.time")}</th><th className="px-4 py-2 text-center">{t("shifts.action")}</th></tr></thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id} className="border-b hover:bg-neutral-50">
                    <td className="px-4 py-2">{s.date}</td>
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2"><span className="capitalize text-xs px-2 py-1 rounded bg-neutral-100">{s.type}</span></td>
                    <td className="px-4 py-2 text-xs">{s.start_time} - {s.end_time}</td>
                    <td className="px-4 py-2">
                      {!s.closed && (
                        <button onClick={() => closeShift(s.id)} className="text-sm px-2 py-1 rounded bg-status-success-bg text-status-success hover:bg-status-success-bg/80">{t("shifts.close_shift")}</button>
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
          {reports.length === 0 ? <p className="text-neutral-400">{t("shifts.no_reports")}</p> : reports.map(r => (
            <div key={r.id} className="mes-panel p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium">{r.date}</h3>
                  <p className="text-xs text-neutral-500">{r.shift_name || t("shifts.no_shift_name")} • {r.shift_start} - {r.shift_end}</p>
                </div>
                {r.finalized ? (
                  <span className="text-status-success text-xs font-medium">{t("shifts.finalized")}</span>
                ) : (
                  <button onClick={() => finalizeReport(r.id)} className="text-xs px-2 py-1 rounded bg-status-bg-info text-status-info hover:bg-status-bg-info/80">{t("shifts.finalize")}</button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-xs text-neutral-500">{t("shifts.orders")}</div>
                  <div className="font-bold">{r.total_orders}</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-xs text-neutral-500">{t("shifts.successful")}</div>
                  <div className="font-bold text-status-success">{r.completed_orders}</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-xs text-neutral-500">{t("shifts.oee")}</div>
                  <div className="font-bold text-status-info">{r.oee_total}%</div>
                </div>
                <div className="text-center p-2 bg-neutral-50 rounded">
                  <div className="text-xs text-neutral-500">{t("shifts.throughput")}</div>
                  <div className="font-bold">{r.throughput_units}</div>
                </div>
              </div>

              {r.oee_availability && (
                <div className="flex gap-2 text-xs text-neutral-500 mb-2">
                  <span>A: {r.oee_availability}%</span> • <span>P: {r.oee_performance}%</span> • <span>Q: {r.oee_quality}%</span>
                </div>
              )}

              <p className="text-xs text-neutral-500">{t("shifts.downtime")}: {r.total_downtime_minutes || 0} min • {t("shifts.manager_label")}: {r.manager_name || "N/A"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
