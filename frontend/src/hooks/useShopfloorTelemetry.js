import { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider.jsx";

const INITIAL_STATE = {
  status: "disconnected",
  telemetry: null,
  telemetryByResource: {},
  handshakeByResource: {},
  eventsByResource: {},
  changedAtByResource: {},
  mqttByTopic: {},
  mqttEvents: [],
  lastMessageAt: null,
  logs: [],
};

export function useShopfloorTelemetry() {
  const { token } = useAuth();
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    if (!token) return;

    let socket;
    let reconnectTimer;
    let stopped = false;
    let attempt = 0;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      setState((current) => ({ ...current, status: "connecting" }));
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/shopfloor/ws`);

      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "auth.ok") {
            attempt = 0;
            setState((current) => ({ ...current, status: "connected" }));
            return;
          }
          if (message.type !== "shopfloor.telemetry") return;

          const logLine = `[${new Date(message.timestamp).toLocaleTimeString("de-DE")}] ${message.source}: ${JSON.stringify(message.payload)}`;
          setState((current) => ({
            ...applyTelemetry(current, message),
            logs: [...current.logs, logLine].slice(-40),
          }));
        } catch {
          setState((current) => ({ ...current, status: "error" }));
        }
      };
      socket.onerror = () => setState((current) => ({ ...current, status: "error" }));
      socket.onclose = (event) => {
        if (stopped || event.code === 4401) return;
        setState((current) => ({ ...current, status: "disconnected" }));
        attempt += 1;
        reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15_000));
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [token]);

  return state;
}

function applyTelemetry(current, message) {
  const resourceId = message.source === "opcua" ? message.payload?.resourceId : null;
  const base = {
    ...current,
    status: "connected",
    telemetry: message,
    lastMessageAt: message.timestamp,
  };
  if (message.source === "mqtt") {
    const mqttEvent = { topic: message.topic, payload: message.payload, timestamp: message.timestamp };
    return {
      ...base,
      mqttByTopic: { ...current.mqttByTopic, [message.topic]: mqttEvent },
      mqttEvents: [...current.mqttEvents, mqttEvent].slice(-30),
    };
  }
  if (!resourceId) return base;

  if (message.payload.kind === "stmes.handshake") {
    const event = { ...message.payload, timestamp: message.timestamp };
    return {
      ...base,
      handshakeByResource: { ...current.handshakeByResource, [resourceId]: event },
      eventsByResource: {
        ...current.eventsByResource,
        [resourceId]: [...(current.eventsByResource[resourceId] || []), event].slice(-20),
      },
    };
  }

  const previousSignals = current.telemetryByResource[resourceId]?.payload?.signals || {};
  const nextSignals = message.payload?.signals || {};
  const changedAt = { ...(current.changedAtByResource[resourceId] || {}) };
  for (const field of new Set([...Object.keys(previousSignals), ...Object.keys(nextSignals)])) {
    if (String(previousSignals[field]) !== String(nextSignals[field])) changedAt[field] = Date.now();
  }
  return {
    ...base,
    telemetryByResource: { ...current.telemetryByResource, [resourceId]: message },
    changedAtByResource: { ...current.changedAtByResource, [resourceId]: changedAt },
  };
}
