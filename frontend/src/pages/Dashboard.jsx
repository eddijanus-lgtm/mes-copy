import { useState, useEffect, useRef } from "react";
import StatCard from "../components/StatCard";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import PageInfo from "../components/PageInfo.jsx";
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
  { value: "1 min", labelKey: "dashboard.interval1" },
  { value: "5 min", labelKey: "dashboard.interval5" },
  { value: "15 min", labelKey: "dashboard.interval15" },
  { value: "1 hour", labelKey: "dashboard.interval1h" },
];

const DATE_PRESETS = [
  { value: "1h", labelKey: "dashboard.preset1h" },
  { value: "4h", labelKey: "dashboard.preset4h" },
  { value: "8h", labelKey: "dashboard.preset8h" },
  { value: "24h", labelKey: "dashboard.preset24h" },
];

const intervalLabels = {
  "dashboard.interval1": "1 Minute",
  "dashboard.interval5": "5 Minuten",
  "dashboard.interval15": "15 Minuten",
  "dashboard.interval1h": "1 Stunde",
};

const presetLabels = {
  "dashboard.preset1h": "1 Std",
  "dashboard.preset4h": "4 Std",
  "dashboard.preset8h": "8 Std",
  "dashboard.preset24h": "24 Std",
};

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ machines: 0, alarms: 0, health: false });
  const [machines, setMachines] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [trendsLoaded, setTrendsLoaded] = useState(false);
  const wsRef = useRef(null);
  const [inspection, setInspection] = useState(null);
  const [stationSamples, setStationSamples] = useState({});
  const { token } = useAuth();

  const exportReport = (scope) => {
    openDashboardReport({ scope, stats, machines, carriers, kpis, trendsLoaded, t });
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
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/shopfloor/ws`);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "kpis" && msg.payload) setKpis(msg.payload);
          if (msg.type === "shopfloor.telemetry" && msg.payload?.kind === "station.snapshot") {
            const sample = msg.payload;
            if (sample.resourceId === 3) setInspection(sample.qualityCounts ?? null);
            if (sample.iCarrierID > 0 && [sample.iPar2, sample.iPar3, sample.iPar4].every(Number.isFinite)) {
              setStationSamples((previous) => {
                const latest = previous[sample.resourceId];
                if (latest?.ldtTimeStamp === sample.ldtTimeStamp && latest?.iCarrierID === sample.iCarrierID) return previous;
                return { ...previous, [sample.resourceId]: sample };
              });
            }
          }
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => { if (wsRef.current === ws) wsRef.current = null; };
    };

    loadMetadata();
    initWebSocket();

    const kpiTimer = setInterval(() => {
      api.get("/dashboard/kpis").then(setKpis).catch(() => {});
    }, 5000);

    return () => {
      clearInterval(kpiTimer);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 inline-flex items-center">{t("dashboard.title")}<PageInfo page="dashboard" /></h1>
            <p className="text-sm text-neutral-500 mt-0.5">{t("dashboard.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => exportReport("shift")} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-brand-primary hover:text-brand-primary">
              {t("dashboard.shiftReport")}
            </button>
            <button onClick={() => exportReport("day")} className="rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--color-brand-primary-dark)]">
              {t("dashboard.dayReport")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label={t("dashboard.connectedStations")} value={String(stats.machines)} icon="⚙️" />
          <StatCard label={t("dashboard.activeAlarms")} value={String(stats.alarms)} icon="🔔" />
          <StatCard label={t("dashboard.shopfloorGateway")} value={stats.health ? t("dashboard.online") : t("dashboard.inactive")} icon="▥" />
          <StatCard label={t("dashboard.oee")} value={formatPercent(kpis?.oee?.total)} icon="%" />
          <StatCard label={t("dashboard.throughput")} value={formatRate(kpis?.throughput?.unitsPerHour)} icon="/h" />
          <StatCard label={t("dashboard.yield")} value={formatPercent(kpis?.yield)} icon="✓" />
        </div>

        <OperationsIntelligence kpis={kpis} t={t} />
        <TrendChartsSection machines={machines} stationSamples={stationSamples} inspection={inspection} onTrendsLoaded={setTrendsLoaded} t={t} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StationOverview machines={machines} carriers={carriers} t={t} />
          <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">{t("dashboard.system")}</h3>
            <pre className="text-xs bg-neutral-50 rounded-md px-4 py-3 font-mono text-neutral-500 leading-relaxed max-h-[160px] overflow-auto whitespace-pre-wrap">
              {JSON.stringify({ version: "MES Shopfloor Gateway v1.0", port: 3000, endpoints: ["/api/machines", "/api/alarms", "/api/traces", "/api/shopfloor"] }, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}

function OperationsIntelligence({ kpis, t }) {
  const oee = kpis?.oee || {};
  const statuses = kpis?.machines?.status || {};
  const statusRows = [
    ["online", "dashboard.online", "bg-emerald-500"],
    ["idle", "dashboard.idle", "bg-lime-500"],
    ["error", "dashboard.error", "bg-red-500"],
    ["maintenance", "dashboard.maintenance", "bg-sky-500"],
    ["offline", "dashboard.offline", "bg-neutral-400"],
  ];

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700">{t("dashboard.oeeLiveScore")}</h3>
            <p className="mt-1 text-xs text-neutral-400">{t("dashboard.oeeSubtitle")}</p>
          </div>
          <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
            {formatRange(kpis?.range)}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <OeeGauge label={t("dashboard.total")} value={oee.total} accent="from-brand-primary to-indigo-500" />
          <OeeGauge label={t("dashboard.availability")} value={oee.availability} accent="from-emerald-500 to-lime-500" />
          <OeeGauge label={t("dashboard.performance")} value={oee.performance} accent="from-amber-500 to-orange-500" />
          <OeeGauge label={t("dashboard.quality")} value={oee.quality} accent="from-sky-500 to-cyan-500" />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
        <h3 className="text-sm font-semibold text-neutral-700">{t("dashboard.operatingStatus")}</h3>
        <div className="mt-4 space-y-3">
          {statusRows.map(([key, labelKey, color]) => {
            const count = statuses[key] || 0;
            const total = kpis?.machines?.total || 0;
            const width = total > 0 ? Math.round((count / total) * 100) : 0;
            return <StatusMeter key={key} label={t(labelKey)} count={count} width={width} color={color} />;
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
          <MiniMetric label={t("dashboard.downtime")} value={`${kpis?.machines?.downtimeMinutes ?? 0} ${t("dashboard.reportMinute")}`} />
          <MiniMetric label={t("dashboard.events")} value={String(kpis?.machines?.downtimeEvents ?? 0)} />
          <MiniMetric label={t("dashboard.completedQty")} value={String(kpis?.throughput?.completedQuantity ?? 0)} />
          <MiniMetric label={t("dashboard.activeOrders")} value={String(kpis?.orders?.activeOrders ?? 0)} />
        </div>
      </div>
    </section>
  );
}

function TrendChartsSection({ machines, stationSamples, inspection, onTrendsLoaded, t }) {
  const [activeTab, setActiveTab] = useState("telemetry");
  const [datePreset, setDatePreset] = useState("8h");
  const [interval, setInterval_] = useState("5 min");
  const [selectedMachine, setSelectedMachine_] = useState("");
  const [trends, setTrends] = useState({});
  const [paretoData, setParetoData] = useState(null);
  const [range, setRange] = useState(null);

  useEffect(() => {
    let disposed = false;
    let timer;
    async function loadTrends() {
      const end = new Date();
      const start = new Date(end.getTime() - Number.parseInt(datePreset, 10) * 3600000);
      const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString(), interval });
      if (selectedMachine) params.set("machine_id", selectedMachine);

      const [trendResult, paretoResult] = await Promise.allSettled([
        api.getSilent(`/dashboard/trends/all?${params}`),
        api.getSilent(`/dashboard/trends/pareto?${params}`),
      ]);
      if (disposed) return;

      const series = trendResult.status === "fulfilled" ? trendResult.value?.trends ?? [] : [];
      setTrends(Object.fromEntries(series.map((trend) => [trend.series, trend])));
      onTrendsLoaded(series.length > 0);
      setParetoData(paretoResult.status === "fulfilled" ? paretoResult.value : null);
      setRange({ start, end });
      timer = setTimeout(loadTrends, 10000);
    }

    loadTrends();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [datePreset, interval, selectedMachine, onTrendsLoaded]);

  const {
    telemetry: telemetryData, oee: oeeData, downtime: downtimeData,
    quality: qualityData, throughput: throughputData, machine_status: machineStatusData,
  } = trends;
  const qualityTotals = qualityData?.points.reduce(
    (total, point) => ({ good: total.good + point.good, bad: total.bad + point.bad }),
    { good: 0, bad: 0 },
  );
  const liveInspection = selectedMachine && !machines.some((machine) => machine.id === selectedMachine && machine.resource_id === 3) ? null : inspection;
  const sampleStations = machines.filter((machine) =>
    (!selectedMachine || selectedMachine === machine.id) && stationSamples[machine.resource_id],
  );

  const tabs = [
    { key: "telemetry", labelKey: "dashboard.telemetry" },
    { key: "quality", labelKey: "dashboard.qualityYield" },
    { key: "throughput", labelKey: "dashboard.throughput" },
    { key: "oee", labelKey: "dashboard.oeeTrend" },
    { key: "downtime", labelKey: "dashboard.downtimeLabel" },
    { key: "pareto", labelKey: "dashboard.pareto" },
    { key: "machine_status", labelKey: "dashboard.machineStatus" },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-700 whitespace-nowrap">{t("dashboard.historicalTrends")}</h3>
        <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
          {DATE_PRESETS.map(preset => (
            <button key={preset.value} onClick={() => setDatePreset(preset.value)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${datePreset === preset.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
              {presetLabels[preset.labelKey] || preset.labelKey}
            </button>
          ))}
        </div>
        {["telemetry", "quality", "machine_status"].includes(activeTab) && <select value={selectedMachine} onChange={e => setSelectedMachine_(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white text-neutral-700 focus:ring-1 focus:ring-brand-primary">
          <option value="">{t("dashboard.allMachines")}</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>}
        <select value={interval} onChange={e => setInterval_(e.target.value)} className="text-xs border border-neutral-200 rounded-lg px-3 py-1.5 bg-white text-neutral-700 focus:ring-1 focus:ring-brand-primary">
          {INTERVAL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{intervalLabels[opt.labelKey] || opt.labelKey}</option>)}
        </select>
        <span className="ml-auto text-xs text-neutral-400">
          {range ? range.start.toLocaleTimeString() + " — " + range.end.toLocaleTimeString() : ""}
        </span>
      </div>

      <div className="flex gap-1 bg-white rounded-xl border border-neutral-200 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 text-xs font-medium rounded-lg transition whitespace-nowrap ${activeTab === tab.key ? 'bg-brand-primary/10 text-brand-primary' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'}`}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm min-h-[360px]">
        {activeTab === "telemetry" && sampleStations.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-semibold text-neutral-700">{t("dashboard.latestStationData")}</h4>
            <ul className="space-y-2 text-sm text-neutral-700">
              {sampleStations.map((machine) => {
                const sample = stationSamples[machine.resource_id];
                return (
                  <li key={machine.id} className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-neutral-50 p-3">
                    <strong>{machine.name}</strong>
                    <span>{t("shopfloor.redBalls")} {sample.iPar2}</span>
                    <span>{t("shopfloor.greenBalls")} {sample.iPar3}</span>
                    <span>{t("shopfloor.blueBalls")} {sample.iPar4}</span>
                    {sample.ldtTimeStamp && <span>{new Date(sample.ldtTimeStamp).toLocaleString()}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {activeTab === "telemetry" && (telemetryData?.points?.length > 0 ? (
          <TrendChart data={telemetryData} xLabel={t("dashboard.from")} yLabel={t("dashboard.telemetry")} primaryColor="#a64b08" metricLabels={{ avg: t("dashboard.telemetry") + " Ø", min: t("dashboard.interval") + " Min", max: t("dashboard.interval") + " Max" }} stackedPoints />
        ) : <EmptyChart message={t("dashboard.noTelemetry")} />)}

        {activeTab === "quality" && liveInspection && (
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-semibold text-neutral-700">{t("dashboard.inspectionCounters")}</h4>
            <div className="grid grid-cols-3 gap-4">
              <TrendMiniCard label={t("dashboard.good")} value={liveInspection.good} color="emerald" />
              <TrendMiniCard label={t("dashboard.bad")} value={liveInspection.bad} color="red" />
              <TrendMiniCard label={t("dashboard.qualityYield")} value={liveInspection.good + liveInspection.bad > 0
                ? formatPercent(Math.round(1000 * liveInspection.good / (liveInspection.good + liveInspection.bad)) / 10)
                : "–"} color="indigo" />
            </div>
          </div>
        )}
        {activeTab === "quality" && (qualityData?.points?.length > 0 ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <TrendMiniCard label={t("dashboard.good")} value={qualityTotals.good.toLocaleString()} color="emerald" />
              <TrendMiniCard label={t("dashboard.bad")} value={qualityTotals.bad.toLocaleString()} color="red" />
              <TrendMiniCard label={t("dashboard.avgYield")} value={formatPercent(Math.round(1000 * qualityTotals.good / (qualityTotals.good + qualityTotals.bad)) / 10)} color="indigo" />
            </div>
            <TrendChart data={qualityData} xLabel={t("dashboard.from")} yLabel={t("dashboard.quality")} primaryColor="#448361" showArea stackedPoints metricLabels={{ good: t("dashboard.good"), bad: t("dashboard.bad") }} />
          </>
        ) : <EmptyChart message={t("dashboard.noQuality")} />)}

        {activeTab === "throughput" && (throughputData?.points?.length > 0 ? (
          <TrendChart data={throughputData} xLabel={t("dashboard.from")} yLabel={t("dashboard.completedQty")} primaryColor="#bd8354" showArea stackedPoints metricLabels={{ completedQty: t("dashboard.completedQty") }} />
        ) : <EmptyChart message={t("dashboard.noThroughput")} />)}

        {activeTab === "oee" && (oeeData?.points?.length > 0 ? (
          <>
            <div className="mb-4 flex items-center gap-6 text-xs">
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500/80" /> {t("dashboard.availability")}</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500/80" /> {t("dashboard.performance")}</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-500/80" /> {t("dashboard.quality")}</span>
            </div>
            <TrendChart data={oeeData} xLabel={t("dashboard.from")} yLabel="OEE %" primaryColor="#a64b08" stackedPoints metricLabels={{ availability: t("dashboard.availability"), performance: t("dashboard.performance"), quality: t("dashboard.quality") }} showArea={false} valueScale={100} />
          </>
        ) : <EmptyChart message={t("dashboard.noOee")} />)}

        {activeTab === "downtime" && (downtimeData?.points?.length > 0 ? (
          <TrendBarChart data={downtimeData} xLabel={t("dashboard.from")} yLabel={t("dashboard.minutes")} primaryColor="#b64d4d" showArea stackedPoints metricLabels={{ minutes: `${t("dashboard.downtime")} (${t("dashboard.reportMinute")})`, eventCount: t("dashboard.events") }} />
        ) : <EmptyChart message={t("dashboard.noDowntime")} />)}

        {activeTab === "pareto" && (paretoData?.data?.length > 0 ? (
          <ParetoBarChart data={paretoData} t={t} />
        ) : <EmptyChart message={t("dashboard.noPareto")} />)}

        {activeTab === "machine_status" && (machineStatusData?.points?.length > 0 ? (
          <>
            <div className="mb-4 flex items-center gap-6 text-xs">
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500/80" /> {t("dashboard.online")}</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-lime-500/80" /> {t("dashboard.idle")}</span>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500/80" /> {t("dashboard.error")}</span>
            </div>
            <TrendChart data={machineStatusData} xLabel={t("dashboard.from")} yLabel={t("dashboard.stationCount")} primaryColor="#a64b08" stackedPoints metricLabels={{ online: t("dashboard.online"), idle: t("dashboard.idle"), error: t("dashboard.error"), offline: t("dashboard.offline"), maintenance: t("dashboard.maintenance") }} showArea={false} />
          </>
        ) : <EmptyChart message={t("dashboard.noMachineStatus")} />)}
      </div>
    </section>
  );
}

function TrendChart({ data, xLabel, yLabel, primaryColor, showArea = true, stackedPoints = false, metricLabels, valueScale = 1 }) {
  if (!data?.points?.length) return null;
  const labels = data.points.map(p => new Date(p.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));

  const datasets = stackedPoints && metricLabels
    ? Object.keys(metricLabels).map((key, i) => ({
        label: metricLabels[key],
        data: data.points.map(p => p[key] == null ? null : p[key] * valueScale),
        borderColor: ['#a64b08', '#b64d4d', '#448361', '#bd8354', '#767178'][i % 5],
        backgroundColor: showArea ? ['#a64b0822', '#b64d4d22', '#44836122', '#bd835422', '#76717822'][i % 5] : undefined,
        fill: showArea && i === 0 ? true : false,
        tension: 0.3, pointRadius: data.points.length <= 12 ? 3 : 0, pointHoverRadius: 4,
      }))
    : [{
        label: metricLabels ? Object.values(metricLabels)[0] || yLabel : yLabel,
        data: data.points.map(p => p.avg ?? p.completedQty ?? p.good ?? p.quantity ?? 0),
        borderColor: primaryColor,
        backgroundColor: showArea ? primaryColor + "33" : undefined,
        fill: showArea, tension: 0.3, pointRadius: data.points.length <= 12 ? 3 : 0, pointHoverRadius: 4,
      }];

  return (
    <div className="relative h-[320px] max-h-[320px] w-full overflow-hidden">
      <Line data={{ labels, datasets }} options={{
        responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: { duration: 600 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: stackedPoints, position: "top", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
          tooltip: { backgroundColor: "#27272a", titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, displayColors: true, boxWidth: 8, boxHeight: 8,
            callbacks: { title: (items) => items[0]?.label || "", label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) ?? ctx.parsed.y}` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#85858c", maxTicksLimit: 12, maxRotation: 0 } },
          y: { grid: { color: "#c4c4ca55" }, ticks: { font: { size: 10 }, color: "#85858c" }, beginAtZero: true },
        },
      }} />
    </div>
  );
}

function TrendBarChart({ data, xLabel, yLabel, primaryColor, showArea = true, stackedPoints = false, metricLabels }) {
  if (!data?.points?.length) return null;
  const labels = data.points.map(p => new Date(p.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));

  const datasets = [{
    label: metricLabels?.minutes || yLabel,
    data: data.points.map(p => p.minutes ?? 0),
    backgroundColor: primaryColor + "66", borderColor: primaryColor, borderWidth: 1, borderRadius: 2,
  }];

  if (data.points[0]?.eventCount !== undefined) {
    datasets.push({
      label: metricLabels?.eventCount || "Events",
      data: data.points.map(p => p.eventCount ?? 0),
      backgroundColor: "#a64b0844", borderColor: "#a64b08", borderWidth: 1, borderRadius: 2,
    });
  }

  return (
    <div className="relative h-[320px] max-h-[320px] w-full overflow-hidden">
      <Bar data={{ labels, datasets }} options={{
        responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: { duration: 600 },
        plugins: {
          legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
          tooltip: { backgroundColor: "#27272a", titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8, displayColors: true },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#85858c", maxTicksLimit: 12, maxRotation: 0 } },
          y: { grid: { color: "#c4c4ca55" }, ticks: { font: { size: 10 }, color: "#85858c" }, beginAtZero: true },
        },
      }} />
    </div>
  );
}

function ParetoBarChart({ data, t }) {
  const rows = [...(data?.data || [])].sort((a, b) => (b.downtime_minutes || 0) - (a.downtime_minutes || 0)).slice(0, 10);
  const total = rows.reduce((sum, row) => sum + (row.downtime_minutes || 0), 0);
  let cumulative = 0;
  const cumulativePct = rows.map((row) => { cumulative += row.downtime_minutes || 0; return total > 0 ? Math.round((cumulative / total) * 100) : 0; });

  return (
    <div className="relative h-[320px] max-h-[320px] w-full overflow-hidden">
      <Bar data={{
        labels: rows.map((row) => row.machine_name || t("common.unknown")),
        datasets: [
          { label: `${t("dashboard.downtime")} (${t("dashboard.reportMinute")})`, data: rows.map((row) => row.downtime_minutes || 0), backgroundColor: "#b64d4d66", borderColor: "#b64d4d", borderWidth: 1, borderRadius: 3, yAxisID: "y" },
          { label: t("dashboard.pareto"), data: cumulativePct, backgroundColor: "#a64b0866", borderColor: "#a64b08", borderWidth: 1, borderRadius: 3, yAxisID: "y1" },
        ],
      }} options={{
        responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: { duration: 600 },
        plugins: {
          legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
          tooltip: { backgroundColor: "#27272a", titleFont: { size: 12 }, bodyFont: { size: 11 }, padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#85858c", maxRotation: 0 } },
          y: { grid: { color: "#c4c4ca55" }, ticks: { font: { size: 10 }, color: "#85858c" }, beginAtZero: true, position: "left" },
          y1: { grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, color: "#a64b08", callback: (value) => `${value}%` }, beginAtZero: true, max: 100, position: "right" },
        },
      }} />
    </div>
  );
}

function EmptyChart({ message }) {
  return <div className="flex items-center justify-center h-[320px]"><p className="text-sm text-neutral-400">{message}</p></div>;
}

function TrendMiniCard({ label, value, color }) {
  const colors = { emerald: "bg-emerald-50 border-emerald-200 text-emerald-700", red: "bg-red-50 border-red-200 text-red-700", indigo: "bg-indigo-50 border-indigo-200 text-indigo-700" };
  return <div className={`rounded-xl border px-4 py-3 ${colors[color] || "bg-neutral-50 border-neutral-200 text-neutral-700"}`}><p className="text-[10px] uppercase tracking-wider opacity-60">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
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
  return <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2"><p className="uppercase tracking-wider text-neutral-400">{label}</p><p className="mt-1 font-bold text-neutral-900">{value}</p></div>;
}

function formatPercent(value) { return `${Number.isFinite(value) ? value : 0}%`; }
function formatRate(value) { return `${Number.isFinite(value) ? value : 0}`; }
function formatRange(range) {
  if (!range?.from || !range?.to) return "8h Fenster";
  return `${new Date(range.from).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} - ${new Date(range.to).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

function openDashboardReport({ scope, stats, machines, carriers, kpis, trendsLoaded, t }) {
  const title = scope === "day" ? t("dashboard.reportTitleDay") : t("dashboard.reportTitleShift");
  const generatedAt = new Date();
  const status = kpis?.machines?.status || {};
  const stations = [...machines].filter((machine) => machine.resource_id).sort((a, b) => a.resource_id - b.resource_id);
  const stationRows = stations.map((station) => {
    const carrier = carriers.find((entry) => entry.current_resource_id === station.resource_id);
    return `<tr><td>${escapeHtml(station.name)}</td><td>${station.resource_id || "-"}</td><td>${escapeHtml(station.status || "-")}</td><td>${carrier ? escapeHtml(String(carrier.carrier_number)) : "-"}</td></tr>`;
  }).join("") || `<tr><td colspan="4">${t("dashboard.reportNoStations")}</td></tr>`;

  const html = `<!doctype html>
    <html lang="de">
      <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
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
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${t("dashboard.reportGenerated")}: ${generatedAt.toLocaleString("de-DE")} | ${t("dashboard.reportPeriod")}: ${escapeHtml(formatRange(kpis?.range))}</div>
        <div class="grid">
          ${reportCard("OEE", formatPercent(kpis?.oee?.total))}
          ${reportCard(t("dashboard.availability"), formatPercent(kpis?.oee?.availability))}
          ${reportCard(t("dashboard.performance"), formatPercent(kpis?.oee?.performance))}
          ${reportCard(t("dashboard.qualityYield"), formatPercent(kpis?.oee?.quality))}
          ${reportCard(t("dashboard.throughput"), `${formatRate(kpis?.throughput?.unitsPerHour)} ${t("dashboard.unitsPerHour")}`)}
          ${reportCard(t("dashboard.completedQty"), kpis?.throughput?.completedQuantity ?? 0)}
          ${reportCard(t("dashboard.activeAlarms"), stats.alarms)}
          ${reportCard(t("dashboard.shopfloorGateway"), stats.health ? t("dashboard.online") : t("dashboard.inactive"))}
        </div>
        <h2>${t("dashboard.reportMachineStatus")}</h2>
        <div class="grid">
          ${reportCard(t("dashboard.online"), status.online || 0)}
          ${reportCard(t("dashboard.idle"), status.idle || 0)}
          ${reportCard(t("dashboard.error"), status.error || 0)}
          ${reportCard(t("dashboard.offline"), status.offline || 0)}
        </div>
        <h2>${t("dashboard.reportStationsLive")}</h2>
        <table><thead><tr><th>${t("dashboard.reportColumnStation")}</th><th>${t("dashboard.reportColumnResource")}</th><th>${t("dashboard.reportColumnStatus")}</th><th>${t("dashboard.reportColumnCarrier")}</th></tr></thead><tbody>${stationRows}</tbody></table>
        <h2>${t("dashboard.reportSystemNotes")}</h2>
        <table><tbody>
          <tr><th>${t("dashboard.reportTrendData")}</th><td>${trendsLoaded ? t("dashboard.reportLoaded") : t("dashboard.reportNotLoaded")}</td></tr>
          <tr><th>${t("dashboard.reportDowntime")}</th><td>${kpis?.machines?.downtimeMinutes ?? 0} ${t("dashboard.reportMinute")} (${kpis?.machines?.downtimeEvents ?? 0} ${t("dashboard.events")})</td></tr>
          <tr><th>${t("dashboard.reportActiveOrders")}</th><td>${kpis?.orders?.activeOrders ?? 0}</td></tr>
        </tbody></table>
      </body>
    </html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}-${generatedAt.toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function reportCard(label, value) { return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value ?? "-"))}</div></div>`; }
function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

function StationOverview({ machines, carriers, t }) {
  const stations = [...machines].filter((machine) => machine.resource_id).sort((a, b) => a.resource_id - b.resource_id);
  return (
    <section className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-700">{t("dashboard.stationsLive")}</h3>
          <p className="mt-1 text-xs text-neutral-400">{t("dashboard.hoverDetails")}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">{stations.length} {t("dashboard.stationCount")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {stations.length === 0 && <p className="text-sm text-neutral-400">{t("dashboard.noStations")}</p>}
        {stations.map((station) => {
          const carrier = carriers.find((entry) => entry.current_resource_id === station.resource_id);
          const state = stationState(station, carrier, t);
          return <StationCard key={station.id} station={station} carrier={carrier} state={state} t={t} />;
        })}
      </div>
    </section>
  );
}

function StationCard({ station, carrier, state, t }) {
  return (
    <article className={`group relative overflow-visible rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-hover ${state.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-70">{t("dashboard.resourceId")} {station.resource_id}</p>
          <h4 className="mt-1 text-sm font-bold text-neutral-900">{station.name}</h4>
        </div>
        <span className={`h-3 w-3 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.75)] ${state.dot}`} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${state.badge}`}>{state.label}</span>
        <span className="text-xs font-medium text-neutral-500">{carrier ? `Carrier ${carrier.carrier_number}` : t("dashboard.noCarrier")}</span>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-3 hidden w-72 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-2xl ring-1 ring-black/5 group-hover:block">
        <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-neutral-200 bg-white" />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand-primary">{t("dashboard.stationDetails")}</p>
        <h5 className="mt-1 font-semibold text-neutral-900">{station.name}</h5>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <TooltipRow label={t("dashboard.tooltipStatus")} value={state.label} />
          <TooltipRow label={t("dashboard.resourceId")} value={station.resource_id} />
          <TooltipRow label={t("dashboard.tooltipType")} value={station.type || "-"} />
          <TooltipRow label={t("dashboard.tooltipLocation")} value={station.location || "-"} />
          <TooltipRow label={t("dashboard.tooltipCarrier")} value={carrier?.carrier_number || "-"} />
          <TooltipRow label={t("dashboard.tooltipStep")} value={carrier?.current_step_no || "-"} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-neutral-500">{state.description}</p>
      </div>
    </article>
  );
}

function TooltipRow({ label, value }) {
  return <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-2.5 py-2"><dt className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</dt><dd className="mt-0.5 font-semibold text-neutral-900">{value}</dd></div>;
}

function stationState(station, carrier, t) {
  if (carrier) return { label: t("dashboard.working"), description: `${t("dashboard.workingDesc")} ${carrier.carrier_number} ${t("shopfloor.step")?.toLowerCase() || "in step"} ${carrier.current_step_no}.`, card: "border-amber-200 bg-amber-50", badge: "bg-amber-200 text-amber-900", dot: "animate-pulse bg-amber-500" };
  if (station.status === "online" || station.status === "idle") return { label: t("dashboard.ready"), description: t("dashboard.readyDesc"), card: "border-emerald-200 bg-emerald-50", badge: "bg-emerald-200 text-emerald-900", dot: "bg-emerald-500" };
  if (station.status === "maintenance") return { label: t("dashboard.maintenance"), description: t("dashboard.maintenanceDesc"), card: "border-sky-200 bg-sky-50", badge: "bg-sky-200 text-sky-900", dot: "bg-sky-500" };
  if (station.status === "error") return { label: t("dashboard.error"), description: t("dashboard.errorDesc"), card: "border-red-200 bg-red-50", badge: "bg-red-200 text-red-900", dot: "animate-pulse bg-red-500" };
  return { label: t("dashboard.offline"), description: t("dashboard.offlineDesc"), card: "border-neutral-200 bg-neutral-50", badge: "bg-neutral-200 text-neutral-700", dot: "bg-neutral-400" };
}
