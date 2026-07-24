import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";

const navItems = [
  { path: "/", label: "nav.dashboard", icon: "📊" },
  { path: "/machines", label: "nav.stations", icon: "⚙️" },
  { path: "/orders", label: "nav.orders", icon: "▤" },
  { path: "/alarms", label: "nav.alarms", icon: "🔔" },
  { path: "/notifications", label: "nav.notifications", icon: "📢" },
  { path: "/shifts", label: "nav.shifts", icon: "⏱️" },
  { path: "/traces", label: "nav.traces", icon: "📈" },
  { path: "/carriers", label: "nav.carrier", icon: "▣" },
  { path: "/shopfloor", label: "nav.shopfloor", icon: "▥" },
  { path: "/users", label: "nav.users", icon: "👤", roles: [ROLES.ADMIN] },
];

export default function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t, locale, changeLocale } = useTranslation();

  return (
    <div className="sticky top-0 h-screen w-64 shrink-0 bg-white border-r border-neutral-200 flex flex-col">
      <div className="p-5 border-b border-neutral-100 flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-wide text-neutral-black"><span className="text-brand-primary">MES </span>Shopfloor</h1>
          <p className="text-xs text-neutral-400 mt-1">OT/IT Gateway</p>
        </div>
        <img src="/logo.jpg" alt="MES Logo" className="flex-shrink-0 w-28 object-contain" />
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.filter((item) => !item.roles || hasRole(user, ...item.roles)).map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-neutral-100">
        {/* Language switcher */}
        <div className="flex gap-1 mb-2 p-1 bg-gray-50 rounded justify-center">
          {["de", "en"].map(l => (
            <button key={l} onClick={() => changeLocale(l)} className={`px-2 py-1 text-xs font-medium rounded ${l === locale ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{l.toUpperCase()}</button>
          ))}
        </div>
        <div className="mb-3 rounded-md bg-neutral-50 px-3 py-2">
          <p className="truncate text-xs font-semibold text-neutral-700">{user?.username}</p>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">{user?.role}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
          {t("sidebar.session_active")}
        </div>
        <button onClick={logout} className="mt-3 w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-xs font-medium text-neutral-600 transition hover:border-status-error/30 hover:bg-status-error-bg hover:text-status-error">
          {t("sidebar.logout")}
        </button>
      </div>
    </div>
  );
}
