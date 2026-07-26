import { useState, useEffect, useRef } from "react";
import StatCard from "../components/StatCard";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const INTERVAL_OPTIONS = [
  { value: "1 min", label: "1 Minute" },
  { value: "5 min", label: "5 Minuten" },
  { value: "15 min", label: "15 Minuten" },
  { value: "1 hour", label: "1 Stunde" },
];

const DATE_PRESETS = [
  { value: "1h", label: "1 Std" },
  { value: "4h", label: "4 Std" },
  { value: "8h", label: "8 Std" },
  { value: "24h", label: "24 Std" },
];

export default function Dashboard() {
  const [stats, setStats] = useState({ machines: 0, alarms: 0, health: false });
  const [machines, setMachines] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [trendsLoaded, setTrendsLoaded] = useState(false);
  const wsRef = useRef(null);
  const { token } = useAuth();

  const exportReport = (scope) => {
    openDashboardReport({ scope, stats, machines, carriers, kpis, trendsLoaded });
  };

  useEffect(() => {
    const loadMetadata = () => {
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
    };

    const initWebSocket = () => {
      if (!token || wsRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/v1/shopfloor/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "kpis" && msg.payload) setKpis(msg.payload);
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => {};
      ws.onclose = () => { wsRef.current = null; };
    };

    loadMetadata();
    initWebSocket();

    // Fallback polling for KPIs in case WebSocket fails
    const kpiTimer = setInterval(() => {
      api.get("/dashboard/kpis").then(setKpis).catch(() => {});
    }, 5000);

    return () => {
      clearInterval(kpiTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Willkommen bei der MES Shopfloor Gateway Ubersicht</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportReport("shift")}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-brand-primary hover:text-brand-primary"
            >
              Schichtbericht PDF
            </button>
            <button
              onClick={() => exportReport("day")}
              className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--color-brand-primary-dark)]"
            >
              Tagesbericht PDF
            </button>
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

        {/* Historical Trend Charts */}
        <TrendChartsSection onTrendsLoaded={setTrendsLoaded} trendsLoaded={trendsLoaded} />

        {/* Stationen + System */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <StationOverview machines={machines} carriers={carriers} />

          <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">System</h3>
            <pre className="text-xs bg-neutral-50 rounded-md px-4 py-3 font-mono text-neutral-500 leading-relaxed max-h-[160px] overflow-auto whitespace-pre-wrap">
              {JSON.stringify({ version: "MES Shopfloor Gateway v1.0", port: 3000, endpoints: ["/api/v1/machines", "/api/v1/alarms", "/api/v1/traces", "/api/v1/shopfloor"] }, null, 2)}
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

function TrendChartsSection({ onTrendsLoaded, trendsLoaded }) {
  const [activeTab, setActiveTab] = useState("telemetry");
  const [datePreset, setDatePreset] = useState("8h");
  const [interval, setInterval_] = useState("5 min");
  const [selectedMachine, setSelectedMachine_] = useState("");
  const [machines, setMachines] = useState([]);

  const [telemetryData, setTelemetryData] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [oeeData, setOeeData] = useState(null);
  const [downtimeData, setDowntimeData] = useState(null);
  const [qualityData, setQualityData] = useState(null);
  const [throughputData, setThroughputData] = useState(null);
  const [machineStatusData, setMachineStatusData] = useState(null);
  const [paretoData, setParetoData] = useState(null);

  useEffect(() => {
    api.get("/machines").then((m) => {
      if (Array.isArray(m)) {
        setMachines(m);
      }
    }).catch(() => {});
  }, []);

  const [from_, setFrom] = useState("");
  const [to, setTo] = useState("");

  const applyPreset = (preset) => {
    setDatePreset(preset);
    const end = new Date();
    const hours = {"1h":1,"4h":4,"8h":8,"24h":24}[preset] || 8;
    const start = new Date(end.getTime() - hours * 3600000);
    setFrom(start.toISOString());
    setTo(end.toISOString());
  };

  useEffect(() => {
    applyPreset("8h");
    loadAllTrends();
  }, []);

  const loadAllTrends = () => {
    const params = new URLSearchParams();
    if (from_) params.set('from', from_);
    if (to) params.set('to', to);
    params.set('interval', interval);
    if (selectedMachine) params.set('machine_id', selectedMachine);

    api.getSilent(`/dashboard/trends/all?${params.toString()}`)
      .then(data => {
        for (const t of (data?.trends || [])) {
          switch(t.series) {
            case 'telemetry': setTelemetryData(t); break;
            case 'order_progress': setOrderData(t); break;
            case 'oee': setOeeData(t); break;
            case 'downtime': setDowntimeData(t); break;
            case 'quality': setQualityData(t); break;
            case 'throughput': setThroughputData(t); break;
            case 'machine_status': setMachineStatusData(t); break;
          }
        }
        onTrendsLoaded(true);
      })
      .catch(() => {
        onTrendsLoaded(false);
      });

    api.getSilent(`/dashboard/trends/pareto?${params.toString()}`)
      .then(setParetoData)
      .catch(() => setParetoData(null));
  };

  useEffect(() => {
    loadAllTrends();
  }, [from_, to, interval, selectedMachine]);

  const tabs = [
    { key: "telemetry", label: "Sensorwerte" },
    { key: "quality", label: "Qualitaet/Yield" },
    { key: "throughput", label: "Durchsatz" },
    { key: "oee", label: "OEE Trend" },
    { key: "downtime", label: "Downtime" },
    { key: "pareto", label: "Pareto" },
    { key: "machine_status", label: "Maschinenstatus" },
  ];

  return (
    <section className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-700 whitespace-nowrap">Historische Trends</h3>

        <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.value}
              onClick={() => applyPreset(preset.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                datePreset === preset.value
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <select
          value={selectedMachine}
          onChange={e => setSelectedMachine_(e.target.value)}
          className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white text-neutral-700 focus:ring-1 focus:ring-brand-primary"
        >
          <option value="">Alle Maschinen</option>
          {machines.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <select
          value={interval}
          onChange={e => setInterval_(e.target.value)}
          className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white text-neutral-700 focus:ring-1 focus:ring-brand-primary"
        >
          {INTERVAL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <span className="ml-auto text-xs text-neutral-400">
          {from_ && to ? new Date(from_).toLocaleTimeString("de-DE") + " — " + new Date(to).toLocaleTimeString("de-DE") : ""}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-neutral-200 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart Area */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm min-h-[360px]">
        {activeTab === "telemetry" && (
          telemetryData?.points?.length > 0 ? (
            <TrendChart
              data={telemetryData}
              xLabel="Zeitstempel"
              yLabel="Wert"
              primaryColor="#6366f1"
              metricLabels={{ avg: "Schnittelle", min: "Minimum", max: "Maximum" }}
              stackedPoints
            />
          ) : (
            <EmptyChart message="Keine Sensorwerte im gewählten Zeitraum." />
          )
        )}

        {activeTab === "quality" && (
          qualityData?.points?.length > 0 ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <TrendMiniCard label="Good" value={qualityData.points.reduce((s, p) => s + p.good, 0).toLocaleString()} color="emerald" />
                <TrendMiniCard label="Bad" value={qualityData.points.reduce((s, p) => s + p.bad, 0).toLocaleString()} color="red" />
                <TrendMiniCard label="Ø Yield" value={formatRate(qualityData.points.length > 0 ? qualityData.points.reduce((s, p) => s + (p.yieldPct || 0), 0) / qualityData.points.length : 0) + "%"} color="indigo" />
              </div>
              <TrendChart
                data={qualityData}
                xLabel="Zeitstempel"
                yLabel="Anzahl"
                primaryColor="#10b981"
                showArea
                stackedPoints
                metricLabels={{ good: "Gute Teile", bad: "Schlechte Teile" }}
              />
            </>
          ) : (
            <EmptyChart message="Keine Qualitaetsdaten im gewählten Zeitraum." />
          )
        )}

        {activeTab === "throughput" && (
          throughputData?.points?.length > 0 ? (
            <TrendChart
              data={throughputData}
              xLabel="Zeitstempel"
              yLabel="Fertige Einheiten"
              primaryColor="#f59e0b"
              showArea
              stackedPoints
              metricLabels={{ completedQty: "Fertigmenge" }}
            />
          ) : (
            <EmptyChart message="Keine Durchsatzdaten im gewählten Zeitraum." />
          )
        )}

        {activeTab === "oee" && (
          oeeData?.points?.length > 0 ? (
            <>
              <div className="mb-4 flex items-center gap-6 text-xs">
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500/80" /> Verfuegbarkeit</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500/80" /> Leistung</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-500/80" /> Qualitaet</span>
              </div>
              <TrendChart
                data={oeeData}
                xLabel="Zeitstempel"
                yLabel="OEE %"
                primaryColor="#6366f1"
                stackedPoints
                metricLabels={{ availability: "Verfuegbarkeit", quality: "Qualitaet" }}
            showArea={false}
              />
            </>
          ) : (
            <EmptyChart message="Keine OEE-Daten im gewählten Zeitraum." />
          )
        )}

        {activeTab === "downtime" && (
          downtimeData?.points?.length > 0 ? (
            <TrendBarChart
              data={downtimeData}
              xLabel="Zeitstempel"
              yLabel="Minuten"
              primaryColor="#ef4444"
              showArea
              stackedPoints
              metricLabels={{ minutes: "Downtime (min)", eventCount: "Events" }}
            />
          ) : (
            <EmptyChart message="Keine Downtime-Daten im gewählten Zeitraum." />
          )
        )}

        {activeTab === "pareto" && (
          paretoData?.data?.length > 0 ? (
            <ParetoBarChart data={paretoData} />
          ) : (
            <EmptyChart message="Keine Pareto-Daten im gewaehlten Zeitraum." />
          )
        )}

        {activeTab === "machine_status" && (
          machineStatusData?.points?.length > 0 ? (
            <>
              <div className="mb-4 flex items-center gap-6 text-xs">
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500/80" /> Online</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-lime-500/80" /> Bereit</span>
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500/80" /> Stoerung</span>
              </div>
              <TrendChart
                data={machineStatusData}
                xLabel="Zeitstempel"
                yLabel="Anzahl Maschinen"
                primaryColor="#6366f1"
                stackedPoints
                metricLabels={{ online: "Online", idle: "Bereit", error: "Stoerung", offline: "Offline", maintenance: "Wartung" }}
          showArea={false}
              />
            </>
          ) : (
            <EmptyChart message="Keine Maschinenstatus-Daten im gewählten Zeitraum." />
          )
        )}
      </div>
    </section>
  );
}

function TrendChart({ data, xLabel, yLabel, primaryColor, showArea = true, stackedPoints = false, metricLabels }) {
  if (!data?.points?.length) return null;

  const labels = data.points.map(p => new Date(p.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));

  const datasets = stackedPoints && metricLabels
    ? Object.keys(metricLabels).map((key, i) => ({
        label: metricLabels[key],
        data: data.points.map(p => p[key] ?? 0),
        borderColor: ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#0ea5e9'][i % 5],
        backgroundColor: showArea ? ['#6366f122', '#ef444422', '#10b98122', '#f59e0b22', '#0ea5e922'][i % 5] : undefined,
        fill: showArea && i === 0 ? true : false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
      }))
    : [{
        label: metricLabels ? Object.values(metricLabels)[0] || "Wert" : yLabel,
        data: data.points.map(p => p.avg ?? p.completedQty ?? p.good ?? p.quantity ?? 0),
        borderColor: primaryColor,
        backgroundColor: showArea ? primaryColor + "33" : undefined,
        fill: showArea,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
      }];

  return (
    <div className="relative h-[320px] max-h-[320px] w-full overflow-hidden">
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 100,
          animation: { duration: 600 },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: stackedPoints, position: "top", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
            tooltip: {
              backgroundColor: "#1e293b",
              titleFont: { size: 12 },
              bodyFont: { size: 11 },
              padding: 10,
              cornerRadius: 8,
              displayColors: true,
              boxWidth: 8,
              boxHeight: 8,
              callbacks: {
                title: (items) => items[0]?.label || "",
                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) ?? ctx.parsed.y}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, color: "#94a3b8", maxTicksLimit: 12, maxRotation: 0 },
            },
            y: {
              grid: { color: "#f1f5f9" },
              ticks: { font: { size: 10 }, color: "#94a3b8" },
              beginAtZero: true,
            },
          },
        }}
      />
    </div>
  );
}

