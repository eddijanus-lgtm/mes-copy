import { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider.jsx";

const INITIAL_STATE = {
  status: "disconnected",
  telemetry: null,
  lastMessageAt: null,
  logs: [],
};

export function useEdgeTelemetry() {
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
      socket = new WebSocket(`${protocol}//${window.location.host}/api/edge/ws`);

      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "auth.ok") {
            attempt = 0;
            setState((current) => ({ ...current, status: "connected" }));
            return;
          }
          if (message.type !== "edge.telemetry") return;

          const logLine = `[${new Date(message.timestamp).toLocaleTimeString("de-DE")}] ${message.source}: ${JSON.stringify(message.payload)}`;
          setState((current) => ({
            ...current,
            status: "connected",
            telemetry: message,
            lastMessageAt: message.timestamp,
            logs: [...current.logs, logLine].slice(-30),
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
