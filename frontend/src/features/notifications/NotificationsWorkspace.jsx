import { useState } from "react";
import { BellRingingIcon } from "@phosphor-icons/react/BellRinging";
import { BellSlashIcon } from "@phosphor-icons/react/BellSlash";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { ListChecksIcon } from "@phosphor-icons/react/ListChecks";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import PageInfo from "../../components/PageInfo.jsx";
import Alert from "../../design-system/components/Alert.jsx";
import Button from "../../design-system/components/Button.jsx";
import DataTable from "../../design-system/components/DataTable.jsx";
import EmptyState from "../../design-system/components/EmptyState.jsx";
import FormField from "../../design-system/components/FormField.jsx";
import Modal from "../../design-system/components/Modal.jsx";
import PageHeader from "../../design-system/components/PageHeader.jsx";
import Panel from "../../design-system/components/Panel.jsx";
import StatCard from "../../design-system/components/StatCard.jsx";
import StatusBadge from "../../design-system/components/StatusBadge.jsx";
import Tabs from "../../design-system/components/Tabs.jsx";
import Toolbar from "../../design-system/components/Toolbar.jsx";
import { useTranslation } from "../../i18n/I18nProvider.jsx";
import "./notifications.css";

const EMPTY_RULE = {
  name: "",
  severity: "warning",
  condition: "",
  message_template: "{machine_id}: {value}",
  channels: "mqtt,websocket",
  machine_id: "",
};

const RULE_COLUMNS = [
  { key: "name", labelKey: "notifications.name" },
  { key: "severity", labelKey: "notifications.severity" },
  { key: "status", labelKey: "notifications.status" },
  { key: "condition", labelKey: "notifications.condition" },
  { key: "actions", labelKey: "notifications.actions", hiddenLabel: true, align: "end" },
];

const CHANNEL_COLUMNS = [
  { key: "channel", labelKey: "notifications.channel" },
  { key: "status", labelKey: "notifications.status" },
];

function severityTone(severity) {
  const value = (severity || "").toLowerCase();
  if (value === "info") return "info";
  if (value === "warning") return "warning";
  if (value === "error" || value === "critical") return "danger";
  return "neutral";
}

