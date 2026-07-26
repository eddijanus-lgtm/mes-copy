import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";

export default function CarriersPage() {
  const { user } = useAuth();
  const canManage = hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [carrierNumber, setCarrierNumber] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [carrierData, orderData] = await Promise.all([api.get("/carriers"), api.get("/orders")]);
      setCarriers(Array.isArray(carrierData) ? carrierData : []);
      setOrders(Array.isArray(orderData) ? orderData : []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2000);
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

  return (
    <div className="mes-page min-h-screen bg-neutral-50 p-6 space-y-6">
      <div className="mes-page-header">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Werkstückträger</h1>
          <p className="mt-1 text-sm text-neutral-500">Carrier-Position, Auftragszuordnung und aktueller Arbeitsschritt der angebundenen Anlage.</p>
        </div>
        <button onClick={load} className="w-fit rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-brand-primary hover:text-brand-primary">Aktualisieren</button>
      </div>

      <section className="mes-context-note">
        <strong>Ablauf:</strong> Das MES entscheidet je Carrier anhand Auftrag und Route, welche Station den nächsten Arbeitsschritt ausführen darf.
      </section>

      {canManage && (
        <form onSubmit={createCarrier} className="mes-filter-panel flex max-w-lg gap-3">
          <input type="number" min="1" required value={carrierNumber} onChange={(event) => setCarrierNumber(event.target.value)} placeholder="Carrier-Nummer" className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white">Anlegen</button>
        </form>
      )}

      {error && <p className="rounded-lg bg-status-error-bg p-3 text-sm text-status-error">{error}</p>}

      <div className="mes-card-list grid xl:grid-cols-2">
        {carriers.map((carrier) => <CarrierCard key={carrier.id} carrier={carrier} order={orderById[carrier.order_id]} />)}
        {carriers.length === 0 && <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-400">Noch keine Werkstückträger vorhanden.</p>}
      </div>
    </div>
  );
}

function CarrierCard({ carrier, order }) {
  const activeStep = carrier.status === "completed" ? 4 : carrier.current_step_no;
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
        <MiniMetric label="Aktueller Schritt" value={carrier.status === "completed" ? "Fertig" : `Schritt ${carrier.current_step_no}`} />
        <MiniMetric label="Resource" value={carrier.current_resource_id ? `R${carrier.current_resource_id}` : "Transport / Wartet"} />
      </div>

      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Routenposition</p>
        <div className="relative grid grid-cols-3 text-center text-xs">
          <div className="absolute left-[16.66%] right-[16.66%] top-2 h-0.5 bg-neutral-200" />
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="relative z-10 flex flex-col items-center gap-2">
              <span className={`h-4 w-4 rounded-full border-2 ${step < activeStep ? "border-emerald-500 bg-emerald-500" : step === activeStep ? "border-amber-400 bg-amber-400 ring-4 ring-amber-200" : "border-neutral-300 bg-white"}`} />
              <span className={step === activeStep ? "font-semibold text-neutral-900" : "text-neutral-500"}>{step === 4 ? "Fertig" : `Schritt ${step}`}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function MiniMetric({ label, value }) { return <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-neutral-900">{value}</p></div>; }
function StatusPill({ status }) { const color = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_process" ? "bg-amber-50 text-amber-700" : status === "assigned" ? "bg-sky-50 text-sky-700" : status === "error" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{carrierStatus(status)}</span>; }
function carrierStatus(status) { return ({ available: "Verfuegbar", assigned: "Zugeordnet", in_process: "In Arbeit", completed: "Fertig", error: "Fehler" })[status] || status; }
