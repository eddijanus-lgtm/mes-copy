import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import AlarmsPage from "./Alarms.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import PageInfo from "../components/PageInfo.jsx";
import { useToasts } from "../providers/ToastProvider.jsx";

const CHANNEL_OPTIONS = [
  { value: "email", label: "E-Mail", configLabel: "Empfänger-Adresse", configPlaceholder: "alarm@example.com" },
  { value: "mqtt", label: "MQTT", configLabel: "Topic", configPlaceholder: "mes/alerts" },
  { value: "websocket", label: "WebSocket", configLabel: null },
];

function parseChannelConfig(config) {
  try { return config ? JSON.parse(config) : {}; } catch { return {}; }
}

export default function NotificationsPage() {
  const { t, locale } = useTranslation();
  const { user, token } = useAuth();
  const { addToast } = useToasts();
  const [params, setParams] = useSearchParams();
  const isAdmin = hasRole(user, ROLES.ADMIN);
  const canManageRules = hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
  const tabs = [
    ["orders", t("notifications.orderInbox")],
    ["alarms", t("nav.alarms")],
    ["history", t("notifications.history")],
    ...(canManageRules ? [["rules", t("notifications.alertRules")]] : []),
    ["channels", t("notifications.channels")],
  ];
  const activeTab = tabs.some(([key]) => key === params.get("tab")) ? params.get("tab") : "orders";
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [channelForm, setChannelForm] = useState({ channel: "email", enabled: true, destination: "" });
  const [channels, setChannels] = useState([]);
  const [channelError, setChannelError] = useState("");
  const [newRule, setNewRule] = useState({ name: "", severity: "warning", condition: "", message_template: "{machine_id}: {value}", channels: ["mqtt", "websocket"], machine_id: "" });

  useEffect(() => {
    const loaders = { rules: loadRules, history: loadHistory, channels: loadChannels };
    const load = loaders[activeTab];
    if (!load) { setLoading(false); return; }

    setLoading(true);
    const requests = activeTab === "rules" ? [load(), loadStats()] : [load()];
    Promise.all(requests).finally(() => setLoading(false));
  }, [activeTab]);

  async function loadRules() { try { const r = await api.get("/notifications/rules"); setRules(Array.isArray(r) ? r : []); } catch {} }
  async function loadHistory() { try { const h = await api.get("/notifications/history?limit=100"); setHistory(Array.isArray(h) ? h : []); } catch {} }
  async function loadChannels() { try { const c = await api.get("/notifications/channels"); setChannels(Array.isArray(c) ? c : []); } catch {} }
  async function loadStats() { try { const s = await api.get("/notifications/stats"); if (s) setStats(s); } catch {} }

  async function toggleRule(id) { try { await api.post(`/notifications/rules/${id}/toggle`); loadRules(); } catch {} }

  async function deleteRule(id) {
    if (!confirm(t("notifications.confirmDelete"))) return;
    try { await api.del(`/notifications/rules/${id}`); loadRules(); } catch {}
  }

  async function createRule(e) {
    e.preventDefault();
    try { await api.post("/notifications/rules", newRule); setShowForm(false); loadRules(); setNewRule({ name: "", severity: "warning", condition: "", message_template: "{machine_id}: {value}", channels: ["mqtt", "websocket"], machine_id: "" }); } catch {}
  }

  async function createChannel(e) {
    e.preventDefault();
    const option = CHANNEL_OPTIONS.find(({ value }) => value === channelForm.channel);
    const config = channelForm.destination.trim()
      ? { [channelForm.channel === "email" ? "recipient" : "topic"]: channelForm.destination.trim() }
      : {};
    if (option?.configLabel && !channelForm.destination.trim()) {
      setChannelError(`${option.configLabel} darf nicht leer sein.`);
      return;
    }
    try {
      setChannelError("");
      await api.post("/notifications/channels", { channel: channelForm.channel, enabled: channelForm.enabled, config: JSON.stringify(config) });
      setChannelForm({ channel: "email", enabled: true, destination: "" });
      loadChannels();
    } catch (error) { setChannelError(error.message || "Kanal konnte nicht gespeichert werden."); }
  }

  async function toggleChannel(channel) {
    try { await api.patch(`/notifications/channels/${channel.id}`, { enabled: !channel.enabled }); loadChannels(); }
    catch (error) { setChannelError(error.message || "Kanal konnte nicht geändert werden."); }
  }

  async function deleteChannel(id) {
    if (!confirm("Kanal wirklich löschen?")) return;
    try { await api.del(`/notifications/channels/${id}`); loadChannels(); }
    catch (error) { setChannelError(error.message || "Kanal konnte nicht gelöscht werden."); }
  }

  async function testChannel(id) {
    try { const result = await api.post(`/notifications/channels/${id}/test`); addToast({ type: "info", message: result.message }); }
    catch (error) { setChannelError(error.message || "Kanaltest fehlgeschlagen."); }
  }

  function toggleRuleChannel(channel) {
    setNewRule((rule) => ({ ...rule, channels: rule.channels.includes(channel) ? rule.channels.filter((item) => item !== channel) : [...rule.channels, channel] }));
  }

  useEffect(() => {
    if (!token) return;
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${window.location.host}/api/notifications/ws`);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "auth", token })));
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification") addToast({ type: data.payload.severity === "critical" ? "error" : "warning", message: data.payload.message });
      } catch { /* ignore malformed WebSocket messages */ }
    });
    return () => socket.close();
  }, [token, addToast]);

  const severityColors = { info: "#6b7280", warning: "#f59e0b", error: "#ef4444", critical: "#dc2626" };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 inline-flex items-center">{t("notifications.title")}<PageInfo page="notifications" /></h1>
      <div className="flex gap-2 mb-4 border-b">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setParams({ tab: key })} className={`px-4 py-2 font-medium ${activeTab === key ? "border-b-2 border-blue-500" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>

      {activeTab === "rules" && stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-sm border"><div className="text-sm text-gray-500">{t("notifications.totalRules")}</div><div className="text-2xl font-bold">{stats.total}</div></div>
          <div className="bg-white rounded-lg p-4 shadow-sm border"><div className="text-sm text-gray-500">{t("notifications.active")}</div><div className="text-2xl font-bold" style={{ color: "#10b981" }}>{stats.active}</div></div>
          <div className="bg-white rounded-lg p-4 shadow-sm border"><div className="text-sm text-gray-500">{t("notifications.firing")}</div><div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{stats.firing}</div></div>
        </div>
      )}

      {activeTab === "orders" && <OrderInbox t={t} />}
      {activeTab === "alarms" && <AlarmsPage />}

      {loading && <p className="text-gray-400">{t("common.loading")}</p>}

      {activeTab === "rules" && !loading && (
        <div>
          {isAdmin && <button onClick={() => setShowForm(!showForm)} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t("notifications.newRule")}</button>}

          {isAdmin && showForm && (
            <form onSubmit={createRule} className="mb-4 p-4 bg-white shadow-sm border rounded-lg space-y-3">
              <input type="text" placeholder={t("notifications.ruleName")} value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} className="border px-2 py-1 rounded w-full" />
              <select value={newRule.severity} onChange={e => setNewRule({ ...newRule, severity: e.target.value })} className="border px-2 py-1 rounded w-full">{["info", "warning", "error", "critical"].map(s => <option key={s} value={s}>{s}</option>)}</select>
              <input type="text" placeholder={t("notifications.conditionPlaceholder")} value={newRule.condition} onChange={e => setNewRule({ ...newRule, condition: e.target.value })} className="border px-2 py-1 rounded w-full" />
              <input type="text" placeholder={t("notifications.machineUuid")} value={newRule.machine_id} onChange={e => setNewRule({ ...newRule, machine_id: e.target.value })} className="border px-2 py-1 rounded w-full" />
              <input type="text" placeholder={t("notifications.messageTemplate")} value={newRule.message_template} onChange={e => setNewRule({ ...newRule, message_template: e.target.value })} className="border px-2 py-1 rounded w-full" />
              <fieldset className="rounded border border-neutral-200 p-3"><legend className="px-1 text-sm font-medium text-neutral-700">{t("notifications.channelsShort")}</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{CHANNEL_OPTIONS.map(({ value, label }) => <label key={value} className="inline-flex items-center"><input type="checkbox" checked={newRule.channels.includes(value)} onChange={() => toggleRuleChannel(value)} className="mr-2" />{label}</label>)}</div></fieldset>
              <div className="flex gap-2"><button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">{t("notifications.create")}</button><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500">{t("notifications.cancel")}</button></div>
            </form>
          )}

          {rules.length === 0 ? <p className="text-gray-400">{t("notifications.noRules")}</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left">{t("notifications.ruleName")}</th><th className="px-4 py-2 text-left">{t("notifications.severity")}</th><th className="px-4 py-2 text-left">{t("notifications.status")}</th><th className="px-4 py-2 text-left">{t("notifications.condition")}</th><th></th></tr></thead>
              <tbody>{rules.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2"><span style={{ background: severityColors[r.severity || "warning"], color: "#fff", padding: "2px 8px", borderRadius: "4px" }}>{r.severity}</span></td>
                  <td className="px-4 py-2">{r.is_active ? <span className="text-green-600">{t("notifications.activeLabel")}</span> : <span className="text-gray-400">{t("notifications.inactiveLabel")}</span>}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.condition}</td>
                  <td className="px-4 py-2 flex gap-1"><button onClick={() => toggleRule(r.id)} className="text-sm px-2 py-1 bg-blue-50 rounded hover:bg-blue-100">{r.is_active ? t("notifications.stop") : t("notifications.start")}</button>{isAdmin && <button onClick={() => deleteRule(r.id)} className="text-sm px-2 py-1 bg-red-50 rounded hover:bg-red-100 text-red-600">{t("notifications.delete")}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "history" && !loading && (
        <div className="space-y-2">
          {history.length === 0 ? <p className="text-gray-400">{t("notifications.noHistory")}</p> : history.map(h => (
            <div key={h.id} className="bg-white p-3 shadow-sm border rounded-lg flex items-start gap-3">
              <span style={{ background: severityColors[h.severity || "warning"], color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "12px" }}>{h.severity}</span>
              <div className="flex-1 min-w-0"><div className="font-medium truncate">{h.message}</div><div className="text-xs text-gray-500">{h.machine_id ? `${t("notifications.machineLabel")}: ${h.machine_id} • ` : ""}{h.delivered ? "✓" : "✗"}<span>{new Date(h.created_at).toLocaleString(locale === "de" ? "de-DE" : "en-US")}</span></div></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "channels" && !loading && (
        <div>
          {isAdmin && <form onSubmit={createChannel} className="mb-4 p-4 bg-white shadow-sm border rounded-lg space-y-3">
            <h3 className="font-medium mb-2">{t("notifications.newChannel")}</h3>
            <select value={channelForm.channel} onChange={e => setChannelForm({ ...channelForm, channel: e.target.value, destination: "" })} className="border px-2 py-1 rounded w-full">{CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
            {CHANNEL_OPTIONS.find(c => c.value === channelForm.channel)?.configLabel && <input type="text" required placeholder={CHANNEL_OPTIONS.find(c => c.value === channelForm.channel).configPlaceholder} value={channelForm.destination} onChange={e => setChannelForm({ ...channelForm, destination: e.target.value })} className="border px-2 py-1 rounded w-full" />}
            <div className="flex flex-wrap items-center gap-5">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{t("notifications.channelCreate")}</button>
              <label className="inline-flex items-center whitespace-nowrap"><input type="checkbox" checked={channelForm.enabled} onChange={e => setChannelForm({ ...channelForm, enabled: e.target.checked })} className="mr-2"/> {t("notifications.channelEnabled")}</label>
            </div>
            {channelError && <p role="alert" className="text-sm text-status-error">{channelError}</p>}
          </form>}

          <p className="mb-4 text-sm text-neutral-600">E-Mail benötigt zusätzlich die SMTP-Zugangsdaten auf dem Server. MQTT benötigt eine laufende Broker-Verbindung. WebSocket liefert an aktuell angemeldete Nutzer. Push ist noch nicht eingerichtet und daher bewusst nicht auswählbar.</p>

          {channels.length === 0 ? <p className="text-gray-400">{t("notifications.noChannels")}</p> : (
            <table className="w-full text-sm bg-white shadow-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 border-b"><tr><th className="px-4 py-2 text-left">{t("notifications.channelLabel")}</th><th className="px-4 py-2 text-left">Ziel</th><th className="px-4 py-2 text-left">{t("notifications.channelStatus")}</th>{isAdmin && <th />}</tr></thead>
              <tbody>{channels.map(c => (
                <tr key={c.id} className="border-b hover:bg-gray-50"><td className="px-4 py-2 font-medium">{c.channel}</td><td className="px-4 py-2 text-xs text-gray-500">{parseChannelConfig(c.config).recipient || parseChannelConfig(c.config).topic || (c.channel === "websocket" ? "Angemeldete Nutzer" : "Nicht konfiguriert")}</td><td className="px-4 py-2 text-xs text-gray-500">{c.enabled ? t("notifications.activeLabel") : t("notifications.inactiveLabel")}</td>{isAdmin && <td className="px-4 py-2 flex gap-2"><button onClick={() => testChannel(c.id)} className="text-sm px-2 py-1 bg-green-50 rounded hover:bg-green-100 text-green-700">Test</button><button onClick={() => toggleChannel(c)} className="text-sm px-2 py-1 bg-blue-50 rounded hover:bg-blue-100">{c.enabled ? "Deaktivieren" : "Aktivieren"}</button><button onClick={() => deleteChannel(c.id)} className="text-sm px-2 py-1 bg-red-50 rounded hover:bg-red-100 text-red-600">{t("notifications.delete")}</button></td>}</tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const lidColors = { 1: "lidColorRed", 2: "lidColorGreen", 4: "lidColorBlue" };

function OrderInbox({ t }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let timer;

    async function refresh() {
      try {
        const data = await api.getSilent("/notifications/orders")
          .catch(() => api.getSilent("/orders"));
        if (!disposed) {
          setEntries(Array.isArray(data) ? data : []);
          setError("");
        }
      } catch (requestError) {
        if (!disposed) setError(requestError.message || t("notifications.orderLoadFailed"));
      }
      if (!disposed) timer = setTimeout(refresh, 5000);
    }

    refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section aria-label={t("notifications.orderInbox")} className="space-y-3">
      {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
      {!error && !entries && <p>{t("common.loading")}</p>}
      {!error && entries?.length === 0 && <p>{t("notifications.noOrders")}</p>}
      {entries?.map(({ id, name, quantity, created_at, parameters }) => (
        <article key={id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="space-y-1">
            <h2 className="font-semibold">{name}</h2>
            <p className="text-sm text-neutral-600">{new Date(created_at).toLocaleString()} · {t("orders.quantity")} {quantity}</p>
            {parameters && <p className="text-sm text-neutral-600">
              {t("shopfloor.lidColor")} {lidColors[parameters.iPar1] ? t("shopfloor." + lidColors[parameters.iPar1]) : parameters.iPar1 ?? "–"}
              {" · "}{t("shopfloor.redBalls")} {parameters.iPar2 ?? "–"}
              {" · "}{t("shopfloor.greenBalls")} {parameters.iPar3 ?? "–"}
              {" · "}{t("shopfloor.blueBalls")} {parameters.iPar4 ?? "–"}
            </p>}
          </div>
          <Link className="text-sm font-semibold text-brand-primary underline" to={"/orders?order=" + encodeURIComponent(id)}>
            {t("notifications.openOrder")}
          </Link>
        </article>
      ))}
    </section>
  );
}
