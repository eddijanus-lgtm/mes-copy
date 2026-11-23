import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import { useTheme } from "../providers/ThemeProvider.jsx";

const navItems = [
  { path: "/", label: "nav.dashboard", icon: "M3 3v18h18M8 16v-4m5 4V7m5 9V4" },
  { path: "/machines", label: "nav.stations", icon: "M6 20h12M8 16v4m8-4v4M3 4h18v12H3zM7 8h4m-4 4h7" },
  { path: "/orders", label: "nav.orders", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7" },
  { path: "/notifications", label: "nav.notifications", icon: "M3 9v5h5l10 4V5L8 9H3zm4 5 2 6h3l-2-5" },
  { path: "/carriers", label: "nav.carrier", icon: "m3 7 9-4 9 4v10l-9 4-9-4V7zm0 0 9 4 9-4m-9 4v10" },
  { path: "/shopfloor", label: "nav.shopfloor", icon: "M3 21V10l6 3V9l6 4V5h4l2 16H3zm4-4h2m4 0h2" },
  { path: "/webshop", label: "nav.webshop", icon: "M4 8h16l1 13H3L4 8zm4 0V6a4 4 0 0 1 8 0v2", roles: [ROLES.ADMIN, ROLES.OPERATOR] },
  { path: "/users", label: "nav.users", icon: "M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0zm-3 14v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2", roles: [ROLES.ADMIN] },
];

export default function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t, locale, changeLocale } = useTranslation();
  const { dark, toggleTheme } = useTheme();

  return (
    <div className="mes-sidebar sticky top-0 h-screen w-64 shrink-0 bg-neutral-100 border-r border-neutral-200 flex flex-col">
      <div className="px-5 py-4 border-b border-neutral-200 flex flex-col items-start gap-3">
        <img src="/logo.jpg" alt="Walther Rathenau Gewerbeschule" className="mes-school-logo w-40 object-contain" />
        <div>
          <p className="text-sm font-semibold text-neutral-800">MES Shopfloor</p>
          <p className="text-xs text-neutral-500">OT/IT Gateway</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.filter((item) => !item.roles || hasRole(user, ...item.roles)).map((item) => {
          const isActive = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive ? "page" : undefined}
              className={`grid min-h-9 grid-cols-[1.25rem_1fr] items-center gap-3 rounded-md px-3 py-2 text-sm leading-5 font-medium transition-colors ${
                isActive
                  ? "bg-neutral-200 text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="mes-sidebar-label">{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-neutral-100 space-y-2">
        {/* Language + Theme toggles */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-md overflow-hidden border border-neutral-200">
            {["de", "en"].map(l => (
              <button key={l} onClick={() => changeLocale(l)} className={`flex-1 py-1 text-xs font-medium transition ${
                l === locale ? 'bg-brand-primary text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={toggleTheme} className="grid size-7 place-items-center rounded-md border border-neutral-200 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition" aria-label={dark ? "Light mode" : "Dark mode"}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round">
              <path d={dark ? "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0" : "M20 15a8 8 0 1 1-11-11 8 8 0 0 0 11 11Z"} />
            </svg>
          </button>
        </div>
        <div className="rounded-md bg-neutral-50 px-3 py-2">
          <p className="truncate text-xs font-semibold text-neutral-700">{user?.username}</p>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">{user?.role}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
          {t("sidebar.sessionActive")}
        </div>
        <button onClick={logout} className="mt-3 w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-xs font-medium text-neutral-600 transition hover:border-status-error/30 hover:bg-status-error-bg hover:text-status-error">
          {t("sidebar.logout")}
        </button>
      </div>
    </div>
  );
}
