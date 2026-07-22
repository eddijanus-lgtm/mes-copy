import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useEdgeTelemetry } from "../hooks/useEdgeTelemetry.js";

const RESULT_TEXT = {
  0: "OK",
  1: "Carrier unbekannt",
  2: "Auftrag oder Schritt fehlt",
  3: "Falsche Station",
  4: "Bereits abgeschlossen",
  9: "Interner Fehler",
};

export default function EdgePage() {
  const [health, setHealth] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [handshakeJournal, setHandshakeJournal] = useState([]);
  const [now, setNow] = useState(Date.now());
  const { status, telemetryByResource, handshakeByResource, eventsByResource, changedAtByResource, lastMessageAt, logs } = useEdgeTelemetry();

  useEffect(() => {
    const loadStatus = () => api.get("/edge/health").then(setHealth).catch(() => setHealth(null));
    const loadFlow = () => Promise.all([api.get("/carriers"), api.get("/orders"), api.get("/edge/stmes/handshakes")])
      .then(([carrierData, orderData, journalData]) => {
        setCarriers(carrierData);
        setOrders(orderData);
        setHandshakeJournal(journalData);
      })
      .catch(() => {});
    loadStatus();
    loadFlow();
    const healthTimer = setInterval(loadStatus, 5000);
    const flowTimer = setInterval(loadFlow, 2000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(healthTimer);
      clearInterval(flowTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const connected = status === "connected";
  const stations = Object.values(telemetryByResource).sort((a, b) => a.payload.resourceId - b.payload.resourceId);
  const demoOrder = orders.find((order) => order.name === "DEMO-ORDER-001");
  const demoCarriers = demoOrder ? carriers.filter((carrier) => carrier.order_id === demoOrder.id) : carriers;

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Edge Gateway</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Live-Prozess aus stMES-Handshake und dbProcessData [DB151]</p>
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

        <CarrierFlow order={demoOrder} carriers={demoCarriers} />

        {stations.length === 0 && <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">Warte auf Stationsdaten...</p>}
        {stations.map((message) => {
          const payload = message.payload;
          const resourceId = payload.resourceId;
          const changedAt = changedAtByResource[resourceId] || {};
          return (
            <section key={resourceId} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Resource {resourceId}</p>
                  <h2 className="font-mono text-sm font-semibold text-neutral-800">Station {resourceId} · dbProcessData [DB151]</h2>
                </div>
                <HandshakeStatus snapshot={payload.handshake} lastEvent={handshakeByResource[resourceId]} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <MetricCard label="Werkstückträger" value={payload.iCarrierID ?? "–"} technical="iCarrierID" changed={isRecent(changedAt.iCarrierID, now)} />
                <MetricCard label="Workplan-Schritt" value={payload.iStepNo ?? "–"} technical="iStepNo" changed={isRecent(changedAt.iStepNo, now)} />
                <MetricCard label="Nächste Station" value={payload.iResourceID ?? "–"} technical="iResourceID" changed={isRecent(changedAt.iResourceID, now)} />
                <MetricCard label="Deckelfarbe" value={formatLidColor(payload.iPar1)} technical="iPar1" changed={isRecent(changedAt.iPar1, now)} />
                <MetricCard label="Rote Kugeln" value={payload.iPar2 ?? "–"} technical="iPar2" changed={isRecent(changedAt.iPar2, now)} />
                <MetricCard label="Grüne Kugeln" value={payload.iPar3 ?? "–"} technical="iPar3" changed={isRecent(changedAt.iPar3, now)} />
                <MetricCard label="Blaue Kugeln" value={payload.iPar4 ?? "–"} technical="iPar4" changed={isRecent(changedAt.iPar4, now)} />
                <MetricCard label="Prozessabschluss" value={formatTimestamp(payload.ldtTimeStamp)} technical="ldtTimeStamp" changed={isRecent(changedAt.ldtTimeStamp, now)} />
              </div>

              <EventTimeline events={(eventsByResource[resourceId] || []).length > 0
                ? eventsByResource[resourceId]
                : handshakeJournal.filter((entry) => entry.resource_id === resourceId).reverse().map(journalEvent)} />
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

function CarrierFlow({ order, carriers }) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-900 text-white shadow-sm">
      <div className="flex flex-col gap-1 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Produktionsfluss</p>
          <h2 className="font-semibold">{order?.name || "Aktive Carrier"}</h2>
        </div>
        {order && <span className="text-sm text-neutral-300">Fortschritt {order.completed_quantity}/{order.quantity}</span>}
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {carriers.length === 0 && <p className="text-sm text-neutral-400">Keine zugeordneten Carrier gefunden.</p>}
        {carriers.map((carrier) => <CarrierRoute key={carrier.id} carrier={carrier} />)}
      </div>
    </section>
  );
}

function CarrierRoute({ carrier }) {
  const position = carrier.status === "completed" ? 2 : carrier.current_step_no <= 1 ? 0 : 1;
  const stages = ["Station 1", "Station 2", "Fertig"];
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <strong>Carrier {carrier.carrier_number}</strong>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-neutral-300">{carrierStatus(carrier.status)}</span>
      </div>
      <div className="relative grid grid-cols-3">
        <div className="absolute left-[16.66%] right-[16.66%] top-2 h-0.5 bg-white/15" />
        {stages.map((stage, index) => (
          <div key={stage} className="relative z-10 flex flex-col items-center gap-2 text-center text-[11px] text-neutral-400">
            <span className={`h-4 w-4 rounded-full border-2 ${index < position ? "border-emerald-400 bg-emerald-400" : index === position ? "border-amber-300 bg-amber-300 ring-4 ring-amber-300/20" : "border-neutral-600 bg-neutral-900"}`} />
            <span className={index === position ? "font-semibold text-white" : ""}>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HandshakeStatus({ snapshot = {}, lastEvent }) {
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
      {resultCode !== undefined && <span className="text-xs text-neutral-500">Letztes Ergebnis: {resultCode} · {RESULT_TEXT[resultCode] || "Unbekannt"}</span>}
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

function journalEvent(entry) {
  const resultCode = entry.result_code;
  return {
    timestamp: entry.responded_at || entry.created_at,
    phase: entry.status === "error" ? "error" : "acknowledged",
    resultCode,
    message: `Carrier ${entry.carrier_number}: ${RESULT_TEXT[resultCode] || entry.status}`,
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

function formatLidColor(value) {
  return ({ 0: "Keine Dose", 1: "Rot", 2: "Blau", 3: "Grün" })[value] || "–";
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
