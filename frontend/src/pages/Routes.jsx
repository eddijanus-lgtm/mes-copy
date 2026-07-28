import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { XIcon } from "@phosphor-icons/react/X";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import Button from "../design-system/components/Button.jsx";
import PageHeader from "../design-system/components/PageHeader.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import "./routes.css";

const EMPTY_FORM = {
  id: null,
  name: "",
  part_no: "",
  profile_machine_id: "",
  route_steps: [],
};

export default function RoutesPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canEdit = hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
  const canDelete = hasRole(user, ROLES.ADMIN);

  function load() {
    setLoading(true);
    return Promise.all([api.get("/products"), api.get("/machine-profiles")])
      .then(([products, machineProfiles]) => {
        setRoutes(Array.isArray(products) ? products : []);
        setProfiles(Array.isArray(machineProfiles?.items) ? machineProfiles.items : []);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.document?.machineId === form.profile_machine_id),
    [profiles, form.profile_machine_id],
  );
  const stations = selectedProfile?.document?.stations?.filter((station) => station.enabled) || [];

  function startNew() {
    const machineId = profiles[0]?.document?.machineId || "";
    setForm({
      ...EMPTY_FORM,
      part_no: `ROUTE-${String(routes.length + 1).padStart(3, "0")}`,
      profile_machine_id: machineId,
    });
    setError("");
    setOpen(true);
  }

  function editRoute(route) {
    setForm({
      id: route.id,
      name: route.name,
      part_no: route.part_no,
      profile_machine_id: route.profile_machine_id || "",
      route_steps: normalizeSteps(route.route_steps || []),
    });
    setError("");
    setOpen(true);
  }

  function changeMachine(machineId) {
    setForm((current) => ({ ...current, profile_machine_id: machineId, route_steps: [] }));
  }

  function addStep() {
    const station = stations[0];
    if (!station) return;
    setForm((current) => ({
      ...current,
      route_steps: normalizeSteps([
        ...current.route_steps,
        {
          step_no: current.route_steps.length + 1,
          resource_id: station.resourceId,
          operation_no: operationFor(station).operationNo,
          operation: operationFor(station).name,
          parameters: {},
        },
      ]),
    }));
  }

  function removeStep(index) {
    setForm((current) => ({
      ...current,
      route_steps: normalizeSteps(current.route_steps.filter((_, itemIndex) => itemIndex !== index)),
    }));
  }

  function updateStep(index, patch) {
    setForm((current) => ({
      ...current,
      route_steps: current.route_steps.map((step, itemIndex) =>
        itemIndex === index ? { ...step, ...patch } : step,
      ),
    }));
  }

  function selectStation(index, resourceId) {
    const station = stations.find((candidate) => candidate.resourceId === Number(resourceId));
    if (!station) return;
    const action = operationFor(station);
    updateStep(index, {
      resource_id: station.resourceId,
      operation_no: action.operationNo,
      operation: action.name,
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!form.route_steps.length) {
      setError("Die Route benötigt mindestens eine Stationsaktion.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      part_no: form.part_no.trim(),
      name: form.name.trim(),
      profile_machine_id: form.profile_machine_id,
      is_active: true,
      parameter_definitions: [],
      route_steps: normalizeSteps(form.route_steps),
    };
    try {
      if (form.id) await api.patch(`/products/${form.id}`, payload);
      else await api.post("/products", payload);
      setOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoute(route) {
    if (!window.confirm(`Route ${route.name} wirklich löschen?`)) return;
    try {
      await api.del(`/products/${route.id}`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="mes-page routes-page">
      <main>
        <PageHeader
          className="routes-header"
          title="Routenplanung"
          description="Produktbezogene Arbeitspläne aus den freigegebenen Stationen einer Anlage."
          titleAccessory={<PageInfo page="routes" />}
          actions={canEdit ? <Button onClick={startNew}>Neue Route anlegen</Button> : null}
        />
        {error && !open && <p className="routes-error">{error}</p>}
        {loading ? <p className="routes-empty">Routen werden geladen…</p> : routes.length ? (
          <div className="routes-list">
            {routes.map((route) => {
              const profile = profiles.find((item) => item.document?.machineId === route.profile_machine_id);
              return <article key={route.id} className="route-card">
                <header><div><span>{route.part_no}</span><h2>{route.name}</h2><small>{profile?.document?.displayName || route.profile_machine_id || "Keine Anlage"}</small></div><div>{canEdit && <button onClick={() => editRoute(route)}>Bearbeiten</button>}{canDelete && <button className="route-delete" aria-label={`Route ${route.name} löschen`} title="Route löschen" onClick={() => deleteRoute(route)}><TrashIcon size={15} aria-hidden="true" /></button>}</div></header>
                <ol>{(route.route_steps || []).map((step, index) => <li key={step.id || `${step.step_no}-${index}`}><b>{index + 1}</b><div><strong>{step.operation}</strong><small>{stationName(profile, step.resource_id)} · R{step.resource_id}</small></div></li>)}</ol>
              </article>;
            })}
          </div>
        ) : <p className="routes-empty">Noch keine Routen angelegt.</p>}
      </main>

      {open && <div className="route-dialog-backdrop" onMouseDown={() => !saving && setOpen(false)}><section className="route-dialog" role="dialog" aria-modal="true" aria-labelledby="route-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>Routenplanung</span><h2 id="route-dialog-title">{form.id ? "Route bearbeiten" : "Neue Route anlegen"}</h2></div><button type="button" aria-label="Routenplanung schließen" title="Schließen" onClick={() => setOpen(false)}><XIcon size={16} aria-hidden="true" /></button></header>
        <form onSubmit={save}>
          {error && <p className="routes-error">{error}</p>}
          <div className="route-form-grid">
            <RouteField label="Routenname" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required />
            <RouteField label="Routen-ID" value={form.part_no} onChange={(value) => setForm((current) => ({ ...current, part_no: value }))} required />
            <label><span>Anlage</span><select value={form.profile_machine_id} onChange={(event) => changeMachine(event.target.value)} required><option value="">Anlage auswählen</option>{profiles.map((profile) => <option key={profile.profileId} value={profile.document?.machineId}>{profile.document?.displayName || profile.document?.machineId}</option>)}</select></label>
          </div>
          <div className="route-actions-heading"><div><strong>Arbeitsschritte</strong><small>Reihenfolge und Station werden hier festgelegt. Die ausführbare Aktion kommt aus der Stationskonfiguration.</small></div><button type="button" className="route-add-step" onClick={addStep} disabled={!stations.length}><PlusIcon size={15} aria-hidden="true" /> Schritt hinzufügen</button></div>
          <div className="route-actions-list">
            {form.route_steps.map((step, index) => {
              const station = stations.find((candidate) => candidate.resourceId === step.resource_id);
              const action = station ? operationFor(station) : null;
              return <div className="route-action-row" key={`${index}-${step.resource_id}`}><b>{index + 1}</b><label><span>Station</span><select aria-label={`Station für Schritt ${index + 1}`} value={step.resource_id} onChange={(event) => selectStation(index, event.target.value)}>{stations.map((item) => <option key={item.stationId} value={item.resourceId}>{item.displayName}</option>)}</select></label><div className="route-action-operation"><span>Stationsaktion</span><strong>{action?.name || step.operation}</strong><small>Operation {action?.operationNo || step.operation_no}</small></div><button type="button" className="route-action-delete" aria-label={`Schritt ${index + 1} entfernen`} title="Schritt entfernen" onClick={() => removeStep(index)}><TrashIcon size={15} aria-hidden="true" /></button></div>;
            })}
            {!form.route_steps.length && <p>{stations.length ? "Fügen Sie den ersten Arbeitsschritt hinzu." : "Aktivieren Sie zuerst mindestens eine Station in der gewählten Anlage."}</p>}
          </div>
          <footer><button type="button" onClick={() => setOpen(false)}>Abbrechen</button><button type="submit" className="routes-primary" disabled={saving || !form.profile_machine_id}>{saving ? "Speichert…" : "Route speichern"}</button></footer>
        </form>
      </section></div>}
    </div>
  );
}

function RouteField({ label, value, onChange, required }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function normalizeSteps(steps) {
  return steps.map((step, index) => ({ ...step, step_no: index + 1, parameters: step.parameters || {} }));
}

function operationFor(station) {
  return {
    operationNo: station.routing?.operationNo || station.resourceId,
    name: station.routing?.operation?.trim() || station.displayName?.trim() || "Standardaktion",
  };
}

function stationName(profile, resourceId) {
  return profile?.document?.stations?.find((station) => station.resourceId === resourceId)?.displayName || "Unbekannte Station";
}
