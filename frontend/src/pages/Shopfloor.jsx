import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useShopfloorTelemetry } from "../hooks/useShopfloorTelemetry.js";

export default function ShopfloorPage() {
  const [health, setHealth] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [handshakeJournal, setHandshakeJournal] = useState([]);
  const [mqttHistory, setMqttHistory] = useState([]);
  const [webshopOrders, setWebshopOrders] = useState([]);
  const [routesByOrder, setRoutesByOrder] = useState({});
  const [now, setNow] = useState(Date.now());
  const [controlLoading, setControlLoading] = useState(null);
  const { status, telemetryByResource, handshakeByResource, eventsByResource, changedAtByResource, mqttEvents, lastMessageAt, logs } = useShopfloorTelemetry();

  const handleMachineControl = async (resourceId, command) => {
    try {
      setControlLoading(resourceId);
      await api.post("/shopfloor/machine/control", { resourceId, command });
    } catch {
      console.error(`Failed to send ${command} for resource ${resourceId}`);
    } finally {
      setControlLoading(null);
    }
  };

  useEffect(() => {
    const loadStatus = () => api.getSilent("/shopfloor/health").then(setHealth).catch(() => setHealth(null));
    const loadFlow = () => Promise.all([api.getSilent("/carriers"), api.getSilent("/orders"), api.getSilent("/shopfloor/stmes/handshakes"), api.getSilent("/shopfloor/mqtt/messages"), api.getSilent("/shopfloor/webshop/orders")])
      .then(([carrierData, orderData, journalData, mqttData, webshopData]) => {
        setCarriers(carrierData);
        setOrders(orderData);
        setHandshakeJournal(journalData);
        setMqttHistory(mqttData);
        setWebshopOrders(Array.isArray(webshopData) ? webshopData : []);
        const activeOrders = orderData.filter((order) => order.status === "in_progress");
        return Promise.all(
          activeOrders.map(async (order) => [
            order.id,
            await api.getSilent(`/orders/${order.id}/route`),
          ]),
        ).then((entries) => setRoutesByOrder(Object.fromEntries(entries)));
      })
      .catch(() => {});
    loadStatus();
    loadFlow();
    const healthTimer = setInterval(loadStatus, 10_000);
    const flowTimer = setInterval(loadFlow, 10_000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(healthTimer);
      clearInterval(flowTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const connected = status === "connected";
  const stations = Object.values(telemetryByResource).sort((a, b) => a.payload.resourceId - b.payload.resourceId);
  const profileStations = health?.machine?.stations || [];
  const controlStations = profileStations.map((station) => {
    const telemetry = telemetryByResource[station.resourceId]?.payload;
    return {
      ...station,
      displayName: station.displayName || telemetry?.displayName,
      signals: telemetry?.signals || {},
      roles: telemetry?.roles || {},
    };
  });
  const activeShopfloorOrder = orders.find((order) => order.status === "in_progress");
  const trackedCarriers = activeShopfloorOrder ? carriers.filter((carrier) => carrier.order_id === activeShopfloorOrder.id) : [];
  const resultCodes = health?.machine?.resultCodes || {};

  return (
    <div className="mes-page min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div className="mes-page-header">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Shopfloor Gateway</h1>
            <p className="text-sm text-neutral-500 mt-0.5">OT/IT-Vermittlung: OPC-UA-Handshake, MQTT-Eingang und Live-Telemetrie</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-status-success animate-pulse" : "bg-status-error"}`} />
            {lastMessageAt ? `Daten empfangen vor ${ageInSeconds(lastMessageAt, now)} s` : "Noch keine Telemetrie"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge label="WebSocket" active={connected} detail={status} />
          <StatusBadge label="OPC UA" active={Boolean(health?.opcua)} />
          <StatusBadge label="MQTT" active={Boolean(health?.mqtt)} />
        </div>

        <GatewayRolePanel health={health} />

        <CarrierFlow order={activeShopfloorOrder} carriers={trackedCarriers} route={routesByOrder[activeShopfloorOrder?.id] || []} />

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {controlStations.map((station) => (
            <MachineControlPanel
              key={station.resourceId}
              resourceId={station.resourceId}
              displayName={station.displayName}
              signals={station.signals}
              roles={station.roles}
              commands={station.availableCommands || []}
              loading={controlLoading === station.resourceId}
              onControl={(command) => handleMachineControl(station.resourceId, command)}
            />
          ))}
        </div>

        <WebshopOrdersPanel orders={webshopOrders} />

        <MqttLivePanel messages={mqttEvents.length > 0 ? [...mqttEvents].reverse() : mqttHistory} connected={Boolean(health?.mqtt)} />

        {stations.length === 0 && <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">Warte auf Stationsdaten...</p>}
        {stations.map((message) => {
          const payload = message.payload;
          const resourceId = payload.resourceId;
          const signals = payload.signals || {};
          const roles = payload.roles || {};
          const changedAt = changedAtByResource[resourceId] || {};
          return (
            <section key={resourceId} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Resource {resourceId}</p>
                  <h2 className="font-mono text-sm font-semibold text-neutral-800">{payload.displayName || payload.stationId || `Station ${resourceId}`}</h2>
                </div>
                <HandshakeStatus snapshot={handshakeSnapshot(roles)} lastEvent={handshakeByResource[resourceId]} resultCodes={resultCodes} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {Object.entries(signals).map(([key, value]) => (
                  <MetricCard
                    key={key}
                    label={signalLabel(key)}
                    value={formatSignalValue(key, value)}
                    technical={key}
                    changed={isRecent(changedAt[key], now)}
                  />
                ))}
              </div>

              <EventTimeline events={(eventsByResource[resourceId] || []).length > 0
                ? eventsByResource[resourceId]
                : handshakeJournal.filter((entry) => entry.resource_id === resourceId).reverse().map((entry) => journalEvent(entry, resultCodes))} />
            </section>
          );
        })}

        <details className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">Technische Rohtelemetrie</summary>
          <pre className="mt-3 text-xs bg-neutral-900 rounded-md px-4 py-3 font-mono text-neutral-100 leading-relaxed overflow-auto max-h-56 whitespace-pre-wrap">
            {logs.join("\n") || "Warte auf Telemetrie..."}
          </pre>
        </details>
      </main>
    </div>
  );
}

function WebshopOrdersPanel({ orders }) {
  return (
    <section className="rounded-xl border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">OpenCart Webshop</p>
        <h2 className="font-semibold text-neutral-900">Letzte MQTT-Bestellungen</h2>
      </div>
      <div className="p-4">
        {orders.length === 0 && <p className="text-sm text-neutral-400">Noch keine Webshop-Bestellung empfangen.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {orders.map((order) => (
            <article key={`${order.orderName}-${order.timestamp}`} className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <strong className="text-sm text-neutral-900">{order.orderName}</strong>
                <time className="shrink-0 text-[10px] text-neutral-400">{formatTimestamp(order.timestamp)}</time>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(order.payload?.parameters || {}).map(([key, value]) => (
                  <MiniPayload key={key} label={signalLabel(key)} value={value} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function GatewayRolePanel({ health }) {
  const protocols = health?.protocols || {};
  return (
    <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary">Gateway-Aufgabe</p>
        <h2 className="mt-1 font-semibold text-neutral-900">Protokollbruecke zwischen SPS und MES</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Das Shopfloor Gateway liest und schreibt Maschinensignale, nimmt MQTT-Nachrichten entgegen und leitet Ereignisse ans MES weiter. Die Produktionsroute und die Entscheidung, ob ein Carrier an einer Station arbeiten darf, bleiben im MES-Routing.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <GatewayAdapter title="OPC UA Adapter" active={protocols.opcua?.connected} detail={protocols.opcua?.purpose || "Profilkonfigurierte Maschinensignale und Produktionsereignisse"} />
        <GatewayAdapter title="MQTT Adapter" active={protocols.mqtt?.connected} detail={protocols.mqtt?.purpose || "Webshop-Aufträge und Broker-Telemetrie"} />
      </div>
    </section>
  );
}

function GatewayAdapter({ title, active, detail }) {
  return (
    <article className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? "bg-status-success-bg text-status-success" : "bg-status-error-bg text-status-error"}`}>
          {active ? "verbunden" : "getrennt"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p>
    </article>
  );
}

function MiniPayload({ label, value }) {
  return <div className="rounded bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</p><p className="font-semibold text-neutral-800">{value ?? "-"}</p></div>;
}

function MqttLivePanel({ messages, connected }) {
  const visible = messages.slice(0, 8);
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">MQTT Subscribe</p>
          <h2 className="font-semibold text-neutral-900">Live-Nachrichten vom Broker</h2>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${connected ? "bg-sky-50 text-sky-700" : "bg-red-50 text-red-700"}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-sky-500" : "bg-red-500"}`} />
          {connected ? "abonniert" : "getrennt"}
        </span>
      </div>
      <div className="p-4">
        {visible.length === 0 && <p className="text-sm text-neutral-400">Noch keine MQTT-Nachricht empfangen.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((message, index) => (
            <article key={`${message.timestamp}-${message.topic}-${index}`} className="rounded-lg border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <code className="break-all text-xs font-semibold text-sky-800">{message.topic}</code>
                <time className="shrink-0 text-[10px] text-neutral-400">{formatTimestamp(message.timestamp)}</time>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Object.entries(message.payload || {}).map(([key, value]) => (
                  <div key={key} className="rounded bg-white px-3 py-2">
                    <p className="font-mono text-[10px] text-neutral-400">{key}</p>
                    <p className="mt-0.5 break-all text-sm font-semibold text-neutral-800">{formatMqttValue(value)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CarrierFlow({ order, carriers, route }) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-sm">
      <div className="flex flex-col gap-1 border-b border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Produktionsfluss</p>
          <h2 className="font-semibold text-neutral-900">{order?.name || "Kein aktiver Auftrag"}</h2>
        </div>
        {order && <span className="text-sm text-neutral-500">Fortschritt {order.completed_quantity}/{order.quantity}</span>}
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {carriers.length === 0 && <p className="text-sm text-neutral-400">Keine aktiven Carrier im Produktionsfluss.</p>}
        {carriers.map((carrier) => <CarrierRoute key={carrier.id} carrier={carrier} route={route} />)}
      </div>
    </section>
  );
}

function CarrierRoute({ carrier, route }) {
  const sortedRoute = [...route].sort((a, b) => a.step_no - b.step_no);
  const stages = [
    ...sortedRoute.map((step) => ({
      key: step.id || step.step_no,
      label: step.operation || `Schritt ${step.step_no}`,
      stepNo: step.step_no,
    })),
    { key: "complete", label: "Fertig", stepNo: null },
  ];
  const position = carrier.status === "completed"
    ? stages.length - 1
    : Math.max(0, sortedRoute.findIndex((step) => step.step_no === carrier.current_step_no));
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <strong className="text-neutral-900">Carrier {carrier.carrier_number}</strong>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] uppercase tracking-wide text-neutral-500 ring-1 ring-neutral-200">{carrierStatus(carrier.status)}</span>
      </div>
      <div className="relative flex">
        <div className="absolute left-[16.66%] right-[16.66%] top-2 h-0.5 bg-neutral-200" />
        {stages.map((stage, index) => (
          <div key={stage.key} className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2 px-1 text-center text-[11px] text-neutral-500">
            <span className={`h-4 w-4 rounded-full border-2 ${index < position ? "border-emerald-500 bg-emerald-500" : index === position ? "border-amber-400 bg-amber-400 ring-4 ring-amber-200" : "border-neutral-300 bg-white"}`} />
            <span className={index === position ? "font-semibold text-neutral-900" : ""}>{stage.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HandshakeStatus({ snapshot = {}, lastEvent, resultCodes = {} }) {
  const phase = snapshot.xQryBusy ? "busy" : snapshot.xDone ? "done" : snapshot.xError ? "error" : snapshot.xStart ? "requested" : "idle";
  const labels = { idle: "Bereit", requested: "SPS-Anfrage", busy: "MES prüft", done: "Antwort bereit", error: "Fehlerantwort" };
  const active = phase !== "idle";
  const resultCode = lastEvent?.resultCode;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${phase === "error" ? "bg-red-100 text-red-700" : active ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
        <span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-current" : "bg-current"}`} />
        {labels[phase]}
      </span>
      <Signal label="START" active={snapshot.xStart} />
      <Signal label="BUSY" active={snapshot.xQryBusy} />
      <Signal label="DONE" active={snapshot.xDone} />
      <Signal label="ERROR" active={snapshot.xError} error />
      {resultCode !== undefined && <span className="text-xs text-neutral-500">Letztes Ergebnis: {resultCode} · {resultCodes[resultCode] || "Unbekannt"}</span>}
    </div>
  );
}

function Signal({ label, active, error = false }) {
  return <span className={`rounded px-2 py-1 font-mono text-[10px] ${active ? (error ? "bg-red-600 text-white" : "bg-neutral-900 text-white") : "bg-neutral-100 text-neutral-400"}`}>{label}</span>;
}

function EventTimeline({ events }) {
  const visible = [...events].reverse().slice(0, 6);
  return (
    <div className="border-t border-neutral-100 pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Stationsereignisse</h3>
      {visible.length === 0 && <p className="text-xs text-neutral-400">Warte auf den nächsten SPS-Zyklus.</p>}
      <div className="grid gap-2 lg:grid-cols-2">
        {visible.map((event, index) => (
          <div key={`${event.timestamp}-${event.phase}-${index}`} className="flex items-start gap-3 rounded-lg bg-neutral-50 px-3 py-2">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.phase === "error" ? "bg-red-500" : event.phase === "process_completed" ? "bg-emerald-500" : "bg-amber-400"}`} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-neutral-700">{event.message}</p>
              <p className="mt-0.5 text-[10px] text-neutral-400">{formatTimestamp(event.timestamp)} · {event.phase}{event.resultCode !== undefined ? ` · Code ${event.resultCode}` : ""}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function journalEvent(entry, resultCodes = {}) {
  const resultCode = entry.result_code;
  return {
    timestamp: entry.responded_at || entry.created_at,
    phase: entry.status === "error" ? "error" : "acknowledged",
    resultCode,
    message: `Carrier ${entry.carrier_number}: ${resultCodes[resultCode] || entry.status}`,
  };
}

function StatusBadge({ label, active, detail }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${active ? "bg-status-success-bg text-status-success" : "bg-status-error-bg text-status-error"}`}>
      <span className={`h-2 w-2 rounded-full ${active ? "bg-status-success" : "bg-status-error"}`} />
      {label}: {detail || (active ? "verbunden" : "getrennt")}
    </span>
  );
}

function MetricCard({ label, value, technical, changed }) {
  return (
    <div className={`rounded-lg border p-4 transition-all duration-500 ${changed ? "border-amber-300 bg-amber-50 shadow-md" : "border-neutral-200 bg-neutral-50"}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
      <p className="mt-1 font-mono text-[11px] text-neutral-400">{technical}</p>
    </div>
  );
}

function signalLabel(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatSignalValue(key, value) {
  if (value === null || value === undefined || value === "") return "–";
  if (key === "processCompleted" || key.toLowerCase().includes("timestamp")) {
    return formatTimestamp(value);
  }
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function handshakeSnapshot(roles) {
  return {
    xStart: roles.workRequest,
    xQryBusy: roles.requestBusy,
    xDone: roles.requestAccepted || roles.requestCompleted,
    xError: roles.requestRejected,
  };
}

function formatTimestamp(value) {
  if (!value) return "–";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "–" : timestamp.toLocaleTimeString("de-DE");
}

function ageInSeconds(value, now) {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
}

function isRecent(value, now) {
  return Boolean(value && now - value < 2500);
}

function carrierStatus(status) {
  return ({ available: "Verfügbar", assigned: "Zugeordnet", in_process: "In Arbeit", completed: "Fertig", error: "Fehler" })[status] || status;
}

function formatMqttValue(value) {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

const CONTROL_COMMANDS = [
  { command: "start", label: "Starten", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { command: "pause", label: "Pause", color: "bg-amber-500 hover:bg-amber-600 text-white" },
  { command: "reset", label: "Reset", color: "bg-neutral-500 hover:bg-neutral-600 text-white" },
  { command: "stop", label: "Stop", color: "bg-red-600 hover:bg-red-700 text-white" },
];

function MachineControlPanel({ resourceId, displayName, signals, roles, commands, loading, onControl }) {
  const hasError = Boolean(signals.stateError || signals.stateErrorL0 || signals.stateErrorL1 || signals.stateErrorL2);
  const isActive = Boolean(roles.processActive || signals.stateAuto);
  const stateLabel = hasError ? "Fehler/Stop" : isActive ? "Aktiv" : "Bereit";
  const stateColor = hasError ? "bg-red-50 text-red-700" : isActive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold text-neutral-800">{displayName || `Station ${resourceId}`}</h3>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${stateColor}`}>{stateLabel}</span>
      </div>
      <p className="mb-3 text-xs leading-5 text-neutral-500">Sendet MES-Steuerbefehle an den OPC-UA-Control-Block der Station.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CONTROL_COMMANDS.filter((cmd) => commands.includes(cmd.command)).map((cmd) => (
          <button
            key={cmd.command}
            onClick={() => onControl(cmd.command)}
            disabled={loading}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${cmd.color} disabled:opacity-40`}
          >
            {loading ? "Senden..." : cmd.label}
          </button>
        ))}
        {commands.length === 0 && <p className="col-span-full text-xs text-neutral-400">Für diese Station sind im Profil keine Steuerbefehle freigegeben.</p>}
      </div>
    </section>
  );
}
