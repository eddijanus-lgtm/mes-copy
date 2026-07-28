import Button from "../components/Button.jsx";
import FormField from "../components/FormField.jsx";
import Panel from "../components/Panel.jsx";

export default {
  title: "Komponenten/Formularfeld",
  component: FormField,
};

export const Textfeld = {
  render: () => (
    <Panel padded className="ds-story-form">
      <FormField label="Maschinenname" hint="Eindeutige Bezeichnung im MES" required>
        <input placeholder="z. B. Servo-Presse 01" />
      </FormField>
    </Panel>
  ),
};

export const Fehlerzustand = {
  render: () => (
    <Panel padded>
      <FormField label="Maschinenname" error="Bitte einen Namen eingeben" required>
        <input defaultValue="" />
      </FormField>
    </Panel>
  ),
};

export const Formularmuster = {
  render: () => (
    <Panel title="Maschine anlegen" description="Manuellen Maschineneintrag erstellen">
      <form style={{ display: "grid", width: 440, gap: 16 }}>
        <FormField label="Name" required><input /></FormField>
        <FormField label="Typ"><select defaultValue="CNC"><option>CNC</option><option>Montage</option></select></FormField>
        <FormField label="Standort"><input /></FormField>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary">Abbrechen</Button>
          <Button type="submit">Anlegen</Button>
        </div>
      </form>
    </Panel>
  ),
};
