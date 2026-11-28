import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useShopfloorTelemetry } from "../hooks/useShopfloorTelemetry.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import PageInfo from "../components/PageInfo.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canManageMachines } from "../utils/roles.js";
import "./shopfloor.css";

const RESULT_TEXT = { 0: "OK", 1: "Carrier unbekannt", 2: "Auftrag oder Schritt fehlt", 3: "Falsche Station", 4: "Bereits abgeschlossen", 9: "Interner Fehler" };
const STATION_CODES = { 1: "S01", 2: "S02", 3: "Q01" };
const STATION_TITLES = { 1: "ballStation", 2: "lidStation", 3: "checkStation" };
const STATION_STALE_SECONDS = 10;
const FLOW_ENDPOINTS = ["/carriers", "/orders", "/shopfloor/stmes/handshakes", "/shopfloor/mqtt/messages", "/shopfloor/webshop/orders"];

function stationName(resourceId, t) {
  return STATION_TITLES[resourceId] ? t(`shopfloor.${STATION_TITLES[resourceId]}`) : `${t("shopfloor.stationLabel")} ${resourceId}`;
}

export default function ShopfloorPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canControl = canManageMachines(user);
  const [health, setHealth] = useState(undefined);
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [handshakeJournal, setHandshakeJournal] = useState([]);
  const [mqttHistory, setMqttHistory] = useState([]);
  const [webshopOrders, setWebshopOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [controlLoading, setControlLoading] = useState(null);
  const [controlFeedback, setControlFeedback] = useState({});
  const [flowStatus, setFlowStatus] = useState([]);
  const { status, telemetryByResource, handshakeByResource, eventsByResource, changedAtByResource, mqttEvents, lastMessageAt, logs } = useShopfloorTelemetry();

  const handleMachineControl = async (resourceId, command) => {
    setControlLoading(resourceId);
    setControlFeedback((current) => ({ ...current, [resourceId]: null }));
    try {
      await api.post("/shopfloor/machine/control", { resourceId, command });
      setControlFeedback((current) => ({ ...current, [resourceId]: "commandSent" }));
    } catch {
      setControlFeedback((current) => ({ ...current, [resourceId]: "commandFailed" }));
    } finally {
      setControlLoading(null);
    }
  };

  useEffect(() => {
    let active = true;
    let checkingHealth = false;
    let checkingFlow = false;
    async function loadStatus() {
      if (checkingHealth) return;
      checkingHealth = true;
      try {
        const data = await api.getSilent("/shopfloor/health");
        if (active) setHealth(data);
      } catch {
        if (active) setHealth(null);
      } finally {
        checkingHealth = false;
      }
    }
    async function loadFlow() {
      if (checkingFlow) return;
      checkingFlow = true;
      const results = await Promise.allSettled(FLOW_ENDPOINTS.map((endpoint) => api.getSilent(endpoint)));
      checkingFlow = false;
      if (!active) return;
      const setters = [setCarriers, setOrders, setHandshakeJournal, setMqttHistory, setWebshopOrders];
      const availability = results.map((result, index) => {
        if (result.status !== "fulfilled" || !Array.isArray(result.value)) return false;
        setters[index](result.value);
        return true;
      });
      setFlowStatus(availability);
    }
    loadStatus(); loadFlow();
    const healthTimer = setInterval(loadStatus, 5000);
    const flowTimer = setInterval(loadFlow, 2000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(healthTimer); clearInterval(flowTimer); clearInterval(clockTimer); };
  }, []);

  const connected = status === "connected";
  const stations = Object.values(telemetryByResource).sort((a, b) => a.payload.resourceId - b.payload.resourceId);
  const stationIds = [...new Set([1, 2, 3, ...stations.map(({ payload }) => payload.resourceId)])];
  const activeOrders = orders.filter((order) => order.status === "in_progress");
  const mqttMessages = [...mqttEvents].reverse();

  return (
    <div className="shopfloor">
      <div className="shopfloor-layout">
        <header className="shopfloor-header">
          <div>
            <h1>{t("shopfloor.title")}<PageInfo page="shopfloor" /></h1>
            <p>{t("shopfloor.overviewSubtitle")}</p>
          </div>
          <p className="shopfloor-freshness">
            {lastMessageAt ? `${t("shopfloor.dataReceived")} ${ageInSeconds(lastMessageAt, now)} ${t("shopfloor.seconds")}` : t("shopfloor.noTelemetry")}
          </p>
        </header>

        <ConnectionOverview health={health} status={status} t={t} />

        <section aria-labelledby="shopfloor-stations">
          <h2 id="shopfloor-stations" className="shopfloor-section-title">{t("shopfloor.stations")}</h2>
          <div className="shopfloor-stations">
            {stationIds.map((resourceId) => {
              const snapshot = telemetryByResource[resourceId];
              const fresh = connected && health?.opcua === true && snapshot &&
                ageInSeconds(snapshot.timestamp, now) < STATION_STALE_SECONDS;
              return (
                <MachineControlPanel key={resourceId} resourceId={resourceId}
                  stationState={snapshot?.payload.state} stale={Boolean(snapshot && !fresh)}
                  blocked={health?.opcua !== true} canControl={canControl}
                  loading={controlLoading === resourceId} busy={controlLoading !== null}
                  feedback={controlFeedback[resourceId]}
                  onControl={(command) => handleMachineControl(resourceId, command)} t={t} />
              );
            })}
          </div>
        </section>

        <section className="shopfloor-panel shopfloor-production" aria-labelledby="shopfloor-production">
          <h2 id="shopfloor-production" className="shopfloor-section-title">{t("shopfloor.productionFlow")}</h2>
          <DataStatus states={flowStatus.slice(0, 2)} expected={2} t={t} />
          {activeOrders.map((order) => (
            <CarrierFlow key={order.id} order={order} carriers={carriers.filter((carrier) => carrier.order_id === order.id)} t={t} />
          ))}
          {activeOrders.length === 0 && flowStatus[1] && <p>{t("shopfloor.noActiveOrder")}</p>}
          <details className="shopfloor-carrier-history">
            <summary>{t("shopfloor.otherCarriers")}</summary>
            <CarrierFlow carriers={carriers.filter((carrier) => !activeOrders.some((order) => order.id === carrier.order_id))} t={t} />
          </details>
        </section>

        <Disclosure title={t("shopfloor.webshopOrders")} description={t("shopfloor.webshopDescription")}
          aside={flowStatus[4] && webshopOrders.length > 0 ? webshopOrders.length : null}>
          <DataStatus states={flowStatus.slice(4)} expected={1} t={t} />
          <WebshopOrdersPanel orders={webshopOrders} available={flowStatus[4]} t={t} />
        </Disclosure>

        <Disclosure title={t("shopfloor.technicalDetails")}>
          <GatewayRolePanel health={health} t={t} />
          <DataStatus states={flowStatus.slice(2, 4)} expected={2} t={t} />
          <MqttLivePanel messages={mqttMessages.length > 0 ? mqttMessages : mqttHistory} connected={health?.mqtt} t={t} />
          {stations.length === 0 && <p>{t("shopfloor.waiting")}</p>}
          {stations.map((message) => {
          const payload = message.payload;
          const resourceId = payload.resourceId;
          const changedAt = changedAtByResource[resourceId] || {};
          return (
            <section key={resourceId} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{t("shopfloor.resource")} {resourceId}</p>
                  <h2 className="font-mono text-sm font-semibold text-neutral-800">{stationName(resourceId, t)} · {t("shopfloor.dbProcessData")}</h2>
                  <p className="text-xs text-neutral-600">{t("shopfloor.snapshotTime")} {formatTimestamp(message.timestamp)}</p>
                </div>
                <HandshakeStatus snapshot={payload.handshake} lastEvent={handshakeByResource[resourceId]} t={t} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <MetricCard label={t("shopfloor.carrier")} value={payload.iCarrierID ?? "–"} technical="iCarrierID" changed={isRecent(changedAt.iCarrierID, now)} />
                <MetricCard label={t("shopfloor.workplanStep")} value={payload.iStepNo ?? "–"} technical="iStepNo" changed={isRecent(changedAt.iStepNo, now)} />
                <MetricCard label={t("shopfloor.nextStation")} value={payload.iResourceID ?? "–"} technical="iResourceID" changed={isRecent(changedAt.iResourceID, now)} />
                <MetricCard label={t("shopfloor.lidColor")} value={formatLidColor(payload.iPar1)} technical="iPar1" changed={isRecent(changedAt.iPar1, now)} />
                <MetricCard label={t("shopfloor.redBalls")} value={payload.iPar2 ?? "–"} technical="iPar2" changed={isRecent(changedAt.iPar2, now)} />
                <MetricCard label={t("shopfloor.greenBalls")} value={payload.iPar3 ?? "–"} technical="iPar3" changed={isRecent(changedAt.iPar3, now)} />
                <MetricCard label={t("shopfloor.blueBalls")} value={payload.iPar4 ?? "–"} technical="iPar4" changed={isRecent(changedAt.iPar4, now)} />
                <MetricCard label={t("shopfloor.completionTime")} value={formatTimestamp(payload.ldtTimeStamp)} technical="ldtTimeStamp" changed={isRecent(changedAt.ldtTimeStamp, now)} />
              </div>
              <EventTimeline events={(eventsByResource[resourceId] || []).length > 0 ? eventsByResource[resourceId] : handshakeJournal.filter((entry) => entry.resource_id === resourceId).reverse().map(journalEvent)} t={t} />
            </section>
          );
          })}

        <details className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">{t("shopfloor.rawTelemetry")}</summary>
          <pre className="mt-3 text-xs bg-neutral-900 rounded-md px-4 py-3 font-mono text-neutral-100 leading-relaxed overflow-auto max-h-56 whitespace-pre-wrap">{logs.join("\n") || t("shopfloor.waitingForTelemetry")}</pre>
        </details>
        </Disclosure>
      </div>
    </div>
  );
}

