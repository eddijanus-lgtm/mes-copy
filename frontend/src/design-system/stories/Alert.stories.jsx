import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { InfoIcon } from "@phosphor-icons/react/Info";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import Alert from "../components/Alert.jsx";

export default {
  title: "Komponenten/Hinweis",
  component: Alert,
};

export const Varianten = {
  render: () => (
    <div style={{ display: "grid", width: 620, gap: 12 }}>
      <Alert tone="info" icon={<InfoIcon size={20} />}>Die Verbindung wird geprüft.</Alert>
      <Alert tone="success" icon={<CheckCircleIcon size={20} />}>Maschine wurde erfolgreich angelegt.</Alert>
      <Alert tone="warning" icon={<WarningCircleIcon size={20} />}>Aktuell werden keine Live-Daten empfangen.</Alert>
      <Alert tone="danger" icon={<WarningCircleIcon size={20} />}>Die Verbindung zur Maschine ist fehlgeschlagen.</Alert>
    </div>
  ),
};
