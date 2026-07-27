import { useEffect, useMemo, useState } from "react";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { StackIcon } from "@phosphor-icons/react/Stack";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import StatCard from "../components/StatCard";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canDeleteMachines, canManageMachines } from "../utils/roles.js";
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

export default function MachinesPage() {
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [executionSteps, setExecutionSteps] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", type: "CNC", status: "offline", location: "" });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const canManage = canManageMachines(user);
  const canDelete = canDeleteMachines(user);

  useEffect(() => {
    const load = () => Promise.all([
      api.getSilent("/machines"),
      api.getSilent("/shopfloor/execution-steps/current").catch(() => ({ items: [] })),
    ]).then(([machineData, executionData]) => {
      setMachines(Array.isArray(machineData) ? machineData : []);
      setExecutionSteps(normalizeExecutionSteps(executionData));
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
    api.del("/machines/" + deleteCandidate.id).then(() => {
      setMachines((prev) => prev.filter((m) => m.id !== deleteCandidate.id));
      setDeleteCandidate(null);
    }).catch((requestError) => setError(requestError.message)).finally(() => setDeleting(false));
  }

  function handleEdit(m) {
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
    api.get("/machines").then((d) => {
      setMachines(Array.isArray(d) ? d : []);
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

  const equipmentTree = useMemo(() => buildEquipmentTree(machines), [machines]);
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
          <h1 className="text-2xl font-bold text-neutral-900">Stationen</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Maschinen, Work Units und Komponenten mit ihrer tatsächlichen Hierarchie.</p>
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
          {canManage && (
            <button onClick={downloadTemplate} className="bg-white border border-neutral-200 text-neutral-700 font-medium px-4 py-2.5 rounded-lg text-sm hover:bg-neutral-50 transition-colors">
              CSV Template herunterladen
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowImportModal(true)} className="bg-white border border-brand-primary/30 text-brand-primary font-medium px-4 py-2.5 rounded-lg text-sm hover:bg-brand-primary/5 transition-colors">
              CSV Importieren
            </button>
          )}
          {canManage && (
            <button onClick={() => { setForm({ id: null, name: "", type: "CNC", status: "offline", location: "" }); setShowModal(true); }} className="bg-brand-primary text-white font-medium px-5 py-2.5 rounded-lg text-sm hover:bg-[var(--color-brand-primary-dark)] transition-colors">
              + Neue Station
            </button>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

        {/* Suche */}
        <input
          type="text"
          placeholder="Stationen durchsuchen..."
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
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ressource</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Equipment</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ausführung</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Aktueller Schritt</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  {canManage && <th className="px-5 py-3 text-right text-xs font-semibold text-neutral-500 uppercase tracking-wider">Aktionen</th>}
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
                        <div className="flex items-start gap-2 text-sm text-neutral-800" style={{ paddingLeft: `${m.depth * 24}px` }}>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusOk ? "bg-status-success" : "bg-status-error"}`} />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className={equipmentLevel(m) === "machine" ? "font-semibold" : "font-medium"}>{m.name || m.machineName || "-"}</strong>
                              <small className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">{equipmentLevelLabel(m)}</small>
                            </div>
                            <p className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-neutral-500">
                              {isRoutableEquipment(m) ? <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700">routbar</span> : <span className="rounded bg-neutral-50 px-2 py-0.5">nur Telemetrie</span>}
                              {isControllableEquipment(m) ? <span className="rounded bg-violet-50 px-2 py-0.5 text-violet-700">steuerbar</span> : null}
                              {m.profile_managed ? <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-brand-primary">Profil</span> : null}
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
                        ) : <span className="text-neutral-400">Kein aktiver Schritt</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${statusOk ? "bg-status-bg-success text-status-success" : "bg-status-bg-error text-status-error"}` }>
                          {m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : "-"}
                        </span>
                      </td>
                      {canManage && <td className="px-5 py-3.5 text-right">
                        {!m.profile_managed ? (
                          <button onClick={() => handleEdit(m)} className="mx-1 px-3 py-1.5 text-xs font-medium text-neutral-dark bg-neutral-stroke rounded-md hover:bg-neutral-border transition-colors">
                            Edit
                          </button>
                        ) : null}
                        {canDelete && !m.profile_managed && (
                        <button onClick={() => requestDelete(m)} className="ml-2 px-3 py-1.5 text-xs font-medium text-white bg-status-error rounded-md hover:bg-[var(--color-status-error-dark)] transition-colors">
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
          <p className="text-center text-neutral-400 py-12 text-sm">Keine Stationen gefunden</p>
        )}

        {/* Modal */}
        {showModal && (
          <div onClick={() => setShowModal(false)} className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">{form.id ? "Station bearbeiten" : "Neue Station"}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required           className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Typ</label>
                    <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                    <option value="CNC">CNC</option>
                    <option value="PLC">PLC</option>
                    <option value="Roboter">Roboter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                    <option value="idle">Bereit / Idle</option>
                    <option value="maintenance">Wartung</option>
                    <option value="error">Fehler</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Standort</label>
                  <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => { setShowModal(false); setForm({ id: null, name: "", type: "CNC", status: "offline", location: "" }); }} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
                    Abbrechen
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors">
                    Speichern
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteCandidate && (
          <div onClick={() => !deleting && setDeleteCandidate(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error">Station löschen</p>
              <h2 className="mt-2 text-lg font-bold text-neutral-900">{deleteCandidate.name || "Station"} wirklich löschen?</h2>
              <p className="mt-2 text-sm text-neutral-500">Diese Aktion entfernt die Station aus der MES-Konfiguration. Laufende HTTP- oder Browser-Dialoge werden dabei nicht verwendet.</p>
              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p><span className="font-medium text-neutral-600">Typ:</span> {deleteCandidate.type || "-"}</p>
                <p><span className="font-medium text-neutral-600">Status:</span> {deleteCandidate.status || "-"}</p>
                <p><span className="font-medium text-neutral-600">Standort:</span> {deleteCandidate.location || "-"}</p>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" disabled={deleting} onClick={() => setDeleteCandidate(null)} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50">Abbrechen</button>
                <button type="button" disabled={deleting} onClick={handleDelete} className="rounded-lg bg-status-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-status-error-dark)] disabled:opacity-50">{deleting ? "Loescht..." : "Loeschen"}</button>
              </div>
            </div>
          </div>
        )}

        {/* CSV Import Modal */}
        {showImportModal && (
          <div onClick={() => { setShowImportModal(false); setImportResult(null); setError(""); }} className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-lg p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">Machines via CSV importieren</h2>

              {!importResult && (
                <form onSubmit={handleImportSubmit} className="space-y-4">
                  <div className="p-4 bg-brand-primary/5 border border-brand-primary/20 rounded-lg text-sm text-brand-primary">
                    <p className="font-semibold mb-1">Hinweise:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Download des CSV-Templates uber den Button weiter unten</li>
                      <li>Spalten: name, type, status, location, model, serial_number, resource_id, opcua_endpoint_url, opcua_node_prefix, opcua_enabled</li>
                      <li>Leere Zeilen und zeilen mit # werden ubergangen</li>
                    </ul>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={downloadTemplate} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
                      CSV Template herunterladen
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">CSV Datei</label>
                    <input id="csv-file-input" type="file" accept=".csv" onChange={(e) => { setError(""); setImportResult(null); }} className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                  </div>

                  <div className="flex gap-2 justify-end pt-2">
                    <button type="button" onClick={() => { setShowImportModal(false); setImportResult(null); setError(""); }} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">Abbrechen</button>
                    <button type="submit" disabled={importing} className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors disabled:opacity-50">{importing ? "Importiere..." : "CSV importieren"}</button>
                  </div>
                </form>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="p-4 bg-status-bg-success text-status-success rounded-lg text-sm font-medium">
                    {importResult.imported} Maschinen erfolgreich importiert
                  </div>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-neutral-700">{importResult.errors.length} Fehler:</p>
                      {importResult.errors.map((err, i) => (
                        <div key={i} className="p-3 bg-status-error-bg border border-status-error/20 rounded-lg text-sm text-status-error">
                          Zeile {err.row}: {err.message}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <button onClick={() => { setShowImportModal(false); setImportResult(null); refreshList(); }} className="px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-lg hover:bg-[var(--color-brand-primary-dark)] transition-colors">Schliessen</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
