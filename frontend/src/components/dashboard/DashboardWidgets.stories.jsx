import {
  OeeWidget,
  ProductionFlowWidget,
  StatusWidget,
} from "./DashboardWidgets.jsx";

const offlineMachines = [
  { id: 71, resource_id: 71, name: "S71 Materialzuführung", route_sequence: 1, routing_enabled: true, live_connected: false },
  { id: 72, resource_id: 72, name: "S72 Servo-Pressstation", route_sequence: 2, routing_enabled: true, live_connected: false },
  { id: 73, resource_id: 73, name: "S73 Qualitätsprüfung", route_sequence: 3, routing_enabled: true, live_connected: false },
];

const onlineMachines = offlineMachines.map((machine) => ({
  ...machine,
  live_connected: true,
  effective_status: "online",
}));

export default {
  title: "Dashboard/Widgets",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 900, minHeight: 380, padding: 24 }}>
        <section className="dashboard-widget" style={{ minHeight: 340 }}>
          <div className="dashboard-widget__body" style={{ minHeight: 280 }}>
            <Story />
          </div>
        </section>
      </div>
    ),
  ],
};

export const ProduktionsflussOffline = {
  render: () => <ProductionFlowWidget machines={offlineMachines} carriers={[]} kpis={{ oee: {} }} />,
};

export const ProduktionsflussOnline = {
  render: () => (
    <ProductionFlowWidget
      machines={onlineMachines}
      carriers={[{ id: 1, carrier_number: 1, current_resource_id: 72, status: "processing" }]}
      kpis={{ oee: { total: 87.4 } }}
    />
  ),
};

export const OeeOhneLiveDaten = {
  render: () => <OeeWidget kpis={{ oee: { total: null, availability: null, performance: null, quality: null } }} />,
};

export const BetriebsstatusOffline = {
  render: () => <StatusWidget kpis={{ machines: { status: { online: 0, idle: 0, error: 0, maintenance: 0, offline: 5 } } }} />,
};
