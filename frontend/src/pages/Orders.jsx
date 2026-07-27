import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import { CaretLeftIcon } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon } from "@phosphor-icons/react/DownloadSimple";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { FunnelSimpleIcon } from "@phosphor-icons/react/FunnelSimple";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimpleIcon } from "@phosphor-icons/react/PencilSimple";
import { XIcon } from "@phosphor-icons/react/X";
import { api } from "../api/client.js";
import ExecutionStepCard from "../components/ExecutionStepCard.jsx";
import PageInfo from "../components/PageInfo.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import {
  isActiveExecutionStep,
  isRoutableEquipment,
  normalizeExecutionSteps,
} from "../utils/equipmentModel.js";
import { canDeleteOrders, canManageOrders } from "../utils/roles.js";
import "../orders.css";

const EMPTY_FORM = { id: null, name: "", priority: 1, machine_id: "", product_id: "", operation: "Produktion", quantity: 1, completed_quantity: 0, status: "pending", production_parameters: {} };

export default function OrdersPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderParameterDefinitions, setOrderParameterDefinitions] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [routes, setRoutes] = useState({});
  const [productionLogs, setProductionLogs] = useState({});
  const [executionStepsByOrder, setExecutionStepsByOrder] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [inspectorTab, setInspectorTab] = useState("overview");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingOrderId, setDownloadingOrderId] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const STATUS_LABELS = {
    pending: t("orders.filter_pending"),
    in_progress: t("orders.filter_in_progress"),
    completed: t("orders.filter_completed"),
    cancelled: t("orders.cancelled"),
    on_hold: t("orders.on_hold"),
  };
  const canManage = canManageOrders(user);
  const canDelete = canDeleteOrders(user);

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [orders, selectedOrderId]);
  useEffect(() => {
    if (!selectedOrderId) return undefined;
    let cancelled = false;

    async function refreshSelectedOrder() {
      try {
        const [order, executionSteps, carrierData] = await Promise.all([
          api.get(`/orders/${selectedOrderId}`),
          api.get(`/orders/${selectedOrderId}/execution-steps`),
          api.get("/carriers"),
        ]);
        if (cancelled) return;
        setOrders((current) => current.map((entry) => entry.id === order.id ? order : entry));
        setCarriers(Array.isArray(carrierData) ? carrierData : []);
        setExecutionStepsByOrder((current) => ({
          ...current,
          [selectedOrderId]: normalizeExecutionSteps(executionSteps),
        }));
        if (order.status === "completed") {
          const productionLog = await api.get(`/orders/${selectedOrderId}/production-log`).catch(() => null);
          if (!cancelled) {
            setProductionLogs((current) => ({ ...current, [selectedOrderId]: productionLog }));
          }
        }
      } catch {
        // The regular page refresh remains the authoritative error surface.
      }
    }

    void refreshSelectedOrder();
    const timer = window.setInterval(refreshSelectedOrder, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedOrderId]);

  async function refresh() {
    try {
      const [orderData, machineData, productData, parameterData, carrierData] = await Promise.all([api.get("/orders"), api.get("/machines"), api.get("/products"), api.get("/shopfloor/machine/order-parameters"), api.get("/carriers")]);
      const safeOrders = Array.isArray(orderData) ? orderData : [];
      setOrders(safeOrders);
      setMachines(sortMachines(Array.isArray(machineData) ? machineData : []));
      setProducts(Array.isArray(productData) ? productData : []);
      setOrderParameterDefinitions(Array.isArray(parameterData) ? parameterData : Array.isArray(parameterData?.parameters) ? parameterData.parameters : []);
      setCarriers(Array.isArray(carrierData) ? carrierData : []);
      const completedOrders = safeOrders.filter((order) => order.status === "completed");
      const [routeEntries, logEntries, executionEntries] = await Promise.all([
        Promise.all(safeOrders.map((order) => api.get(`/orders/${order.id}/route`).then((route) => [order.id, route]).catch(() => [order.id, []]))),
        Promise.all(completedOrders.map((order) => api.get(`/orders/${order.id}/production-log`).then((log) => [order.id, log]).catch(() => [order.id, null]))),
        Promise.all(safeOrders.map((order) => api.get(`/orders/${order.id}/execution-steps`).then((steps) => [order.id, normalizeExecutionSteps(steps)]).catch(() => [order.id, []]))),
      ]);
      setRoutes(Object.fromEntries(routeEntries));
      setProductionLogs(Object.fromEntries(logEntries));
      setExecutionStepsByOrder(Object.fromEntries(executionEntries));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function openCreate() {
    const product = products.find((entry) => entry.is_active && startMachineForProduct(routableMachines, entry));
    const startMachine = startMachineForProduct(routableMachines, product) || routableMachines[0];
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

  async function downloadProductionCsv(order) {
    setError("");
    setDownloadingOrderId(order.id);
    try {
      triggerBrowserDownload(await api.download(`/orders/${order.id}/production-log.csv`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDownloadingOrderId(null);
    }
  }

  async function downloadAllProductionCsv() {
    setError("");
    setDownloadingAll(true);
    try {
      triggerBrowserDownload(await api.download("/orders/production-logs.csv"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDownloadingAll(false);
    }
  }

  const routableMachines = useMemo(() => {
    const configured = machines.filter(isRoutableEquipment);
    return configured.length > 0 ? configured : machines;
  }, [machines]);
  const machineNames = Object.fromEntries(machines.map((machine) => [machine.id, machine.name]));
  const productNames = Object.fromEntries(products.map((product) => [product.id, product.name]));
  const resourceNames = Object.fromEntries(machines.map((machine) => [machine.resource_id, machine.name]));
  const carriersByOrder = carriers.reduce((groups, carrier) => {
    if (!carrier.order_id) return groups;
    return { ...groups, [carrier.order_id]: [...(groups[carrier.order_id] || []), carrier] };
  }, {});
  const filtered = orders.filter((order) => {
    const matchesText = !search || `${order.name} ${order.operation}`.toLowerCase().includes(search.toLowerCase());
    const orderCarriers = carriersByOrder[order.id] || [];
    const matchesCarrier = carrierFilter === "all" || orderCarriers.some((carrier) => carrier.id === carrierFilter);
    return matchesText && matchesCarrier && (statusFilter === "all" || order.status === statusFilter);
  });
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;
  const selectedCarriers = selectedOrder ? carriersByOrder[selectedOrder.id] || [] : [];
  const selectedRoute = selectedOrder ? routes[selectedOrder.id] || [] : [];
  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const activeCount = orders.filter((order) => order.status === "in_progress").length;
  const completedCount = orders.filter((order) => order.status === "completed").length;

  function toggleInspector(order) {
    const nextId = selectedOrderId === order.id ? null : order.id;
    setSelectedOrderId(nextId);
    setInspectorTab("overview");
  }

  return (
    <div className="mes-page orders-page min-h-screen bg-neutral-50">
      <header className="mes-page-header">
        <div>
          <div className="mes-title-row">
            <h1>{t("orders.title")}</h1>
            <PageInfo page="orders" />
          </div>
          <p>{t("orders.subtitle")}</p>
        </div>
        <div className="orders-page-actions">
          {completedCount > 0 && (
            <button
              type="button"
              className="orders-secondary-action"
              disabled={downloadingAll}
              onClick={downloadAllProductionCsv}
            >
              <DownloadSimpleIcon aria-hidden="true" size={16} />
              {downloadingAll ? t("orders.csv_downloading") : `${t("orders.csv_all")} (${completedCount})`}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              disabled={routableMachines.length === 0}
              className="orders-primary-action bg-brand-primary"
            >
              {t("orders.new_order")}
            </button>
          )}
        </div>
      </header>

      {routableMachines.length === 0 && <p className="orders-warning">{t("orders.warning_no_routable")}</p>}
      {error && <p role="alert" className="orders-error">{error}</p>}

      <section className={`orders-workspace${selectedOrder ? " orders-workspace--open" : ""}`}>
        <div className="orders-list-pane">
          <div className="orders-toolbar">
            <div className="orders-status-tabs" role="tablist" aria-label="Aufträge nach Status filtern">
              <StatusTab label={t("orders.filter_all")} count={orders.length} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
              <StatusTab label={t("orders.filter_pending")} count={pendingCount} active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
              <StatusTab label={t("orders.filter_in_progress")} count={activeCount} active={statusFilter === "in_progress"} onClick={() => setStatusFilter("in_progress")} />
              <StatusTab label={t("orders.filter_completed")} count={completedCount} active={statusFilter === "completed"} onClick={() => setStatusFilter("completed")} />
            </div>

            <div className="orders-toolbar__actions">
              <label className="orders-search">
                <MagnifyingGlassIcon aria-hidden="true" size={16} />
                <span className="sr-only">{t("orders.search")}</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("orders.search")}
                />
              </label>
              <button
                type="button"
                className={`orders-filter-button${filterMenuOpen ? " is-active" : ""}`}
                aria-expanded={filterMenuOpen}
                onClick={() => setFilterMenuOpen((open) => !open)}
              >
                <FunnelSimpleIcon aria-hidden="true" size={16} />
                {t("orders.filter")}
              </button>
            </div>
          </div>

          {filterMenuOpen && (
            <div className="orders-filter-bar">
              <label>
                <span>{t("orders.filter_status")}</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">{t("orders.filter_all")}</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>{t("orders.filter_carrier")}</span>
                <select value={carrierFilter} onChange={(event) => setCarrierFilter(event.target.value)}>
                  <option value="all">{t("orders.filter_all")}</option>
                  {carriers.filter((carrier) => carrier.order_id).map((carrier) => (
                    <option key={carrier.id} value={carrier.id}>{formatCarrier(carrier)}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setCarrierFilter("all");
                  setSearch("");
                }}
              >
                {t("orders.filter_reset")}
              </button>
            </div>
          )}

          <div className="orders-table-region">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>{t("orders.order")}</th>
                  <th className="orders-col-product">{t("orders.product")}</th>
                  <th>{t("orders.status")}</th>
                  <th className="orders-col-quantity">{t("orders.quantity")}</th>
                  <th>{t("orders.progress")}</th>
                  <th className="orders-col-carrier">{t("orders.carriers")}</th>
                  <th><span className="sr-only">{t("orders.details")}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={selectedOrderId === order.id}
                    carriers={carriersByOrder[order.id] || []}
                    productionLog={productionLogs[order.id]}
                    executionSteps={executionStepsByOrder[order.id] || []}
                    machineName={machineNames[order.machine_id]}
                    productName={productNames[order.product_id]}
                    onToggle={() => toggleInspector(order)}
                    statusLabels={STATUS_LABELS}
                  />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="orders-empty">{t("orders.no_results")}</p>}
          </div>

          <footer className="orders-pagination">
            <span>{filtered.length} {t("orders.results")}</span>
            <div aria-label="Seitennavigation">
              <button type="button" disabled aria-label={t("orders.prev_page")}><CaretLeftIcon aria-hidden="true" size={15} /></button>
              <span>1</span>
              <button type="button" disabled aria-label={t("orders.next_page")}><CaretRightIcon aria-hidden="true" size={15} /></button>
            </div>
          </footer>
        </div>

        {selectedOrder && (
          <>
            <button className="orders-inspector-backdrop" type="button" aria-label="Detailansicht schließen" onClick={() => setSelectedOrderId(null)} />
            <OrderInspector
              order={selectedOrder}
              route={selectedRoute}
              productionLog={productionLogs[selectedOrder.id]}
              executionSteps={executionStepsByOrder[selectedOrder.id] || []}
              carriers={selectedCarriers}
              machineName={machineNames[selectedOrder.machine_id]}
              productName={productNames[selectedOrder.product_id]}
              resourceNames={resourceNames}
              activeTab={inspectorTab}
              onTabChange={setInspectorTab}
              canManage={canManage}
              canDelete={canDelete}
              downloading={downloadingOrderId === selectedOrder.id}
              onEdit={() => openEdit(selectedOrder)}
              onDelete={() => requestDelete(selectedOrder)}
              onDownload={() => downloadProductionCsv(selectedOrder)}
              onClose={() => setSelectedOrderId(null)}
              statusLabels={STATUS_LABELS}
              t={t}
            />
          </>
        )}
      </section>

      {modalOpen && <OrderModal form={form} setForm={setForm} machines={routableMachines} products={products} orderParameterDefinitions={orderParameterDefinitions} carriers={carriers} saving={saving} onSubmit={submit} onClose={() => { setModalOpen(false); setForm(EMPTY_FORM); }} t={t} statusLabels={STATUS_LABELS} />}
      {deleteCandidate && <DeleteOrderDialog order={deleteCandidate} deleting={deleting} onCancel={() => setDeleteCandidate(null)} onConfirm={remove} t={t} statusLabels={STATUS_LABELS} />}
    </div>
  );
}

function DeleteOrderDialog({ order, deleting, onCancel, onConfirm, t, statusLabels }) {
  return (
    <div onClick={() => !deleting && onCancel()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-status-error">{t("orders.delete_title")}</p>
        <h2 className="mt-2 text-lg font-bold text-neutral-900">{order.name} {t("orders.delete_confirm")}</h2>
        <p className="mt-2 text-sm text-neutral-500">{t("orders.delete_body")}</p>
        <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <p><span className="font-medium text-neutral-600">{t("orders.delete_status")}</span> {statusLabels[order.status] || order.status}</p>
          <p><span className="font-medium text-neutral-600">{t("orders.delete_quantity")}</span> {order.completed_quantity}/{order.quantity}</p>
          <p><span className="font-medium text-neutral-600">{t("orders.delete_operation")}</span> {order.operation}</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={deleting} onClick={onCancel} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50">{t("common.cancel")}</button>
          <button type="button" disabled={deleting} onClick={onConfirm} className="rounded-lg bg-status-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-status-error-dark)] disabled:opacity-50">{deleting ? t("orders.saving") : t("common.delete")}</button>
        </div>
      </div>
    </div>
  );
}

function StatusTab({ label, count, active, onClick }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={onClick}>
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function OrderRow({ order, selected, carriers, productionLog, executionSteps, machineName, productName, onToggle, statusLabels }) {
  const orderProgress = progress(order);
  const primaryCarrier = carriers[0];
  const historicalCarrier = productionLog?.snapshot?.carriers?.[0];
  const activeStep = executionSteps.find(isActiveExecutionStep);
  return (
    <tr className={selected ? "is-selected" : ""}>
      <td>
        <strong className="orders-row__name">{order.name}</strong>
        <span className="orders-row__mobile-product">{productName || order.operation}<br />{activeStep?.operation || machineName || "Startstation unbekannt"}</span>
      </td>
      <td className="orders-col-product">
        <strong>{productName || order.operation}</strong>
        <span>{activeStep ? `Aktuell: ${activeStep.operation}` : machineName || "Startstation unbekannt"}</span>
      </td>
      <td><OrderStatus status={order.status} statusLabels={statusLabels} /></td>
      <td className="orders-col-quantity">{order.completed_quantity} / {order.quantity}</td>
      <td>
        <div className="orders-progress" aria-label={`${orderProgress} Prozent abgeschlossen`}>
          <span>{orderProgress}%</span>
          <div><i style={{ width: `${orderProgress}%` }} /></div>
        </div>
      </td>
      <td className="orders-col-carrier">
        {primaryCarrier
          ? formatCarrier(primaryCarrier)
          : historicalCarrier
            ? formatCarrierNumber(historicalCarrier)
            : "–"}
      </td>
      <td className="orders-row__toggle">
        <button
          type="button"
          aria-expanded={selected}
          aria-label={`${order.name} ${selected ? "schließen" : "öffnen"}`}
          onClick={onToggle}
        >
          <CaretRightIcon aria-hidden="true" size={18} weight="bold" />
        </button>
      </td>
    </tr>
  );
}

function OrderInspector({ order, route, productionLog, executionSteps, carriers, machineName, productName, resourceNames, activeTab, onTabChange, canManage, canDelete, downloading, onEdit, onDelete, onDownload, onClose, t, statusLabels }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const primaryCarrier = carriers[0];
  const historicalCarrierNumbers = productionLog?.snapshot?.carriers || [];
  const carrierSummary = primaryCarrier
    ? formatCarrier(primaryCarrier)
    : historicalCarrierNumbers.length
      ? historicalCarrierNumbers.map(formatCarrierNumber).join(", ")
      : "Kein Carrier";
  const orderProgress = progress(order);

  async function copyOrderId() {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="orders-inspector" aria-label={`Details für ${order.name}`}>
      <div className="orders-inspector__header">
        <div>
          <h2>{order.name}</h2>
          <OrderStatus status={order.status} statusLabels={statusLabels} />
        </div>
        <button type="button" className="orders-icon-button" onClick={onClose} aria-label="Detailansicht schließen">
          <XIcon aria-hidden="true" size={20} />
        </button>
      </div>

      <div className="orders-inspector__summary">
        <div className="orders-inspector__progress">
          <span>{orderProgress}%</span>
          <div><i style={{ width: `${orderProgress}%` }} /></div>
        </div>
        <span>{order.completed_quantity} / {order.quantity}</span>
        <span>{carrierSummary}</span>
        {(order.status === "completed" || canManage) && (
          <div className="orders-inspector__actions">
            {order.status === "completed" && (
              <button type="button" className="orders-download-button" disabled={downloading} onClick={onDownload}>
                <DownloadSimpleIcon aria-hidden="true" size={16} />
                {downloading ? t("orders.csv_creating") : t("orders.csv")}
              </button>
            )}
            {canManage && (
              <>
                <button type="button" onClick={onEdit}>
                  <PencilSimpleIcon aria-hidden="true" size={15} />
                  {t("common.edit")}
                </button>
                <div className="orders-overflow">
                  <button type="button" className="orders-icon-button" aria-label="Weitere Aktionen" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                    <DotsThreeIcon aria-hidden="true" size={20} weight="bold" />
                  </button>
                  {menuOpen && (
                    <div className="orders-overflow__menu">
                      {canDelete ? <button type="button" onClick={onDelete}>{t("orders.delete")}</button> : <span>{t("orders.no_actions")}</span>}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="orders-inspector__tabs" role="tablist" aria-label="Auftragsdetails">
        <InspectorTab id="overview" label={t("orders.overview")} active={activeTab === "overview"} onClick={onTabChange} />
        <InspectorTab id="route" label={t("orders.route_carrier")} active={activeTab === "route"} onClick={onTabChange} />
        <InspectorTab id="history" label={t("orders.history")} active={activeTab === "history"} onClick={onTabChange} />
      </div>

      <div className="orders-inspector__content">
        {activeTab === "overview" && (
          <InspectorOverview
            order={order}
            route={route}
            carriers={carriers}
            productionLog={productionLog}
            executionSteps={executionSteps}
            machineName={machineName}
            productName={productName}
            resourceNames={resourceNames}
            copied={copied}
            onCopy={copyOrderId}
          />
        )}
        {activeTab === "route" && <InspectorRoute order={order} route={route} executionSteps={executionSteps} carriers={carriers} productionLog={productionLog} resourceNames={resourceNames} />}
        {activeTab === "history" && <InspectorHistory order={order} log={productionLog} executionSteps={executionSteps} resourceNames={resourceNames} />}
      </div>
    </aside>
  );
}

function InspectorTab({ id, label, active, onClick }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={() => onClick(id)}>{label}</button>;
}

function InspectorOverview({ order, route, carriers, productionLog, executionSteps, machineName, productName, resourceNames, copied, onCopy }) {
  const primaryCarrier = carriers[0];
  const historicalCarrierNumbers = productionLog?.snapshot?.carriers || [];
  const activeStep = executionSteps.find(isActiveExecutionStep);
  return (
    <>
      <section className="orders-inspector__section">
        <h3>Auftragsdetails</h3>
        <dl className="orders-facts">
          <OrderFact label="Produkt" value={productName || order.operation} />
          <OrderFact label="Priorität" value={`P${order.priority}`} />
          <OrderFact label="Startstation" value={machineName || "Unbekannt"} />
          <div>
            <dt>UUID</dt>
            <dd className="orders-copy-value">
              <span title={order.id}>{order.id}</span>
              <button type="button" onClick={onCopy} aria-label="UUID kopieren"><CopyIcon aria-hidden="true" size={15} /></button>
            </dd>
          </div>
          <OrderFact label="Erstellt am" value={formatDateTime(order.created_at)} />
        </dl>
        {copied && <p className="orders-copy-feedback" role="status">UUID kopiert</p>}
      </section>

      <section className="orders-inspector__section">
        <h3>Aktueller Arbeitsschritt</h3>
        {activeStep
          ? <ExecutionStepCard step={activeStep} resourceName={activeStep.resource_name || resourceNames[activeStep.resource_id]} compact />
          : <p className="orders-inspector__empty">{order.status === "completed" ? "Auftrag abgeschlossen." : "Noch kein Arbeitsschritt aktiv."}</p>}
      </section>

      <section className="orders-inspector__section">
        <h3>Arbeitsplan / Route</h3>
        <RouteTimeline order={order} route={route} executionSteps={executionSteps} carriers={carriers} resourceNames={resourceNames} />
      </section>

      <section className="orders-inspector__section">
        <h3>Carrier-Zuordnung</h3>
        {carriers.length === 0 && historicalCarrierNumbers.length === 0 ? (
          <p className="orders-inspector__empty">Noch kein Carrier zugeordnet.</p>
        ) : carriers.length === 0 ? (
          <dl className="orders-facts">
            <OrderFact label="Carrier" value={historicalCarrierNumbers.map(formatCarrierNumber).join(", ")} />
            <OrderFact label="Status" value="freigegeben · historisch" tone="success" />
            <OrderFact label="Aktueller Schritt" value="Auftrag abgeschlossen" />
          </dl>
        ) : (
          <dl className="orders-facts">
            <OrderFact label="Carrier" value={formatCarrier(primaryCarrier)} />
            <OrderFact label="Status" value={carrierStatus(primaryCarrier.status)} tone="success" />
            <OrderFact label="Aktueller Schritt" value={activeStep?.step_no ?? primaryCarrier.current_step_no ?? "–"} />
          </dl>
        )}
      </section>

      <section className="orders-inspector__section">
        <h3>Notizen</h3>
        <p className="orders-inspector__empty">Keine Notizen vorhanden.</p>
      </section>
    </>
  );
}

function InspectorRoute({ order, route, executionSteps, carriers, productionLog, resourceNames }) {
  const historicalCarrierNumbers = productionLog?.snapshot?.carriers || [];
  return (
    <>
      <section className="orders-inspector__section">
        <h3>Route</h3>
        <RouteTimeline order={order} route={route} executionSteps={executionSteps} carriers={carriers} resourceNames={resourceNames} />
      </section>
      <section className="orders-inspector__section">
        <h3>Technische Routendaten</h3>
        {route.length === 0 && <p className="orders-inspector__empty">Noch keine Route hinterlegt.</p>}
        <div className="orders-route-list">
          {route.map((step) => (
            <div key={step.id || step.step_no}>
              <strong>{step.step_no}. {step.operation}</strong>
              <span>OP {step.operation_no} · R{step.resource_id} · {resourceNames[step.resource_id] || "Station"}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="orders-inspector__section">
        <h3>Zugeordnete Carrier</h3>
        {carriers.length === 0 && historicalCarrierNumbers.length === 0 && <p className="orders-inspector__empty">Noch kein Carrier zugeordnet.</p>}
        <div className="orders-carrier-list">
          {carriers.map((carrier) => (
            <div key={carrier.id}>
              <strong>{formatCarrier(carrier)}</strong>
              <span>{carrierStatus(carrier.status)} · Schritt {carrier.current_step_no}</span>
            </div>
          ))}
          {carriers.length === 0 && historicalCarrierNumbers.map((carrierNumber) => (
            <div key={carrierNumber}>
              <strong>{formatCarrierNumber(carrierNumber)}</strong>
              <span>freigegeben · Auftrag abgeschlossen</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function InspectorHistory({ order, log, executionSteps, resourceNames }) {
  const snapshot = log?.snapshot;
  if (!snapshot && executionSteps.length === 0) {
    return (
      <section className="orders-inspector__section">
        <h3>Produktionsverlauf</h3>
        <p className="orders-inspector__empty">
          {order.status === "completed" ? "Das Auftragslog konnte noch nicht geladen werden." : "Der Produktionsverlauf wird nach Stationsmeldungen ergänzt."}
        </p>
      </section>
    );
  }
  return (
    <>
      {snapshot ? <section className="orders-inspector__section">
        <h3>Zusammenfassung</h3>
        <dl className="orders-facts">
          <OrderFact label="Produktionsstart" value={formatDateTime(snapshot.order.started_at)} />
          <OrderFact label="Produktionsende" value={formatDateTime(snapshot.order.completed_at)} />
          <OrderFact label="Dauer" value={formatDuration(snapshot.order.duration_ms)} />
        </dl>
      </section> : null}
      <section className="orders-inspector__section">
        <h3>Arbeitsschritte</h3>
        {executionSteps.length > 0 ? (
          <div className="grid gap-2">
            {executionSteps.map((step, index) => (
              <ExecutionStepCard key={step.id || `${step.resource_id}-${step.started_at || index}`} step={step} resourceName={step.resource_name || resourceNames[step.resource_id]} compact />
            ))}
          </div>
        ) : <p className="orders-inspector__empty">Noch keine Arbeitsschritte gemeldet.</p>}
      </section>
      {snapshot ? <section className="orders-inspector__section">
        <h3>Technische Stationsereignisse</h3>
        <div className="orders-history-list">
          {(snapshot.station_executions || []).map((entry) => (
            <div key={`${entry.resource_id}-${entry.carrier_number}-${entry.requested_at}`}>
              <span className={executionSucceeded(entry) ? "is-success" : "is-error"} />
              <div>
                <strong>{resourceNames[entry.resource_id] || `Station ${entry.resource_id}`}</strong>
                <small>{formatDateTime(entry.requested_at)} · Carrier {entry.carrier_number}</small>
              </div>
              <em>{executionSucceeded(entry) ? "Erfolgreich" : `Fehler ${entry.result_code ?? "–"}`}</em>
            </div>
          ))}
        </div>
      </section> : null}
    </>
  );
}

function OrderFact({ label, value, tone }) {
  return <div><dt>{label}</dt><dd className={tone ? `is-${tone}` : ""}>{value || "–"}</dd></div>;
}

function OrderStatus({ status, statusLabels }) {
  return <span className={`orders-status orders-status--${status}`}><i />{statusLabels?.[status] || status}</span>;
}

function RouteTimeline({ order, route, executionSteps = [], carriers, resourceNames }) {
  if (route.length === 0) return <p className="orders-inspector__empty">Noch keine Route hinterlegt.</p>;
  const sortedRoute = [...route].sort((a, b) => a.step_no - b.step_no);
  return (
    <ol className="orders-route-timeline">
      {sortedRoute.map((step) => {
        const execution = executionForRouteStep(executionSteps, step);
        const state = execution ? routeStateFromExecution(execution.state) : getRouteStepState(order, step, carriers, sortedRoute);
        return (
          <li key={step.id || step.step_no} className={`is-${state}`}>
            <span className="orders-route-timeline__marker">
              {state === "complete" ? <CheckCircleIcon aria-hidden="true" size={18} weight="fill" /> : <CircleIcon aria-hidden="true" size={18} weight={state === "current" ? "duotone" : "regular"} />}
            </span>
            <div>
              <strong>{step.step_no === 1 ? resourceNames[step.resource_id] || step.operation : resourceNames[step.resource_id] || step.operation}</strong>
              <small>{state === "complete" ? "Abgeschlossen" : state === "current" ? execution?.state === "paused" ? "Pausiert" : "In Arbeit" : state === "failed" ? "Fehler" : "Ausstehend"}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OrderModal({ form, setForm, machines, products, orderParameterDefinitions, carriers, saving, onSubmit, onClose, t, statusLabels }) {
  const availableCount = carriers.filter(
    (carrier) =>
      carrier.status === "available" &&
      (carrier.inventory_managed !== true ||
        (carrier.physical_state === "stored" &&
          carrier.rfid_read_valid === true &&
          carrier.inventory_stale !== true)),
  ).length;
  const activeProducts = products.filter((product) => product.is_active);
  const product = selectedProduct(products, form.product_id);
  const parameterDefinitions = orderParameterDefinitions;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/50 p-4" onMouseDown={onClose}>
      <div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-neutral-100 px-6 py-5"><p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">Produktionsplanung</p><h2 className="mt-1 text-xl font-bold text-neutral-900">{form.id ? t("orders.edit_order") : t("orders.create_order")}</h2></div>
        <form onSubmit={onSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label={t("orders.order_name")}><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="form-input" /></Field>
          <Field label={t("orders.start_station")}><select required value={form.machine_id} onChange={(event) => setForm((current) => ({ ...current, machine_id: event.target.value }))} className="form-input"><option value="">{t("orders.start_station_select")}</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></Field>
          <Field label={t("orders.product_label")}><select value={form.product_id} onChange={(event) => { const nextProduct = selectedProduct(products, event.target.value); const startMachine = startMachineForProduct(machines, nextProduct); setForm((current) => ({ ...current, product_id: event.target.value, machine_id: startMachine?.id || current.machine_id, operation: nextProduct?.name || current.operation, production_parameters: defaultParameters(orderParameterDefinitions) })); }} className="form-input"><option value="">{t("orders.product_select")}</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.part_no} · {product.name}</option>)}</select></Field>
          <Field label={t("orders.product_operation")}><input required value={form.operation} onChange={(event) => setForm((current) => ({ ...current, operation: event.target.value }))} className="form-input" /></Field>
          <Field label={t("orders.priority")}><input required type="number" min="1" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="form-input" /></Field>
          <Field label={t("orders.quantity_label").replace("{count}", availableCount)}><input required type="number" min="1" max={availableCount} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} className="form-input" /></Field>
          {!form.id && parameterDefinitions.length > 0 && <section className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:col-span-2 sm:grid-cols-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:col-span-4">{t("orders.product_config")}</p>
            {parameterDefinitions.map((definition) => <ParameterField key={definition.key} definition={definition} value={form.production_parameters[definition.key]} onChange={(value) => setForm((current) => ({ ...current, production_parameters: { ...current.production_parameters, [definition.key]: value } }))} />)}
          </section>}
          {!form.id && parameterDefinitions.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:col-span-2">{t("orders.no_parameters")}</p>}
          {form.id && <Field label="Fertigmenge"><input required type="number" min="0" max={form.quantity} value={form.completed_quantity} onChange={(event) => setForm((current) => ({ ...current, completed_quantity: event.target.value }))} className="form-input" /></Field>}
          {form.id && <Field label={t("orders.status")}><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="form-input">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
          {!form.id && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:col-span-2"><strong>{t("orders.auto_create")}</strong> {t("orders.auto_create_detail").replace("{quantity}", form.quantity).replace("{available}", availableCount)}</div>}
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100">{t("common.cancel")}</button><button disabled={saving} type="submit" className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t("orders.saving") : t("common.save")}</button></div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) { return <label className="space-y-1.5 text-sm font-medium text-neutral-700"><span>{label}</span>{children}</label>; }
function progress(order) { return order.quantity ? Math.min(100, Math.round((order.completed_quantity / order.quantity) * 100)) : 0; }
function formatCarrier(carrier) { return carrier ? formatCarrierNumber(carrier.carrier_number) : "–"; }
function formatCarrierNumber(carrierNumber) { return `C-${String(carrierNumber).padStart(4, "0")}`; }
function executionSucceeded(entry) { return !entry.error_message && (entry.status === "acknowledged" || entry.status === "responded" || entry.response?.accepted === true); }
function getRouteStepState(order, step, carriers, route) {
  if (order.status === "completed") return "complete";
  const carrierSteps = carriers.map((carrier) => Number(carrier.current_step_no)).filter(Number.isFinite);
  const currentStep = carrierSteps.length
    ? Math.max(...carrierSteps)
    : order.status === "in_progress"
      ? Number(route[0]?.step_no)
      : 0;
  if (Number(step.step_no) < currentStep) return "complete";
  if (order.status === "in_progress" && Number(step.step_no) === currentStep) return "current";
  return "pending";
}
function routeStateFromExecution(state) {
  if (state === "completed") return "complete";
  if (state === "failed") return "failed";
  if (state === "running" || state === "paused" || state === "ready") return "current";
  return "pending";
}
function executionForRouteStep(executionSteps, routeStep) {
  const matching = executionSteps.filter((entry) => (
    (entry.step_no != null && Number(entry.step_no) === Number(routeStep.step_no))
    || (entry.resource_id != null && Number(entry.resource_id) === Number(routeStep.resource_id))
  ));
  return matching.find(isActiveExecutionStep) || matching.at(-1) || null;
}
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
function triggerBrowserDownload({ blob, filename }) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
function ParameterField({ definition, value, onChange }) {
  const stockLabel = definition.available_quantity !== undefined ? ` · Bestand: ${definition.available_quantity}${definition.unit ? ` ${definition.unit}` : ""}` : "";
  if (definition.type === "select") {
    return <Field label={definition.label}><select value={value ?? definition.default_value ?? ""} onChange={(event) => onChange(Number(event.target.value))} className="form-input">{(definition.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}{option.available_quantity !== undefined ? ` · Bestand: ${option.available_quantity}` : ""}</option>)}</select></Field>;
  }
  return <Field label={`${definition.label}${definition.unit ? ` (${definition.unit})` : ""}${stockLabel}`}><input required type="number" min={definition.min_value ?? 0} max={definition.max_value ?? definition.available_quantity ?? undefined} value={value ?? definition.default_value ?? 0} onChange={(event) => onChange(event.target.value)} className="form-input" /></Field>;
}