export default function NotificationsWorkspace({
  activeTab,
  channels,
  history,
  loading,
  onCreateChannel,
  onCreateRule,
  onDeleteRule,
  onTabChange,
  onToggleRule,
  rules,
  stats,
}) {
  const { t } = useTranslation();
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [newRule, setNewRule] = useState(EMPTY_RULE);
  const [channelForm, setChannelForm] = useState({ channel: "email", enabled: true });
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const tabs = [
    { value: "rules", label: t("notifications.alert_rules") },
    { value: "history", label: t("notifications.history") },
    { value: "channels", label: t("notifications.channels") },
  ];

  async function runAction(action) {
    setSaving(true);
    setActionError("");
    try {
      await action();
      return true;
    } catch {
      setActionError(t("notifications.action_failed"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitRule(event) {
    event.preventDefault();
    const channelsList = newRule.channels
      .split(",")
      .map((channel) => channel.trim())
      .filter(Boolean);
    const succeeded = await runAction(() => onCreateRule({ ...newRule, channels: channelsList }));
    if (succeeded) {
      setNewRule(EMPTY_RULE);
      setShowRuleForm(false);
    }
  }

  async function submitChannel(event) {
    event.preventDefault();
    await runAction(() => onCreateChannel(channelForm));
  }

  async function confirmDelete() {
    const succeeded = await runAction(() => onDeleteRule(deleteCandidate.id));
    if (succeeded) setDeleteCandidate(null);
  }

  return (
    <div className="mes-page notifications-page">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.subtitle")}
        titleAccessory={<PageInfo page="notifications" />}
      />

      {stats ? (
        <section className="notifications-metrics" aria-label={t("notifications.metrics")}>
          <StatCard label={t("notifications.total_rules")} value={stats.total} icon={<ListChecksIcon size={24} />} />
          <StatCard label={t("notifications.active_count")} value={stats.active} tone="success" icon={<CheckCircleIcon size={24} />} />
          <StatCard label={t("notifications.firing_count")} value={stats.firing} tone="danger" icon={<WarningCircleIcon size={24} />} />
        </section>
      ) : null}

      <div className="notifications-navigation">
        <Tabs ariaLabel={t("notifications.title")} value={activeTab} onChange={onTabChange} items={tabs} />
      </div>

      {actionError ? <Alert tone="danger" icon={<WarningCircleIcon size={19} />}>{actionError}</Alert> : null}
      {loading ? <div className="mes-page-loading">{t("common.loading")}</div> : null}

      {!loading && activeTab === "rules" ? (
        <RulesPanel
          rules={rules}
          showForm={showRuleForm}
          setShowForm={setShowRuleForm}
          form={newRule}
          setForm={setNewRule}
          saving={saving}
          t={t}
          onSubmit={submitRule}
          onToggle={async (id) => runAction(() => onToggleRule(id))}
          onDelete={setDeleteCandidate}
        />
      ) : null}

      {!loading && activeTab === "history" ? <HistoryPanel history={history} t={t} /> : null}
      {!loading && activeTab === "channels" ? (
        <ChannelsPanel
          channels={channels}
          form={channelForm}
          setForm={setChannelForm}
          saving={saving}
          t={t}
          onSubmit={submitChannel}
        />
      ) : null}

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title={t("notifications.delete_rule_title")}
      >
        <p className="notifications-dialog-copy">
          {t("notifications.delete_rule_confirm")}: <strong>{deleteCandidate?.name}</strong>
        </p>
        <Toolbar className="notifications-dialog-actions">
          <Button variant="secondary" onClick={() => setDeleteCandidate(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" disabled={saving} onClick={confirmDelete}>{t("notifications.delete_rule_confirm")}</Button>
        </Toolbar>
      </Modal>
    </div>
  );
}

function RulesPanel({ form, onDelete, onSubmit, onToggle, rules, saving, setForm, setShowForm, showForm, t }) {
  const columns = RULE_COLUMNS.map((column) => ({ ...column, label: t(column.labelKey) }));
  return (
    <section className="notifications-section">
      <Toolbar>
        <Button icon={<PlusIcon size={17} weight="bold" />} onClick={() => setShowForm(!showForm)}>
          {t("notifications.new_rule")}
        </Button>
      </Toolbar>

      {showForm ? (
        <Panel title={t("notifications.new_rule")} description={t("notifications.rule_form_help")}>
          <form className="notifications-form" onSubmit={onSubmit}>
            <FormField label={t("notifications.rule_name")} required>
              <input value={form.name} placeholder={t("notifications.placeholder_name")} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </FormField>
            <FormField label={t("notifications.severity")}>
              <select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}>
                {["info", "warning", "error", "critical"].map((severity) => <option key={severity}>{severity}</option>)}
              </select>
            </FormField>
            <FormField label={t("notifications.condition")} required hint={t("notifications.condition_help")}>
              <input value={form.condition} placeholder={t("notifications.placeholder_condition")} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} />
            </FormField>
            <FormField label={t("notifications.machine_uuid")} hint={t("notifications.placeholder_optional")}>
              <input value={form.machine_id} onChange={(event) => setForm((current) => ({ ...current, machine_id: event.target.value }))} />
            </FormField>
            <FormField label={t("notifications.msg_template")} required>
              <input value={form.message_template} placeholder={t("notifications.placeholder_message")} onChange={(event) => setForm((current) => ({ ...current, message_template: event.target.value }))} />
            </FormField>
            <FormField label={t("notifications.channels_label")} hint={t("notifications.channels_help")}>
              <input value={form.channels} placeholder={t("notifications.placeholder_channels")} onChange={(event) => setForm((current) => ({ ...current, channels: event.target.value }))} />
            </FormField>
            <Toolbar className="notifications-form__actions">
              <Button variant="secondary" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={saving}>{t("common.create")}</Button>
            </Toolbar>
          </form>
        </Panel>
      ) : null}

      <DataTable
        ariaLabel={t("notifications.alert_rules")}
        columns={columns}
        rows={rules}
        empty={(
          <Panel>
            <EmptyState
              icon={<BellSlashIcon size={42} weight="duotone" />}
              title={t("notifications.no_rules_title")}
              description={t("notifications.no_rules")}
              action={<Button icon={<PlusIcon size={17} />} onClick={() => setShowForm(true)}>{t("notifications.new_rule")}</Button>}
            />
          </Panel>
        )}
        renderCell={(rule, column) => {
          if (column.key === "severity") return <StatusBadge tone={severityTone(rule.severity)}>{rule.severity}</StatusBadge>;
          if (column.key === "status") return <StatusBadge tone={rule.is_active ? "success" : "neutral"}>{rule.is_active ? t("common.active") : t("common.inactive")}</StatusBadge>;
          if (column.key === "condition") return <code className="notifications-condition">{rule.condition}</code>;
          if (column.key === "actions") {
            return (
              <div className="notifications-row-actions">
                <Button size="sm" variant="ghost" onClick={() => onToggle(rule.id)}>
                  {rule.is_active ? t("notifications.stop") : t("notifications.start")}
                </Button>
                <Button size="sm" variant="ghost" className="notifications-delete-action" onClick={() => onDelete(rule)}>
                  {t("common.delete")}
                </Button>
              </div>
            );
          }
          return <strong>{rule.name}</strong>;
        }}
      />
    </section>
  );
}

function HistoryPanel({ history, t }) {
  if (history.length === 0) {
    return (
      <Panel>
        <EmptyState icon={<BellSlashIcon size={42} weight="duotone" />} title={t("notifications.no_history_title")} description={t("notifications.no_history")} />
      </Panel>
    );
  }
  return (
    <Panel title={t("notifications.history")} description={t("notifications.history_help")}>
      <ol className="notifications-history">
        {history.map((entry) => (
          <li key={entry.id}>
            <StatusBadge tone={severityTone(entry.severity)}>{entry.severity}</StatusBadge>
            <div>
              <strong>{entry.message}</strong>
              <p>
                {entry.machine_id ? `${entry.machine_id} · ` : ""}
                {entry.delivered ? t("notifications.delivered") : t("notifications.pending")}
                {" · "}
                <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function ChannelsPanel({ channels, form, onSubmit, saving, setForm, t }) {
  const columns = CHANNEL_COLUMNS.map((column) => ({ ...column, label: t(column.labelKey) }));
  return (
    <div className="notifications-channels-layout">
      <Panel title={t("notifications.new_channel")} description={t("notifications.channel_form_help")}>
        <form className="notifications-channel-form" onSubmit={onSubmit}>
          <FormField label={t("notifications.channel_type")}>
            <select value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}>
              {["email", "push", "mqtt", "websocket"].map((channel) => <option key={channel}>{channel}</option>)}
            </select>
          </FormField>
          <label className="notifications-checkbox">
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
            <span>{t("common.active")}</span>
          </label>
          <Button type="submit" disabled={saving}>{t("common.create")}</Button>
        </form>
      </Panel>

      <DataTable
        ariaLabel={t("notifications.channels")}
        columns={columns}
        rows={channels}
        empty={(
          <Panel>
            <EmptyState icon={<BellRingingIcon size={42} weight="duotone" />} title={t("notifications.no_channels_title")} description={t("notifications.no_channels")} />
          </Panel>
        )}
        renderCell={(channel, column) => column.key === "channel"
          ? <strong>{channel.channel}</strong>
          : <StatusBadge tone={channel.enabled ? "success" : "neutral"}>{channel.enabled ? t("common.active") : t("common.inactive")}</StatusBadge>}
      />
    </div>
  );
}