function TrendBarChart({ data, xLabel, yLabel, primaryColor, showArea = true, stackedPoints = false, metricLabels }) {
  if (!data?.points?.length) return null;

  const labels = data.points.map(p => new Date(p.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));

  const datasets = [
    {
      label: metricLabels?.minutes || "Minuten",
      data: data.points.map(p => p.minutes ?? 0),
      backgroundColor: primaryColor + "66",
      borderColor: primaryColor,
      borderWidth: 1,
      borderRadius: 2,
    },
  ];

  if (data.points[0]?.eventCount !== undefined) {
    datasets.push({
      label: metricLabels?.eventCount || "Events",
      data: data.points.map(p => p.eventCount ?? 0),
      backgroundColor: "#6366f144",
      borderColor: "#6366f1",
      borderWidth: 1,
      borderRadius: 2,
    });
  }

  return (
    <div className="relative h-[320px] max-h-[320px] w-full overflow-hidden">
      <Bar
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 100,
          animation: { duration: 600 },
          plugins: {
            legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
            tooltip: {
              backgroundColor: "#1e293b", titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, displayColors: true },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#94a3b8", maxTicksLimit: 12, maxRotation: 0 } },
            y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 }, color: "#94a3b8" }, beginAtZero: true },
          },
        }}
      />
    </div>
  );
}

