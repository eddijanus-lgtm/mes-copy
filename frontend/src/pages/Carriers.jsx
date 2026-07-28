import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";

export default function CarriersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [routesByOrder, setRoutesByOrder] = useState({});
  const [inventory, setInventory] = useState(null);
  const [carrierNumber, setCarrierNumber] = useState("");
  const [error, setError] = useState("");

  async function load({ silent = false } = {}) {
    try {
      const get = silent ? api.getSilent : api.get;
      const [carrierData, orderData, inventoryData] = await Promise.all([
        get("/carriers"),
        get("/orders"),
        get("/carriers/inventory").catch(() => null),
      ]);
      setCarriers(Array.isArray(carrierData) ? carrierData : []);
      setOrders(Array.isArray(orderData) ? orderData : []);
      setInventory(inventoryData && typeof inventoryData === "object" ? inventoryData : null);
      const assignedOrderIds = new Set(
        (Array.isArray(carrierData) ? carrierData : [])
          .map((carrier) => carrier.order_id)
          .filter(Boolean),
      );
      const routeEntries = await Promise.all(
        (Array.isArray(orderData) ? orderData : [])
          .filter((order) => assignedOrderIds.has(order.id))
          .map(async (order) => [
          order.id,
          await get(`/orders/${order.id}/route`),
          ]),
      );
      setRoutesByOrder(Object.fromEntries(routeEntries));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    void load({ silent: true });
    const timer = setInterval(() => void load({ silent: true }), 10_000);
    return () => clearInterval(timer);
  }, []);

  async function createCarrier(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/carriers", { carrier_number: Number(carrierNumber) });
      setCarrierNumber("");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const orderById = Object.fromEntries(orders.map((order) => [order.id, order]));
  const normalizedInventory = normalizeInventory(inventory, carriers);
  const machineManagedInventory =
    inventory?.configured === true ||
    carriers.some((carrier) => carrier.inventory_managed === true);

  return (
    <div className="mes-page min-h-screen bg-neutral-50 p-6 space-y-6">
      <div className="mes-page-header">
        <div>
          <div className="mes-title-row">
            <h1 className="text-2xl font-bold text-neutral-900">{t("carriers.title")}</h1>
            <PageInfo page="carriers" />
          </div>
          <p className="mt-1 text-sm text-neutral-500">{t("carriers.subtitle")}</p>
        </div>
        <button onClick={load} className="w-fit rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-brand-primary hover:text-brand-primary">{t("carriers.refresh")}</button>
      </div>

      <section className="mes-context-note">
        <strong>{t("carriers.info")}</strong>
      </section>

      {normalizedInventory && <InventorySummary inventory={normalizedInventory} />}

      {canManage && !machineManagedInventory && (
        <form onSubmit={createCarrier} className="mes-filter-panel flex max-w-lg gap-3">
          <input type="number" min="1" required value={carrierNumber} onChange={(event) => setCarrierNumber(event.target.value)} placeholder={t("carriers.carrier_number")} className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white">{t("carriers.create")}</button>
        </form>
      )}
      {canManage && machineManagedInventory && (
        <p className="text-sm text-neutral-500">
          {t("carriers.auto_sync")}
        </p>
      )}

      {error && <p className="rounded-lg bg-status-error-bg p-3 text-sm text-status-error">{error}</p>}

      <div className="mes-card-list grid xl:grid-cols-2">
        {carriers.map((carrier) => (
          <CarrierCard
            key={carrier.id}
            carrier={carrier}
            order={orderById[carrier.order_id]}
            route={routesByOrder[carrier.order_id] || []}
          />
        ))}
        {carriers.length === 0 && <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-400">{t("carriers.no_carriers")}</p>}
      </div>
    </div>
  );
}

function CarrierCard({ carrier, order, route }) {
  const { t } = useTranslation();
  const sortedRoute = [...route].sort((a, b) => a.step_no - b.step_no);
  const stages = [
    ...sortedRoute.map((step) => ({
      key: step.id || step.step_no,
      stepNo: step.step_no,
      label: step.operation || `${t("carriers.step")} ${step.step_no}`,
    })),
    { key: "complete", stepNo: null, label: t("carriers.done") },
  ];
  const activeIndex =
    carrier.status === "completed"
      ? stages.length - 1
      : Math.max(
          0,
          sortedRoute.findIndex(
            (step) => step.step_no === carrier.current_step_no,
          ),
        );
  const hasPhysicalData =
    carrier.inventory_managed === true &&
    [
      carrier.physical_state,
      carrier.rfid_uid,
      carrier.storage_slot,
      carrier.last_reader_id,
      carrier.last_seen_at,
      carrier.rfid_read_valid,
    ].some((value) => value !== undefined && value !== null && value !== "");
  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("carriers.carrier_label")}</p>
          <h2 className="mt-1 font-mono text-2xl font-bold text-neutral-900">Carrier {carrier.carrier_number}</h2>
        </div>
        <StatusPill status={carrier.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric label={t("carriers.order")} value={order?.name || t("carriers.not_assigned")} />
        <MiniMetric
          label={t("carriers.current_step")}
          value={
            carrier.status === "completed"
              ? t("carriers.done")
              : carrier.status === "available" ||
                  !carrier.order_id ||
                  carrier.current_step_no == null
                ? t("carriers.no_active_step")
                : `Schritt ${carrier.current_step_no}`
          }
        />
        <MiniMetric label={t("carriers.resource")} value={carrier.current_resource_id ? `R${carrier.current_resource_id}` : t("carriers.waiting")} />
      </div>

      {hasPhysicalData && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("carriers.physical_inventory")}</p>
            <div className="flex flex-wrap gap-2">
              {carrier.physical_state && <PhysicalStatePill state={carrier.physical_state} />}
              {carrier.rfid_read_valid === false && <InventoryAlert label={t("carriers.rfid_invalid")} />}
              {carrier.inventory_stale && <InventoryAlert label={t("carriers.data_stale")} />}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label={t("carriers.rfid_uid")} value={carrier.rfid_uid || t("carriers.not_reported")} mono />
            <MiniMetric label={t("carriers.storage_slot")} value={carrier.storage_slot || t("carriers.not_in_storage")} />
            <MiniMetric label={t("carriers.rfid_reader")} value={carrier.last_reader_id || t("carriers.not_reported")} />
            <MiniMetric label={t("carriers.last_seen")} value={formatLastSeen(carrier.last_seen_at)} />
          </div>
        </div>
      )}

      {sortedRoute.length > 0 ? <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("carriers.route_position")}</p>
        <div className="relative flex text-center text-xs">
          <div className="absolute left-[16.66%] right-[16.66%] top-2 h-0.5 bg-neutral-200" />
          {stages.map((stage, index) => (
            <div key={stage.key} className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2 px-1">
              <span className={`h-4 w-4 rounded-full border-2 ${index < activeIndex ? "border-emerald-500 bg-emerald-500" : index === activeIndex ? "border-amber-400 bg-amber-400 ring-4 ring-amber-200" : "border-neutral-300 bg-white"}`} />
              <span className={index === activeIndex ? "font-semibold text-neutral-900" : "text-neutral-500"}>{stage.label}</span>
            </div>
          ))}
        </div>
      </div> : <p className="mt-5 text-sm text-neutral-400">{t("carriers.no_route")}</p>}
    </article>
  );
}

