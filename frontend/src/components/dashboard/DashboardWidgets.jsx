import { lazy, Suspense } from "react";
import { BellSimpleIcon } from "@phosphor-icons/react/BellSimple";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { FilePdfIcon } from "@phosphor-icons/react/FilePdf";
import { GaugeIcon } from "@phosphor-icons/react/Gauge";
import { PackageIcon } from "@phosphor-icons/react/Package";
import { PulseIcon } from "@phosphor-icons/react/Pulse";
import { UsersIcon } from "@phosphor-icons/react/Users";
import { openDashboardReport } from "../../dashboard/dashboardReport.js";

const TrendWidget = lazy(() => import("./TrendWidget.jsx"));

const STATUS_ROWS = [
  ["online", "Online", "green"],
  ["idle", "Bereit", "blue"],
  ["error", "Störung", "orange"],
  ["maintenance", "Wartung", "yellow"],
  ["offline", "Offline", "gray"],
];

export function ProductionFlowWidget({ machines, carriers, kpis, health }) {
  const stations = [...machines]
    .filter((machine) => machine.resource_id != null && machine.routing_enabled !== false)
    .sort((a, b) => Number(a.route_sequence ?? Number.MAX_SAFE_INTEGER) - Number(b.route_sequence ?? Number.MAX_SAFE_INTEGER));

  if (stations.length === 0) {
    return (
      <div className="flow-empty">
        <PulseIcon size={34} />
        <strong>Keine Stationen verbunden</strong>
        <span>Der Produktionsfluss erscheint automatisch, sobald die API Stationen liefert.</span>
      </div>
    );
  }

  return (
    <div
      className="production-flow"
      aria-label={`${stations.length} Stationen und ${carriers.length} Carrier im Produktionsfluss`}
    >
      <div className="production-flow__stations">
        {stations.map((station, index) => {
          const stationCarriers = carriers.filter(
            (entry) => String(entry.current_resource_id) === String(station.resource_id),
          );
          const state = getStationState(station, stationCarriers.length > 0);
          const nextStation = stations[index + 1];
          const connectionActive = nextStation && isOnline(station) && isOnline(nextStation) && health;
          return (
            <div className="production-flow__segment" key={station.id || station.resource_id}>
              <article className={`flow-station ${state.className}`}>
                <div className="flow-station__identity">
                  <span>{resourceCode(station)}</span>
                  <strong>{stationDisplayName(station)}</strong>
                </div>
                {station.dashboard_image ? (
                  <img
                    src={station.dashboard_image}
                    alt=""
                    className={stationCarriers.length > 0 ? "is-working" : ""}
                  />
                ) : null}
                <div className="flow-station__meta">
                  <span><i className={`status-dot ${state.dot}`} />{state.label}</span>
                  <span>{formatCarrierCount(stationCarriers.length)}</span>
                  <span>OEE ges. <b>{formatPercent(kpis?.oee?.total)}</b></span>
                </div>
                {stationCarriers.length > 0 ? (
                  <div className="flow-station__carriers" aria-label={`Carrier an ${resourceCode(station)}`}>
                    {stationCarriers.map((carrier) => (
                      <span key={carrier.id || carrier.carrier_number}>
                        <PackageIcon size={14} weight="fill" />
                        Carrier {carrier.carrier_number}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
              {nextStation ? (
                <div className={`flow-connector ${connectionActive ? "is-live" : ""}`} aria-hidden="true">
                  <div className="flow-connector__line" />
                  <span className="flow-connector__check"><CheckIcon size={18} weight="bold" /></span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <CarrierTrack stations={stations} carriers={carriers} />
    </div>
  );
}

function CarrierTrack({ stations, carriers }) {
  const stationPositions = new Map(
    stations.map((station, index) => [
      String(station.resource_id),
      stations.length === 1 ? 50 : (index / (stations.length - 1)) * 100,
    ]),
  );
  const laneByResource = new Map();
  const positionedCarriers = carriers
    .filter((carrier) => stationPositions.has(String(carrier.current_resource_id)))
    .map((carrier) => {
      const resourceId = String(carrier.current_resource_id);
      const lane = laneByResource.get(resourceId) || 0;
      laneByResource.set(resourceId, lane + 1);
      return { carrier, lane, position: stationPositions.get(resourceId) };
    });
  const unpositionedCarriers = carriers.filter(
    (carrier) => isActiveCarrier(carrier) && !stationPositions.has(String(carrier.current_resource_id)),
  );
  const laneCount = Math.max(1, ...laneByResource.values());

  return (
    <div
      className="carrier-track"
      style={{ "--carrier-lanes": laneCount }}
      aria-label="Aktuelle Carrier-Positionen"
    >
      <div className="carrier-track__rail" aria-hidden="true" />
      {stations.map((station, index) => {
        const position = stations.length === 1 ? 50 : (index / (stations.length - 1)) * 100;
        return (
          <span
            className="carrier-track__station"
            key={station.id || station.resource_id}
            style={{ "--station-position": `${position}%` }}
            aria-hidden="true"
          >
            <i />
            <b>{resourceCode(station)}</b>
          </span>
        );
      })}
      {positionedCarriers.map(({ carrier, lane, position }) => (
        <span
          className={`carrier-track__carrier ${position >= 99 ? "is-end" : ""}`}
          key={carrier.id || carrier.carrier_number}
          style={{
            "--carrier-position": `${position}%`,
            "--carrier-lane": lane,
          }}
          title={`Carrier ${carrier.carrier_number} an Resource ${carrier.current_resource_id}`}
        >
          <i><PackageIcon size={15} weight="fill" /></i>
          <strong>Carrier {carrier.carrier_number}</strong>
        </span>
      ))}
      {positionedCarriers.length === 0 ? (
        <span className="carrier-track__empty">Aktuell kein Carrier an einer Station</span>
      ) : null}
      {unpositionedCarriers.length > 0 ? (
        <div className="carrier-track__unpositioned">
          <span>Transport / wartet:</span>
          {unpositionedCarriers.map((carrier) => (
            <strong key={carrier.id || carrier.carrier_number}>Carrier {carrier.carrier_number}</strong>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OeeWidget({ kpis }) {
  const values = [
    ["Gesamt", kpis?.oee?.total],
    ["Verfügbarkeit", kpis?.oee?.availability],
    ["Leistung", kpis?.oee?.performance],
    ["Qualität", kpis?.oee?.quality],
  ];
  return (
    <div className="oee-score">
      {values.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{formatPercent(value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function StatusWidget({ kpis }) {
  const statuses = kpis?.machines?.status || {};
  return (
    <div className="status-list">
      {STATUS_ROWS.map(([key, label, color]) => (
        <div key={key}>
          <span><i className={`status-dot ${color}`} />{label}</span>
          <strong>{statuses[key] || 0}</strong>
        </div>
      ))}
    </div>
  );
}

export function MetricWidget({ type, value }) {
  const config = {
    connected: { icon: UsersIcon, suffix: "", valueClass: "" },
    alarms: { icon: BellSimpleIcon, suffix: "", valueClass: "" },
    throughput: { icon: GaugeIcon, suffix: "/h", valueClass: "" },
    yield: { icon: GaugeIcon, suffix: "%", valueClass: "is-positive" },
  }[type];
  const Icon = config.icon;
  return (
    <div className="metric-value">
      <Icon size={39} weight="thin" />
      <strong className={config.valueClass}>{value}</strong>
      {config.suffix ? <span>{config.suffix}</span> : null}
    </div>
  );
}

export function HistoricalTrendsWidget({ machines }) {
  return (
    <Suspense fallback={<div className="widget-loading">Trenddaten werden geladen…</div>}>
      <TrendWidget machines={machines} />
    </Suspense>
  );
}

export function ReportsWidget({ dashboardData }) {
  return (
    <div className="report-actions">
      <button type="button" onClick={() => openDashboardReport({ scope: "shift", ...dashboardData })}>
        <FilePdfIcon size={21} /> Schichtbericht PDF
      </button>
      <button type="button" onClick={() => openDashboardReport({ scope: "day", ...dashboardData })}>
        <FilePdfIcon size={21} /> Tagesbericht PDF
      </button>
    </div>
  );
}

function isOnline(station) {
  return station.status === "online" || station.status === "idle";
}

function getStationState(station, hasCarrier) {
  if (hasCarrier) return { label: "Arbeitet", dot: "orange", className: "is-working" };
  if (station.status === "error") return { label: "Störung", dot: "orange", className: "has-error" };
  if (station.status === "maintenance") return { label: "Wartung", dot: "yellow", className: "" };
  if (isOnline(station)) return { label: "Online", dot: "green", className: "" };
  return { label: "Offline", dot: "gray", className: "is-offline" };
}

function resourceCode(station) {
  const codeFromName = String(station.name || "").trim().match(/^([A-Za-z]+\d+)\b/)?.[1];
  if (codeFromName) return codeFromName.toUpperCase();
  const raw = String(station.resource_id ?? "").trim();
  return /^\d+$/.test(raw) ? `S${raw.padStart(2, "0")}` : raw.toUpperCase();
}

function stationDisplayName(station) {
  const name = String(station.name || "").trim();
  const withoutCode = name.replace(/^[A-Za-z]+\d+\s*[-–:]?\s*/, "").trim();
  return withoutCode || `Station ${station.resource_id}`;
}

function isActiveCarrier(carrier) {
  return carrier.status !== "available" && carrier.status !== "completed";
}

function formatCarrierCount(count) {
  if (count === 0) return "Kein Carrier";
  return count === 1 ? "1 Carrier" : `${count} Carrier`;
}

function formatPercent(value) {
  return `${Number.isFinite(value) ? value : 0}%`;
}
