import { useCallback, useMemo, useState } from "react";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { XIcon } from "@phosphor-icons/react/X";
import PageInfo from "../components/PageInfo.jsx";
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import WidgetCatalog from "../components/dashboard/WidgetCatalog.jsx";
import WidgetFrame from "../components/dashboard/WidgetFrame.jsx";
import {
  HistoricalTrendsWidget,
  MetricWidget,
  OeeWidget,
  ProductionFlowWidget,
  ReportsWidget,
  StatusWidget,
} from "../components/dashboard/DashboardWidgets.jsx";
import { WIDGET_BY_ID } from "../dashboard/dashboardConfig.js";
import { useDashboardData } from "../dashboard/useDashboardData.js";
import { useDashboardLayouts } from "../dashboard/useDashboardLayouts.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import "./dashboard.css";

const BREAKPOINTS = { lg: 1200, md: 900, sm: 600, xs: 360, xxs: 0 };
const COLUMNS = { lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 };

export default function Dashboard() {
  const { token, user } = useAuth();
  const dashboardData = useDashboardData(token);
  const layoutState = useDashboardLayouts(user);
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });
  const [activeBreakpoint, setActiveBreakpoint] = useState("lg");

  const commitCurrentLayout = useCallback((layout) => {
    if (layoutState.isEditing) {
      layoutState.updateLayout(activeBreakpoint, layout);
    }
  }, [activeBreakpoint, layoutState.isEditing, layoutState.updateLayout]);

  const visibleWidgets = useMemo(
    () => Array.from(layoutState.visibleWidgetIds)
      .map((id) => WIDGET_BY_ID[id])
      .filter(Boolean),
    [layoutState.visibleWidgetIds],
  );

  return (
    <div className={`dashboard-page ${layoutState.isEditing ? "is-editing" : ""}`}>
      <DashboardHeader layoutState={layoutState} />

      <div className="dashboard-workspace">
        {layoutState.isEditing ? (
          <WidgetCatalog
            visibleWidgetIds={layoutState.visibleWidgetIds}
            onToggle={layoutState.toggleWidget}
            onClose={layoutState.cancelEditing}
          />
        ) : null}

        <div className="dashboard-grid-shell" ref={containerRef}>
          {mounted ? (
            <ResponsiveGridLayout
              width={width}
              layouts={layoutState.profile.layouts}
              breakpoints={BREAKPOINTS}
              cols={COLUMNS}
              rowHeight={56}
              margin={[16, 16]}
              containerPadding={[0, 0]}
              dragConfig={{
                enabled: layoutState.isEditing,
                bounded: true,
                handle: ".dashboard-widget__drag",
              }}
              resizeConfig={{ enabled: layoutState.isEditing, handles: ["se"] }}
              onBreakpointChange={setActiveBreakpoint}
              onDragStop={commitCurrentLayout}
              onResizeStop={commitCurrentLayout}
            >
              {visibleWidgets.map((definition) => (
                <div key={definition.id}>
                  <WidgetFrame
                    definition={definition}
                    isEditing={layoutState.isEditing}
                    onHide={() => layoutState.toggleWidget(definition.id)}
                    className={`dashboard-widget--${definition.id}`}
                  >
                    <WidgetContent id={definition.id} dashboardData={dashboardData} />
                  </WidgetFrame>
                </div>
              ))}
            </ResponsiveGridLayout>
          ) : (
            <div className="dashboard-grid-loading">Dashboard wird vorbereitet…</div>
          )}
        </div>
      </div>

      <p className="dashboard-layout-hint">
        <SlidersHorizontalIcon size={17} aria-hidden="true" />
        Widgets können im Bearbeitungsmodus verschoben, skaliert und ausgeblendet werden.
      </p>
    </div>
  );
}

function DashboardHeader({ layoutState }) {
  return (
    <header className="dashboard-page__header">
      <div>
        <div className="mes-title-row">
          <h1>{layoutState.profiles[layoutState.activeProfileId]?.name || "Leitstand"}</h1>
          <PageInfo page="dashboard" />
        </div>
        <p>Produktion, Kennzahlen und Anlagenstatus auf einen Blick.</p>
      </div>

      <div className="dashboard-page__controls">
        <label>
          <span>Ansicht</span>
          <select
            value={layoutState.activeProfileId}
            onChange={(event) => layoutState.selectProfile(event.target.value)}
            disabled={layoutState.isEditing}
          >
            {Object.values(layoutState.profiles).map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>

        {layoutState.isEditing ? (
          <>
            <button type="button" className="dashboard-button secondary" onClick={layoutState.resetDraft}>
              Zurücksetzen
            </button>
            <button type="button" className="dashboard-button secondary" onClick={layoutState.cancelEditing}>
              <XIcon size={18} /> Abbrechen
            </button>
            <button type="button" className="dashboard-button primary" onClick={layoutState.saveEditing}>
              <FloppyDiskIcon size={18} /> Speichern
            </button>
          </>
        ) : (
          <button type="button" className="dashboard-button primary" onClick={layoutState.startEditing}>
            <PencilSimpleIcon size={18} /> Dashboard bearbeiten
          </button>
        )}
      </div>
    </header>
  );
}

function WidgetContent({ id, dashboardData }) {
  const { machines, carriers, kpis, stats, connectedMachineCount, isLoading } = dashboardData;

  if (isLoading && id !== "reports") {
    return <div className="widget-loading">Live-Daten werden geladen…</div>;
  }

  switch (id) {
    case "production-flow":
      return (
        <ProductionFlowWidget
          machines={machines}
          carriers={carriers}
          kpis={kpis}
          health={stats.health}
        />
      );
    case "oee":
      return <OeeWidget kpis={kpis} />;
    case "status":
      return <StatusWidget kpis={kpis} />;
    case "connected":
      return <MetricWidget type="connected" value={connectedMachineCount} />;
    case "alarms":
      return <MetricWidget type="alarms" value={stats.alarms} />;
    case "throughput":
      return <MetricWidget type="throughput" value={formatNumber(kpis?.throughput?.unitsPerHour)} />;
    case "yield":
      return <MetricWidget type="yield" value={formatNumber(kpis?.yield ?? kpis?.oee?.quality)} />;
    case "trends":
      return <HistoricalTrendsWidget machines={machines} />;
    case "reports":
      return <ReportsWidget dashboardData={dashboardData} />;
    default:
      return null;
  }
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "–";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(number)
    : "–";
}
