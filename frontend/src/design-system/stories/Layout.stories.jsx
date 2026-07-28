import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { StackIcon } from "@phosphor-icons/react/Stack";
import Button from "../components/Button.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Panel from "../components/Panel.jsx";
import StatCard from "../components/StatCard.jsx";

export default {
  title: "Muster/Seitenaufbau",
};

export const Seitenkopf = {
  render: () => (
    <div style={{ width: "min(960px, calc(100vw - 64px))" }}>
      <PageHeader
        title="Maschinen"
        description="Maschinen, Work Units und Komponenten in ihrer tatsächlichen Hierarchie."
        actions={(
          <>
            <Button variant="secondary">Vorlage laden</Button>
            <Button icon={<GearSixIcon size={17} />}>Maschine konfigurieren</Button>
          </>
        )}
      />
    </div>
  ),
};

export const Kennzahlen = {
  render: () => (
    <div className="ds-story-grid">
      <StatCard label="Maschinen" value="5" icon={<StackIcon size={24} />} />
      <StatCard label="Work Units" value="3" icon={<StackIcon size={24} />} />
      <StatCard label="Offline" value="5" icon={<StackIcon size={24} />} />
    </div>
  ),
};

export const PanelMitKopf = {
  render: () => (
    <div style={{ width: "min(760px, calc(100vw - 64px))" }}>
      <Panel
        title="Betriebsstatus"
        description="Status der gesamten Anlage"
        actions={<Button variant="ghost" size="sm">Details</Button>}
      >
        Inhalt des Funktionsbereichs
      </Panel>
    </div>
  ),
};
