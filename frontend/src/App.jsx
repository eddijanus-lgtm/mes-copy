import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import MachinesPage from "./pages/Machines.jsx";
import AlarmsPage from "./pages/Alarms.jsx";
import TracesPage from "./pages/Traces.jsx";
import ShopfloorPage from "./pages/Shopfloor.jsx";
import SystemStatus from "./components/SystemStatus.jsx";
import LoginPage from "./pages/Login.jsx";
import UsersPage from "./pages/Users.jsx";
import CarriersPage from "./pages/Carriers.jsx";
import OrdersPage from "./pages/Orders.jsx";
import RoutesPage from "./pages/Routes.jsx";
import NotificationsPage from "./pages/Notifications.jsx";
import ShiftsPage from "./pages/Shifts.jsx";
import { useAuth } from "./providers/AuthProvider.jsx";
import { hasRole, ROLES } from "./utils/roles.js";
import { I18nProvider } from "./i18n/I18nProvider.jsx";

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
      <main className="app-content relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="machines/*" element={<MachinesPage />} />
          <Route path="orders/*" element={<OrdersPage />} />
          <Route path="routes/*" element={<RoutesPage />} />
          <Route path="alarms/*" element={<AlarmsPage />} />
          <Route path="traces/*" element={<TracesPage />} />
          <Route path="shopfloor/*" element={<ShopfloorPage />} />
          <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
          <Route path="carriers" element={<CarriersPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
        <SystemStatus />
      </>
    </I18nProvider>
  );
}
