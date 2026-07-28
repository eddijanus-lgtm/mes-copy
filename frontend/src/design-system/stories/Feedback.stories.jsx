import { FactoryIcon } from "@phosphor-icons/react/Factory";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import Button from "../components/Button.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Panel from "../components/Panel.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default {
  title: "Komponenten/Status und Leerzustände",
};

export const Statusvarianten = {
  render: () => (
    <div className="ds-story-stack">
      <StatusBadge tone="success">Online</StatusBadge>
      <StatusBadge tone="info">Bereit</StatusBadge>
      <StatusBadge tone="warning">Wartung</StatusBadge>
      <StatusBadge tone="danger">Störung</StatusBadge>
      <StatusBadge>Offline</StatusBadge>
    </div>
  ),
};

export const KeineStationen = {
  render: () => (
    <Panel style={{ width: 620 }}>
      <EmptyState
        icon={<FactoryIcon size={42} weight="duotone" />}
        title="Keine Stationen verbunden"
        description="Drei Stationen sind konfiguriert, liefern aber aktuell keine frische Telemetrie."
        action={<Button icon={<PlusIcon size={17} weight="bold" />}>Maschine anlegen</Button>}
      />
    </Panel>
  ),
};