function ParetoBarChart({ data }) {
  const rows = [...(data?.data || [])]
    .sort((a, b) => (b.downtime_minutes || 0) - (a.downtime_minutes || 0))
    .slice(0, 10);
  const total = rows.reduce((sum, row) => sum + (row.downtime_minutes || 0), 0);
  let cumulative = 0;
  const cumulativePct = rows.map((row) => {
    cumulative += row.downtime_minutes || 0;
    return total > 0 ? Math.round((cumulative / total) * 100) : 0;
  });

  return (
    <div className="relative h-[320px] max-h-[320px] w-full overflow-hidden">
      <Bar
        data={{
          labels: rows.map((row) => row.machine_name || "Unbekannt"),
          datasets: [
            {
              label: "Downtime (min)",
              data: rows.map((row) => row.downtime_minutes || 0),
              backgroundColor: "#ef444466",
              borderColor: "#ef4444",
              borderWidth: 1,
              borderRadius: 3,
              yAxisID: "y",
            },
            {
              label: "Kumuliert %",
              data: cumulativePct,
              backgroundColor: "#6366f166",
              borderColor: "#6366f1",
              borderWidth: 1,
              borderRadius: 3,
              yAxisID: "y1",
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 100,
          animation: { duration: 600 },
          plugins: {
            legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
            tooltip: { backgroundColor: "#1e293b", titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#94a3b8", maxRotation: 0 } },
            y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 }, color: "#94a3b8" }, beginAtZero: true, position: "left" },
            y1: { grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: "#6366f1", callback: (value) => `${value}%` }, beginAtZero: true, max: 100, position: "right" },
          },
        }}
      />
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="flex items-center justify-center h-[320px]">
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
}

