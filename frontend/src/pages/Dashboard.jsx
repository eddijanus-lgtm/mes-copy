import { useCallback, useMemo, useState } from "react";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/SlidersHorizontal";
import { XIcon } from "@phosphor-icons/react/X";
import PageInfo from "../components/PageInfo.jsx";
import Button from "../design-system/components/Button.jsx";
import PageHeader from "../design-system/components/PageHeader.jsx";
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import WidgetCatalog from "../components/dashboard/WidgetCatalog.jsx";
import WidgetFrame from "../components/dashboard/WidgetFrame.jsx";
import TabletDashboard from "../components/dashboard/TabletDashboard.jsx";
import SmartphoneDashboard from "../components/dashboard/SmartphoneDashboard.jsx";
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
import { useSmartphoneMode, useTabletMode } from "../hooks/useTabletMode.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import "./dashboard.css";

const BREAKPOINTS = { lg: 1200, md: 900, sm: 600, xs: 360, xxs: 0 };
const COLUMNS = { lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 };

export default function Dashboard() {
  const { token, user } = useAuth();
  const dashboardData = useDashboardData(token);
  const layoutState = useDashboardLayouts(user);
  const isTabletMode = useTabletMode();
  const isSmartphoneMode = useSmartphoneMode();

  if (isSmartphoneMode) {
    return <SmartphoneDashboard dashboardData={dashboardData} />;
  }
  if (isTabletMode) {
    return <TabletDashboard dashboardData={dashboardData} user={user} />;
  }

  return <DesktopDashboard dashboardData={dashboardData} layoutState={layoutState} />;
}

function DesktopDashboard({ dashboardData, layoutState }) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });
  const { t } = useTranslation();
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
            <div className="dashboard-grid-loading">{t("dashboard.loading")}</div>
          )}
        </div>
      </div>

      <p className="dashboard-layout-hint">
        <SlidersHorizontalIcon size={17} aria-hidden="true" />
        {t("dashboard.hint")}
      </p>
    </div>
  );
}

function DashboardHeader({ layoutState }) {
  const { t } = useTranslation();
  return (
    <PageHeader
      className="dashboard-page__header"
      title={layoutState.profiles[layoutState.activeProfileId]?.name || t("dashboard.title")}
      description={t("dashboard.subtitle")}
      titleAccessory={<PageInfo page="dashboard" />}
      actions={(
        <div className="dashboard-page__controls">
          <label>
            <span>{t("dashboard.view")}</span>
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
              <Button variant="secondary" onClick={layoutState.resetDraft}>
                {t("dashboard.reset")}
              </Button>
              <Button variant="secondary" icon={<XIcon size={18} />} onClick={layoutState.cancelEditing}>
                {t("dashboard.cancel")}
              </Button>
              <Button icon={<FloppyDiskIcon size={18} />} onClick={layoutState.saveEditing}>
                {t("dashboard.save")}
              </Button>
            </>
          ) : (
            <Button icon={<PencilSimpleIcon size={18} />} onClick={layoutState.startEditing}>
              {t("dashboard.edit")}
            </Button>
          )}
        </div>
      )}
    />
  );
}

function WidgetContent({ id, dashboardData }) {
  const { t } = useTranslation();
  const { machines, carriers, kpis, stats, connectedMachineCount, isLoading } = dashboardData;

  if (isLoading && id !== "reports") {
    return <div className="widget-loading">{t("dashboard.widget_loading")}</div>;
  }

  switch (id) {
    case "production-flow":
      return (
        <ProductionFlowWidget
          machines={machines}
          carriers={carriers}
          kpis={kpis}
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
