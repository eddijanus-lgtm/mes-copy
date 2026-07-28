import React, { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import SystemStatus from "./components/SystemStatus.jsx";
import { useAuth } from "./providers/AuthProvider.jsx";
import { hasRole, ROLES } from "./utils/roles.js";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import { useSmartphoneMode, useTabletMode } from "./hooks/useTabletMode.js";
import { useDosKeyboardShortcut } from "./hooks/useDosEasterEgg.js";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const MachinesPage = lazy(() => import("./pages/Machines.jsx"));
const AlarmsPage = lazy(() => import("./pages/Alarms.jsx"));
const TracesPage = lazy(() => import("./pages/Traces.jsx"));
const ShopfloorPage = lazy(() => import("./pages/Shopfloor.jsx"));
const LoginPage = lazy(() => import("./pages/Login.jsx"));
const UsersPage = lazy(() => import("./pages/Users.jsx"));
const CarriersPage = lazy(() => import("./pages/Carriers.jsx"));
const OrdersPage = lazy(() => import("./pages/Orders.jsx"));
const RoutesPage = lazy(() => import("./pages/Routes.jsx"));
const NotificationsPage = lazy(() => import("./pages/Notifications.jsx"));
const ShiftsPage = lazy(() => import("./pages/Shifts.jsx"));
const DosMes = lazy(() => import("./pages/DosMes.jsx"));

function PageLoading() {
  return <div className="mes-page-loading" role="status">Ansicht wird geladen…</div>;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  return hasRole(user, ROLES.ADMIN) ? children : <Navigate to="/" replace />;
}

function ProtectedDosRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  return isAuthenticated
    ? children
    : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function useTabletDashboardViewportLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return undefined;

    const viewport = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewport?.getAttribute("content");

    document.documentElement.classList.add("tablet-dashboard-locked");
    viewport?.setAttribute(
      "content",
      "width=device-width, initial-scale=1, viewport-fit=cover",
    );
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove("tablet-dashboard-locked");
      if (viewport && previousViewport) {
        viewport.setAttribute("content", previousViewport);
      }
    };
  }, [isLocked]);
}

function ProtectedApp() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isTabletMode = useTabletMode();
  const isSmartphoneMode = useSmartphoneMode();
  const isTouchDashboard = (isTabletMode || isSmartphoneMode) && location.pathname === "/";
  useDosKeyboardShortcut(isAuthenticated);
  useTabletDashboardViewportLock(isAuthenticated && isTouchDashboard);

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-neutral-50">
      {isTouchDashboard ? null : <Sidebar />}
      <main className={`app-content relative min-h-0 min-w-0 flex-1 ${isTouchDashboard ? "overflow-hidden" : "overflow-y-auto"}`}>
        <Suspense fallback={<PageLoading />}>
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
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const isDosMode = location.pathname.startsWith("/dos");

  return (
    <I18nProvider>
      <>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/dos/*" element={<ProtectedDosRoute><DosMes /></ProtectedDosRoute>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </Suspense>
        {isDosMode ? null : <SystemStatus />}
      </>
    </I18nProvider>
  );
}
