import { PlusIcon } from "@phosphor-icons/react/Plus";
import Button from "../components/Button.jsx";

export default {
  title: "Komponenten/Button",
  component: Button,
  args: {
    children: "Maschine anlegen",
    variant: "primary",
    size: "md",
    disabled: false,
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "touch"],
    },
  },
};

export const Primär = {};

export const Sekundär = {
  args: { variant: "secondary", children: "Abbrechen" },
};

export const MitIcon = {
  args: { icon: <PlusIcon size={17} weight="bold" /> },
};

export const Touch = {
  args: { size: "touch", icon: <PlusIcon size={20} weight="bold" /> },
};

export const Varianten = {
  render: () => (
    <div className="ds-story-stack">
      <Button variant="primary">Speichern</Button>
      <Button variant="secondary">Abbrechen</Button>
      <Button variant="ghost">Details</Button>
      <Button variant="danger">Löschen</Button>
      <Button disabled>Nicht verfügbar</Button>
    </div>
  ),
};
