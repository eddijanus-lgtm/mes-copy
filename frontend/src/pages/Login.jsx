import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider.jsx";

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(username, password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 grid lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden lg:flex relative overflow-hidden bg-neutral-900 text-white p-14 flex-col justify-between">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_10%,var(--color-brand-primary),transparent_38%),radial-gradient(circle_at_85%_80%,var(--color-brand-cyan),transparent_35%)]" />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-brand-orange">WARA MES</p>
          <h1 className="mt-6 max-w-xl text-5xl font-bold leading-tight">Produktion sehen. Prozesse sicher steuern.</h1>
        </div>
        <div className="relative font-mono text-sm text-neutral-300 space-y-2">
          <p><span className="text-status-success">●</span> Edge Gateway verfügbar</p>
          <p>OPC UA · MQTT · PostgreSQL</p>
        </div>
      </section>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-hover p-8 sm:p-10">
          <img src="/logo.jpg" alt="WARA MES" className="h-12 w-auto object-contain" />
          <h2 className="mt-8 text-2xl font-bold text-neutral-900">Anmelden</h2>
          <p className="mt-2 text-sm text-neutral-500">Mit Ihrem MES-Benutzerkonto fortfahren.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Benutzername</span>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Passwort</span>
              <input
                type="password"
                autoComplete="current-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 text-neutral-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                required
              />
            </label>

            {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-primary px-4 py-3 font-semibold text-white transition hover:bg-brand-primary-dark disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? "Anmeldung läuft..." : "Anmelden"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
