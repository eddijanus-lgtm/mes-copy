import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { BellSimpleIcon } from "@phosphor-icons/react/BellSimple";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ClipboardTextIcon } from "@phosphor-icons/react/ClipboardText";
import { FactoryIcon } from "@phosphor-icons/react/Factory";
import { FilePdfIcon } from "@phosphor-icons/react/FilePdf";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { GaugeIcon } from "@phosphor-icons/react/Gauge";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { HouseIcon } from "@phosphor-icons/react/House";
import { MinusCircleIcon } from "@phosphor-icons/react/MinusCircle";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { PlusCircleIcon } from "@phosphor-icons/react/PlusCircle";
import { PulseIcon } from "@phosphor-icons/react/Pulse";
import { SquaresFourIcon } from "@phosphor-icons/react/SquaresFour";
import { XIcon } from "@phosphor-icons/react/X";
import { openDashboardReport } from "../../dashboard/dashboardReport.js";
import Button from "../../design-system/components/Button.jsx";
import { useDosLongPress } from "../../hooks/useDosEasterEgg.js";
import "./tablet-dashboard.css";

const MAX_WIDGETS = 4;
const LONG_PRESS_MS = 560;
const STORAGE_PREFIX = "mes.dashboard.tablet.v1";
const DEFAULT_WIDGET_IDS = ["production", "oee", "alarms", "performance"];

const WIDGET_CATALOG = [
  { id: "production", title: "Produktionsfluss", description: "Stationen und Linienstatus", icon: FactoryIcon },
  { id: "oee", title: "OEE Live-Score", description: "OEE und Zielwert", icon: GaugeIcon },
  { id: "alarms", title: "Aktive Alarme", description: "Kritische Meldungen", icon: BellSimpleIcon },
  { id: "performance", title: "Leistung", description: "Durchsatz und Yield", icon: HouseIcon },
  { id: "status", title: "Betriebsstatus", description: "Anlagenzustand kompakt", icon: PulseIcon },
  { id: "reports", title: "Berichte", description: "Schicht- und Tagesberichte", icon: FilePdfIcon },
];

const VALID_WIDGET_IDS = new Set(WIDGET_CATALOG.map((widget) => widget.id));

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: SquaresFourIcon, path: "/" },
  { id: "orders", label: "Aufträge", icon: ClipboardTextIcon, path: "/orders" },
  { id: "machines", label: "Maschinen", icon: FactoryIcon, path: "/machines" },
  { id: "more", label: "Mehr", icon: GearSixIcon, path: null },
];

function storageKey(user) {
  return `${STORAGE_PREFIX}.${user?.id || user?.username || "authenticated-user"}`;
}

function loadTabletWidgets(user) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(user)));
    const valid = Array.isArray(stored)
      ? stored.filter((id) => VALID_WIDGET_IDS.has(id)).slice(0, MAX_WIDGETS)
      : [];
    return valid.length > 0 ? valid : DEFAULT_WIDGET_IDS;
  } catch {
    return DEFAULT_WIDGET_IDS;
  }
}

