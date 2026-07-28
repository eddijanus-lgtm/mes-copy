import { useState } from "react";
import { I18nProvider } from "../../i18n/I18nProvider.jsx";
import NotificationsWorkspace from "./NotificationsWorkspace.jsx";

const sampleRules = [
  {
    id: "rule-1",
    name: "Temperaturgrenze Dosierung",
    severity: "critical",
    condition: "temperature >= 80",
    is_active: true,
  },
  {
    id: "rule-2",
    name: "Druckabfall Zuführung",
    severity: "warning",
    condition: "pressure < 4.2",
    is_active: true,
  },
  {
    id: "rule-3",
    name: "Wartungsfenster",
    severity: "info",
    condition: "runtime_hours >= 500",
    is_active: false,
  },
];

const sampleHistory = [
  {
    id: "history-1",
    severity: "critical",
    message: "Temperaturgrenze an Station Dosieren überschritten",
    machine_id: "dose-01",
    delivered: true,
    created_at: "2026-07-28T14:32:00.000Z",
  },
  {
    id: "history-2",
    severity: "warning",
    message: "Druck an Station Zuführen unter Grenzwert",
    machine_id: "feed-01",
    delivered: false,
    created_at: "2026-07-28T14:16:00.000Z",
  },
];

const sampleChannels = [
  { id: "channel-1", channel: "mqtt", enabled: true },
  { id: "channel-2", channel: "websocket", enabled: true },
  { id: "channel-3", channel: "email", enabled: false },
];

function StoryState({ empty = false, initialTab = "rules", loading = false }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [rules, setRules] = useState(empty ? [] : sampleRules);
  const [channels, setChannels] = useState(empty ? [] : sampleChannels);

  return (
    <I18nProvider>
      <NotificationsWorkspace
        activeTab={activeTab}
        channels={channels}
        history={empty ? [] : sampleHistory}
        loading={loading}
        onCreateChannel={async (channel) => {
          setChannels((current) => [...current, { ...channel, id: `channel-${current.length + 1}` }]);
        }}
        onCreateRule={async (rule) => {
          setRules((current) => [...current, { ...rule, id: `rule-${current.length + 1}`, is_active: true }]);
        }}
        onDeleteRule={async (id) => setRules((current) => current.filter((rule) => rule.id !== id))}
        onTabChange={setActiveTab}
        onToggleRule={async (id) => setRules((current) => current.map((rule) => (
          rule.id === id ? { ...rule, is_active: !rule.is_active } : rule
        )))}
        rules={rules}
        stats={empty ? { total: 0, active: 0, firing: 0 } : { total: 3, active: 2, firing: 1 }}
      />
    </I18nProvider>
  );
}

export default {
  title: "MES-Seiten/Benachrichtigungen",
  component: NotificationsWorkspace,
  parameters: { layout: "fullscreen" },
};

export const AlertRegeln = {
  render: () => <StoryState />,
};

export const Verlauf = {
  render: () => <StoryState initialTab="history" />,
};

export const LeererZustand = {
  render: () => <StoryState empty />,
};

export const Laden = {
  render: () => <StoryState loading />,
};
