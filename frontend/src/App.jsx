import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MachinesPage from "./pages/Machines.jsx";
import AlarmsPage from "./pages/Alarms.jsx";
import TracesPage from "./pages/Traces.jsx";
import EdgePage from "./pages/Edge.jsx";
import SystemStatus from "./components/SystemStatus.jsx";
import LoginPage from "./pages/Login.jsx";
import UsersPage from "./pages/Users.jsx";
import { useAuth } from "./providers/AuthProvider.jsx";
import { hasRole, ROLES } from "./utils/roles.js";

function AdminRoute({ children }) {
  const { user } = useAuth();
  return hasRole(user, ROLES.ADMIN) ? children : <Navigate to="/" replace />;
}

function ProtectedApp() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-neutral-50">
      <Sidebar />
      <main className="flex-1 flex flex-col gap-6 p-6 relative">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="machines/*" element={<MachinesPage />} />
          <Route path="alarms/*" element={<AlarmsPage />} />
          <Route path="traces/*" element={<TracesPage />} />
          <Route path="edge/*" element={<EdgePage />} />
          <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
      <SystemStatus />
    </>
  );
}
