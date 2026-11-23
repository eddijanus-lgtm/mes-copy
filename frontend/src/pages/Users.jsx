import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import { ROLES, USER_ROLES } from "../utils/roles.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import PageInfo from "../components/PageInfo.jsx";

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", password: "", role: ROLES.VIEWER });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", password: "", role: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const roleLabels = {
    [ROLES.VIEWER]: t("users.viewer"),
    [ROLES.OPERATOR]: t("users.operator"),
    [ROLES.ADMIN]: t("users.admin"),
  };

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try { const data = await api.get("/auth/users"); setUsers(Array.isArray(data) ? data : []); }
    catch { setUsers([]); }
    finally { setLoading(false); }
  }

  async function handleSubmit(event) {
    event.preventDefault(); setError(""); setSuccess(""); setSubmitting(true);
    try {
      await api.post("/auth/register", form);
      setSuccess(`${t("users.username")} ${form.username} ${t("users.created")}`);
      setForm({ username: "", password: "", role: ROLES.VIEWER });
      loadUsers();
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  function openEdit(user) {
    setEditTarget(user);
    setEditForm({ username: user.username, password: "", role: user.role });
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editTarget) return;
    setError(""); setSuccess("");
    try {
      const body = { ...editForm };
      if (!body.password) delete body.password;
      await api.patch(`/auth/users/${editTarget.id}`, body);
      setSuccess(`${t("users.username")} ${editForm.username} ${t("users.updated")}`);
      setEditTarget(null);
      loadUsers();
    } catch (requestError) { setError(requestError.message); }
  }

  function requestDelete(user) { setDeleteTarget(user); }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.del(`/auth/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      loadUsers();
    } catch (requestError) { setError(requestError.message); }
    finally { setDeleting(false); }
  }

  function togglePassword(id) {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function formatDate(date) {
    if (!date) return "-";
    return new Date(date).toLocaleString(locale === "de" ? "de-DE" : "en-US");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 inline-flex items-center">{t("users.title")}<PageInfo page="users" /></h1>
          <p className="text-sm text-neutral-500 mt-0.5">{t("users.subtitle")}</p>
        </div>

        <section className="max-w-2xl bg-white rounded-lg shadow-card border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-5">{t("users.createUser")}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block"><span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.username")}</span><input autoFocus autoComplete="off" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" required /></label>
            <label className="block"><span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.password")}</span><input type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" required /><span className="mt-1 block text-xs text-neutral-400">{t("users.minChars")}</span></label>
            <label className="block"><span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.role")}</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary">{USER_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>

            {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}
            {success && <p role="status" className="rounded-lg bg-status-success-bg px-4 py-3 text-sm text-status-success">{success}</p>}

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={submitting} className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-primary-dark disabled:cursor-wait disabled:opacity-60">{submitting ? t("users.creating") : t("users.create")}</button>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-lg shadow-card border border-neutral-200 overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-neutral-400">{t("common.loading")}</p>
          ) : users.length === 0 ? (
            <p className="p-6 text-sm text-neutral-400">{t("common.noEntries")}</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("users.username")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("users.password")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("users.role")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("users.lastLogon")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("users.createdAt")}</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("common.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium text-neutral-800">{user.username}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-sm text-neutral-500">
                        {visiblePasswords[user.id] ? "••••••••" : "••••••••"}
                        <button onClick={() => togglePassword(user.id)} className="text-neutral-400 hover:text-neutral-600 transition-colors" title={visiblePasswords[user.id] ? t("users.hidePassword") : t("users.showPassword")}>
                          {visiblePasswords[user.id] ? "🙈" : "👁️"}
                        </button>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        user.role === ROLES.ADMIN ? "bg-brand-primary/10 text-brand-primary" :
                        user.role === ROLES.OPERATOR ? "bg-status-info-bg text-status-info" :
                        "bg-neutral-100 text-neutral-600"
                      }`}>{roleLabels[user.role] || user.role}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-neutral-500">{formatDate(user.last_logon)}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-500">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => openEdit(user)} className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200 transition-colors">{t("common.edit")}</button>
                        <button onClick={() => requestDelete(user)} className="px-3 py-1.5 text-xs font-medium text-white bg-status-error rounded-md hover:bg-[var(--color-status-error-dark)] transition-colors">{t("common.delete")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {editTarget && (
          <div onClick={() => setEditTarget(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">{t("users.editUser")}</h2>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <label className="block"><span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.username")}</span><input value={editForm.username} onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" required /></label>
                <label className="block"><span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.password")}</span><input type="password" autoComplete="new-password" minLength={8} value={editForm.password} onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={t("users.passwordPlaceholder")} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" /><span className="mt-1 block text-xs text-neutral-400">{t("users.minCharsOptional")}</span></label>
                <label className="block"><span className="block text-sm font-medium text-neutral-700 mb-1.5">{t("users.role")}</span><select value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary">{USER_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">{t("common.cancel")}</button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors">{t("users.save")}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div onClick={() => !deleting && setDeleteTarget(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error">{t("users.deleteTitle")}</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">{deleteTarget.username} {t("users.deleteConfirm")}</h2>
              <p className="mt-2 text-sm text-neutral-500">{t("users.deleteText")}</p>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50">{t("common.cancel")}</button>
                <button type="button" disabled={deleting} onClick={handleDelete} className="rounded-lg bg-status-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-status-error-dark)] disabled:opacity-50">{deleting ? t("users.deleting") : t("users.deleteBtn")}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
