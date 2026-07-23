import { useState, useEffect } from "react";
import StatCard from "../components/StatCard";
import { api } from "../api/client.js";

export default function Dashboard() {
  const [stats, setStats] = useState({ machines: 0, alarms: 0, health: false });
  const [machines, setMachines] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    const loadDashboard = () => {
      api.get("/machines").then((m) => {
        if (Array.isArray(m)) {
          setMachines(m);
          setStats((s) => ({ ...s, machines: m.length }));
        }
      }).catch(() => {});
      api.get("/carriers").then((c) => {
        if (Array.isArray(c)) setCarriers(c);
      }).catch(() => {});
      api.get("/alarms/stats/active-count").then((a) => {
        if (typeof a === "number") setStats((s) => ({ ...s, alarms: a }));
      }).catch(() => {});
      api.get("/shopfloor/health").then((h) => {
        setStats((s) => ({ ...s, health: Boolean(h?.ok) }));
      }).catch(() => setStats((s) => ({ ...s, health: false })));
      api.get("/dashboard/kpis").then(setKpis).catch(() => setKpis(null));
    };
    loadDashboard();
    const timer = setInterval(loadDashboard, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Willkommen bei der MES Shopfloor Gateway Ubersicht</p>
          </div>
        </div>

        {/* StatCards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Verbundene Stationen" value={String(stats.machines)} icon="⚙️" />
          <StatCard label="Aktive Alarme" value={String(stats.alarms)} icon="🔔" />
          <StatCard label="Shopfloor Gateway" value={stats.health ? "Online" : "Inaktiv"} icon="▥" />
          <StatCard label="OEE" value={formatPercent(kpis?.oee?.total)} icon="%" />
          <StatCard label="Durchsatz" value={formatRate(kpis?.throughput?.unitsPerHour)} icon="/h" />
          <StatCard label="Yield" value={formatPercent(kpis?.yield)} icon="✓" />
        </div>

        <OperationsIntelligence kpis={kpis} />

        {/* Stationen + System */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <StationOverview machines={machines} carriers={carriers} />

          <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">System</h3>
            <pre className="text-xs bg-neutral-50 rounded-md px-4 py-3 font-mono text-neutral-500 leading-relaxed max-h-[160px] overflow-auto whitespace-pre-wrap">
              {JSON.stringify({ version: "MES Shopfloor Gateway v1.0", port: 3000, endpoints: ["/api/machines", "/api/alarms", "/api/traces", "/api/shopfloor"] }, null, 2)}
            </pre>
          </div>

        </div>
      </main>
    </div>
  );
}

function OperationsIntelligence({ kpis }) {
  const oee = kpis?.oee || {};
  const statuses = kpis?.machines?.status || {};
  const statusRows = [
    ["online", "Online", "bg-emerald-500"],
    ["idle", "Bereit", "bg-lime-500"],
    ["error", "Stoerung", "bg-red-500"],
    ["maintenance", "Wartung", "bg-sky-500"],
    ["offline", "Offline", "bg-neutral-400"],
  ];

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">OEE Live-Score</h3>
            <p className="mt-1 text-xs text-neutral-400">Letzte 8 Stunden, aktualisiert alle 2 Sekunden.</p>
          </div>
          <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
            {formatRange(kpis?.range)}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <OeeGauge label="Gesamt" value={oee.total} accent="from-brand-primary to-indigo-500" />
          <OeeGauge label="Verfuegbarkeit" value={oee.availability} accent="from-emerald-500 to-lime-500" />
          <OeeGauge label="Leistung" value={oee.performance} accent="from-amber-500 to-orange-500" />
          <OeeGauge label="Qualitaet" value={oee.quality} accent="from-sky-500 to-cyan-500" />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
        <h3 className="text-sm font-semibold text-neutral-700">Betriebsstatus</h3>
        <div className="mt-4 space-y-3">
          {statusRows.map(([key, label, color]) => {
            const count = statuses[key] || 0;
            const total = kpis?.machines?.total || 0;
            const width = total > 0 ? Math.round((count / total) * 100) : 0;
            return <StatusMeter key={key} label={label} count={count} width={width} color={color} />;
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
          <MiniMetric label="Downtime" value={`${kpis?.machines?.downtimeMinutes ?? 0} min`} />
          <MiniMetric label="Events" value={String(kpis?.machines?.downtimeEvents ?? 0)} />
          <MiniMetric label="Fertigmenge" value={String(kpis?.throughput?.completedQuantity ?? 0)} />
          <MiniMetric label="Aktive Auftraege" value={String(kpis?.orders?.activeOrders ?? 0)} />
        </div>
      </div>
    </section>
  );
}

function OeeGauge({ label, value, accent }) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="text-lg font-bold text-neutral-900">{formatPercent(safeValue)}</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full bg-gradient-to-r ${accent}`} style={{ width: `${Math.min(safeValue, 100)}%` }} />
      </div>
    </div>
  );
}

function StatusMeter({ label, count, width, color }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-neutral-600">{label}</span>
        <span className="text-neutral-400">{count}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
      <p className="uppercase tracking-wider text-neutral-400">{label}</p>
      <p className="mt-1 font-bold text-neutral-900">{value}</p>
    </div>
  );
}

function formatPercent(value) {
  return `${Number.isFinite(value) ? value : 0}%`;
}

function formatRate(value) {
  return `${Number.isFinite(value) ? value : 0}`;
}

function formatRange(range) {
  if (!range?.from || !range?.to) return "8h Fenster";
  return `${new Date(range.from).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} - ${new Date(range.to).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

function StationOverview({ machines, carriers }) {
  const stations = [...machines]
    .filter((machine) => machine.resource_id)
    .sort((a, b) => a.resource_id - b.resource_id);

  return (
    <section className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-700">Stationen Live</h3>
          <p className="mt-1 text-xs text-neutral-400">Hover fuer Details wie bei einer Spiel-Info-Karte.</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">{stations.length} Stationen</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stations.length === 0 && <p className="text-sm text-neutral-400">Keine Stationen gefunden.</p>}
        {stations.map((station) => {
          const carrier = carriers.find((entry) => entry.current_resource_id === station.resource_id);
          const state = stationState(station, carrier);
          return <StationCard key={station.id} station={station} carrier={carrier} state={state} />;
        })}
      </div>
    </section>
  );
}

function StationCard({ station, carrier, state }) {
  return (
    <article className={`group relative overflow-visible rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-hover ${state.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-70">Resource {station.resource_id}</p>
          <h4 className="mt-1 text-sm font-bold text-neutral-900">{station.name}</h4>
        </div>
        <span className={`h-3 w-3 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.75)] ${state.dot}`} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${state.badge}`}>{state.label}</span>
        <span className="text-xs font-medium text-neutral-500">{carrier ? `Carrier ${carrier.carrier_number}` : "kein Carrier"}</span>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-3 hidden w-72 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-2xl ring-1 ring-black/5 group-hover:block">
        <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-neutral-200 bg-white" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand-primary">Shopfloor Intel</p>
        <h5 className="mt-1 font-semibold text-neutral-900">{station.name}</h5>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <TooltipRow label="Status" value={state.label} />
          <TooltipRow label="Resource" value={station.resource_id} />
          <TooltipRow label="Typ" value={station.type || "-"} />
          <TooltipRow label="Ort" value={station.location || "-"} />
          <TooltipRow label="Carrier" value={carrier?.carrier_number || "-"} />
          <TooltipRow label="Schritt" value={carrier?.current_step_no || "-"} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-neutral-500">{state.description}</p>
      </div>
    </article>
  );
}

function TooltipRow({ label, value }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

function stationState(station, carrier) {
  if (carrier) {
    return {
      label: "arbeitet",
      description: `Station bearbeitet gerade Carrier ${carrier.carrier_number} in Routenschritt ${carrier.current_step_no}.`,
      card: "border-amber-200 bg-amber-50",
      badge: "bg-amber-200 text-amber-900",
      dot: "animate-pulse bg-amber-500",
    };
  }
  if (station.status === "online" || station.status === "idle") {
    return {
      label: "bereit",
      description: "Station ist verbunden und wartet auf den naechsten Carrier.",
      card: "border-emerald-200 bg-emerald-50",
      badge: "bg-emerald-200 text-emerald-900",
      dot: "bg-emerald-500",
    };
  }
  if (station.status === "maintenance") {
    return {
      label: "wartung",
      description: "Station ist fuer Wartung markiert und sollte nicht produktiv genutzt werden.",
      card: "border-sky-200 bg-sky-50",
      badge: "bg-sky-200 text-sky-900",
      dot: "bg-sky-500",
    };
  }
  if (station.status === "error") {
    return {
      label: "stoerung",
      description: "Station meldet einen Fehlerstatus.",
      card: "border-red-200 bg-red-50",
      badge: "bg-red-200 text-red-900",
      dot: "animate-pulse bg-red-500",
    };
  }
  return {
    label: "offline",
    description: "Station ist aktuell nicht als verbunden gemeldet.",
    card: "border-neutral-200 bg-neutral-50",
    badge: "bg-neutral-200 text-neutral-700",
    dot: "bg-neutral-400",
  };
}
