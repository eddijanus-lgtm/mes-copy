import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";
import { useTranslation } from "../i18n/I18nProvider.jsx";

export default function LoginPage() {
  const { t } = useTranslation();
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault(); setError(""); setSubmitting(true);
    try { await login(username, password); navigate(location.state?.from || "/", { replace: true }); }
    catch (loginError) { setError(loginError.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-neutral-100 grid lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden lg:flex relative overflow-hidden bg-neutral-900 text-white p-14 flex-col justify-between">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_10%,var(--color-brand-primary),transparent_50%)]" />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#e6a875]">WARA MES</p>
          <h1 className="mt-6 max-w-xl text-5xl font-bold leading-tight">{t("login.heroTitle")}</h1>
        </div>
        <div className="relative font-mono text-sm text-neutral-300 space-y-2">
          <p><span className="text-status-success">●</span> {t("login.gatewayAvailable")}</p>
          <p>OPC UA · MQTT · PostgreSQL</p>
        </div>
      </section>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-hover p-8 sm:p-10">
          <img src="/logo.jpg" alt="WARA MES" className="mes-school-logo h-12 w-auto object-contain" />
          <h2 className="mt-8 text-2xl font-bold text-neutral-900">{t("login.title")}</h2>
          <p className="mt-2 text-sm text-neutral-500">{t("login.subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">{t("login.username")}</span>
              <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">{t("login.password")}</span>
              <input type="password" autoComplete="current-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20" required />
            </label>

            {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

            <button type="submit" disabled={submitting} className="w-full rounded-lg bg-brand-primary px-4 py-3 font-semibold text-white transition hover:bg-brand-primary-dark disabled:cursor-wait disabled:opacity-60">
              {submitting ? t("login.loggingIn") : t("login.login")}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
