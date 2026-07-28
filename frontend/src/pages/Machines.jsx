import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { StackIcon } from "@phosphor-icons/react/Stack";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { useSearchParams } from "react-router-dom";
import StatCard from "../components/StatCard";
import PageInfo from "../components/PageInfo.jsx";
import MachineProfileWizard from "../components/MachineProfileWizard.jsx";
import PageHeader from "../design-system/components/PageHeader.jsx";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canConfigureMachineProfiles, canDeleteMachines, canManageMachines } from "../utils/roles.js";
import {
  buildEquipmentTree,
  filterEquipmentTree,
} from "../utils/equipmentModel.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";

export default function MachinesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [machines, setMachines] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProfileWizard, setShowProfileWizard] = useState(false);
  const [editProfileId, setEditProfileId] = useState(null);
  const [editStationResourceId, setEditStationResourceId] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", type: "CNC", status: "offline", location: "" });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [inlineEditor, setInlineEditor] = useState(null);
  const [savingInline, setSavingInline] = useState(false);
  const canManage = canManageMachines(user);
  const canDelete = canDeleteMachines(user);
  const canConfigureProfiles = canConfigureMachineProfiles(user);

  useEffect(() => {
    if (searchParams.get("create") !== "1" || !canManage) return;
    setForm({ id: null, name: "", type: "CNC", status: "offline", location: "" });
    setShowModal(true);
    setSearchParams({}, { replace: true });
  }, [canManage, searchParams, setSearchParams]);

  useEffect(() => {
    const load = () => Promise.all([
      api.getSilent("/machines"),
      api.getSilent("/machine-profiles").catch(() => ({ items: [] })),
    ]).then(([machineData, profileData]) => {
      setMachines(Array.isArray(machineData) ? machineData : []);
      setProfiles(Array.isArray(profileData?.items) ? profileData.items : []);
    }).catch(() => {});
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  function requestDelete(machine) {
    setError("");
    setDeleteCandidate(machine);
  }

  function handleDelete() {
    if (!deleteCandidate) return;
    setError("");
    setDeleting(true);
    const endpoint = deleteCandidate._nodeKind === "profile-root"
      ? `/machine-profiles/${deleteCandidate._profileId}`
      : deleteCandidate._nodeKind === "profile-station"
        ? `/machine-profiles/${deleteCandidate._profileId}/stations/${encodeURIComponent(deleteCandidate._stationId)}`
        : `/machines/${deleteCandidate.id}`;
    api.del(endpoint).then(() => {
      refreshList();
      setDeleteCandidate(null);
    }).catch((requestError) => setError(requestError.message)).finally(() => setDeleting(false));
  }

  function profileForMachine(m) {
    const resId = m.resource_id ?? m.resourceId;
    if (m._isUncommissioned) return profiles.find((p) => p.profileId === m.id);
    if (resId == null) {
      const byName = profiles.find((p) => p.document?.displayName === (m.name || m.machineName));
      return byName || null;
    }
    return profiles.find((p) => String(p.document?.machineId) === String(resId))
      || profiles.find((p) => p.document?.stations?.some((s) => String(s.resourceId) === String(resId)))
      || profiles.find((p) => p.document?.displayName === (m.name || m.machineName));
  }

  function handleEdit(m) {
    if (m._nodeKind === "profile-root" || m._nodeKind === "profile-station") {
      if (inlineEditor?.nodeId === m.id) {
        setInlineEditor(null);
        return;
      }
      const match = profiles.find((profile) => profile.profileId === m._profileId);
      if (!match) return;
      setInlineEditor({
        nodeId: m.id,
        profileId: match.profileId,
        stationId: m._stationId || null,
        document: structuredClone(match.document),
      });
      return;
    }
    if (m.profile_managed || m._isUncommissioned) {
      const match = profileForMachine(m);
      if (match) {
        setEditProfileId(match.profileId);
        const resId = m.resource_id ?? m.resourceId;
        const stationMatch = match.document?.stations?.find((s) => String(s.resourceId) === String(resId));
        setEditStationResourceId(stationMatch ? String(resId) : null);
      } else {
        setEditStationResourceId(null);
      }
      setShowProfileWizard(true);
      return;
    }
    setShowModal(true);
    setForm({ id: m.id, name: m.name || m.machineName || "", type: m.type || "CNC", status: m.status || "offline", location: m.location || "" });
  }

  function saveInlineEditor() {
    if (!inlineEditor) return;
    setSavingInline(true);
    setError("");
    api.patch(`/machine-profiles/${inlineEditor.profileId}`, {
      document: inlineEditor.document,
      changeSummary: inlineEditor.stationId
        ? `Station ${inlineEditor.stationId} in Maschinenbaum bearbeitet`
        : "Maschine im Maschinenbaum bearbeitet",
    }).then(() => {
      setInlineEditor(null);
      refreshList();
    }).catch((requestError) => setError(requestError.message)).finally(() => setSavingInline(false));
  }

  function openAdvancedEditor() {
    if (!inlineEditor) return;
    const station = inlineEditor.document.stations?.find(
      (item) => item.stationId === inlineEditor.stationId,
    );
    setEditProfileId(inlineEditor.profileId);
    setEditStationResourceId(station ? String(station.resourceId) : null);
    setInlineEditor(null);
    setShowProfileWizard(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const endpoint = form.id ? "/machines/" + form.id : "/machines";
    const save = form.id ? api.patch : api.post;
    save(endpoint, { name: form.name, type: form.type || "CNC", status: form.status || "offline", location: form.location || "" }).then(() => {
      refreshList();
      setShowModal(false);
      setForm({ id: null, name: "", type: "CNC", status: "offline", location: "" });
    }).catch((requestError) => setError(requestError.message));
  }

  function refreshList() {
    Promise.all([
      api.get("/machines"),
      api.getSilent("/machine-profiles").catch(() => ({ items: [] })),
    ]).then(([machineData, profileData]) => {
      setMachines(Array.isArray(machineData) ? machineData : []);
      setProfiles(Array.isArray(profileData?.items) ? profileData.items : []);
    }).catch(() => setMachines([]));
  }

  function downloadTemplate() {
    window.open('/api/v1/machines/template/csv', '_blank');
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    setImportResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const res = await api.post('/machines/import/csv', { content: text });
      setImportResult(res);
    } catch (err) {
      setError('Import fehlgeschlagen: ' + (err.message || 'Unbekannter Fehler'));
    } finally {
      setImporting(false);
    }
  }

  function handleImportSubmit(e) {
    e.preventDefault();
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput && fileInput.files.length > 0) {
      handleImport({ target: { files: fileInput.files } });
    }
  }

  const equipmentTree = useMemo(
    () => buildMachineForest(profiles, machines),
    [profiles, machines],
  );
  const visibleEquipment = useMemo(
    () => flattenMachineTree(filterEquipmentTree(equipmentTree, search), expandedIds, Boolean(search.trim())),
    [equipmentTree, expandedIds, search],
  );
  const machineCount = equipmentTree.length;
  const workUnitCount = equipmentTree.reduce((sum, root) => sum + countDescendants(root), 0);
  const onlineCount = machines.filter((m) => ["online", "running", "idle"].includes(m.status)).length;

  return (
    <div className="mes-page min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">

        <PageHeader
          title={t("machines.title")}
          description={t("machines.subtitle")}
          titleAccessory={<PageInfo page="machines" />}
        />

        {/* Status-Karten */}
        <div className="mes-metric-strip grid grid-cols-3">
          <StatCard label="Maschinen" value={String(machineCount)} icon={<StackIcon size={24} weight="thin" />} />
          <StatCard label="Work Units" value={String(workUnitCount)} icon={<CheckCircleIcon size={24} weight="thin" />} />
          <StatCard label="Offline" value={String(machines.length - onlineCount)} icon={<WarningCircleIcon size={24} weight="thin" />} />
        </div>

        {/* Toolbar */}
        <div className="mes-toolbar">
          {!canConfigureProfiles && (
            <button onClick={() => setShowProfileWizard(true)} className="bg-white border border-neutral-200 text-neutral-700 font-medium px-4 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">
              {t("machines.view_profiles")}
            </button>
          )}
          {canManage && (
            <button onClick={downloadTemplate} className="bg-white border border-neutral-200 text-neutral-700 font-medium px-4 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">
              {t("machines.template_download")}
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowImportModal(true)} className="bg-white border border-brand-primary/30 text-brand-primary font-medium px-4 py-2.5 rounded-lg text-sm hover:bg-brand-primary/5 transition-colors">
              {t("machines.csv_import")}
            </button>
          )}
          {canManage && (
            <button onClick={() => { setForm({ id: null, name: "", type: "CNC", status: "offline", location: "" }); setShowModal(true); }} className="bg-brand-primary text-white font-medium px-5 py-2.5 rounded-lg text-sm hover:bg-[var(--color-brand-primary-dark)] transition-colors">
              {t("machines.create")}
            </button>
          )}
          {canConfigureProfiles && (
            <button onClick={() => setShowProfileWizard(true)} className="machine-profile-launch">
              {t("machines.configure")}
            </button>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

        {/* Suche */}
        <input
          type="text"
          placeholder={t("machines.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-neutral-200 rounded-lg px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
        />

        {/* Maschinen- und Stationsbaum */}
        {visibleEquipment.length > 0 ? (
          <div className="mes-panel machine-tree-panel">
            <table className="w-full machine-tree-table">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Maschine / Station</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">OPC-UA-Endpoint</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.status")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Stationsart</th>
                  {canManage && <th className="px-5 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.actions")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleEquipment.map((m) => {
                  const statusOk = ["online", "running", "idle"].includes(m.status);
                  const hasChildren = Array.isArray(m.children) && m.children.length > 0;
                  const expanded = expandedIds.has(m.id) || Boolean(search.trim());
                  return (
                    <Fragment key={m.id}>
                    <tr className={`machine-tree-row ${m._nodeKind === "profile-root" ? "is-root" : "is-station"}`}>
                      <td className="px-5 py-3.5">
                        <div className="machine-tree-name">
                          <span className="tree-connectors" style={{ width: `${Math.max(m.depth, 0) * 22 + (m.depth > 0 ? 28 : 0)}px`, paddingLeft: m.depth > 0 ? 28 : 0 }}>
                            {m.depth > 0 && (
                              <>
                                {m._treeConnectors?.map((isLast, i) => (
                                  <i key={i}>{!isLast ? '│' : ' '}</i>
                                ))}
                                <i>{m._isLastChild ? '└' : '├'}─</i>
                              </>
                            )}
                          </span>
                          {hasChildren ? (
                            <button
                              type="button"
                              className="machine-tree-toggle"
                              aria-label={expanded ? "Stationen einklappen" : "Stationen ausklappen"}
                              aria-expanded={expanded}
                              onClick={() => setExpandedIds((current) => toggleSetValue(current, m.id))}
                            >
                              {expanded ? '⌄' : '›'}
                            </button>
                          ) : <span className="machine-tree-toggle-spacer" />}
                          <span className={`machine-tree-node-icon ${m._nodeKind === "profile-root" ? "is-machine" : "is-station"}`} />
                          <div>
                            <strong>{m.name || "-"}</strong>
                            <small>{m._nodeKind === "profile-root" ? m._machineId : `R${m.resource_id} · ${m._stationId || "Station"}`}</small>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {m._nodeKind === "profile-root" ? (
                          <span className="machine-tree-no-endpoint">Keine IP an der Maschine</span>
                        ) : m.opcua_endpoint_url ? (
                          <code className="machine-tree-endpoint">{m.opcua_endpoint_url}</code>
                        ) : (
                          <span className="machine-tree-no-endpoint">Nicht konfiguriert</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`machine-tree-status ${statusOk ? "is-ok" : "is-offline"}`}>
                          {formatMachineStatus(m)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-neutral-600">
                        <strong className="machine-tree-type">{m._stationTypeLabel}</strong>
                        {m._nodeKind === "profile-station" && <small className="machine-tree-type-detail">{formatJobInterface(m.job_interface)}</small>}
                      </td>
                      {canManage && <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(m)} className="machine-tree-edit">
                          {t("common.edit")}
                        </button>
                        {canDelete && (
                          <button aria-label={`${m.name} löschen`} onClick={() => requestDelete(m)} className="machine-tree-delete">
                            ×
                          </button>
                        )}
                      </td>}
                    </tr>
                    {inlineEditor?.nodeId === m.id && (
                      <tr className="machine-tree-editor-row">
                        <td colSpan={canManage ? 5 : 4}>
                          <div style={{ marginLeft: `${(m.depth + 1) * 22}px` }}>
                            <MachineInlineEditor
                              editor={inlineEditor}
                              disabled={savingInline}
                              onChange={(document) => setInlineEditor((current) => ({ ...current, document }))}
                              onCancel={() => setInlineEditor(null)}
                              onSave={saveInlineEditor}
                              onAdvanced={openAdvancedEditor}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-neutral-400 py-12 text-sm">{t("machines.no_results")}</p>
        )}

        {/* Modal */}
        {showModal && (
          <div onClick={() => setShowModal(false)} className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">{form.id ? t("machines.edit_station") : t("machines.create_station")}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t("machines.name")}</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required           className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t("machines.type")}</label>
                    <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                    <option value="CNC">CNC</option>
                    <option value="PLC">PLC</option>
                    <option value="Roboter">Roboter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t("machines.status")}</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                    <option value="idle">Bereit / Idle</option>
                    <option value="maintenance">Wartung</option>
                    <option value="error">Fehler</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t("machines.location")}</label>
                  <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => { setShowModal(false); setForm({ id: null, name: "", type: "CNC", status: "offline", location: "" }); }} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors">
                    {t("common.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteCandidate && (
          <div onClick={() => !deleting && setDeleteCandidate(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error">{deleteCandidate._nodeKind === "profile-root" ? "Maschine löschen" : t("machines.delete_station_title")}</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">{deleteCandidate.name || "Eintrag"} wirklich löschen?</h2>
              <p className="mt-2 text-sm text-neutral-500">{deleteCandidate._nodeKind === "profile-root" ? "Das Maschinenprofil und alle zugeordneten Stationen werden entfernt." : "Die Station wird aus dem Maschinenprofil entfernt. Andere Stationen bleiben erhalten."}</p>
              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p><span className="font-medium text-neutral-600">Typ:</span> {deleteCandidate._stationTypeLabel || deleteCandidate.type || "-"}</p>
                <p><span className="font-medium text-neutral-600">Status:</span> {formatMachineStatus(deleteCandidate)}</p>
                <p><span className="font-medium text-neutral-600">OPC UA:</span> {deleteCandidate.opcua_endpoint_url || "Keine IP an der Maschine"}</p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" disabled={deleting} onClick={() => setDeleteCandidate(null)} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50">{t("common.cancel")}</button>
                <button type="button" disabled={deleting} onClick={handleDelete} className="rounded-lg bg-status-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-status-error-dark)] disabled:opacity-50">{deleting ? t("machines.deleting") : t("common.delete")}</button>
              </div>
            </div>
          </div>
        )}

        {/* CSV Import Modal */}
        {showImportModal && (
          <div onClick={() => { setShowImportModal(false); setImportResult(null); setError(""); }} className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-lg p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">{t("machines.import_title")}</h2>

              {!importResult && (
                <form onSubmit={handleImportSubmit} className="space-y-4">
                  <div className="p-4 bg-brand-primary/5 border border-brand-primary/20 rounded-lg text-sm text-brand-primary">
                    <p className="font-semibold mb-1">{t("machines.import_hint")}</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Download des CSV-Templates uber den Button weiter unten</li>
                      <li>Maschinenzeile ohne Endpoint; Stationszeilen mit parent_resource_id und eigenem OPC-UA-Endpoint</li>
                      <li>Leere Zeilen und zeilen mit # werden ubergangen</li>
                    </ul>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={downloadTemplate} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
                      {t("machines.template_download")}
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t("machines.import_file")}</label>
                    <input id="csv-file-input" type="file" accept=".csv" onChange={(e) => { setError(""); setImportResult(null); }} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button type="button" onClick={() => { setShowImportModal(false); setImportResult(null); setError(""); }} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">{t("common.cancel")}</button>
                    <button type="submit" disabled={importing} className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors disabled:opacity-50">{importing ? "Importiere..." : t("machines.import_csv")}</button>
                  </div>
                </form>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="p-4 bg-status-bg-success text-status-success rounded-lg text-sm font-medium">
                    {importResult.imported} {t("machines.import_success")}
                  </div>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-neutral-700">{importResult.errors.length} {t("machines.import_errors")}</p>
                      {importResult.errors.map((err, i) => (
                        <div key={i} className="p-3 bg-status-error-bg border border-status-error/20 rounded-lg text-sm text-status-error">
                          {t("machines.import_row")} {err.row}: {err.message}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <button onClick={() => { setShowImportModal(false); setImportResult(null); refreshList(); }} className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors">{t("machines.import_close")}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <MachineProfileWizard
          isOpen={showProfileWizard}
          canEdit={canConfigureProfiles}
          editProfileId={editProfileId}
          editStationResourceId={editStationResourceId}
          onClose={() => { setShowProfileWizard(false); setEditProfileId(null); setEditStationResourceId(null); }}
          onProfilesChanged={refreshList}
        />

      </main>
    </div>
  );
}

function MachineInlineEditor({ editor, disabled, onChange, onCancel, onSave, onAdvanced }) {
  const document = editor.document;
  const stationIndex = editor.stationId
    ? document.stations.findIndex((station) => station.stationId === editor.stationId)
    : -1;
  const station = stationIndex >= 0 ? document.stations[stationIndex] : null;

  function updateRoot(key, value) {
    onChange({ ...document, [key]: value });
  }

  function updateStation(key, value) {
    const next = structuredClone(document);
    next.stations[stationIndex][key] = value;
    onChange(next);
  }

  function updateEndpoint(value) {
    const next = structuredClone(document);
    next.stations[stationIndex].connection = {
      ...next.stations[stationIndex].connection,
      endpointUrl: value,
    };
    onChange(next);
  }

  const host = station ? endpointHost(station.connection?.endpointUrl) : null;
  const duplicate = station && host
    ? document.stations.find(
        (candidate, index) =>
          index !== stationIndex &&
          endpointHost(candidate.connection?.endpointUrl) === host,
      )
    : null;
  const incomplete = station
    ? !station.displayName?.trim() ||
      !station.stationId?.trim() ||
      !Number(station.resourceId) ||
      !station.connection?.endpointUrl?.trim()
    : !document.displayName?.trim() || !document.machineId?.trim();

  return (
    <section className="machine-tree-inline-editor">
      <header>
        <div>
          <span>{station ? "Station bearbeiten" : "Maschine bearbeiten"}</span>
          <strong>{station?.displayName || document.displayName}</strong>
        </div>
        <button type="button" onClick={onCancel} aria-label="Editor schließen">×</button>
      </header>
      <div className="machine-tree-editor-grid">
        {station ? (
          <>
            <TreeField label="Stationsname" value={station.displayName} disabled={disabled} onChange={(value) => updateStation("displayName", value)} />
            <TreeField label="Stations-ID" value={station.stationId} disabled={disabled} onChange={(value) => updateStation("stationId", value)} />
            <TreeField label="Ressourcen-ID" type="number" value={station.resourceId} disabled={disabled} onChange={(value) => updateStation("resourceId", Number(value))} />
            <TreeField label="OPC-UA-Endpoint" value={station.connection?.endpointUrl || ""} disabled={disabled} onChange={updateEndpoint} />
            <TreeSelect label="Stationsart" value={station.resourceType || "production"} disabled={disabled} options={["production", "inventory", "storage", "hybrid"]} labels={["Produktion", "Bestand", "Lager", "Hybrid"]} onChange={(value) => updateStation("resourceType", value)} />
            <TreeSelect label="Ebene" value={station.equipmentLevel || "work_unit"} disabled={disabled} options={["work_unit", "component"]} labels={["Work Unit", "Komponente"]} onChange={(value) => updateStation("equipmentLevel", value)} />
            <label className="machine-tree-editor-check"><input type="checkbox" checked={station.enabled !== false} disabled={disabled} onChange={(event) => updateStation("enabled", event.target.checked)} /> Station aktiviert</label>
          </>
        ) : (
          <>
            <TreeField label="Maschinenname" value={document.displayName} disabled={disabled} onChange={(value) => updateRoot("displayName", value)} />
            <TreeField label="Maschinen-ID" value={document.machineId} disabled disabledHint="Nach dem Anlegen stabil" />
            <TreeField label="Hersteller" value={document.manufacturer || ""} disabled={disabled} onChange={(value) => updateRoot("manufacturer", value)} />
            <TreeField label="Modell" value={document.model || ""} disabled={disabled} onChange={(value) => updateRoot("model", value)} />
            <TreeField label="Standort" value={document.location || ""} disabled={disabled} onChange={(value) => updateRoot("location", value)} />
          </>
        )}
      </div>
      {duplicate && <p className="machine-tree-editor-error">Die IP {host} wird bereits von Station {duplicate.displayName || duplicate.stationId} verwendet.</p>}
      <footer>
        <button type="button" onClick={onAdvanced}>Erweiterte Einstellungen</button>
        <div>
          <button type="button" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="profile-primary" disabled={disabled || incomplete || Boolean(duplicate)} onClick={onSave}>{disabled ? "Speichert…" : "Speichern"}</button>
        </div>
      </footer>
    </section>
  );
}

function TreeField({ label, value, onChange, disabled, type = "text", disabledHint }) {
  return <label><span>{label}</span><input type={type} value={value ?? ""} disabled={disabled} onChange={(event) => onChange?.(event.target.value)} />{disabledHint && <small>{disabledHint}</small>}</label>;
}

function TreeSelect({ label, value, onChange, disabled, options, labels }) {
  return <label><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option, index) => <option key={option} value={option}>{labels[index]}</option>)}</select></label>;
}

function formatJobInterface(jobInterface) {
  return ({
    signal_handshake: "Signal-Handshake",
    job_control: "Job Control",
    telemetry_only: "Nur Telemetrie",
  })[jobInterface] || "Schnittstelle nicht angegeben";
}

function buildMachineForest(profiles, machines) {
  const runtimeByResource = new Map(
    machines
      .filter((machine) => machine.resource_id != null)
      .map((machine) => [String(machine.resource_id), machine]),
  );
  const claimedMachineIds = new Set();
  const profileRoots = profiles.map((profile) => {
    const document = profile.document || {};
    const stationNodes = (document.stations || []).map((station) => {
      const runtime = runtimeByResource.get(String(station.resourceId));
      if (runtime?.id) claimedMachineIds.add(runtime.id);
      return {
        ...runtime,
        id: `profile:${profile.profileId}:station:${station.stationId}`,
        name: station.displayName || station.stationId,
        status: runtime?.status || (station.enabled ? "offline" : "disabled"),
        resource_id: station.resourceId,
        parent_resource_id: station.parentResourceId ?? null,
        equipment_level: station.equipmentLevel || "work_unit",
        execution_model: station.executionModel || "machine_job",
        job_interface: station.jobInterface || "telemetry_only",
        opcua_endpoint_url: station.connection?.endpointUrl || null,
        profile_managed: true,
        children: [],
        _nodeKind: "profile-station",
        _profileId: profile.profileId,
        _stationId: station.stationId,
        _stationTypeLabel: formatStationType(station),
      };
    });
    const byResource = new Map(
      stationNodes.map((station) => [String(station.resource_id), station]),
    );
    const children = [];
    for (const station of stationNodes) {
      const parent = station.parent_resource_id == null
        ? null
        : byResource.get(String(station.parent_resource_id));
      if (parent) parent.children.push(station);
      else children.push(station);
    }
    sortTree(children);
    return {
      id: `profile:${profile.profileId}`,
      name: document.displayName || document.machineId || "Unbenannte Maschine",
      status: profile.active || profile.runtimeActiveVersion ? "idle" : "offline",
      equipment_level: "machine",
      profile_managed: true,
      children,
      _nodeKind: "profile-root",
      _profileId: profile.profileId,
      _machineId: document.machineId,
      _profileStatus: profile.status,
      _profileActive: Boolean(profile.active || profile.runtimeActiveVersion),
      _stationTypeLabel: "Maschine",
    };
  });

  const manualMachines = machines.filter(
    (machine) => !claimedMachineIds.has(machine.id) && !machine.profile_managed,
  );
  const manualRoots = buildEquipmentTree(manualMachines).map(decorateManualTree);
  return [...profileRoots, ...manualRoots].sort((left, right) =>
    String(left.name).localeCompare(String(right.name), "de"),
  );
}

function decorateManualTree(node) {
  const isRoot = node.equipment_level === "machine" || node.depth === 0;
  return {
    ...node,
    opcua_endpoint_url: isRoot ? null : node.opcua_endpoint_url,
    children: (node.children || []).map(decorateManualTree),
    _nodeKind: "manual",
    _stationTypeLabel: isRoot ? "Maschine" : node.type || "Station",
  };
}

function sortTree(nodes) {
  nodes.sort(
    (left, right) =>
      Number(left.resource_id || 0) - Number(right.resource_id || 0) ||
      String(left.name).localeCompare(String(right.name), "de"),
  );
  nodes.forEach((node) => sortTree(node.children || []));
}

function flattenMachineTree(tree, expandedIds, expandAll) {
  const rows = [];
  function visit(nodes, depth, ancestorLasts = []) {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      rows.push({
        ...node,
        depth,
        _isLastChild: isLast,
        _treeConnectors: ancestorLasts.slice(1),
      });
      if (expandAll || expandedIds.has(node.id)) {
        visit(node.children || [], depth + 1, [...ancestorLasts, isLast]);
      }
    });
  }
  visit(tree || [], 0);
  return rows;
}

function toggleSetValue(current, value) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function countDescendants(node) {
  return (node.children || []).reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}

function formatStationType(station) {
  const resourceTypes = {
    production: "Produktion",
    inventory: "Bestand",
    storage: "Lager",
    hybrid: "Hybrid",
  };
  const levels = {
    machine: "Maschine",
    work_unit: "Work Unit",
    component: "Komponente",
  };
  return `${resourceTypes[station.resourceType] || "Station"} · ${levels[station.equipmentLevel] || "Work Unit"}`;
}

function formatMachineStatus(machine) {
  if (machine._nodeKind === "profile-root") {
    return machine._profileActive ? "Aktiv" : "Entwurf";
  }
  const labels = {
    online: "Online",
    idle: "Bereit",
    maintenance: "Wartung",
    error: "Fehler",
    disabled: "Deaktiviert",
    offline: "Offline",
  };
  return labels[machine.status] || machine.status || "Offline";
}

function endpointHost(endpointUrl = "") {
  return endpointUrl
    .trim()
    .match(/^opc\.tcp:\/\/(\[[^\]]+\]|[^/:]+)/i)?.[1]
    ?.replace(/^\[|\]$/g, "")
    .toLowerCase();
}
