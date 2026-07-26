import { useEffect, useMemo, useState } from "react";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { api } from "../../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const PRESETS = [
  ["1h", "1 Std", 1],
  ["4h", "4 Std", 4],
  ["8h", "8 Std", 8],
  ["24h", "24 Std", 24],
];

const INTERVALS = [
  ["1 min", "1 Minute"],
  ["5 min", "5 Minuten"],
  ["15 min", "15 Minuten"],
  ["1 hour", "1 Stunde"],
];

export default function TrendWidget({ machines }) {
  const [preset, setPreset] = useState("4h");
  const [interval, setIntervalValue] = useState("5 min");
  const [machineId, setMachineId] = useState("");
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const hours = PRESETS.find(([value]) => value === preset)?.[2] || 4;
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3_600_000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        interval,
      });
      if (machineId) params.set("machine_id", machineId);
      setLoading(true);
      try {
        const response = await api.getSilent(`/dashboard/trends/all?${params}`);
        const firstSeries = response?.trends?.find((series) => Array.isArray(series.points) && series.points.length > 0);
        if (active) setTrend(firstSeries || null);
      } catch {
        if (active) setTrend(null);
      } finally {
        if (active) setLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [preset, interval, machineId]);

  const chartData = useMemo(() => toChartData(trend), [trend]);

  return (
    <div className="trend-widget">
      <div className="trend-widget__controls">
        <div className="trend-widget__presets">
          {PRESETS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={preset === value ? "is-active" : ""}
              onClick={() => setPreset(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={machineId} onChange={(event) => setMachineId(event.target.value)} aria-label="Maschine auswählen">
          <option value="">Alle Maschinen</option>
          {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
        </select>
        <select value={interval} onChange={(event) => setIntervalValue(event.target.value)} aria-label="Intervall auswählen">
          {INTERVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="trend-widget__chart">
        {chartData && !loading ? (
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 380 },
              plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
              scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: "#7a818b", font: { size: 10 } } },
                y: { grid: { color: "#edf0f2" }, ticks: { color: "#7a818b", font: { size: 10 } } },
              },
            }}
          />
        ) : (
          <div className="trend-widget__empty">
            <ChartLineUpIcon size={36} weight="thin" />
            <span>{loading ? "Daten werden geladen…" : "Keine Daten im ausgewählten Zeitraum"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function toChartData(series) {
  if (!series?.points?.length) return null;
  const preferredKeys = ["avg", "completedQty", "yieldPct", "availability", "minutes", "online"];
  const key = preferredKeys.find((candidate) => series.points.some((point) => Number.isFinite(Number(point[candidate]))));
  if (!key) return null;
  return {
    labels: series.points.map((point) => new Date(point.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })),
    datasets: [{
      data: series.points.map((point) => Number(point[key]) || 0),
      borderColor: "#ff5a00",
      backgroundColor: "rgba(255,90,0,.08)",
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 3,
      fill: true,
      tension: 0.32,
    }],
  };
}
