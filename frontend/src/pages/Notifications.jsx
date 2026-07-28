import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import NotificationsWorkspace from "../features/notifications/NotificationsWorkspace.jsx";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("rules");
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTab = useCallback(async (tab, showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      if (tab === "rules") {
        const response = await api.get("/notifications/rules");
        setRules(Array.isArray(response) ? response : []);
      } else if (tab === "history") {
        const response = await api.get("/notifications/history?limit=100");
        setHistory(Array.isArray(response) ? response : []);
      } else {
        const response = await api.get("/notifications/channels");
        setChannels(Array.isArray(response) ? response : []);
      }
    } catch {
      if (tab === "rules") setRules([]);
      else if (tab === "history") setHistory([]);
      else setChannels([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await api.get("/notifications/stats");
      setStats(response || null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadTab(activeTab);
  }, [activeTab, loadTab]);

  async function createRule(payload) {
    await api.post("/notifications/rules", payload);
    await Promise.all([loadTab("rules", false), loadStats()]);
  }

  async function createChannel(payload) {
    await api.post("/notifications/channels", { ...payload, config: "{}" });
    await loadTab("channels", false);
  }

  async function toggleRule(id) {
    await api.post(`/notifications/rules/${id}/toggle`);
    await Promise.all([loadTab("rules", false), loadStats()]);
  }

  async function deleteRule(id) {
    await api.del(`/notifications/rules/${id}`);
    await Promise.all([loadTab("rules", false), loadStats()]);
  }

  return (
    <NotificationsWorkspace
      activeTab={activeTab}
      channels={channels}
      history={history}
      loading={loading}
      onCreateChannel={createChannel}
      onCreateRule={createRule}
      onDeleteRule={deleteRule}
      onTabChange={setActiveTab}
      onToggleRule={toggleRule}
      rules={rules}
      stats={stats}
    />
  );
}
