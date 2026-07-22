import { useState } from "react";
import { api } from "../api/client.js";
import { ROLES, USER_ROLES } from "../utils/roles.js";

const roleLabels = {
  [ROLES.VIEWER]: "Viewer (nur lesen)",
  [ROLES.OPERATOR]: "Operator (erstellen und bearbeiten)",
  [ROLES.ADMIN]: "Admin (voller Zugriff)",
};

export default function UsersPage() {
  const [form, setForm] = useState({ username: "", password: "", role: ROLES.VIEWER });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      await api.post("/auth/register", form);
      setSuccess(`Benutzer ${form.username} wurde erstellt.`);
      setForm({ username: "", password: "", role: ROLES.VIEWER });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Benutzerverwaltung</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Neuen MES-Benutzer mit passender Rolle anlegen</p>
        </div>

        <section className="max-w-2xl bg-white rounded-lg shadow-card border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-5">Benutzer erstellen</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-neutral-700 mb-1.5">Benutzername</span>
              <input
                autoFocus
                autoComplete="off"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                required
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-neutral-700 mb-1.5">Passwort</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                required
              />
              <span className="mt-1 block text-xs text-neutral-400">Mindestens 8 Zeichen</span>
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-neutral-700 mb-1.5">Rolle</span>
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              >
                {USER_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select>
            </label>

            {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}
            {success && <p role="status" className="rounded-lg bg-status-success-bg px-4 py-3 text-sm text-status-success">{success}</p>}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-primary-dark disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? "Benutzer wird erstellt..." : "Benutzer erstellen"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