export default function TabletDashboard({ dashboardData, user }) {
  const navigate = useNavigate();
  const dosLongPress = useDosLongPress();
  const [visibleWidgetIds, setVisibleWidgetIds] = useState(() => loadTabletWidgets(user));
  const [isEditing, setIsEditing] = useState(false);
  const [draggingWidgetId, setDraggingWidgetId] = useState(null);
  const [dragVisual, setDragVisual] = useState(null);
  const [detail, setDetail] = useState(null);
  const pressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const widgetSlotRefs = useRef(new Map());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(user), JSON.stringify(visibleWidgetIds));
    } catch {
      // The dashboard remains usable when storage is unavailable.
    }
  }, [user, visibleWidgetIds]);

  const stationSummary = useMemo(() => {
    const stations = [...dashboardData.machines]
      .filter((machine) => machine.resource_id != null && machine.routing_enabled !== false)
      .sort((a, b) => Number(a.route_sequence ?? Number.MAX_SAFE_INTEGER)
        - Number(b.route_sequence ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 4);
    const runningCount = stations.filter(isMachineOnline).length;
    return { stations, runningCount };
  }, [dashboardData.machines]);

  const clearPressTimer = () => {
    if (!pressTimerRef.current) return;
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  const toggleWidget = (id) => {
    setVisibleWidgetIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((widgetId) => widgetId !== id);
      }
      return current.length >= MAX_WIDGETS ? current : [...current, id];
    });
  };

  const handleTilePointerDown = (id, event) => {
    if (isEditing) {
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDraggingWidgetId(id);
      setDragVisual({
        id,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        dropping: false,
      });
      return;
    }

    longPressTriggeredRef.current = false;
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsEditing(true);
      pressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const handleTilePointerMove = (event) => {
    if (!isEditing || !draggingWidgetId) return;

    setDragVisual((current) => current ? {
      ...current,
      x: event.clientX - current.offsetX,
      y: event.clientY - current.offsetY,
    } : current);

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".tablet-widget-slot");
    const targetId = target?.dataset.widgetId;
    if (!targetId || targetId === draggingWidgetId) return;

    const beforeRects = new Map(
      visibleWidgetIds.map((id) => [id, widgetSlotRefs.current.get(id)?.getBoundingClientRect()]),
    );

    flushSync(() => setVisibleWidgetIds((current) => {
      const fromIndex = current.indexOf(draggingWidgetId);
      const toIndex = current.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggingWidgetId);
      return next;
    }));

    widgetSlotRefs.current.forEach((element, id) => {
      if (!element || id === draggingWidgetId) return;
      const before = beforeRects.get(id);
      const after = element.getBoundingClientRect();
      if (!before) return;
      const deltaX = before.left - after.left;
      const deltaY = before.top - after.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      element.style.transition = "none";
      element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      requestAnimationFrame(() => {
        element.style.transition = "transform 230ms cubic-bezier(.2,.75,.2,1)";
        element.style.transform = "";
      });
    });
  };

  const handleTilePointerEnd = (event) => {
    clearPressTimer();
    if (!draggingWidgetId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const destination = widgetSlotRefs.current.get(draggingWidgetId)?.getBoundingClientRect();
    if (!destination) {
      setDraggingWidgetId(null);
      setDragVisual(null);
      return;
    }

    setDragVisual((current) => current ? {
      ...current,
      x: destination.left,
      y: destination.top,
      width: destination.width,
      height: destination.height,
      dropping: true,
    } : current);
    window.setTimeout(() => {
      setDraggingWidgetId(null);
      setDragVisual(null);
    }, 210);
  };

  const handleTileClick = (id) => {
    if (isEditing || longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setDetail(id);
  };

  const saveEditing = () => {
    clearPressTimer();
    setDraggingWidgetId(null);
    setDragVisual(null);
    setIsEditing(false);
  };

  return (
    <main className={`tablet-dashboard${isEditing ? " is-editing" : ""}`}>
      <header className="tablet-topbar">
        <div className="tablet-brand">
          <button type="button" className="tablet-wordmark dos-easter-egg-trigger" aria-label="WARA" {...dosLongPress}>
            WAR<span>A</span>
          </button>
          <span>MES Shopfloor</span>
        </div>
        <div className="tablet-heading">
          <h1>Dashboard</h1>
          <p>Produktion auf einen Blick</p>
        </div>
        <div className="tablet-actions">
          <div className="tablet-shift" aria-label="Aktive Schicht">
            <i />
            <span><strong>Frühschicht</strong><small>06:00–14:00</small></span>
          </div>
          <button type="button" className={isEditing ? "is-save" : ""} onClick={isEditing ? saveEditing : () => setIsEditing(true)}>
            {isEditing ? <FloppyDiskIcon size={24} weight="bold" /> : <PencilSimpleIcon size={24} weight="bold" />}
            {isEditing ? "Speichern" : "Bearbeiten"}
          </button>
        </div>
      </header>

      <section className="tablet-dashboard-grid" aria-label="Dashboard-Kacheln">
        {visibleWidgetIds.map((id) => (
          <div
            className={`tablet-widget-slot${draggingWidgetId === id ? " is-placeholder" : ""}`}
            data-widget-id={id}
            key={id}
            ref={(element) => {
              if (element) widgetSlotRefs.current.set(id, element);
              else widgetSlotRefs.current.delete(id);
            }}
          >
            <TabletWidget
              id={id}
              data={dashboardData}
              stationSummary={stationSummary}
              isEditing={isEditing}
              isDragging={draggingWidgetId === id}
              onOpen={() => handleTileClick(id)}
              onPointerDown={(event) => handleTilePointerDown(id, event)}
              onPointerMove={handleTilePointerMove}
              onPointerUp={handleTilePointerEnd}
              onPointerCancel={handleTilePointerEnd}
              onCreateMachine={() => navigate("/machines?create=1")}
            />
          </div>
        ))}
      </section>

      {dragVisual ? (
        <div
          className={`tablet-drag-preview${dragVisual.dropping ? " is-dropping" : ""}`}
          style={{
            left: dragVisual.x,
            top: dragVisual.y,
            width: dragVisual.width,
            height: dragVisual.height,
          }}
          aria-hidden="true"
        >
          <TabletWidget
            id={dragVisual.id}
            data={dashboardData}
            stationSummary={stationSummary}
            isEditing
            isDragging
            isGhost
          />
        </div>
      ) : null}

      <nav className="tablet-bottom-nav" aria-label="Hauptnavigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === "dashboard";
          return (
            <button
              type="button"
              key={item.id}
              className={active ? "is-active" : ""}
              onClick={() => item.path ? navigate(item.path) : setDetail("more")}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={28} weight={active ? "fill" : "regular"} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {isEditing ? (
        <aside className="tablet-widget-editor" aria-label="Widgets bearbeiten">
          <header>
            <div><span>Dashboard bearbeiten</span><strong>Widgets</strong></div>
            <b>{visibleWidgetIds.length}/{MAX_WIDGETS}</b>
          </header>
          <p>Halte und ziehe eine Kachel, um sie anzuordnen. Entferne eine Kachel, um ein anderes Widget hinzuzufügen.</p>
          <div>
            {WIDGET_CATALOG.map((widget) => {
              const Icon = widget.icon;
              const selected = visibleWidgetIds.includes(widget.id);
              return (
                <button
                  type="button"
                  key={widget.id}
                  className={selected ? "is-selected" : ""}
                  disabled={!selected && visibleWidgetIds.length >= MAX_WIDGETS}
                  onClick={() => toggleWidget(widget.id)}
                  aria-pressed={selected}
                >
                  <i><Icon size={22} weight="duotone" /></i>
                  <span><strong>{widget.title}</strong><small>{widget.description}</small></span>
                  {selected ? <MinusCircleIcon size={25} weight="fill" /> : <PlusCircleIcon size={25} weight="fill" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="tablet-reset-widgets" onClick={() => setVisibleWidgetIds(DEFAULT_WIDGET_IDS)}>
            Standard wiederherstellen
          </button>
        </aside>
      ) : null}

      {detail ? (
        <TabletDialog
          detail={detail}
          data={dashboardData}
          onClose={() => setDetail(null)}
          onNavigate={(path) => {
            setDetail(null);
            navigate(path);
          }}
        />
      ) : null}
    </main>
  );
}

function TabletWidget({
  id,
  data,
  stationSummary,
  isEditing,
  isDragging,
  isGhost = false,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onCreateMachine,
}) {
  const interactionProps = {
    onClick: isGhost ? undefined : onOpen,
    onPointerDown: isGhost ? undefined : onPointerDown,
    onPointerMove: isGhost ? undefined : onPointerMove,
    onPointerUp: isGhost ? undefined : onPointerUp,
    onPointerCancel: isGhost ? undefined : onPointerCancel,
    "aria-label": isEditing ? `${widgetTitle(id)} verschieben` : undefined,
    tabIndex: isGhost ? -1 : undefined,
    className: `tablet-tile tablet-${id}${isDragging ? " is-dragging" : ""}${isGhost ? " is-ghost" : ""}`,
  };

  if (id === "production") {
    const stations = stationSummary.stations;
    return (
      <div
        {...interactionProps}
        role="button"
        onKeyDown={(event) => {
          if (!isGhost && !isEditing && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onOpen?.();
          }
        }}
      >
        <TabletTileHeading icon={FactoryIcon} title="Produktionsfluss" />
        {stationSummary.runningCount === 0 ? (
          <div className="tablet-production-empty">
            <PulseIcon size={54} weight="duotone" />
            <strong>Keine Stationen verbunden</strong>
            <span>{stations.length} Stationen sind konfiguriert, liefern aber keine frische Telemetrie.</span>
            {!isEditing && !isGhost ? (
              <Button
                className="tablet-empty-action"
                size="touch"
                icon={<PlusCircleIcon size={21} weight="fill" />}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateMachine?.();
                }}
              >
                Maschine anlegen
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="tablet-station-flow">
              {stations.map((station, index) => {
                const online = isMachineOnline(station);
                return (
                  <div className="tablet-station-step" key={station.id || station.resource_id}>
                    <span className={online ? "is-online" : ""}>
                      <CheckCircleIcon size={24} weight={online ? "fill" : "regular"} />
                      <strong>{resourceCode(station)}</strong>
                    </span>
                    {index < stations.length - 1 ? <i className={online ? "is-online" : ""} /> : null}
                  </div>
                );
              })}
            </div>
            <div className="tablet-summary">
              <i />
              <strong>{stationSummary.runningCount} Stationen laufen</strong>
              <span>Linie A</span>
            </div>
          </>
        )}
      </div>
    );
  }

  if (id === "oee") {
    const value = numberValue(data.kpis?.oee?.total);
    return (
      <button type="button" {...interactionProps}>
        <TabletTileHeading icon={GaugeIcon} title="OEE Live-Score" />
        <div className="tablet-oee-content">
          <div className="tablet-oee-ring" style={{ "--oee-value": `${value ?? 0}%` }}>
            <strong>{formatNumber(value)}{value == null ? null : <span>%</span>}</strong>
          </div>
          <div><strong>{oeeStateLabel(value)}</strong><small>{value == null ? "Keine aktive Maschine" : "Zielwert 85 %"}</small></div>
        </div>
      </button>
    );
  }

  if (id === "alarms") {
    const alarmCount = Number(data.stats?.alarms || 0);
    return (
      <button type="button" {...interactionProps}>
        <TabletTileHeading icon={BellSimpleIcon} title="Aktive Alarme" tone="danger" />
        <div className="tablet-alarm-content">
          <BellSimpleIcon size={72} weight="duotone" />
          <div><strong>{alarmCount}</strong><span>{alarmCount > 0 ? "Handlung erforderlich" : "Keine aktiven Alarme"}</span></div>
        </div>
        <div className="tablet-alarm-footer">{alarmCount > 0 ? "Meldungen öffnen" : "Anlage störungsfrei"}</div>
      </button>
    );
  }

  if (id === "performance") {
    return (
      <button type="button" {...interactionProps}>
        <TabletTileHeading icon={HouseIcon} title="Leistung" />
        <div className="tablet-metrics">
          <TabletMetric value={formatNumber(data.kpis?.throughput?.unitsPerHour)} unit="/h" label="Durchsatz" />
          <TabletMetric value={formatNumber(data.kpis?.yield ?? data.kpis?.oee?.quality)} unit="%" label="Yield" />
        </div>
        <div className="tablet-target"><span>Schichtziel</span><div><i /></div><strong>82 %</strong></div>
      </button>
    );
  }

  if (id === "status") {
    const healthy = Boolean(data.stats?.health);
    return (
      <button type="button" {...interactionProps}>
        <TabletTileHeading icon={PulseIcon} title="Betriebsstatus" />
        <div className="tablet-status-content">
          <CheckCircleIcon size={86} weight="duotone" />
          <div><strong>{healthy ? "Normalbetrieb" : "Verbindung prüfen"}</strong><span>{data.connectedMachineCount} Stationen verbunden</span></div>
        </div>
        <div className="tablet-status-footer">{healthy ? "Alle Systeme im Sollbereich" : "Statusdaten werden geprüft"}</div>
      </button>
    );
  }

  return (
    <button type="button" {...interactionProps}>
      <TabletTileHeading icon={FilePdfIcon} title="Berichte" />
      <div className="tablet-reports-content">
        <div><FilePdfIcon size={50} weight="duotone" /><span><strong>Schichtbericht</strong><small>PDF erstellen</small></span></div>
        <div><FilePdfIcon size={50} weight="duotone" /><span><strong>Tagesbericht</strong><small>PDF erstellen</small></span></div>
      </div>
      <div className="tablet-reports-footer">Berichte öffnen</div>
    </button>
  );
}

function TabletTileHeading({ icon: Icon, title, tone = "default" }) {
  return (
    <div className="tablet-tile-heading">
      <i className={tone}><Icon size={25} weight="duotone" /></i>
      <h2>{title}</h2>
    </div>
  );
}

function TabletMetric({ value, unit, label }) {
  return <div><strong>{value}{value === "–" ? null : <small>{unit}</small>}</strong><span>{label}</span></div>;
}

function TabletDialog({ detail, data, onClose, onNavigate }) {
  const isReports = detail === "reports";
  const isMore = detail === "more";
  const stations = [...data.machines]
    .filter((machine) => machine.resource_id != null && machine.routing_enabled !== false)
    .sort((a, b) => Number(a.route_sequence ?? Number.MAX_SAFE_INTEGER)
      - Number(b.route_sequence ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6);

  return (
    <div className="tablet-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="tablet-dialog" role="dialog" aria-modal="true" aria-labelledby="tablet-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Dashboard</span><h2 id="tablet-dialog-title">{isMore ? "Weitere Bereiche" : widgetTitle(detail)}</h2></div>
          <button type="button" onClick={onClose} aria-label="Dialog schließen"><XIcon size={26} /></button>
        </header>
        <div className="tablet-dialog-body">
          {isReports ? (
            <>
              <button type="button" onClick={() => openDashboardReport({ scope: "shift", ...data })}><FilePdfIcon size={24} /> Schichtbericht PDF</button>
              <button type="button" onClick={() => openDashboardReport({ scope: "day", ...data })}><FilePdfIcon size={24} /> Tagesbericht PDF</button>
            </>
          ) : isMore ? (
            <>
              <button type="button" onClick={() => onNavigate("/alarms")}><BellSimpleIcon size={24} /> Alarme</button>
              <button type="button" onClick={() => onNavigate("/shifts")}><PulseIcon size={24} /> Schichten</button>
              <button type="button" onClick={() => onNavigate("/carriers")}><FactoryIcon size={24} /> Werkstückträger</button>
            </>
          ) : detail === "production" ? (
            <div className="tablet-detail-stack">
              <div className="tablet-detail-lead">
                <span>Linie A</span>
                <strong>{stations.filter(isMachineOnline).length} von {stations.length} Stationen laufen</strong>
              </div>
              <div className="tablet-station-list">
                {stations.map((machine) => (
                  <div key={machine.id || machine.resource_id}>
                    <i className={isMachineOnline(machine) ? "is-online" : ""} />
                    <span><strong>{resourceCode(machine)}</strong><small>{machine.name || "Produktionsstation"}</small></span>
                    <b>{machineStatusLabel(machine)}</b>
                  </div>
                ))}
              </div>
              <button className="tablet-detail-action" type="button" onClick={() => onNavigate("/machines")}>
                Maschinenübersicht öffnen
              </button>
            </div>
          ) : detail === "oee" ? (
            <div className="tablet-detail-stack">
              <div className="tablet-detail-score">
                <span>Aktueller OEE</span>
                <strong>{formatNumber(data.kpis?.oee?.total)}{numberValue(data.kpis?.oee?.total) == null ? null : <small>%</small>}</strong>
                <b>{oeeStateLabel(numberValue(data.kpis?.oee?.total), "Unter Zielwert 85 %")}</b>
              </div>
              <div className="tablet-detail-kpis">
                <DetailKpi label="Verfügbarkeit" value={data.kpis?.oee?.availability} />
                <DetailKpi label="Leistung" value={data.kpis?.oee?.performance} />
                <DetailKpi label="Qualität" value={data.kpis?.oee?.quality} />
              </div>
              <p className="tablet-detail-note">Auswertung für die laufende 8-Stunden-Schicht.</p>
            </div>
          ) : detail === "alarms" ? (
            <div className="tablet-detail-stack">
              <div className="tablet-detail-lead is-danger">
                <span>Offene Meldungen</span>
                <strong>{data.activeAlarms.length || Number(data.stats?.alarms || 0)} Alarme benötigen Aufmerksamkeit</strong>
              </div>
              <div className="tablet-alarm-list">
                {data.activeAlarms.slice(0, 3).map((alarm) => (
                  <div key={alarm.id}>
                    <i className={`is-${String(alarm.severity || "info").toLowerCase()}`} />
                    <span><strong>{alarm.message || "Anlagenmeldung"}</strong><small>{alarm.machine_id || "Shopfloor"} · {formatTime(alarm.created_at)}</small></span>
                    <b>{alarmSeverityLabel(alarm.severity)}</b>
                  </div>
                ))}
                {data.activeAlarms.length === 0 ? (
                  <div className="tablet-empty-state"><CheckCircleIcon size={34} weight="duotone" /><span>Keine offenen Alarmdetails vorhanden.</span></div>
                ) : null}
              </div>
              <button className="tablet-detail-action is-danger" type="button" onClick={() => onNavigate("/alarms")}>
                Alle Alarme bearbeiten
              </button>
            </div>
          ) : detail === "performance" ? (
            <div className="tablet-detail-stack">
              <div className="tablet-detail-kpis is-large">
                <DetailKpi label="Durchsatz" value={data.kpis?.throughput?.unitsPerHour} unit="/h" />
                <DetailKpi label="Yield" value={data.kpis?.yield ?? data.kpis?.oee?.quality} />
              </div>
              <div className="tablet-detail-rows">
                <div><span>Fertigteile</span><strong>{formatNumber(data.kpis?.throughput?.completedQuantity)}</strong></div>
                <div><span>Abgeschlossene Aufträge</span><strong>{formatNumber(data.kpis?.throughput?.completedOrders)}</strong></div>
                <div><span>Schichtfortschritt</span><strong>{formatNumber(data.kpis?.orders?.completionPercent)} %</strong></div>
              </div>
              <p className="tablet-detail-note">Live-Werte der aktuellen Schicht, automatische Aktualisierung alle 5 Sekunden.</p>
            </div>
          ) : detail === "status" ? (
            <div className="tablet-detail-stack">
              <div className="tablet-detail-lead">
                <span>Shopfloor Gateway</span>
                <strong>{data.stats?.health ? "Alle Dienste sind erreichbar" : "Verbindung wird geprüft"}</strong>
              </div>
              <div className="tablet-detail-rows">
                <div><span>Maschinen verbunden</span><strong>{data.connectedMachineCount}</strong></div>
                <div><span>Maschinen gesamt</span><strong>{data.machines.length}</strong></div>
                <div><span>Aktive Alarme</span><strong>{Number(data.stats?.alarms || 0)}</strong></div>
              </div>
            </div>
          ) : (
            <div className="tablet-empty-state"><CheckCircleIcon size={40} weight="duotone" /><span>Keine weiteren Details verfügbar.</span></div>
          )}
        </div>
      </section>
    </div>
  );
}

function widgetTitle(id) {
  return WIDGET_CATALOG.find((widget) => widget.id === id)?.title || "Widget";
}

function DetailKpi({ label, value, unit = "%" }) {
  const numericValue = numberValue(value);
  return (
    <div>
      <span>{label}</span>
      <strong>{formatNumber(value)}{numericValue == null ? null : <small>{unit}</small>}</strong>
      <i><b style={{ width: `${Math.max(0, Math.min(numericValue ?? 0, 100))}%` }} /></i>
    </div>
  );
}

function machineStatusLabel(machine) {
  if (machine.live_connected && machine.effective_status === "online") return "Online";
  if (machine.live_connected && machine.effective_status === "idle") return "Bereit";
  if (machine.effective_status === "maintenance") return "Wartung";
  if (machine.effective_status === "error") return "Störung";
  return "Offline";
}

function alarmSeverityLabel(severity) {
  if (severity === "critical") return "Kritisch";
  if (severity === "error") return "Fehler";
  if (severity === "warning") return "Warnung";
  return "Info";
}

function formatTime(value) {
  if (!value) return "Zeit unbekannt";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function isMachineOnline(machine) {
  return machine.live_connected === true;
}

function resourceCode(machine) {
  const codeFromName = String(machine.name || "").trim().match(/^([A-Za-z]+\d+)\b/)?.[1];
  if (codeFromName) return codeFromName.toUpperCase();
  const raw = String(machine.resource_id ?? "").trim();
  return /^\d+$/.test(raw) ? `S${raw.padStart(2, "0")}` : raw.toUpperCase();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value) {
  const number = numberValue(value);
  return number !== null
    ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(number)
    : "–";
}

function oeeStateLabel(value, belowTargetLabel = "Unter Zielwert") {
  if (value === null) return "Keine Live-Daten";
  return value >= 85 ? "Im Zielbereich" : belowTargetLabel;
}
