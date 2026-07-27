import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import Modal from "../components/Modal.jsx";

export default function NotificationsPage() {
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

  const severityColors = { info: "#6b7280", warning: "#f59e0b", error: "#ef4444", critical: "#dc2626" };

  return (
    <div className="mes-page p-6 max-w-7xl mx-auto">
      <div className="mes-page-header mb-6">
        <div>
        <div className="mes-title-row">
          <h1 className="text-2xl font-bold">Benachrichtigungen</h1>
          <PageInfo page="notifications" />
        </div>
        <p>Alert-Regeln, Auslieferungsverlauf und angebundene Kanäle.</p>
        </div>
      </div>
      {stats && (
        <div className="mes-metric-strip mb-6 grid grid-cols-3">
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="text-sm text-gray-500">Regeln gesamt</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="text-sm text-gray-500">Aktiv</div>
            <div className="text-2xl font-bold" style={{ color: "#10b981" }}>{stats.active}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="text-sm text-gray-500">Firing</div>
            <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{stats.firing}</div>
          </div>
        </div>
      )}

      <div className="mes-tabs">
        {[["rules", "Alert-Regeln"], ["history", "Verlauf"], ["channels", "Kanäle"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? "is-active" : ""}>{label}</button>
        ))}
      </div>

      {loading && <p className="text-gray-400">Laden...</p>}

      {activeTab === "rules" && !loading && (
        <div>
          <button onClick={() => setShowForm(!showForm)} className="mes-primary-button mb-4">+ Neue Regel</button>

          {showForm && (
            <form onSubmit={createRule} className="mes-panel mes-form-panel mes-form-grid mb-4">
              <label>
                <span>Regelname</span>
                <input type="text" placeholder="z. B. Temperaturgrenze" value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} />
              </label>
              <label>
                <span>Schweregrad</span>
                <select value={newRule.severity} onChange={e => setNewRule({ ...newRule, severity: e.target.value })}>
                  {["info", "warning", "error", "critical"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>
                <span>Bedingung</span>
                <input type="text" placeholder="temperature >= 80" value={newRule.condition} onChange={e => setNewRule({ ...newRule, condition: e.target.value })} />
              </label>
              <label>
                <span>Maschinen-UUID</span>
                <input type="text" placeholder="Optional" value={newRule.machine_id} onChange={e => setNewRule({ ...newRule, machine_id: e.target.value })} />
              </label>
              <label>
                <span>Nachrichten-Vorlage</span>
                <input type="text" placeholder="{machine_id}: {value}" value={newRule.message_template} onChange={e => setNewRule({ ...newRule, message_template: e.target.value })} />
              </label>
              <label>
                <span>Kanäle</span>
                <input type="text" placeholder="mqtt, websocket" value={newRule.channels} onChange={e => setNewRule({ ...newRule, channels: e.target.value })} />
              </label>
              <div className="mes-form-actions gap-2">
                <button type="submit" className="mes-primary-button">Erstellen</button>
                <button type="button" onClick={() => setShowForm(false)} className="mes-secondary-button">Abbrechen</button>
              </div>
            </form>
          )}

          {rules.length === 0 ? <p className="text-gray-400">Keine Regeln konfiguriert.</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Schweregrad</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Bedingung</th><th></th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2"><span style={{ background: severityColors[r.severity || "warning"], color: "#fff", padding: "2px 8px", borderRadius: "4px" }}>{r.severity}</span></td>
                    <td className="px-4 py-2">{r.is_active ? <span className="text-green-600">Aktiv</span> : <span className="text-gray-400">Inaktiv</span>}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.condition}</td>
                    <td className="px-4 py-2 flex gap-1">
                      <button onClick={() => toggleRule(r.id)} className="text-sm px-2 py-1 bg-blue-50 rounded hover:bg-blue-100">{r.is_active ? "Stopp" : "Start"}</button>
                      <button onClick={() => setDeleteCandidate(r)} className="text-sm px-2 py-1 bg-red-50 rounded hover:bg-red-100 text-red-600">Löschen</button>
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
          {history.length === 0 ? <p className="text-gray-400">Kein Benachrichtnungsverlauf.</p> : history.map(h => (
            <div key={h.id} className="bg-white p-3 shadow-sm border rounded-lg flex items-start gap-3">
              <span style={{ background: severityColors[h.severity || "warning"], color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "12px" }}>{h.severity}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{h.message}</div>
                <div className="text-xs text-gray-500">
                  {h.machine_id ? `Machine: ${h.machine_id} • ` : ""}{h.delivered ? "✓" : "✗"}<span>{new Date(h.created_at).toLocaleString("de-DE")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "channels" && !loading && (
        <div>
          <form onSubmit={createChannel} className="mes-panel mes-form-panel mes-form-grid mb-4">
            <h3 className="font-medium mb-2">Neuen Kanal hinzufügen</h3>
            <label>
              <span>Kanaltyp</span>
              <select value={channelForm.channel} onChange={e => setChannelForm({ ...channelForm, channel: e.target.value })}>
                {["email", "push", "mqtt", "websocket"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="mes-checkbox-field"><input type="checkbox" checked={channelForm.enabled} onChange={e => setChannelForm({ ...channelForm, enabled: e.target.checked })} /> Aktiviert</label>
            <div className="mes-form-actions">
              <button type="submit" className="mes-primary-button">Kanal erstellen</button>
            </div>
          </form>

          {channels.length === 0 ? <p className="text-gray-400">Keine Kanäle konfiguriert.</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left">Kanal</th><th className="px-4 py-2 text-left">Status</th></tr></thead>
              <tbody>
                {channels.map(c => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{c.channel}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{c.enabled ? "Aktiv" : "Inaktiv"}</td>
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
        title="Alert-Regel löschen"
      >
        <p className="text-sm leading-6 text-neutral-500">
          Die Regel <strong className="text-neutral-800">{deleteCandidate?.name}</strong> wird dauerhaft entfernt.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="mes-secondary-button" onClick={() => setDeleteCandidate(null)}>Abbrechen</button>
          <button type="button" className="mes-danger-button" onClick={() => deleteRule(deleteCandidate.id)}>Regel löschen</button>
        </div>
      </Modal>
    </div>
  );
}
