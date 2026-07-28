import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  BellSimpleIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  FactoryIcon,
  FilePdfIcon,
  FloppyDiskIcon,
  GaugeIcon,
  GearSixIcon,
  HouseIcon,
  MinusCircleIcon,
  PencilSimpleIcon,
  PlusCircleIcon,
  PulseIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";

const stations = ["S10", "S20", "S30", "S40"];

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: SquaresFourIcon },
  { id: "orders", label: "Aufträge", icon: ClipboardTextIcon },
  { id: "machines", label: "Maschinen", icon: FactoryIcon },
  { id: "more", label: "Mehr", icon: GearSixIcon },
];

const widgetCatalog = [
  { id: "production", title: "Produktionsfluss", description: "Stationen und Linienstatus", icon: FactoryIcon },
  { id: "oee", title: "OEE Live-Score", description: "OEE und Zielwert", icon: GaugeIcon },
  { id: "alarms", title: "Aktive Alarme", description: "Kritische Meldungen", icon: BellSimpleIcon },
  { id: "performance", title: "Leistung", description: "Durchsatz und Yield", icon: HouseIcon },
  { id: "status", title: "Betriebsstatus", description: "Anlagenzustand kompakt", icon: PulseIcon },
  { id: "reports", title: "Berichte", description: "Schicht- und Tagesberichte", icon: FilePdfIcon },
];

const defaultWidgets = ["production", "oee", "alarms", "performance"];

