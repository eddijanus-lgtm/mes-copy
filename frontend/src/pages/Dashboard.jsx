import { useState, useEffect } from "react";
import StatCard from "../components/StatCard";
import { api } from "../api/client.js";
import { Link } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canManageMachines } from "../utils/roles.js";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ machines: 0, alarms: 0, health: false });

  useEffect(() => {
    api.get("/machines").then((m) => {
      if (Array.isArray(m)) setStats((s) => ({ ...s, machines: m.length }));
    }).catch(() => {});
    api.get("/alarms/stats/active-count").then((a) => {
      if (typeof a === "number") setStats((s) => ({ ...s, alarms: a }));
    }).catch(() => {});
    api.get("/edge/health").then((h) => {
      if (h && h.ok) setStats((s) => ({ ...s, health: true }));
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Willkommen bei der MES Edge Gateway Ubersicht</p>
          </div>
        </div>

        {/* StatCards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Verbundene Stationen" value={String(stats.machines)} icon="⚙️" />
          <StatCard label="Aktive Alarme" value={String(stats.alarms)} icon="🔔" />
          <StatCard label="Edge Gateway" value={stats.health ? "Online" : "Inaktiv"} icon="🌐" />
        </div>

        {/* Schnellzugriff + System */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">Schnellzugriff</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to="/machines"
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-colors duration-150 bg-brand-primary text-white hover:bg-[var(--color-brand-primary-dark)]"
              >
                {canManageMachines(user) ? "+ Neue Station" : "Stationen ansehen"}
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-card border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">System</h3>
            <pre className="text-xs bg-neutral-50 rounded-md px-4 py-3 font-mono text-neutral-500 leading-relaxed max-h-[160px] overflow-auto whitespace-pre-wrap">
              {JSON.stringify({ version: "MES Edge Gateway v1.0", port: 3000, endpoints: ["/api/machines", "/api/alarms", "/api/traces", "/api/edge"] }, null, 2)}
            </pre>
          </div>

        </div>
      </main>
    </div>
  );
}
