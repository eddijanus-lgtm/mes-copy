import Button from "../components/Button.jsx";
import FormField from "../components/FormField.jsx";
import Modal from "../components/Modal.jsx";

export default {
  title: "Komponenten/Dialog",
  component: Modal,
  parameters: {
    layout: "fullscreen",
  },
};

export const MaschineAnlegen = {
  render: () => (
    <Modal isOpen title="Maschine anlegen" onClose={() => {}}>
      <form style={{ display: "grid", gap: 16 }}>
        <FormField label="Name" required><input /></FormField>
        <FormField label="Typ"><select defaultValue="CNC"><option>CNC</option><option>Montage</option></select></FormField>
        <FormField label="Standort"><input /></FormField>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary">Abbrechen</Button>
          <Button type="submit">Anlegen</Button>
        </div>
      </form>
    </Modal>
  ),
};