export function App() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [detail, setDetail] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [alarmAcknowledged, setAlarmAcknowledged] = useState(false);
  const [visibleWidgetIds, setVisibleWidgetIds] = useState(defaultWidgets);
  const [draggingWidgetId, setDraggingWidgetId] = useState(null);
  const [dragVisual, setDragVisual] = useState(null);
  const pressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const widgetSlotRefs = useRef(new Map());

  const closeDetail = () => setDetail(null);
  const toggleWidget = (id) => {
    setVisibleWidgetIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((widgetId) => widgetId !== id);
      }
      return current.length >= 4 ? current : [...current, id];
    });
  };
  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
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
    }, 560);
  };
  const handleTilePointerMove = (event) => {
    if (!isEditing || !draggingWidgetId) return;
    setDragVisual((current) => current ? {
      ...current,
      x: event.clientX - current.offsetX,
      y: event.clientY - current.offsetY,
    } : current);

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".widget-slot");
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
    if (draggingWidgetId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      const destination = widgetSlotRefs.current.get(draggingWidgetId)?.getBoundingClientRect();
      if (destination) {
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
      } else {
        setDraggingWidgetId(null);
        setDragVisual(null);
      }
    }
  };
  const handleTileClick = (id) => {
    if (isEditing || longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setDetail(id);
  };

  return (
    <main className={`prototype-shell${isEditing ? " is-editing" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="wordmark">WAR<span>A</span></span>
          <span className="product-name">MES Shopfloor</span>
        </div>

        <div className="page-heading">
          <h1>Dashboard</h1>
          <p>Produktion auf einen Blick</p>
        </div>

        <div className="topbar-actions">
          <div className="shift-status" aria-label="Aktive Schicht">
            <span className="live-dot" />
            <span>
              <strong>Frühschicht</strong>
              <small>06:00–14:00</small>
            </span>
          </div>
          <button
            className={isEditing ? "primary-action save" : "primary-action"}
            type="button"
            onClick={() => {
              setIsEditing((value) => !value);
              setDraggingWidgetId(null);
              setDragVisual(null);
            }}
            aria-pressed={isEditing}
          >
            {isEditing ? <FloppyDiskIcon size={24} weight="bold" /> : <PencilSimpleIcon size={24} weight="bold" />}
            {isEditing ? "Speichern" : "Bearbeiten"}
          </button>
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Dashboard-Kacheln">
        {visibleWidgetIds.map((id) => (
          <div
            className={`widget-slot${draggingWidgetId === id ? " is-placeholder" : ""}`}
            data-widget-id={id}
            key={id}
            ref={(element) => {
              if (element) widgetSlotRefs.current.set(id, element);
              else widgetSlotRefs.current.delete(id);
            }}
          >
            <WidgetTile
              id={id}
              alarmAcknowledged={alarmAcknowledged}
              isEditing={isEditing}
              isDragging={draggingWidgetId === id}
              onOpen={() => handleTileClick(id)}
              onPointerDown={(event) => handleTilePointerDown(id, event)}
              onPointerMove={handleTilePointerMove}
              onPointerUp={handleTilePointerEnd}
              onPointerCancel={handleTilePointerEnd}
            />
          </div>
        ))}
      </section>

      {dragVisual ? (
        <div
          className={`drag-preview${dragVisual.dropping ? " is-dropping" : ""}`}
          style={{
            left: dragVisual.x,
            top: dragVisual.y,
            width: dragVisual.width,
            height: dragVisual.height,
          }}
          aria-hidden="true"
        >
          <WidgetTile
            id={dragVisual.id}
            alarmAcknowledged={alarmAcknowledged}
            isEditing
            isDragging
            isGhost
          />
        </div>
      ) : null}

      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              type="button"
              key={item.id}
              className={active ? "is-active" : ""}
              onClick={() => {
                setActiveNav(item.id);
                if (item.id !== "dashboard") setDetail("nav");
              }}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={28} weight={active ? "fill" : "regular"} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {isEditing ? (
        <aside className="widget-editor" aria-label="Widgets bearbeiten">
          <header>
            <div>
              <span>Dashboard bearbeiten</span>
              <strong>Widgets</strong>
            </div>
            <span className="widget-count">{visibleWidgetIds.length}/4</span>
          </header>
          <p>Halte und ziehe eine Kachel, um sie anzuordnen. Entferne eine Kachel, um ein anderes Widget hinzuzufügen.</p>
          <div className="widget-catalog">
            {widgetCatalog.map((widget) => {
              const Icon = widget.icon;
              const selected = visibleWidgetIds.includes(widget.id);
              const disabled = !selected && visibleWidgetIds.length >= 4;
              return (
                <button
                  type="button"
                  key={widget.id}
                  className={selected ? "is-selected" : ""}
                  onClick={() => toggleWidget(widget.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                >
                  <span className="catalog-icon"><Icon size={22} weight="duotone" /></span>
                  <span>
                    <strong>{widget.title}</strong>
                    <small>{widget.description}</small>
                  </span>
                  {selected
                    ? <MinusCircleIcon size={25} weight="fill" />
                    : <PlusCircleIcon size={25} weight="fill" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="reset-widgets" onClick={() => setVisibleWidgetIds(defaultWidgets)}>
            Standard wiederherstellen
          </button>
        </aside>
      ) : null}

      {detail ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeDetail}>
          <section
            className="detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>Dashboard</span>
                <h2 id="detail-title">{dialogTitle(detail)}</h2>
              </div>
              <button type="button" onClick={closeDetail} aria-label="Dialog schließen">
                <XIcon size={26} />
              </button>
            </header>
            <div className="dialog-body">
              {detail === "alarms" ? (
                <>
                  <article className="alarm-row">
                    <span className="severity critical">Kritisch</span>
                    <div>
                      <strong>S20 · Mischdruck zu hoch</strong>
                      <small>Seit 2 Minuten aktiv</small>
                    </div>
                  </article>
                  <article className="alarm-row">
                    <span className="severity warning">Warnung</span>
                    <div>
                      <strong>S40 · Materialvorrat prüfen</strong>
                      <small>Seit 8 Minuten aktiv</small>
                    </div>
                  </article>
                  <button
                    type="button"
                    className="dialog-primary"
                    onClick={() => {
                      setAlarmAcknowledged(true);
                      closeDetail();
                    }}
                  >
                    Alarm quittieren
                  </button>
                </>
              ) : (
                <div className="dialog-placeholder">
                  <CheckCircleIcon size={42} weight="duotone" />
                  <strong>{dialogCopy(detail)}</strong>
                  <span>Dies ist ein interaktiver HTML-Prototyp ohne Live-Daten.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function WidgetTile({
  id,
  alarmAcknowledged,
  isEditing,
  isDragging,
  isGhost = false,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) {
  const interactionProps = {
    type: "button",
    onClick: isGhost ? undefined : onOpen,
    onPointerDown: isGhost ? undefined : onPointerDown,
    onPointerMove: isGhost ? undefined : onPointerMove,
    onPointerUp: isGhost ? undefined : onPointerUp,
    onPointerCancel: isGhost ? undefined : onPointerCancel,
    "aria-label": isEditing ? `${widgetTitle(id)} verschieben` : undefined,
    tabIndex: isGhost ? -1 : undefined,
    className: `dashboard-tile ${id}-tile${isDragging ? " is-dragging" : ""}${isGhost ? " is-ghost" : ""}`,
  };

  if (id === "production") {
    return (
      <button {...interactionProps}>
        <TileHeading icon={FactoryIcon} title="Produktionsfluss" />
        <div className="station-flow">
          {stations.map((station, index) => (
            <div className="station-step" key={station}>
              <span className="station-node">
                <CheckCircleIcon size={26} weight="fill" />
                <strong>{station}</strong>
              </span>
              {index < stations.length - 1 ? <span className="station-line" /> : null}
            </div>
          ))}
        </div>
        <div className="tile-summary positive">
          <span className="summary-dot" />
          <strong>4 Stationen laufen</strong>
          <span>Linie A</span>
        </div>
      </button>
    );
  }

  if (id === "oee") {
    return (
      <button {...interactionProps}>
        <TileHeading icon={GaugeIcon} title="OEE Live-Score" />
        <div className="oee-content">
          <div className="oee-ring" aria-label="OEE 87,4 Prozent">
            <strong>87,4<span>%</span></strong>
          </div>
          <div className="oee-state">
            <span className="positive-label">Im Zielbereich</span>
            <small>Zielwert 85 %</small>
          </div>
        </div>
      </button>
    );
  }

  if (id === "alarms") {
    return (
      <button {...interactionProps}>
        <TileHeading icon={BellSimpleIcon} title="Aktive Alarme" tone="danger" />
        <div className="alarm-content">
          <BellSimpleIcon size={74} weight="duotone" />
          <div>
            <strong className="big-value">{alarmAcknowledged ? "1" : "2"}</strong>
            <span>{alarmAcknowledged ? "Ein Alarm verbleibt" : "Handlung erforderlich"}</span>
          </div>
        </div>
        <div className="alarm-priority">
          <span>1 kritisch</span>
          <span>1 Warnung</span>
        </div>
      </button>
    );
  }

  if (id === "performance") {
    return (
      <button {...interactionProps}>
        <TileHeading icon={HouseIcon} title="Leistung" />
        <div className="performance-values">
          <Metric value="48" unit="/h" label="Durchsatz" />
          <Metric value="98,7" unit="%" label="Yield" />
        </div>
        <div className="target-line">
          <span>Schichtziel</span>
          <div><i style={{ width: "82%" }} /></div>
          <strong>82 %</strong>
        </div>
      </button>
    );
  }

  if (id === "status") {
    return (
      <button {...interactionProps}>
        <TileHeading icon={PulseIcon} title="Betriebsstatus" />
        <div className="status-content">
          <span className="status-symbol"><CheckCircleIcon size={82} weight="duotone" /></span>
          <div>
            <strong>Normalbetrieb</strong>
            <span>Alle Systeme laufen im Sollbereich</span>
          </div>
        </div>
        <div className="status-breakdown">
          <span><i className="green" />4 online</span>
          <span><i className="yellow" />0 Wartung</span>
          <span><i className="gray" />0 offline</span>
        </div>
      </button>
    );
  }

  return (
    <button {...interactionProps}>
      <TileHeading icon={FilePdfIcon} title="Berichte" />
      <div className="reports-content">
        <div>
          <FilePdfIcon size={52} weight="duotone" />
          <span><strong>Schichtbericht</strong><small>Heute, 14:00 Uhr</small></span>
        </div>
        <div>
          <FilePdfIcon size={52} weight="duotone" />
          <span><strong>Tagesbericht</strong><small>Heute, 22:00 Uhr</small></span>
        </div>
      </div>
      <div className="reports-summary">2 Berichte bereit</div>
    </button>
  );
}

function widgetTitle(id) {
  return widgetCatalog.find((widget) => widget.id === id)?.title || "Widget";
}

function TileHeading({ icon: Icon, title, tone = "default" }) {
  return (
    <div className="tile-heading">
      <span className={`tile-icon ${tone}`}><Icon size={25} weight="duotone" /></span>
      <h2>{title}</h2>
    </div>
  );
}

function Metric({ value, unit, label }) {
  return (
    <div className="metric">
      <strong>{value}<small>{unit}</small></strong>
      <span>{label}</span>
    </div>
  );
}

function dialogTitle(detail) {
  return {
    production: "Produktionsfluss",
    oee: "OEE Live-Score",
    alarms: "Aktive Alarme",
    performance: "Leistung",
    status: "Betriebsstatus",
    reports: "Berichte",
    nav: "Bereich wechseln",
  }[detail];
}

function dialogCopy(detail) {
  return {
    production: "Alle vier Stationen sind verbunden und produzieren.",
    oee: "Der aktuelle OEE liegt 2,4 Prozentpunkte über dem Zielwert.",
    performance: "Durchsatz und Yield liegen innerhalb der Schichtziele.",
    status: "Die Anlage befindet sich im Normalbetrieb.",
    reports: "Schicht- und Tagesberichte stehen als PDF bereit.",
    nav: "Die gewählte Navigation würde im Produkt zur entsprechenden Ansicht führen.",
  }[detail];
}
