import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellSimpleIcon } from "@phosphor-icons/react/BellSimple";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ClipboardTextIcon } from "@phosphor-icons/react/ClipboardText";
import { FactoryIcon } from "@phosphor-icons/react/Factory";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { SquaresFourIcon } from "@phosphor-icons/react/SquaresFour";
import { XIcon } from "@phosphor-icons/react/X";
import "./smartphone-dashboard.css";

const NAV_ITEMS = [
  { label: "Dashboard", icon: SquaresFourIcon, path: "/" },
  { label: "Aufträge", icon: ClipboardTextIcon, path: "/orders" },
  { label: "Maschinen", icon: FactoryIcon, path: "/machines" },
  { label: "Mehr", icon: GearSixIcon, path: null },
];

export default function SmartphoneDashboard({ dashboardData }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const stations = useMemo(
    () => [...dashboardData.machines]
      .filter((machine) => machine.resource_id != null && machine.routing_enabled !== false)
      .sort((a, b) => Number(a.route_sequence ?? Number.MAX_SAFE_INTEGER)
        - Number(b.route_sequence ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 6),
    [dashboardData.machines],
  );

  const oee = numberValue(dashboardData.kpis?.oee?.total);
  const throughput = numberValue(dashboardData.kpis?.throughput?.unitsPerHour);
  const yieldValue = numberValue(dashboardData.kpis?.yield ?? dashboardData.kpis?.oee?.quality);
  const alarms = Number(dashboardData.stats?.alarms || 0);
  const onlineStations = stations.filter((station) => station.live_connected).length;

  return (
    <main className="phone-dashboard">
      <header className="phone-topbar">
        <span className="phone-wordmark" aria-label="WARA">WAR<span>A</span></span>
        <div><h1>Dashboard</h1><p>Produktion live</p></div>
        <button type="button" onClick={() => setSheet("edit")} aria-label="Dashboard bearbeiten">
          <PencilSimpleIcon size={22} weight="bold" />
        </button>
      </header>

      <div className="phone-dashboard__scroll">
        <button className="phone-shift" type="button" onClick={() => navigate("/shifts")}>
          <i aria-hidden="true" />
          <span><strong>Frühschicht</strong><small>06:00–14:00</small></span>
          <b>Aktiv</b>
          <CaretRightIcon size={20} aria-hidden="true" />
        </button>

        <section className="phone-kpis" aria-label="Aktuelle Kennzahlen">
          <PhoneKpi label="OEE" value={formatNumber(oee)} unit="%" tone="success" onClick={() => setSheet("performance")} />
          <PhoneKpi label="Alarme" value={alarms} tone={alarms > 0 ? "danger" : "success"} onClick={() => navigate("/alarms")} />
          <PhoneKpi label="Durchsatz" value={formatNumber(throughput)} unit="/h" onClick={() => setSheet("performance")} />
          <PhoneKpi label="Yield" value={formatNumber(yieldValue)} unit="%" tone="success" onClick={() => setSheet("performance")} />
        </section>

        <section className="phone-section phone-production">
          <header>
            <div><span>Linie A</span><h2>Produktionsfluss</h2></div>
            <button type="button" onClick={() => navigate("/machines")}>Alle <CaretRightIcon size={17} /></button>
          </header>
          {dashboardData.isLoading ? (
            <div className="phone-loading">Live-Daten werden geladen …</div>
          ) : stations.length === 0 ? (
            <button className="phone-empty" type="button" onClick={() => navigate("/machines?create=1")}>
              <FactoryIcon size={30} weight="duotone" />
              <span><strong>Noch keine Stationen</strong><small>Erste Maschine anlegen</small></span>
              <CaretRightIcon size={20} />
            </button>
          ) : (
            <>
              <div className="phone-station-rail" tabIndex="0" aria-label="Stationen, horizontal scrollbar">
                {stations.map((station, index) => {
                  const status = machineStatus(station);
                  return (
                    <button type="button" key={station.id || station.resource_id} onClick={() => navigate("/machines")}>
                      <span className={`phone-station-index is-${status.tone}`}>{String(index + 1).padStart(2, "0")}</span>
                      <i className={`is-${status.tone}`}><CheckCircleIcon size={24} weight={status.tone === "success" ? "fill" : "regular"} /></i>
                      <strong>{resourceCode(station)}</strong>
                      <small>{status.label}</small>
                    </button>
                  );
                })}
              </div>
              <div className="phone-line-summary">
                <span><i />{onlineStations} von {stations.length} online</span>
                <small>Horizontal wischen</small>
              </div>
            </>
          )}
        </section>

        <section className="phone-section phone-performance">
          <header>
            <div><span>Aktuelle Schicht</span><h2>Live-Leistung</h2></div>
            <ChartLineUpIcon size={24} weight="duotone" />
          </header>
          <button type="button" onClick={() => setSheet("performance")} className="phone-oee-row">
            <div className="phone-oee-gauge" style={{ "--phone-oee": `${Math.max(0, Math.min(oee ?? 0, 100))}%` }}>
              <span>{formatNumber(oee)}<small>%</small></span>
            </div>
            <div>
              <span>OEE Live-Score</span>
              <strong>{oeeState(oee)}</strong>
              <small>Zielwert 85 %</small>
            </div>
            <CaretRightIcon size={20} />
          </button>
          <div className="phone-performance-grid">
            <MiniMetric label="Verfügbarkeit" value={dashboardData.kpis?.oee?.availability} />
            <MiniMetric label="Leistung" value={dashboardData.kpis?.oee?.performance} />
            <MiniMetric label="Qualität" value={dashboardData.kpis?.oee?.quality} />
          </div>
        </section>
      </div>

      <nav className="phone-bottom-nav" aria-label="Hauptnavigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.path === "/";
          return (
            <button
              type="button"
              key={item.label}
              className={active ? "is-active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => item.path ? navigate(item.path) : setSheet("more")}
            >
              <Icon size={24} weight={active ? "fill" : "regular"} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {sheet ? (
        <PhoneSheet title={sheet === "edit" ? "Dashboard bearbeiten" : sheet === "more" ? "Weitere Bereiche" : "Live-Leistung"} onClose={() => setSheet(null)}>
          {sheet === "edit" ? (
            <div className="phone-sheet-copy">
              <PencilSimpleIcon size={30} weight="duotone" />
              <strong>Für Smartphones optimiert</strong>
              <p>Die wichtigsten Bereiche sind fest priorisiert. KPI-Kacheln öffnen Details per Tippen; der Produktionsfluss lässt sich horizontal wischen.</p>
            </div>
          ) : sheet === "more" ? (
            <div className="phone-sheet-links">
              <SheetLink icon={BellSimpleIcon} label="Alarme" onClick={() => navigate("/alarms")} />
              <SheetLink icon={FactoryIcon} label="Shopfloor" onClick={() => navigate("/shopfloor")} />
              <SheetLink icon={GearSixIcon} label="Schichten" onClick={() => navigate("/shifts")} />
            </div>
          ) : (
            <div className="phone-sheet-metrics">
              <MiniMetric label="OEE" value={oee} />
              <MiniMetric label="Durchsatz / h" value={throughput} unit="" />
              <MiniMetric label="Yield" value={yieldValue} />
              <MiniMetric label="Aktive Alarme" value={alarms} unit="" />
            </div>
          )}
        </PhoneSheet>
      ) : null}
    </main>
  );
}

function PhoneKpi({ label, value, unit, tone = "default", onClick }) {
  return (
    <button type="button" className={`phone-kpi is-${tone}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}{unit ? <small>{unit}</small> : null}</strong>
      <i><b /></i>
    </button>
  );
}

function MiniMetric({ label, value, unit = "%" }) {
  return <div><span>{label}</span><strong>{formatNumber(value)}{unit ? <small>{unit}</small> : null}</strong></div>;
}

function PhoneSheet({ title, onClose, children }) {
  return (
    <div className="phone-sheet-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="phone-sheet" role="dialog" aria-modal="true" aria-labelledby="phone-sheet-title" onPointerDown={(event) => event.stopPropagation()}>
        <header><h2 id="phone-sheet-title">{title}</h2><button type="button" onClick={onClose} aria-label="Schließen"><XIcon size={23} /></button></header>
        {children}
      </section>
    </div>
  );
}

function SheetLink({ icon: Icon, label, onClick }) {
  return <button type="button" onClick={onClick}><Icon size={23} weight="duotone" /><span>{label}</span><CaretRightIcon size={19} /></button>;
}

function machineStatus(machine) {
  if (machine.live_connected) return { tone: "success", label: machine.effective_status === "idle" ? "Bereit" : "Online" };
  if (machine.effective_status === "error") return { tone: "danger", label: "Störung" };
  if (machine.effective_status === "maintenance") return { tone: "warning", label: "Wartung" };
  return { tone: "muted", label: "Offline" };
}

function resourceCode(machine) {
  const code = String(machine.name || "").trim().match(/^([A-Za-z]+\d+)\b/)?.[1];
  if (code) return code.toUpperCase();
  const resource = String(machine.resource_id ?? "").trim();
  return /^\d+$/.test(resource) ? `S${resource.padStart(2, "0")}` : resource.toUpperCase();
}

function oeeState(value) {
  if (value == null) return "Keine Live-Daten";
  if (value >= 85) return "Im Zielbereich";
  if (value >= 70) return "Leicht unter Ziel";
  return "Handlungsbedarf";
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  const number = numberValue(value);
  return number == null ? "–" : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(number);
}
