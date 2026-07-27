import { Link, useLocation } from "react-router-dom";
import { BellIcon } from "@phosphor-icons/react/Bell";
import { ChartLineUpIcon } from "@phosphor-icons/react/ChartLineUp";
import { ClipboardTextIcon } from "@phosphor-icons/react/ClipboardText";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { MegaphoneIcon } from "@phosphor-icons/react/Megaphone";
import { PackageIcon } from "@phosphor-icons/react/Package";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { SignOutIcon } from "@phosphor-icons/react/SignOut";
import { MoonIcon } from "@phosphor-icons/react/Moon";
import { SunIcon } from "@phosphor-icons/react/Sun";
import { SquaresFourIcon } from "@phosphor-icons/react/SquaresFour";
import { TimerIcon } from "@phosphor-icons/react/Timer";
import { UsersThreeIcon } from "@phosphor-icons/react/UsersThree";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import { useTheme } from "../providers/ThemeProvider.jsx";

const navGroups = [
  {
    label: "Produktion",
    items: [
      { path: "/", label: "nav.dashboard", icon: SquaresFourIcon },
      { path: "/machines", label: "nav.stations", icon: GearSixIcon },
      { path: "/orders", label: "nav.orders", icon: ClipboardTextIcon },
      { path: "/shifts", label: "nav.shifts", icon: TimerIcon },
    ],
  },
  {
    label: "Überwachung",
    items: [
      { path: "/alarms", label: "nav.alarms", icon: BellIcon },
      { path: "/notifications", label: "nav.notifications", icon: MegaphoneIcon },
      { path: "/traces", label: "nav.traces", icon: ChartLineUpIcon },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/carriers", label: "nav.carrier", icon: PackageIcon },
      { path: "/shopfloor", label: "nav.shopfloor", icon: PlugsConnectedIcon },
      { path: "/users", label: "nav.users", icon: UsersThreeIcon, roles: [ROLES.ADMIN] },
    ],
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t, locale, changeLocale } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const ThemeIcon = theme === "dark" ? SunIcon : MoonIcon;

  return (
    <aside className="app-sidebar" aria-label="Hauptnavigation">
      <div className="app-sidebar__brand">
        <div className="app-sidebar__wordmark" aria-label="WARA">
          <span className="app-sidebar__wordmark-full">WAR<span>A</span></span>
          <span className="app-sidebar__wordmark-short">W</span>
        </div>
        <div className="app-sidebar__product">
          <strong>MES Shopfloor</strong>
          <span>Production Gateway</span>
        </div>
      </div>

      <nav className="app-sidebar__nav">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.roles || hasRole(user, ...item.roles));
          if (visibleItems.length === 0) return null;
          return (
            <section className="app-sidebar__group" key={group.label}>
              <h2>{group.label}</h2>
              <div>
                {visibleItems.map((item) => {
                  const active = location.pathname === item.path
                    || (item.path !== "/" && location.pathname.startsWith(item.path));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={active ? "is-active" : ""}
                      aria-current={active ? "page" : undefined}
                      title={t(item.label)}
                    >
                      <span className="app-sidebar__nav-icon"><Icon size={20} weight={active ? "fill" : "regular"} /></span>
                      <span className="app-sidebar__nav-label">{t(item.label)}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="app-sidebar__footer">
        <div className="app-sidebar__languages" aria-label="Sprache">
          {["de", "en"].map((language) => (
            <button
              type="button"
              key={language}
              onClick={() => changeLocale(language)}
              className={`app-sidebar__language-button${language === locale ? " is-active" : ""}`}
              aria-pressed={language === locale}
            >
              {language.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            className="app-sidebar__theme-button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Helles Design aktivieren" : "Dunkles Design aktivieren"}
            title={theme === "dark" ? "Helles Design" : "Dunkles Design"}
            aria-pressed={theme === "dark"}
          >
            <ThemeIcon size={15} weight="bold" />
          </button>
        </div>

        <div className="app-sidebar__account">
          <span className="app-sidebar__avatar" aria-hidden="true">
            {(user?.username || "U").slice(0, 1).toUpperCase()}
          </span>
          <span className="app-sidebar__user">
            <strong>{user?.username || "Benutzer"}</strong>
            <small><i />{t("sidebar.session_active")}</small>
          </span>
          <button type="button" onClick={logout} aria-label={t("sidebar.logout")} title={t("sidebar.logout")}>
            <SignOutIcon size={19} />
          </button>
        </div>
      </div>
    </aside>
  );
}
