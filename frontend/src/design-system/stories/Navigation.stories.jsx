import { useState } from "react";
import Tabs from "../components/Tabs.jsx";

function TabsExample() {
  const [value, setValue] = useState("overview");
  return (
    <Tabs
      ariaLabel="Maschinendaten"
      value={value}
      onChange={setValue}
      items={[
        { value: "overview", label: "Übersicht" },
        { value: "signals", label: "Signale" },
        { value: "routing", label: "Routing" },
      ]}
    />
  );
}

export default {
  title: "Komponenten/Tabs",
  component: Tabs,
};

export const Interaktiv = {
  render: () => <TabsExample />,
};
