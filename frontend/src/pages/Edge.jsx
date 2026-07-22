import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useEdgeTelemetry } from "../hooks/useEdgeTelemetry.js";

export default function EdgePage() {
  const [health, setHealth] = useState(null);
  const { status, telemetry, lastMessageAt, logs } = useEdgeTelemetry();

  useEffect(() => {
    api.get("/edge/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  const payload = telemetry?.source === "opcua" ? telemetry.payload : {};
  const connected = status === "connected";

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Edge Gateway</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Live-Daten vom OPC-UA-Testserver und MQTT</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge label="WebSocket" active={connected} detail={status} />
          <StatusBadge label="OPC UA" active={Boolean(health?.opcua)} />
          <StatusBadge label="MQTT" active={Boolean(health?.mqtt)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Temperatur" value={formatNumber(payload.temperature, " °C")} />
          <MetricCard label="Druck" value={formatNumber(payload.pressure, " bar")} />
          <MetricCard label="Maschine" value={payload.running === undefined ? "–" : payload.running ? "Läuft" : "Stopp"} />
          <MetricCard label="Stückzähler" value={payload.producedCount ?? "–"} />
        </div>

        <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
          <h3 className="text-sm font-semibold text-neutral-700 mb-3">Live-Telemetrie</h3>
          <pre className="text-xs bg-neutral-900 rounded-md px-4 py-3 font-mono text-neutral-100 leading-relaxed overflow-auto max-h-56 whitespace-pre-wrap">
            {logs.join("\n") || "Warte auf Telemetrie..."}
          </pre>
        </div>

        <p className="text-xs text-neutral-400">
          Letzte Telemetrie: {lastMessageAt ? new Date(lastMessageAt).toLocaleString("de-DE") : "noch keine"}
        </p>
      </main>
    </div>
  );
}

function StatusBadge({ label, active, detail }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${active ? "bg-status-success-bg text-status-success" : "bg-status-error-bg text-status-error"}`}>
      <span className={`h-2 w-2 rounded-full ${active ? "bg-status-success" : "bg-status-error"}`} />
      {label}: {detail || (active ? "verbunden" : "getrennt")}
    </span>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}

function formatNumber(value, suffix) {
  return typeof value === "number" ? `${value.toFixed(2)}${suffix}` : "–";
}
