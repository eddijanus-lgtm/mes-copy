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
    <div className="login-page">
      <section className="login-showcase">
        <div className="login-showcase__brand">
          <strong className="login-showcase__wordmark">WARA</strong>
          <span className="login-showcase__product">MES Shopfloor</span>
        </div>

        <div className="login-showcase__copy">
          <h1>Produktion sehen. Prozesse sicher steuern.</h1>
          <p>
            Der gemeinsame Leitstand für Produktionsfluss, Anlagenstatus und
            nachvollziehbare Prozessdaten.
          </p>
        </div>

        <img
          className="login-showcase__image"
          src="/assets/dashboard/station-dose.png"
          alt=""
        />

        <div className="login-showcase__status">
          <span>Shopfloor Gateway verfügbar</span>
          <span>OPC UA · PostgreSQL</span>
        </div>
      </section>

      <main className="login-panel">
        <div className="login-card">
          <h2>Anmelden</h2>
          <p>Mit Ihrem MES-Benutzerkonto fortfahren.</p>

          <form onSubmit={handleSubmit}>
            <label>
              <span>Benutzername</span>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>

            <label>
              <span>Passwort</span>
              <input
                type="password"
                autoComplete="current-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error ? <p role="alert">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Anmeldung läuft..." : "Anmelden"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
