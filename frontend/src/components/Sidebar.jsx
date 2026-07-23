import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";

const navItems = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/machines", label: "Stationen", icon: "⚙️" },
  { path: "/orders", label: "Aufträge", icon: "▤" },
  { path: "/alarms", label: "Alarme", icon: "🔔" },
  { path: "/traces", label: "Traces", icon: "📈" },
  { path: "/carriers", label: "Werkstückträger", icon: "▣" },
  { path: "/shopfloor", label: "Shopfloor Gateway", icon: "▥" },
  { path: "/users", label: "Benutzer", icon: "👤", roles: [ROLES.ADMIN] },
];

export default function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();

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
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-neutral-100">
        <div className="mb-3 rounded-md bg-neutral-50 px-3 py-2">
          <p className="truncate text-xs font-semibold text-neutral-700">{user?.username}</p>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">{user?.role}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
          Sitzung aktiv
        </div>
        <button onClick={logout} className="mt-3 w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-xs font-medium text-neutral-600 transition hover:border-status-error/30 hover:bg-status-error-bg hover:text-status-error">
          Abmelden
        </button>
      </div>
    </div>
  );
}
