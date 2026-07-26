import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canDeleteOrders, canManageOrders } from "../utils/roles.js";

const EMPTY_FORM = { id: null, name: "", priority: 1, machine_id: "", product_id: "", operation: "Produktion", quantity: 1, completed_quantity: 0, status: "pending", production_parameters: {} };
const STATUS_LABELS = { pending: "Ausstehend", in_progress: "In Arbeit", completed: "Abgeschlossen", cancelled: "Abgebrochen", on_hold: "Pausiert" };

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderParameterDefinitions, setOrderParameterDefinitions] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [routes, setRoutes] = useState({});
  const [productionLogs, setProductionLogs] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const canManage = canManageOrders(user);
  const canDelete = canDeleteOrders(user);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      const [orderData, machineData, productData, parameterData, carrierData] = await Promise.all([api.get("/orders"), api.get("/machines"), api.get("/products"), api.get("/shopfloor/machine/order-parameters"), api.get("/carriers")]);
      const safeOrders = Array.isArray(orderData) ? orderData : [];
      setOrders(safeOrders);
      setMachines(sortMachines(Array.isArray(machineData) ? machineData : []));
      setProducts(Array.isArray(productData) ? productData : []);
      setOrderParameterDefinitions(Array.isArray(parameterData) ? parameterData : Array.isArray(parameterData?.parameters) ? parameterData.parameters : []);
      setCarriers(Array.isArray(carrierData) ? carrierData : []);
      const routeEntries = await Promise.all(safeOrders.map((order) => api.get(`/orders/${order.id}/route`).then((route) => [order.id, route]).catch(() => [order.id, []])));
      setRoutes(Object.fromEntries(routeEntries));
      const completedOrders = safeOrders.filter((order) => order.status === "completed");
      const logEntries = await Promise.all(completedOrders.map((order) => api.get(`/orders/${order.id}/production-log`).then((log) => [order.id, log]).catch(() => [order.id, null])));
      setProductionLogs(Object.fromEntries(logEntries));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function openCreate() {
    const product = products.find((entry) => entry.is_active);
    const startMachine = startMachineForProduct(machines, product) || machines[0];
    setError("");
    setForm({ ...EMPTY_FORM, name: nextOrderName(orders), machine_id: startMachine?.id || "", product_id: product?.id || "", operation: product?.name || EMPTY_FORM.operation, production_parameters: defaultParameters(orderParameterDefinitions) });
    setModalOpen(true);
  }

  function openEdit(order) {
    setError("");
    setForm({ ...EMPTY_FORM, id: order.id, name: order.name, priority: order.priority, machine_id: order.machine_id, product_id: order.product_id || "", operation: order.operation, quantity: order.quantity, completed_quantity: order.completed_quantity, status: order.status });
    setModalOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = { name: form.name.trim(), priority: Number(form.priority), machine_id: form.machine_id, product_id: form.product_id || undefined, operation: form.operation.trim(), quantity: Number(form.quantity) };
    if (!form.id) payload.production_parameters = normalizeParameters(orderParameterDefinitions, form.production_parameters);
    if (form.id) {
      payload.status = form.status;
      payload.completed_quantity = Number(form.completed_quantity);
    }
    try {
      if (form.id) await api.patch(`/orders/${form.id}`, payload);
      else await api.post("/orders", payload);
      await refresh();
      setModalOpen(false);
      setForm(EMPTY_FORM);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(order) {
    setError("");
    setDeleteCandidate(order);
  }

  async function remove() {
    if (!deleteCandidate) return;
    setError("");
    setDeleting(true);
    try {
      await api.del(`/orders/${deleteCandidate.id}`);
      await refresh();
      setDeleteCandidate(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeleting(false);
    }
  }

  const machineNames = Object.fromEntries(machines.map((machine) => [machine.id, machine.name]));
  const productNames = Object.fromEntries(products.map((product) => [product.id, product.name]));
  const resourceNames = Object.fromEntries(machines.map((machine) => [machine.resource_id, machine.name]));
  const carriersByOrder = carriers.reduce((groups, carrier) => {
    if (!carrier.order_id) return groups;
    return { ...groups, [carrier.order_id]: [...(groups[carrier.order_id] || []), carrier] };
  }, {});
  const filtered = orders.filter((order) => {
    const matchesText = !search || `${order.name} ${order.operation}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (statusFilter === "all" || order.status === statusFilter);
  });

  return (
    <div className="mes-page min-h-screen bg-neutral-50 p-6 space-y-6">
      <header className="mes-page-header">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Produktionsaufträge</h1>
          <p className="mt-1 text-sm text-neutral-500">Ein Auftrag erzeugt Route, Carrier-Zuordnung und stMES-Freigaben für die Anlage.</p>
        </div>
        {canManage && <button onClick={openCreate} disabled={machines.length === 0} className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50">+ Neuer Auftrag</button>}
      </header>

      <ProcessHint />

      <div className="mes-metric-strip grid sm:grid-cols-3">
        <OrderStat label="Alle Aufträge" value={orders.length} />
        <OrderStat label="In Arbeit" value={orders.filter((order) => order.status === "in_progress").length} accent="amber" />
        <OrderStat label="Abgeschlossen" value={orders.filter((order) => order.status === "completed").length} accent="green" />
      </div>

      {machines.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Vor dem ersten Auftrag muss mindestens eine Station angelegt werden.</p>}
      {error && <p role="alert" className="rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error">{error}</p>}

      <div className="mes-filter-panel grid gap-3 sm:grid-cols-[1fr_220px]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Auftrag oder Operation suchen..." className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none">
          <option value="all">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="mes-card-list">
        {filtered.map((order) => <OrderCard key={order.id} order={order} route={routes[order.id] || []} productionLog={productionLogs[order.id]} carriers={carriersByOrder[order.id] || []} machineName={machineNames[order.machine_id]} productName={productNames[order.product_id]} resourceNames={resourceNames} canManage={canManage} canDelete={canDelete} onEdit={openEdit} onDelete={requestDelete} />)}
        {filtered.length === 0 && <p className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-400">Keine passenden Aufträge gefunden.</p>}
      </div>

      {modalOpen && <OrderModal form={form} setForm={setForm} machines={machines} products={products} orderParameterDefinitions={orderParameterDefinitions} carriers={carriers} saving={saving} onSubmit={submit} onClose={() => { setModalOpen(false); setForm(EMPTY_FORM); }} />}
      {deleteCandidate && <DeleteOrderDialog order={deleteCandidate} deleting={deleting} onCancel={() => setDeleteCandidate(null)} onConfirm={remove} />}
    </div>
  );
}

function DeleteOrderDialog({ order, deleting, onCancel, onConfirm }) {
  return (
    <div onClick={() => !deleting && onCancel()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error">Auftrag löschen</p>
        <h2 className="mt-2 text-lg font-bold text-neutral-900">{order.name} wirklich löschen?</h2>
        <p className="mt-2 text-sm text-neutral-500">Der Auftrag und seine Route werden entfernt. Diese Abfrage bleibt im MES-UI und nutzt keinen Browser-Dialog.</p>
        <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <p><span className="font-medium text-neutral-600">Status:</span> {STATUS_LABELS[order.status] || order.status}</p>
          <p><span className="font-medium text-neutral-600">Menge:</span> {order.completed_quantity}/{order.quantity}</p>
          <p><span className="font-medium text-neutral-600">Operation:</span> {order.operation}</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={deleting} onClick={onCancel} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50">Abbrechen</button>
          <button type="button" disabled={deleting} onClick={onConfirm} className="rounded-lg bg-status-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-status-error-dark)] disabled:opacity-50">{deleting ? "Loescht..." : "Loeschen"}</button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, route, productionLog, carriers, machineName, productName, resourceNames, canManage, canDelete, onEdit, onDelete }) {
  return (
    <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-neutral-900">{order.name}</p>
              <p className="mt-1 text-sm text-neutral-500">{productName || order.operation} · Startstation: {machineName || "Unbekannt"}</p>
              <p className="mt-1 font-mono text-[10px] text-neutral-400">{order.id}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Priorität" value={`P${order.priority}`} />
            <MiniMetric label="Menge" value={`${order.completed_quantity}/${order.quantity}`} />
            <MiniMetric label="Fortschritt" value={`${progress(order)}%`} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-brand-primary" style={{ width: `${progress(order)}%` }} /></div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Arbeitsplan / Route</p>
          <div className="mt-3 grid gap-2">
            {route.length === 0 && <p className="text-sm text-neutral-400">Noch keine Route hinterlegt.</p>}
            {route.map((step) => <RouteStep key={step.id || step.step_no} step={step} stationName={resourceNames[step.resource_id]} />)}
          </div>
        </div>
      </div>

      {order.status === "completed" && <ProductionLog log={productionLog} resourceNames={resourceNames} />}

      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CarrierChips carriers={carriers} />
          {canManage && <div className="flex justify-end gap-2"><button onClick={() => onEdit(order)} className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-brand-primary hover:text-brand-primary">Bearbeiten</button>{canDelete && <button onClick={() => onDelete(order)} className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">Löschen</button>}</div>}
        </div>
      </div>
    </article>
  );
}

function ProductionLog({ log, resourceNames }) {
  if (!log?.snapshot) {
    return <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">Der Produktionsabschluss ist vorhanden, das Auftragslog konnte aber noch nicht geladen werden.</div>;
  }
  const snapshot = log.snapshot;
  const successfulSteps = snapshot.station_executions.filter((entry) => entry.result_code === 0).length;
  return (
    <details className="group border-t border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
        <span>Auftragslog · {successfulSteps}/{snapshot.station_executions.length} Stationsschritte erfolgreich</span>
        <span className="text-xs font-medium text-neutral-500 group-open:hidden">Anzeigen</span>
        <span className="hidden text-xs font-medium text-neutral-500 group-open:inline">Schließen</span>
      </summary>
      <div className="border-t border-neutral-100 px-5 pb-5 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LogMetric label="Produktionsstart" value={formatDateTime(snapshot.order.started_at)} />
          <LogMetric label="Produktionsende" value={formatDateTime(snapshot.order.completed_at)} />
          <LogMetric label="Dauer" value={formatDuration(snapshot.order.duration_ms)} />
          <LogMetric label="Carrier" value={snapshot.carriers.length ? snapshot.carriers.map((carrier) => `#${carrier}`).join(", ") : "–"} />
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200">
          {snapshot.station_executions.map((entry, index) => {
            const routeStep = snapshot.route.find((step) => step.resource_id === entry.resource_id);
            return (
              <div key={`${entry.resource_id}-${entry.carrier_number}-${entry.requested_at}`} className={`grid gap-3 px-4 py-3 text-sm lg:grid-cols-[60px_1fr_160px_120px] ${index ? "border-t border-neutral-100" : ""}`}>
                <span className="font-semibold text-neutral-500">R{entry.resource_id}</span>
                <span><strong className="text-neutral-800">{resourceNames[entry.resource_id] || routeStep?.operation || "Station"}</strong><span className="ml-2 text-neutral-500">Carrier {entry.carrier_number}</span></span>
                <span className="text-neutral-500">{formatDateTime(entry.requested_at)}</span>
                <span className={`font-semibold ${entry.result_code === 0 ? "text-emerald-700" : "text-red-700"}`}>{entry.result_code === 0 ? "Erfolgreich" : `Fehler ${entry.result_code ?? "–"}`}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Qualitätsstatus: nicht bewertet.</strong> {snapshot.quality.note}
        </div>
      </div>
    </details>
  );
}

function OrderModal({ form, setForm, machines, products, orderParameterDefinitions, carriers, saving, onSubmit, onClose }) {
  const availableCount = carriers.filter((c) => c.status === "available").length;
  const activeProducts = products.filter((product) => product.is_active);
  const product = selectedProduct(products, form.product_id);
  const parameterDefinitions = orderParameterDefinitions;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/50 p-4" onMouseDown={onClose}>
      <div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-neutral-100 px-6 py-5"><p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Produktionsplanung</p><h2 className="mt-1 text-xl font-bold text-neutral-900">{form.id ? "Auftrag bearbeiten" : "Neuen Auftrag anlegen"}</h2></div>
        <form onSubmit={onSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Auftragsname"><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="form-input" /></Field>
          <Field label="Startstation"><select required value={form.machine_id} onChange={(event) => setForm((current) => ({ ...current, machine_id: event.target.value }))} className="form-input"><option value="">Station wählen</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></Field>
          <Field label="Produkt"><select value={form.product_id} onChange={(event) => { const nextProduct = selectedProduct(products, event.target.value); const startMachine = startMachineForProduct(machines, nextProduct); setForm((current) => ({ ...current, product_id: event.target.value, machine_id: startMachine?.id || current.machine_id, operation: nextProduct?.name || current.operation, production_parameters: defaultParameters(orderParameterDefinitions) })); }} className="form-input"><option value="">Kein Produktstamm</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.part_no} · {product.name}</option>)}</select></Field>
          <Field label="Produkt / Operation"><input required value={form.operation} onChange={(event) => setForm((current) => ({ ...current, operation: event.target.value }))} className="form-input" /></Field>
          <Field label="Priorität"><input required type="number" min="1" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="form-input" /></Field>
          <Field label={`Menge (max. ${availableCount})`}><input required type="number" min="1" max={availableCount} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} className="form-input" /></Field>
          {!form.id && parameterDefinitions.length > 0 && <section className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:col-span-2 sm:grid-cols-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:col-span-4">Produktkonfiguration</p>
            {parameterDefinitions.map((definition) => <ParameterField key={definition.key} definition={definition} value={form.production_parameters[definition.key]} onChange={(value) => setForm((current) => ({ ...current, production_parameters: { ...current.production_parameters, [definition.key]: value } }))} />)}
          </section>}
          {!form.id && parameterDefinitions.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:col-span-2">Der Maschinenadapter liefert aktuell keine Auftragsparameter.</p>}
          {form.id && <Field label="Fertigmenge"><input required type="number" min="0" max={form.quantity} value={form.completed_quantity} onChange={(event) => setForm((current) => ({ ...current, completed_quantity: event.target.value }))} className="form-input" /></Field>}
          {form.id && <Field label="Status"><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="form-input">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
          {!form.id && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:col-span-2"><strong>Wird automatisch angelegt:</strong> Ein Arbeitsplan ab der gewählten Startstation über alle nachfolgenden Stationen der Linie und {form.quantity} von {availableCount} verfügbaren Carriern.</div>}
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Abbrechen</button><button disabled={saving} type="submit" className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Speichert..." : "Speichern"}</button></div>
        </form>
      </div>
    </div>
  );
}

function ProcessHint() { return <section className="mes-context-note"><strong>Ablauf:</strong> Beim Erstellen eines Auftrags werden Arbeitsplan, Carrier-Zuordnung und stMES-Freigaben für die angebundene Anlage vorbereitet.</section>; }
function RouteStep({ step, stationName }) { return <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"><span><strong>{step.step_no}. {step.operation}</strong><span className="ml-2 text-neutral-500">OP {step.operation_no}</span></span><span className="text-xs text-neutral-500">R{step.resource_id} · {stationName || "Station"}</span></div>; }
function CarrierChips({ carriers }) { return <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Werkstückträger</span>{carriers.length === 0 && <span className="text-sm text-neutral-400">noch nicht zugeordnet</span>}{carriers.map((carrier) => <span key={carrier.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm">Carrier {carrier.carrier_number} · {carrierStatus(carrier.status)} · Schritt {carrier.current_step_no}</span>)}</div>; }
function Field({ label, children }) { return <label className="space-y-1.5 text-sm font-medium text-neutral-700"><span>{label}</span>{children}</label>; }
function MiniMetric({ label, value }) { return <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-1 text-lg font-bold text-neutral-900">{value}</p></div>; }
function LogMetric({ label, value }) { return <div className="rounded-lg bg-neutral-50 p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-1 text-sm font-semibold text-neutral-800">{value}</p></div>; }
function OrderStat({ label, value, accent = "neutral" }) { const colors = accent === "green" ? "text-emerald-700" : accent === "amber" ? "text-amber-700" : "text-neutral-900"; return <div className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p><p className={`mt-2 text-3xl font-bold ${colors}`}>{value}</p></div>; }
function StatusBadge({ status }) { const color = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_progress" ? "bg-amber-50 text-amber-700" : status === "cancelled" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{STATUS_LABELS[status] || status}</span>; }
function progress(order) { return order.quantity ? Math.min(100, Math.round((order.completed_quantity / order.quantity) * 100)) : 0; }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "–"; }
function formatDuration(value) { if (!Number.isFinite(value)) return "–"; const seconds = Math.max(0, Math.round(value / 1000)); const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return minutes ? `${minutes} min ${rest} s` : `${rest} s`; }
function carrierStatus(status) { return ({ available: "verfügbar", assigned: "zugeordnet", in_process: "in Arbeit", completed: "fertig", error: "Fehler" })[status] || status; }
function nextOrderName(orders) { return `ORDER-${String(orders.length + 1).padStart(3, "0")}`; }
function productOperation(products, productId) { return products.find((product) => product.id === productId)?.name || ""; }
function selectedProduct(products, productId) { return products.find((product) => product.id === productId); }
function sortMachines(machines) { return [...machines].sort((a, b) => (a.resource_id ?? 9999) - (b.resource_id ?? 9999) || a.name.localeCompare(b.name)); }
function startMachineForProduct(machines, product) { const resourceId = product?.route_steps?.[0]?.resource_id; return machines.find((machine) => machine.resource_id === resourceId); }
function defaultParameters(definitions) { return Object.fromEntries((definitions || []).map((definition) => [definition.key, definition.default_value ?? 0])); }
function normalizeParameters(definitions, values) { return Object.fromEntries((definitions || []).map((definition) => [definition.key, Number(values[definition.key] ?? definition.default_value ?? 0)])); }
function ParameterField({ definition, value, onChange }) {
  const stockLabel = definition.available_quantity !== undefined ? ` · Bestand: ${definition.available_quantity}${definition.unit ? ` ${definition.unit}` : ""}` : "";
  if (definition.type === "select") {
    return <Field label={definition.label}><select value={value ?? definition.default_value ?? ""} onChange={(event) => onChange(Number(event.target.value))} className="form-input">{(definition.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}{option.available_quantity !== undefined ? ` · Bestand: ${option.available_quantity}` : ""}</option>)}</select></Field>;
  }
  return <Field label={`${definition.label}${definition.unit ? ` (${definition.unit})` : ""}${stockLabel}`}><input required type="number" min={definition.min_value ?? 0} max={definition.max_value ?? definition.available_quantity ?? undefined} value={value ?? definition.default_value ?? 0} onChange={(event) => onChange(event.target.value)} className="form-input" /></Field>;
}