function InventorySummary({ inventory }) {
  const { t } = useTranslation();
  const warning = !inventory.valid || inventory.stale || inventory.countMismatch;
  return (
    <section className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("carriers.machine_inventory")}</p>
          <p className="mt-1 text-sm text-neutral-700">
            {t("carriers.inventory_source", { source: inventory.source || "der Inventarressource" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!inventory.valid && <InventoryAlert label={t("carriers.snapshot_invalid")} />}
          {inventory.stale && <InventoryAlert label={t("carriers.connection_stale")} />}
          {inventory.countMismatch && <InventoryAlert label={t("carriers.count_mismatch")} />}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniMetric label={t("carriers.available_plc")} value={inventory.availableCount ?? "–"} />
        <MiniMetric label={t("carriers.available_mes")} value={inventory.reconciledAvailableCount ?? "–"} />
        <MiniMetric label={t("carriers.detected")} value={inventory.observedCount ?? inventory.totalCount ?? "–"} />
        <MiniMetric label={t("carriers.capacity")} value={inventory.capacity ?? "–"} />
        <MiniMetric label={t("carriers.revision")} value={inventory.revision ?? "–"} />
      </div>
      {inventory.updatedAt && (
        <p className="mt-3 text-xs text-neutral-500">{t("carriers.last_snapshot")} {formatLastSeen(inventory.updatedAt)}</p>
      )}
    </section>
  );
}

function normalizeInventory(inventory, carriers) {
  const hasCarrierInventoryData = carriers.some(
    (carrier) => carrier.inventory_managed === true,
  );
  if ((!inventory || inventory.configured === false) && !hasCarrierInventoryData) return null;

  const derivedAvailable = carriers.filter(
    (carrier) =>
      carrier.inventory_managed === true &&
      carrier.physical_state === "stored" &&
      carrier.rfid_read_valid === true &&
      carrier.inventory_stale !== true &&
      carrier.status === "available",
  ).length;
  return {
    source: inventory?.source || carriers.find((carrier) => carrier.inventory_source)?.inventory_source,
    valid: inventory?.valid ?? true,
    stale: Boolean(inventory?.stale ?? carriers.some((carrier) => carrier.inventory_stale)),
    revision: inventory?.revision,
    capacity: inventory?.capacity,
    availableCount: inventory?.availableCount ?? (hasCarrierInventoryData ? derivedAvailable : undefined),
    reconciledAvailableCount:
      inventory?.reconciledAvailableCount ?? (hasCarrierInventoryData ? derivedAvailable : undefined),
    totalCount: inventory?.totalCount ?? (hasCarrierInventoryData ? carriers.length : undefined),
    observedCount: inventory?.observedCount,
    countMismatch: Boolean(inventory?.countMismatch),
    updatedAt: inventory?.updatedAt,
  };
}

function formatLastSeen(value) {
  if (!value) return "nicht gemeldet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("de-DE");
}

function MiniMetric({ label, value, mono = false }) { return <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className={`mt-1 break-words text-sm font-semibold text-neutral-900 ${mono ? "font-mono" : ""}`}>{value}</p></div>; }
function StatusPill({ status }) { const { t } = useTranslation(); const color = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_process" ? "bg-amber-50 text-amber-700" : status === "assigned" ? "bg-sky-50 text-sky-700" : status === "error" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{carrierStatus(status, t)}</span>; }
function PhysicalStatePill({ state }) { const { t } = useTranslation(); const normalized = String(state).toLowerCase(); const color = normalized === "stored" ? "bg-emerald-100 text-emerald-800" : normalized === "rfid_error" || normalized === "missing" ? "bg-red-100 text-red-800" : normalized === "at_station" || normalized === "in_transit" ? "bg-sky-100 text-sky-800" : "bg-neutral-200 text-neutral-700"; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{physicalStateLabel(normalized, t)}</span>; }
function InventoryAlert({ label }) { return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{label}</span>; }
function carrierStatus(status, t) { return ({ available: t("carriers.status_available"), assigned: t("carriers.status_assigned"), in_process: t("carriers.status_in_process"), completed: t("carriers.status_completed"), error: t("carriers.status_error") })[status] || status; }
function physicalStateLabel(state, t) { return ({ stored: t("carriers.state_stored"), dispensed: t("carriers.state_dispensed"), in_transit: t("carriers.state_in_transit"), at_station: t("carriers.state_at_station"), returned: t("carriers.state_returned"), missing: t("carriers.state_missing"), rfid_error: t("carriers.state_rfid_error"), empty: t("carriers.state_empty") })[state] || state; }
