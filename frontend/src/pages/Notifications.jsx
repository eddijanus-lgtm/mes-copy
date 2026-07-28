import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import Modal from "../components/Modal.jsx";
import PageHeader from "../design-system/components/PageHeader.jsx";
import Tabs from "../design-system/components/Tabs.jsx";
import { useTranslation } from "../i18n/I18nProvider.jsx";

function sevClass(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "info") return "bg-status-bg-info text-status-info";
  if (s === "warning") return "bg-status-bg-warning text-status-warning";
  if (s === "error" || s === "critical") return "bg-status-bg-error text-status-error";
  return "bg-neutral-100 text-neutral-600";
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("rules");
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [channelForm, setChannelForm] = useState({ channel: "email", enabled: true });
  const [channels, setChannels] = useState([]);
  const [newRule, setNewRule] = useState({ name: "", severity: "warning", condition: "", message_template: "{machine_id}: {value}", channels: "mqtt,websocket", machine_id: "" });

  useEffect(() => { loadStats(); }, []);
  
  useEffect(() => {
    setLoading(true);
    if (activeTab === "rules") loadRules();
    if (activeTab === "history") loadHistory();
    if (activeTab === "channels") loadChannels();
    setLoading(false);
  }, [activeTab]);

  async function loadRules() {
    try { const r = await api.get("/notifications/rules"); setRules(Array.isArray(r) ? r : []); } catch {}
  }
  
  async function loadHistory() {
    try { const h = await api.get("/notifications/history?limit=100"); setHistory(Array.isArray(h) ? h : []); } catch {}
  }

  async function loadChannels() {
    try { const c = await api.get("/notifications/channels"); setChannels(Array.isArray(c) ? c : []); } catch {}
  }
  
  async function loadStats() {
    try { const s = await api.get("/notifications/stats"); if (s) setStats(s); } catch {}
  }

  async function toggleRule(id) {
    try { await api.post(`/notifications/rules/${id}/toggle`); loadRules(); } catch {}
  }
  
  async function deleteRule(id) {
    try {
      await api.del(`/notifications/rules/${id}`);
      setDeleteCandidate(null);
      loadRules();
    } catch {}
  }

  async function createRule(e) {
    e.preventDefault();
    const payload = newRule.channels ? { ...newRule, channels: newRule.channels.split(",").map(c => c.trim()).filter(Boolean) } : { ...newRule };
    try { await api.post("/notifications/rules", payload); setShowForm(false); loadRules(); setNewRule({ name: "", severity: "warning", condition: "", message_template: "{machine_id}: {value}", channels: "mqtt,websocket", machine_id: "" }); } catch {}
  }

  async function createChannel(e) {
    e.preventDefault();
    try { const p = { ...channelForm, config: "{}" }; await api.post("/notifications/channels", p); loadChannels(); } catch {}
  }

  return (
    <div className="mes-page p-6 max-w-7xl mx-auto">
      <PageHeader
        className="mb-6"
        title={t("notifications.title")}
        description={t("notifications.subtitle")}
        titleAccessory={<PageInfo page="notifications" />}
      />
      {stats && (
        <div className="flex gap-4 mb-6">
          <div className="mes-panel flex-1 p-4 text-center">
            <div className="text-sm text-neutral-500">{t("notifications.total_rules")}</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="mes-panel flex-1 p-4 text-center">
            <div className="text-sm text-neutral-500">{t("notifications.active_count")}</div>
            <div className="text-2xl font-bold text-status-success">{stats.active}</div>
          </div>
          <div className="mes-panel flex-1 p-4 text-center">
            <div className="text-sm text-neutral-500">{t("notifications.firing_count")}</div>
            <div className="text-2xl font-bold text-status-error">{stats.firing}</div>
          </div>
        </div>
      )}

      <Tabs
        className="mb-5"
        ariaLabel={t("notifications.title")}
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: "rules", label: t("notifications.alert_rules") },
          { value: "history", label: t("notifications.history") },
          { value: "channels", label: t("notifications.channels") },
        ]}
      />

      {loading && <p className="text-neutral-400">{t("common.loading")}</p>}

      {activeTab === "rules" && !loading && (
        <div>
          <button onClick={() => setShowForm(!showForm)} className="mes-primary-button mb-4">+ {t("notifications.new_rule")}</button>

          {showForm && (
            <form onSubmit={createRule} className="mes-panel mes-form-panel mes-form-grid mb-4">
              <label>
                <span>{t("notifications.rule_name")}</span>
                <input type="text" placeholder={t("notifications.placeholder_name")} value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} />
              </label>
              <label>
                <span>{t("notifications.severity")}</span>
                <select value={newRule.severity} onChange={e => setNewRule({ ...newRule, severity: e.target.value })}>
                  {["info", "warning", "error", "critical"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                <span>{t("notifications.condition")}</span>
                <input type="text" placeholder={t("notifications.placeholder_condition")} value={newRule.condition} onChange={e => setNewRule({ ...newRule, condition: e.target.value })} />
              </label>
              <label>
                <span>{t("notifications.machine_uuid")}</span>
                <input type="text" placeholder={t("notifications.placeholder_optional")} value={newRule.machine_id} onChange={e => setNewRule({ ...newRule, machine_id: e.target.value })} />
              </label>
              <label>
                <span>{t("notifications.msg_template")}</span>
                <input type="text" placeholder={t("notifications.placeholder_message")} value={newRule.message_template} onChange={e => setNewRule({ ...newRule, message_template: e.target.value })} />
              </label>
              <label>
                <span>{t("notifications.channels_label")}</span>
                <input type="text" placeholder={t("notifications.placeholder_channels")} value={newRule.channels} onChange={e => setNewRule({ ...newRule, channels: e.target.value })} />
              </label>
              <div className="mes-form-actions gap-2">
                <button type="submit" className="mes-primary-button">{t("common.create")}</button>
                <button type="button" onClick={() => setShowForm(false)} className="mes-secondary-button">{t("common.cancel")}</button>
              </div>
            </form>
          )}

          {rules.length === 0 ? <p className="text-neutral-400">{t("notifications.no_rules")}</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-neutral-50 border-b"><tr><th className="px-4 py-2 text-left">{t("notifications.name")}</th><th className="px-4 py-2 text-left">{t("notifications.severity")}</th><th className="px-4 py-2 text-left">{t("notifications.status")}</th><th className="px-4 py-2 text-left">{t("notifications.condition")}</th><th></th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-neutral-50">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sevClass(r.severity)}`}>{r.severity}</span></td>
                    <td className="px-4 py-2">{r.is_active ? <span className="text-status-success">{t("common.active")}</span> : <span className="text-neutral-400">{t("common.inactive")}</span>}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.condition}</td>
                    <td className="px-4 py-2 flex gap-1">
                      <button onClick={() => toggleRule(r.id)} className="text-sm px-2 py-1 rounded hover:bg-neutral-100">{r.is_active ? t("notifications.stop") : t("notifications.start")}</button>
                      <button onClick={() => setDeleteCandidate(r)} className="text-sm px-2 py-1 rounded text-status-error hover:bg-status-error-bg">{t("common.delete")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "history" && !loading && (
        <div className="space-y-2">
          {history.length === 0 ? <p className="text-neutral-400">{t("notifications.no_history")}</p> : history.map(h => (
            <div key={h.id} className="mes-panel p-3 flex items-start gap-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sevClass(h.severity)}`}>{h.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{h.message}</div>
                <div className="text-xs text-neutral-500">
                  {h.machine_id ? `Machine: ${h.machine_id} • ` : ""}{h.delivered ? "✓" : "✗"} {h.delivered ? t("notifications.delivered") : t("notifications.pending")} • <span>{new Date(h.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "channels" && !loading && (
        <div>
          <form onSubmit={createChannel} className="mes-panel mes-form-panel mes-form-grid mb-4">
            <h3 className="font-medium mb-2">{t("notifications.new_channel")}</h3>
            <label>
              <span>{t("notifications.channel_type")}</span>
              <select value={channelForm.channel} onChange={e => setChannelForm({ ...channelForm, channel: e.target.value })}>
                {["email", "push", "mqtt", "websocket"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="mes-checkbox-field"><input type="checkbox" checked={channelForm.enabled} onChange={e => setChannelForm({ ...channelForm, enabled: e.target.checked })} /> {t("common.active")}</label>
            <div className="mes-form-actions">
              <button type="submit" className="mes-primary-button">{t("common.create")}</button>
            </div>
          </form>

          {channels.length === 0 ? <p className="text-neutral-400">{t("notifications.no_channels")}</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-neutral-50 border-b"><tr><th className="px-4 py-2 text-left">{t("notifications.channel")}</th><th className="px-4 py-2 text-left">{t("notifications.status")}</th></tr></thead>
              <tbody>
                {channels.map(c => (
                  <tr key={c.id} className="border-b hover:bg-neutral-50">
                    <td className="px-4 py-2 font-medium">{c.channel}</td>
                    <td className="px-4 py-2 text-xs text-neutral-500">{c.enabled ? t("common.active") : t("common.inactive")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title={t("notifications.delete_rule_title")}
      >
        <p className="text-sm leading-6 text-neutral-500">
          {t("notifications.delete_rule_confirm")}: <strong className="text-neutral-800">{deleteCandidate?.name}</strong>
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="mes-secondary-button" onClick={() => setDeleteCandidate(null)}>{t("common.cancel")}</button>
          <button type="button" className="mes-danger-button" onClick={() => deleteRule(deleteCandidate.id)}>{t("notifications.delete_rule_confirm")}</button>
        </div>
      </Modal>
    </div>
  );
}
