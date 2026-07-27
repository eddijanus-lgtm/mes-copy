import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import PageInfo from "../components/PageInfo.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";

export default function CarriersPage() {
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
            <h1 className="text-2xl font-bold text-neutral-900">Werkstückträger</h1>
            <PageInfo page="carriers" />
          </div>
          <p className="mt-1 text-sm text-neutral-500">Carrier-Position, Auftragszuordnung und aktueller Arbeitsschritt der angebundenen Anlage.</p>
        </div>
        <button onClick={load} className="w-fit rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-brand-primary hover:text-brand-primary">Aktualisieren</button>
      </div>

      <section className="mes-context-note">
        <strong>Ablauf:</strong> Das MES entscheidet je Carrier anhand Auftrag und Route, welche Station den nächsten Arbeitsschritt ausführen darf.
      </section>

      {normalizedInventory && <InventorySummary inventory={normalizedInventory} />}

      {canManage && !machineManagedInventory && (
        <form onSubmit={createCarrier} className="mes-filter-panel flex max-w-lg gap-3">
          <input type="number" min="1" required value={carrierNumber} onChange={(event) => setCarrierNumber(event.target.value)} placeholder="Carrier-Nummer" className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white">Anlegen</button>
        </form>
      )}
      {canManage && machineManagedInventory && (
        <p className="text-sm text-neutral-500">
          RFID-Carrier werden von der Maschine erkannt und automatisch synchronisiert.
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
        {carriers.length === 0 && <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-400">Noch keine Werkstückträger vorhanden.</p>}
      </div>
    </div>
  );
}

function CarrierCard({ carrier, order, route }) {
  const sortedRoute = [...route].sort((a, b) => a.step_no - b.step_no);
  const stages = [
    ...sortedRoute.map((step) => ({
      key: step.id || step.step_no,
      stepNo: step.step_no,
      label: step.operation || `Schritt ${step.step_no}`,
    })),
    { key: "complete", stepNo: null, label: "Fertig" },
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
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Werkstückträger</p>
          <h2 className="mt-1 font-mono text-2xl font-bold text-neutral-900">Carrier {carrier.carrier_number}</h2>
        </div>
        <StatusPill status={carrier.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric label="Auftrag" value={order?.name || "nicht zugeordnet"} />
        <MiniMetric
          label="Aktueller Schritt"
          value={
            carrier.status === "completed"
              ? "Fertig"
              : carrier.status === "available" ||
                  !carrier.order_id ||
                  carrier.current_step_no == null
                ? "Kein aktiver Schritt"
                : `Schritt ${carrier.current_step_no}`
          }
        />
        <MiniMetric label="Resource" value={carrier.current_resource_id ? `R${carrier.current_resource_id}` : "Transport / Wartet"} />
      </div>

      {hasPhysicalData && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Physisches Inventar</p>
            <div className="flex flex-wrap gap-2">
              {carrier.physical_state && <PhysicalStatePill state={carrier.physical_state} />}
              {carrier.rfid_read_valid === false && <InventoryAlert label="RFID ungültig" />}
              {carrier.inventory_stale && <InventoryAlert label="Daten veraltet" />}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="RFID-UID" value={carrier.rfid_uid || "nicht gemeldet"} mono />
            <MiniMetric label="Lagerplatz" value={carrier.storage_slot || "nicht im Lager"} />
            <MiniMetric label="RFID-Reader" value={carrier.last_reader_id || "nicht gemeldet"} />
            <MiniMetric label="Zuletzt erkannt" value={formatLastSeen(carrier.last_seen_at)} />
          </div>
        </div>
      )}

      {sortedRoute.length > 0 ? <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Routenposition</p>
        <div className="relative flex text-center text-xs">
          <div className="absolute left-[16.66%] right-[16.66%] top-2 h-0.5 bg-neutral-200" />
          {stages.map((stage, index) => (
            <div key={stage.key} className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2 px-1">
              <span className={`h-4 w-4 rounded-full border-2 ${index < activeIndex ? "border-emerald-500 bg-emerald-500" : index === activeIndex ? "border-amber-400 bg-amber-400 ring-4 ring-amber-200" : "border-neutral-300 bg-white"}`} />
              <span className={index === activeIndex ? "font-semibold text-neutral-900" : "text-neutral-500"}>{stage.label}</span>
            </div>
          ))}
        </div>
      </div> : <p className="mt-5 text-sm text-neutral-400">Keine Route zugeordnet.</p>}
    </article>
  );
}

function InventorySummary({ inventory }) {
  const warning = !inventory.valid || inventory.stale || inventory.countMismatch;
  return (
    <section className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Maschinenbestand</p>
          <p className="mt-1 text-sm text-neutral-700">
            Physisch von {inventory.source || "der Inventarressource"} gemeldete RFID-Carrier
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!inventory.valid && <InventoryAlert label="Snapshot ungültig" />}
          {inventory.stale && <InventoryAlert label="Verbindung veraltet" />}
          {inventory.countMismatch && <InventoryAlert label="Bestand stimmt nicht überein" />}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniMetric label="Verfügbar (SPS)" value={inventory.availableCount ?? "–"} />
        <MiniMetric label="Verfügbar (MES)" value={inventory.reconciledAvailableCount ?? "–"} />
        <MiniMetric label="Erkannt" value={inventory.observedCount ?? inventory.totalCount ?? "–"} />
        <MiniMetric label="Kapazität" value={inventory.capacity ?? "–"} />
        <MiniMetric label="Revision" value={inventory.revision ?? "–"} />
      </div>
      {inventory.updatedAt && (
        <p className="mt-3 text-xs text-neutral-500">Letzter Snapshot: {formatLastSeen(inventory.updatedAt)}</p>
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
function StatusPill({ status }) { const color = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_process" ? "bg-amber-50 text-amber-700" : status === "assigned" ? "bg-sky-50 text-sky-700" : status === "error" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{carrierStatus(status)}</span>; }
function PhysicalStatePill({ state }) { const normalized = String(state).toLowerCase(); const color = normalized === "stored" ? "bg-emerald-100 text-emerald-800" : normalized === "rfid_error" || normalized === "missing" ? "bg-red-100 text-red-800" : normalized === "at_station" || normalized === "in_transit" ? "bg-sky-100 text-sky-800" : "bg-neutral-200 text-neutral-700"; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{physicalStateLabel(normalized)}</span>; }
function InventoryAlert({ label }) { return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{label}</span>; }
function carrierStatus(status) { return ({ available: "Verfuegbar", assigned: "Zugeordnet", in_process: "In Arbeit", completed: "Fertig", error: "Fehler" })[status] || status; }
function physicalStateLabel(state) { return ({ stored: "Im Palettenlager", dispensed: "Ausgegeben", in_transit: "Im Transport", at_station: "An Station", returned: "Rücktransport", missing: "Nicht gefunden", rfid_error: "RFID-Fehler", empty: "Leer" })[state] || state; }