function TrendMiniCard({ label, value, color }) {
  const colors = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    red: "bg-red-50 border-red-200 text-red-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color] || "bg-neutral-50 border-neutral-200 text-neutral-700"}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-60">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
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

function openDashboardReport({ scope, stats, machines, carriers, kpis, trendsLoaded }) {
  const title = scope === "day" ? "MES Tagesbericht" : "MES Schichtbericht";
  const generatedAt = new Date();
  const status = kpis?.machines?.status || {};
  const stations = [...machines]
    .filter((machine) => machine.resource_id)
    .sort((a, b) => a.resource_id - b.resource_id);
  const stationRows = stations.map((station) => {
    const carrier = carriers.find((entry) => entry.current_resource_id === station.resource_id);
    return `<tr><td>${escapeHtml(station.name)}</td><td>${station.resource_id || "-"}</td><td>${escapeHtml(station.status || "-")}</td><td>${carrier ? escapeHtml(String(carrier.carrier_number)) : "-"}</td></tr>`;
  }).join("") || `<tr><td colspan="4">Keine Stationen gefunden.</td></tr>`;

  const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!reportWindow) return;
  reportWindow.document.write(`<!doctype html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          h2 { border-bottom: 1px solid #e5e7eb; font-size: 15px; margin-top: 28px; padding-bottom: 8px; }
          .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
          .grid { display: grid; gap: 12px; grid-template-columns: repeat(4, 1fr); }
          .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
          .label { color: #6b7280; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
          .value { font-size: 22px; font-weight: 700; margin-top: 6px; }
          table { border-collapse: collapse; font-size: 12px; width: 100%; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
          th { background: #f9fafb; color: #374151; }
          @media print { button { display: none; } body { margin: 18mm; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="float:right;padding:8px 12px">Als PDF speichern</button>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">Erstellt: ${generatedAt.toLocaleString("de-DE")} | Zeitraum: ${escapeHtml(formatRange(kpis?.range))}</div>

        <div class="grid">
          ${reportCard("OEE", formatPercent(kpis?.oee?.total))}
          ${reportCard("Availability", formatPercent(kpis?.oee?.availability))}
          ${reportCard("Performance", formatPercent(kpis?.oee?.performance))}
          ${reportCard("Quality/Yield", formatPercent(kpis?.oee?.quality))}
          ${reportCard("Durchsatz", `${formatRate(kpis?.throughput?.unitsPerHour)} /h`)}
          ${reportCard("Fertigmenge", kpis?.throughput?.completedQuantity ?? 0)}
          ${reportCard("Aktive Alarme", stats.alarms)}
          ${reportCard("Gateway", stats.health ? "Online" : "Inaktiv")}
        </div>

        <h2>Maschinenstatus</h2>
        <div class="grid">
          ${reportCard("Online", status.online || 0)}
          ${reportCard("Bereit", status.idle || 0)}
          ${reportCard("Stoerung", status.error || 0)}
          ${reportCard("Offline", status.offline || 0)}
        </div>

        <h2>Stationen Live</h2>
        <table><thead><tr><th>Station</th><th>Resource</th><th>Status</th><th>Carrier</th></tr></thead><tbody>${stationRows}</tbody></table>

        <h2>Systemhinweise</h2>
        <table><tbody>
          <tr><th>Trenddaten</th><td>${trendsLoaded ? "geladen" : "nicht geladen / keine Daten"}</td></tr>
          <tr><th>Downtime</th><td>${kpis?.machines?.downtimeMinutes ?? 0} min (${kpis?.machines?.downtimeEvents ?? 0} Events)</td></tr>
          <tr><th>Aktive Auftraege</th><td>${kpis?.orders?.activeOrders ?? 0}</td></tr>
        </tbody></table>
        <script>setTimeout(() => window.print(), 300)</script>
      </body>
    </html>`);
  reportWindow.document.close();
}

function reportCard(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value ?? "-"))}</div></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
