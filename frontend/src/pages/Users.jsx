import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import Modal from "../components/Modal.jsx";
import { ROLES, USER_ROLES } from "../utils/roles.js";
import { EyeIcon } from "@phosphor-icons/react/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/EyeSlash";
import { useTranslation } from "../i18n/I18nProvider.jsx";

const roleLabels = {
  [ROLES.VIEWER]: "Viewer (nur lesen)",
  [ROLES.OPERATOR]: "Operator (erstellen und bearbeiten)",
  [ROLES.ADMIN]: "Admin (voller Zugriff)",
};

const labelRole = {
  "viewer": ROLES.VIEWER,
  "operator": ROLES.OPERATOR,
  "admin": ROLES.ADMIN,
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", password: "", role: "" });
  const [deletingId, setDeletingId] = useState(null);

  const [form, setForm] = useState({ username: "", password: "", role: ROLES.VIEWER });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get("/users");
      setUsers(data || []);
    } catch {
      /* toast already shown */
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      await api.post("/auth/register", form);
      setSuccess(`Benutzer ${form.username} wurde erstellt.`);
      setForm({ username: "", password: "", role: ROLES.VIEWER });
      await fetchUsers();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(user) {
    setEditingUser(user.id);
    setEditForm({ username: user.username, password: "", role: user.role });
  }

  async function handleEditSave() {
    try {
      const body = {};
      if (editForm.username) body.username = editForm.username;
      if (editForm.password) body.password = editForm.password;
      if (editForm.role) body.role = editForm.role;
      await api.put(`/users/${editingUser}`, body);
      setEditingUser(null);
      setEditForm({ username: "", password: "", role: "" });
      await fetchUsers();
    } catch {
      /* toast already shown */
    }
  }

  function confirmDelete(userId) {
    setDeletingId(userId);
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await api.del(`/users/${deletingId}`);
      setDeletingId(null);
      await fetchUsers();
    } catch {
      /* toast already shown */
    }
  }

  function togglePassword(id) {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="mes-page min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div className="mes-page-header">
          <div>
            <div className="mes-title-row">
              <h1 className="text-2xl font-bold text-neutral-900">{t("users.title")}</h1>
              <PageInfo page="users" />
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">{t("users.subtitle")}</p>
          </div>
        </div>

        {/* Create user form */}
        <section className="mes-panel max-w-2xl p-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-5">{t("users.create_user")}</h2>
          <form onSubmit={handleCreate} className="mes-form-grid">
            <div className="flex flex-col sm:flex-row gap-4">
              <label className="block flex-1 min-w-0">
                <span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.username")}</span>
                <input
                  autoFocus
                  autoComplete="off"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                  required
                />
              </label>

              <label className="block flex-1 min-w-0">
                <span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.password")}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                  required
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.role")}</span>
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              >
                {USER_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </select>
            </label>

            {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}
            {success && <p role="status" className="rounded-lg bg-status-success-bg px-4 py-3 text-sm text-status-success">{success}</p>}

            <div className="mes-form-actions">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-primary-dark disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? t("users.creating_user") : t("users.create_user")}
              </button>
            </div>
          </form>
        </section>

        {/* User list table */}
        <section className="mes-panel p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-sm font-semibold text-neutral-700">{t("users.all_users")}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="mes-table w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                  <th className="px-4 py-3 font-medium">{t("users.id")}</th>
                  <th className="px-4 py-3 font-medium">{t("users.username")}</th>
                  <th className="px-4 py-3 font-medium">{t("users.password")}</th>
                  <th className="px-4 py-3 font-medium">{t("users.last_logon")}</th>
                  <th className="px-4 py-3 font-medium">{t("users.created_at")}</th>
                  <th className="px-4 py-3 font-medium">{t("users.role")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("users.actions")}</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-400">{t("users.no_users")}</td></tr>
                )}
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-500 font-mono text-xs">{user.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 font-medium text-neutral-800">{user.username}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-400">
                          {visiblePasswords[user.id] ? user.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePassword(user.id)}
                          className="text-neutral-400 hover:text-neutral-600"
                          aria-label={visiblePasswords[user.id] ? t("users.password_hide") : t("users.password_show")}
                        >
                          {visiblePasswords[user.id] ? <EyeSlashIcon size={15} /> : <EyeIcon size={15} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {user.last_logon_at ? new Date(user.last_logon_at).toLocaleString("de-DE") : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {new Date(user.created_at).toLocaleString("de-DE")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-xs text-brand-primary">
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="rounded px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/10 transition-colors"
                      >
                        {t("common.edit")}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => confirmDelete(user.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-status-error hover:bg-status-error-bg transition-colors"
                        aria-label={t("common.delete")}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Edit modal */}
      <Modal isOpen={!!editingUser} onClose={() => { setEditingUser(null); setEditForm({ username: "", password: "", role: "" }); }} title={t("users.edit_user")}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 mb-1.5">Benutzername</span>
            <input
              value={editForm.username}
              onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.new_password")}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={editForm.password}
              onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700 mb-1.5">Rolle</span>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
            >
              {USER_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setEditingUser(null); setEditForm({ username: "", password: "", role: "" }); }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleEditSave}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary-dark transition-colors"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title={t("common.delete")}>
        <p className="text-sm text-neutral-600 mb-6">{t("users.delete_confirm")}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeletingId(null)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg bg-status-error px-4 py-2 text-sm font-medium text-white hover:bg-status-error-dark transition-colors"
          >
            {t("common.delete")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
