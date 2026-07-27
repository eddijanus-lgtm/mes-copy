import { useEffect, useMemo, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { StackIcon } from "@phosphor-icons/react/Stack";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import StatCard from "../components/StatCard";
import PageInfo from "../components/PageInfo.jsx";
import MachineProfileWizard from "../components/MachineProfileWizard.jsx";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canConfigureMachineProfiles, canDeleteMachines, canManageMachines } from "../utils/roles.js";
import {
  buildEquipmentTree,
  activeExecutionForResource,
  equipmentExecutionModel,
  equipmentJobInterface,
  equipmentLevel,
  equipmentLevelLabel,
  executionStateLabel,
  filterEquipmentTree,
  flattenEquipmentTree,
  isControllableEquipment,
  isRoutableEquipment,
  normalizeExecutionSteps,
} from "../utils/equipmentModel.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";

export default function MachinesPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [machines, setMachines] = useState([]);
  const [executionSteps, setExecutionSteps] = useState([]);
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
  const canManage = canManageMachines(user);
  const canDelete = canDeleteMachines(user);
  const canConfigureProfiles = canConfigureMachineProfiles(user);

  useEffect(() => {
    const load = () => Promise.all([
      api.getSilent("/machines"),
      api.getSilent("/shopfloor/execution-steps/current").catch(() => ({ items: [] })),
      api.getSilent("/machine-profiles").catch(() => ({ items: [] })),
    ]).then(([machineData, executionData, profileData]) => {
      setMachines(Array.isArray(machineData) ? machineData : []);
      setExecutionSteps(normalizeExecutionSteps(executionData));
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
    const isProfile = deleteCandidate._isUncommissioned;
    const endpoint = isProfile ? "/machine-profiles/" + deleteCandidate.id : "/machines/" + deleteCandidate.id;
    api.del(endpoint).then(() => {
      if (isProfile) {
        setProfiles((prev) => prev.filter((p) => p.profileId !== deleteCandidate.id));
      } else {
        setMachines((prev) => prev.filter((m) => m.id !== deleteCandidate.id));
      }
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

  const mergedEquipment = useMemo(() => {
    const existingResourceIds = new Set(
      machines.map((m) => m.resource_id ?? m.resourceId).filter((id) => id != null).map(String),
    );
    const profileEntries = profiles
      .filter((p) => {
        const resId = p.document?.machineId;
        return resId != null && !existingResourceIds.has(String(resId));
      })
      .map((p) => ({
        id: p.profileId,
        name: p.document?.displayName || p.document?.machineId || p.profileId,
        resource_id: p.document?.machineId != null ? Number(p.document.machineId) : undefined,
        status: "uncommissioned",
        type: "profile",
        equipment_level: "machine",
        _isUncommissioned: true,
        profile_managed: true,
      }));
    return [...machines, ...profileEntries];
  }, [machines, profiles]);

  const equipmentTree = useMemo(() => buildEquipmentTree(mergedEquipment), [mergedEquipment]);
  const visibleEquipment = useMemo(
    () => flattenEquipmentTree(filterEquipmentTree(equipmentTree, search)),
    [equipmentTree, search],
  );
  const machineCount = machines.filter((machine) => equipmentLevel(machine) === "machine").length;
  const workUnitCount = machines.filter((machine) => equipmentLevel(machine) === "work_unit").length;
  const onlineCount = machines.filter((m) => ["online", "running", "idle"].includes(m.status)).length;

  return (
    <div className="mes-page min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">

        <div className="mes-page-header">
          <div>
          <div className="mes-title-row">
            <h1 className="text-2xl font-bold text-neutral-900">{t("machines.title")}</h1>
            <PageInfo page="machines" />
          </div>
          <p className="text-sm text-neutral-500 mt-0.5">{t("machines.subtitle")}</p>
          </div>
        </div>

        {/* Status-Karten */}
        <div className="mes-metric-strip grid grid-cols-3">
          <StatCard label="Maschinen" value={String(machineCount || equipmentTree.length)} icon={<StackIcon size={24} weight="thin" />} />
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

        {/* Tabelle */}
        {visibleEquipment.length > 0 ? (
          <div className="mes-panel">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.resource")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.equipment")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.execution")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.current_step")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.status")}</th>
                  {canManage && <th className="px-5 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("machines.actions")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {visibleEquipment.map((m) => {
                  const statusOk = ["online", "running", "idle"].includes(m.status);
                  const currentStep = activeExecutionForResource(executionSteps, m.resource_id ?? m.resourceId);
                  return (
                    <tr key={m.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3.5 text-xs font-mono text-neutral-500">{m.resource_id != null ? `R${m.resource_id}` : (m.id || "").substring(0, 8)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-start gap-1.5 text-sm text-neutral-800">
                          <span className="tree-connectors shrink-0 font-mono text-neutral-400 select-none" style={{ width: `${Math.max(m.depth, 0) * 18}px`, display: 'inline-flex', alignItems: 'center' }}>
                            {m.depth > 0 && (
                              <>
                                {m._treeConnectors?.map((isLast, i) => (
                                  <span key={i} style={{ width: 18, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', lineHeight: 1 }}>
                                    {!isLast ? '│' : ' '}
                                  </span>
                                ))}
                                <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', lineHeight: 1 }}>
                                  {m._isLastChild ? '└' : '├'}
                                </span>
                              </>
                            )}
                          </span>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusOk ? "bg-status-success" : (m._isUncommissioned ? "bg-neutral-300" : "bg-status-error")}`} />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className={equipmentLevel(m) === "machine" ? "font-semibold" : "font-medium"}>{m.name || m.machineName || "-"}</strong>
                              <small className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">{equipmentLevelLabel(m)}</small>
                            </div>
                            <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-neutral-500">
                              {isRoutableEquipment(m) ? <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700">{t("machines.routable")}</span> : <span className="rounded bg-neutral-50 px-2 py-0.5">{t("machines.telemetry_only")}</span>}
                              {isControllableEquipment(m) ? <span className="rounded bg-violet-50 px-2 py-0.5 text-violet-700">{t("machines.controllable")}</span> : null}
                              {m.profile_managed ? <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-brand-primary">{t("machines.profile")}</span> : null}
                              {m._isUncommissioned ? <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">{t("machines.inactive")}</span> : null}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-neutral-600">
                        <p className="font-medium text-neutral-700">{formatExecutionModel(equipmentExecutionModel(m))}</p>
                        <p className="mt-1 text-neutral-400">{formatJobInterface(equipmentJobInterface(m))}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-neutral-600">
                        {currentStep ? (
                          <>
                            <p className="font-medium text-neutral-800">{currentStep.operation}</p>
                            <p className="mt-1 text-neutral-400">{executionStateLabel(currentStep.state)}{currentStep.carrier_number != null ? ` · C-${String(currentStep.carrier_number).padStart(4, "0")}` : ""}</p>
                          </>
                        ) : <span className="text-neutral-400">{t("machines.no_active_step")}</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {m._isUncommissioned ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-500">
                            {t("machines.inactive_status")}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${statusOk ? "bg-status-bg-success text-status-success" : "bg-status-bg-error text-status-error"}` }>
                            {m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : "-"}
                          </span>
                        )}
                      </td>
                      {canManage && <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(m)} className="mx-1 px-3 py-1.5 text-xs font-medium text-neutral-dark bg-neutral-stroke rounded-md hover:bg-neutral-border transition-colors">
                          {t("common.edit")}
                        </button>
                        {canDelete && (
                          <button onClick={() => requestDelete(m)} className="ml-1 px-2.5 py-1.5 text-xs font-bold text-white bg-status-error rounded-full hover:bg-[var(--color-status-error-dark)] transition-colors leading-none">
                            ×
                          </button>
                        )}
                      </td>}
                    </tr>
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error">{t("machines.delete_station_title")}</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">{deleteCandidate.name || "Station"} wirklich löschen?</h2>
              <p className="mt-2 text-sm text-neutral-500">{t("machines.delete_station_confirm")}</p>
              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p><span className="font-medium text-neutral-600">Typ:</span> {deleteCandidate.type || "-"}</p>
                <p><span className="font-medium text-neutral-600">Status:</span> {deleteCandidate.status || "-"}</p>
                <p><span className="font-medium text-neutral-600">Standort:</span> {deleteCandidate.location || "-"}</p>
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
                      <li>Spalten: name, type, status, location, model, serial_number, resource_id, opcua_endpoint_url, opcua_node_prefix, opcua_enabled</li>
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

function formatExecutionModel(model) {
  return ({
    machine_job: "Maschinenauftrag",
    work_unit_jobs: "Work-Unit-Jobs",
  })[model] || "Bestandsprofil";
}

function formatJobInterface(jobInterface) {
  return ({
    signal_handshake: "Signal-Handshake",
    job_control: "Job Control",
    telemetry_only: "Nur Telemetrie",
  })[jobInterface] || "Schnittstelle nicht angegeben";
}