function ConnectionOverview({ health, status, t }) {
  const links = [
    { label: "liveDisplay", state: status === "connected" ? "connected" : status === "connecting" ? "connecting" : "disconnected" },
    { label: "machineLink", state: adapterStatus(health?.opcua, health) },
    { label: "webshopLink", state: adapterStatus(health?.mqtt, health) },
  ];
  const allConnected = links.every(({ state }) => state === "connected");
  const waiting = links.every(({ state }) => state === "connected" || state === "connecting");
  const overview = allConnected ? "linksReady" : waiting ? "linksChecking" : "linksLimited";
  return (
    <section className="shopfloor-connections" aria-labelledby="shopfloor-link-title">
      <div className="shopfloor-connection-intro">
        <span aria-hidden="true" className="shopfloor-link-icon" data-tone={allConnected ? "good" : waiting ? "neutral" : "warn"}>
          {allConnected ? "✓" : waiting ? "…" : "!"}
        </span>
        <div>
          <h2 id="shopfloor-link-title">{t(`shopfloor.${overview}`)}</h2>
          <p>{t(`shopfloor.${overview}Hint`)}</p>
        </div>
      </div>
      <ul className="shopfloor-link-list">
        {links.map(({ label, state }) => (
          <li key={label} data-tone={connectionTone(state)}>
            <span>{t(`shopfloor.${label}`)}</span>
            <span>{t(`shopfloor.${state}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function adapterStatus(active, health) {
  if (health === undefined) return "connecting";
  if (typeof active !== "boolean") return "linkUnknown";
  return active ? "connected" : "disconnected";
}

function connectionTone(state) {
  if (state === "connected") return "good";
  if (state === "disconnected") return "bad";
  return "neutral";
}

function Disclosure({ title, description, aside, children }) {
  return (
    <details className="shopfloor-panel shopfloor-disclosure">
      <summary>
        <span><strong>{title}</strong>{description && <small>{description}</small>}</span>
        {aside != null && <b className="shopfloor-count">{aside}</b>}
      </summary>
      <div className="shopfloor-disclosure-body">{children}</div>
    </details>
  );
}

function DataStatus({ states, expected, t }) {
  if (states.length < expected) return <p>{t("shopfloor.loadingData")}</p>;
  if (states.every(Boolean)) return null;
  return <p className="shopfloor-data-warning">{t("shopfloor.dataUnavailable")}</p>;
}

function WebshopOrdersPanel({ orders, available, t }) {
  return (
    <div>
        {available && orders.length === 0 && <p>{t("shopfloor.webshopNoOrders")}</p>}
        <div className="grid gap-3 lg:grid-cols-2">{orders.map((order) => (
          <article key={`${order.orderName}-${order.timestamp}`} className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-start justify-between gap-3"><strong className="text-sm text-neutral-900">{order.orderName}</strong><time className="shrink-0 text-[10px] text-neutral-400">{formatTimestamp(order.timestamp)}</time></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <MiniPayload label={t("shopfloor.lidColorLabel")} value={formatLidColor(order.payload?.bDeckelfarbe)} />
              <MiniPayload label={t("shopfloor.red")} value={order.payload?.uiKugelRot} />
              <MiniPayload label={t("shopfloor.green")} value={order.payload?.uiKugelGruen} />
              <MiniPayload label={t("shopfloor.blue")} value={order.payload?.uiKugelBlau} />
            </div>
          </article>
        ))}</div>
    </div>
  );
}

function GatewayRolePanel({ health, t }) {
  const protocols = health?.protocols || {};
  return (
    <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_1.4fr]">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary">{t("shopfloor.gatewayTask")}</p><h2 className="mt-1 font-semibold text-neutral-900">{t("shopfloor.gatewayTitle")}</h2><p className="mt-2 text-sm leading-6 text-neutral-500">{t("shopfloor.gatewayDesc")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <GatewayAdapter title={t("shopfloor.opcuaAdapter")} state={adapterStatus(protocols.opcua?.connected, health)} detail={t("shopfloor.opcuaPurpose")} t={t} />
        <GatewayAdapter title={t("shopfloor.mqttAdapter")} state={adapterStatus(protocols.mqtt?.connected, health)} detail={t("shopfloor.mqttPurpose")} t={t} />
      </div>
    </section>
  );
}

function GatewayAdapter({ title, state, detail, t }) {
  return (
    <article className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-neutral-800">{title}</h3><span className="shopfloor-state-pill" data-tone={connectionTone(state)}>{t(`shopfloor.${state}`)}</span></div>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p>
    </article>
  );
}

function MiniPayload({ label, value }) { return <div className="rounded bg-white px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</p><p className="font-semibold text-neutral-800">{value ?? "-"}</p></div>; }

function MqttLivePanel({ messages, connected, t }) {
  const visible = messages.slice(0, 8);
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">{t("shopfloor.mqttSubscription")}</p><h2 className="font-semibold text-neutral-900">{t("shopfloor.mqttLive")}</h2></div>
        <span className="shopfloor-state-pill" data-tone={connected ? "good" : connected === false ? "bad" : "neutral"}>{t(connected ? "shopfloor.subscribed" : connected === false ? "shopfloor.disconnected" : "shopfloor.linkUnknown")}</span>
      </div>
      <div className="p-4">
        {visible.length === 0 && <p className="text-sm text-neutral-400">{t("shopfloor.mqttNoMessages")}</p>}
        <div className="grid gap-3 lg:grid-cols-2">{visible.map((message, index) => (
          <article key={`${message.timestamp}-${message.topic}-${index}`} className="rounded-lg border border-sky-100 bg-sky-50/50 p-4">
            <div className="flex items-start justify-between gap-3"><code className="break-all text-xs font-semibold text-sky-800">{message.topic}</code><time className="shrink-0 text-[10px] text-neutral-400">{formatTimestamp(message.timestamp)}</time></div>
            <div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(message.payload || {}).map(([key, value]) => (
              <div key={key} className="rounded bg-white px-3 py-2"><p className="font-mono text-[10px] text-neutral-400">{key}</p><p className="mt-0.5 break-all text-sm font-semibold text-neutral-800">{formatMqttValue(value)}</p></div>
            ))}</div>
          </article>
        ))}</div>
      </div>
    </section>
  );
}

function CarrierFlow({ order, carriers, t }) {
  const orderId = order?.id;
  const [route, setRoute] = useState(undefined);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let pending = false;

    async function loadRoute() {
      if (pending) return;
      pending = true;
      try {
        const steps = await api.getSilent(`/orders/${orderId}/route`);
        if (active) setRoute(Array.isArray(steps) && steps.length ? steps : null);
      } catch {
        if (active) setRoute(null);
      } finally {
        pending = false;
      }
    }
    loadRoute();
    const timer = setInterval(loadRoute, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [orderId]);

  return (
    <div className="shopfloor-order">
      {order && (
        <header className="shopfloor-order-header">
          <h3>{t("shopfloor.currentOrder")} <strong>{order.name}</strong></h3>
          <p><strong>{order.completed_quantity} / {order.quantity}</strong> {t("shopfloor.piecesDone")}</p>
        </header>
      )}
      <div className="shopfloor-carriers">
        {carriers.length === 0 && <p>{t("shopfloor.noCarriers")}</p>}
        {orderId && carriers.length > 0 && !route && <p>{t(route === undefined ? "shopfloor.routeLoading" : "shopfloor.routeUnavailable")}</p>}
        {carriers.map((carrier) => <CarrierRoute key={carrier.id} carrier={carrier} route={route} t={t} />)}
      </div>
    </div>
  );
}

const STANDARD_OPERATIONS = { "Deckelfarbe bereitstellen": "lidStep", "Kugeln dosieren": "ballStep", "Deckel und Kugeln pruefen": "checkStation" };
const CARRIER_STATES = { available: "carrierAvailable", assigned: "carrierAssigned", in_process: "carrierInProcess", completed: "routeDone", error: "carrierError" };

function CarrierRoute({ carrier, route, t }) {
  const finished = carrier.status === "completed";
  const assigned = Boolean(carrier.order_id) && carrier.status !== "available";
  const stepNumber = carrier.current_step_no;
  const stages = route && [...route, { step_no: "finished" }];
  const position = finished ? route?.length : route?.findIndex(({ step_no }) => step_no === stepNumber);
  return (
    <article className="shopfloor-carrier">
      <header>
        <h4>{t("shopfloor.carrier")} {carrier.carrier_number}</h4>
        <span className="shopfloor-state-pill" data-tone={carrier.status === "error" ? "bad" : finished ? "good" : "neutral"}>
          {t(`shopfloor.${CARRIER_STATES[carrier.status] || "unknown"}`)}
        </span>
      </header>
      {stages && position >= 0 ? (
        <ol className="shopfloor-stage-list">
          {stages.map((stage, index) => {
            const done = index < position || finished;
            const current = index === position && !finished;
            const failed = current && carrier.status === "error";
            const stageState = done ? "stepDone" : failed ? "carrierError" : current ? "currentStep" : "stepPending";
            return (
              <li key={stage.step_no} data-stage={done ? "done" : failed ? "error" : current ? "current" : "pending"}
                aria-current={current ? "step" : undefined}>
                <span aria-hidden="true">{done ? "✓" : failed ? "!" : index + 1}</span>
                <div><strong>{routeStepLabel(stage, t)}</strong><small>{t(`shopfloor.${stageState}`)}</small></div>
              </li>
            );
          })}
        </ol>
      ) : !finished && assigned && (
        <p>{route || !Number.isInteger(stepNumber) || stepNumber < 1 ? t("shopfloor.stepUnknown") : `${t("shopfloor.stepNumber")} ${stepNumber}`}</p>
      )}
    </article>
  );
}

function routeStepLabel(step, t) {
  if (step.step_no === "finished") return t("shopfloor.routeDone");
  const standardLabel = STANDARD_OPERATIONS[step.operation];
  return standardLabel ? t(`shopfloor.${standardLabel}`) : step.operation || stationName(step.resource_id, t);
}

function HandshakeStatus({ snapshot = {}, lastEvent, t }) {
  const phase = snapshot.xError ? "error" : snapshot.xQryBusy ? "busy" : snapshot.xDone ? "done" : snapshot.xStart ? "requested" : "idle";
  const labels = { idle: t("shopfloor.idle"), requested: t("shopfloor.requested"), busy: t("shopfloor.busy"), done: t("shopfloor.done"), error: t("shopfloor.errorResult") };
  const active = phase !== "idle";
  const resultCode = lastEvent?.resultCode;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${phase === "error" ? "bg-red-100 text-red-700" : active ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
        <span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-current" : "bg-current"}`} />{labels[phase] || phase}
      </span>
      <Signal label="START" active={snapshot.xStart} /><Signal label="BUSY" active={snapshot.xQryBusy} /><Signal label="DONE" active={snapshot.xDone} /><Signal label="ERROR" active={snapshot.xError} error />
      {resultCode !== undefined && <span className="text-xs text-neutral-500">{t("shopfloor.lastResult")}: {resultCode} · {RESULT_TEXT[resultCode] || t("shopfloor.unknown")}</span>}
    </div>
  );
}

function Signal({ label, active, error = false }) { return <span className={`rounded px-2 py-1 font-mono text-[10px] ${active ? (error ? "bg-red-600 text-white" : "bg-neutral-900 text-white") : "bg-neutral-100 text-neutral-400"}`}>{label}</span>; }

function EventTimeline({ events, t }) {
  const visible = [...events].reverse().slice(0, 6);
  return (
    <div className="border-t border-neutral-100 pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("shopfloor.stationEvents")}</h3>
      {visible.length === 0 && <p className="text-xs text-neutral-400">{t("shopfloor.waitingForCycle")}</p>}
      <div className="grid gap-2 lg:grid-cols-2">{visible.map((event, index) => (
        <div key={`${event.timestamp}-${event.phase}-${index}`} className="flex items-start gap-3 rounded-lg bg-neutral-50 px-3 py-2">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.phase === "error" ? "bg-red-500" : event.phase === "process_completed" ? "bg-emerald-500" : "bg-amber-400"}`} />
          <div className="min-w-0"><p className="text-xs font-medium text-neutral-700">{event.message}</p><p className="mt-0.5 text-[10px] text-neutral-400">{formatTimestamp(event.timestamp)} · {event.phase}{event.resultCode !== undefined ? ` · Code ${event.resultCode}` : ""}</p></div>
        </div>
      ))}</div>
    </div>
  );
}

function journalEvent(entry) {
  const phases = { received: "requested", responded: "done", acknowledged: "acknowledged", error: "error" };
  return {
    timestamp: entry.acknowledged_at || entry.responded_at || entry.created_at,
    phase: phases[entry.status] || entry.status,
    resultCode: entry.result_code,
    message: `Carrier ${entry.carrier_number}: ${RESULT_TEXT[entry.result_code] || entry.status}`,
  };
}
function MetricCard({ label, value, technical, changed }) { return <div className={`rounded-lg border p-4 transition-all duration-500 ${changed ? "border-amber-300 bg-amber-50 shadow-md" : "border-neutral-200 bg-neutral-50"}`}><p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p><p className="mt-1 font-mono text-[11px] text-neutral-400">{technical}</p></div>; }

function formatLidColor(value) { return ({ 0: "Keine Dose", 1: "Rot", 2: "Blau", 3: "Grün" })[value] || "–"; }
function formatTimestamp(value) { if (!value) return "–"; const timestamp = new Date(value); return Number.isNaN(timestamp.getTime()) ? "–" : timestamp.toLocaleTimeString("de-DE"); }
function ageInSeconds(value, now) { return Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000)); }
function isRecent(value, now) { return Boolean(value && now - value < 2500); }
function formatMqttValue(value) { return typeof value === "object" ? JSON.stringify(value) : String(value); }

const CONTROL_COMMANDS = [
  { command: "start", labelKey: "shopfloor.start", color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { command: "pause", labelKey: "shopfloor.pause", color: "bg-amber-500 hover:bg-amber-600 text-white" },
  { command: "reset", labelKey: "shopfloor.reset", color: "bg-neutral-500 hover:bg-neutral-600 text-white" },
  { command: "stop", labelKey: "shopfloor.stop", color: "bg-red-600 hover:bg-red-700 text-white" },
];

function getMachineState(state, stale) {
  if (stale) return { label: "stationStale", tone: "warn" };
  if (!state || !Object.values(state).some((value) => typeof value === "boolean")) return { label: "stationWaiting", tone: "neutral" };
  if (state.xErrL0 || state.xErrL1 || state.xErrL2) return { label: "stationFault", tone: "bad" };
  if (state.xReset) return { label: "stationReset", tone: "warn" };
  if (state.xBusy) return { label: "stationWorking", tone: "good" };
  if (state.xManual) return { label: "stationManual", tone: "warn" };
  if (state.xAuto) return { label: "stationAuto", tone: "good" };
  if (state.xAuto === false) return { label: "stationInactive", tone: "neutral" };
  return { label: "stationWaiting", tone: "neutral" };
}

function MachineControlPanel({ resourceId, stationState, stale, blocked, canControl, loading, busy, feedback, onControl, t }) {
  const { label, tone } = getMachineState(stationState, stale);
  return (
    <article className="shopfloor-panel shopfloor-station">
      <h3>{STATION_CODES[resourceId] && <span>{STATION_CODES[resourceId]}</span>}{stationName(resourceId, t)}</h3>
      <div className="shopfloor-station-state">
        <strong data-tone={tone}>{t(`shopfloor.${label}`)}</strong>
        <p>{t(`shopfloor.${label}Hint`)}</p>
      </div>
      {canControl && (
        <details className="shopfloor-controls">
          <summary>{t("shopfloor.machineControl")}</summary>
          <div className="shopfloor-control-content">
            <p>{t(blocked ? "shopfloor.controlsOffline" : "shopfloor.controlDescription")}</p>
            <div className="shopfloor-command-grid">{CONTROL_COMMANDS.map((cmd) => (
              <button key={cmd.command} type="button" onClick={() => onControl(cmd.command)}
                disabled={busy || blocked} className={`rounded-md px-3 py-2 text-sm font-semibold ${cmd.color} disabled:opacity-50`}>
                {t(cmd.labelKey)}
              </button>
            ))}</div>
            <p role="status" data-command-result={feedback || undefined}>
              {loading ? t("shopfloor.sending") : feedback && t(`shopfloor.${feedback}`)}
            </p>
          </div>
        </details>
      )}
    </article>
  );
}
