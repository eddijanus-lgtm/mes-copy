import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";

const EMPTY_STATS = { alarms: 0, health: false };

export function useDashboardData(token) {
  const [machines, setMachines] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [kpis, setKpis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    let active = true;

    const loadMetadata = async () => {
      const [machineResult, carrierResult, alarmResult, alarmListResult, healthResult, kpiResult] = await Promise.allSettled([
        api.getSilent("/machines"),
        api.getSilent("/carriers"),
        api.getSilent("/alarms/stats/active-count"),
        api.getSilent("/alarms"),
        api.getSilent("/shopfloor/health"),
        api.getSilent("/dashboard/kpis"),
      ]);
      if (!active) return;
      if (machineResult.status === "fulfilled" && Array.isArray(machineResult.value)) setMachines(machineResult.value);
      if (carrierResult.status === "fulfilled" && Array.isArray(carrierResult.value)) setCarriers(carrierResult.value);
      if (alarmListResult.status === "fulfilled" && Array.isArray(alarmListResult.value)) {
        setActiveAlarms(alarmListResult.value.filter((alarm) => !alarm.acknowledged));
      }
      setStats({
        alarms: alarmResult.status === "fulfilled" && Number.isFinite(alarmResult.value) ? alarmResult.value : 0,
        health: healthResult.status === "fulfilled" && Boolean(healthResult.value?.ok),
      });
      if (kpiResult.status === "fulfilled") setKpis(kpiResult.value);
      setIsLoading(false);
    };

    const loadKpis = async () => {
      try {
        const nextKpis = await api.getSilent("/dashboard/kpis");
        if (active) setKpis(nextKpis);
      } catch {
        // The last valid value remains visible during a short connection issue.
      }
    };

    loadMetadata();
    const metadataTimer = window.setInterval(loadMetadata, 30_000);
    const kpiTimer = window.setInterval(loadKpis, 5_000);

    if (token) {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/shopfloor/ws`);
      wsRef.current = socket;
      socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "auth", token })));
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data);
          if (active && message.type === "kpis" && message.payload) setKpis(message.payload);
        } catch {
          // Ignore malformed third-party telemetry frames.
        }
      });
    }

    return () => {
      active = false;
      window.clearInterval(metadataTimer);
      window.clearInterval(kpiTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token]);

  const connectedMachines = useMemo(
    () => machines.filter((machine) => machine.status === "online" || machine.status === "idle"),
    [machines],
  );

  return {
    machines,
    carriers,
    activeAlarms,
    kpis,
    stats,
    isLoading,
    connectedMachineCount: connectedMachines.length,
  };
}
