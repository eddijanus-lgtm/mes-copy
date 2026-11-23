import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import PageInfo from "../components/PageInfo.jsx";

export default function CarriersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
  const [carriers, setCarriers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [carrierNumber, setCarrierNumber] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try { const [carrierData, orderData] = await Promise.all([api.get("/carriers"), api.get("/orders")]); setCarriers(Array.isArray(carrierData) ? carrierData : []); setOrders(Array.isArray(orderData) ? orderData : []); }
    catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 2000); return () => clearInterval(timer); }, []);

  async function createCarrier(event) {
    event.preventDefault(); setError("");
    try { await api.post("/carriers", { carrier_number: Number(carrierNumber) }); setCarrierNumber(""); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  const orderById = Object.fromEntries(orders.map((order) => [order.id, order]));

  return (
    <div className="min-h-screen bg-neutral-50 p-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">{t("carriers.title")}</p>
          <h1 className="text-2xl font-bold text-neutral-900 inline-flex items-center">{t("carriers.subtitle")}<PageInfo page="carriers" /></h1>
          <p className="mt-1 text-sm text-neutral-500">{t("carriers.description")}</p>
        </div>
        <button onClick={load} className="w-fit rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-brand-primary hover:text-brand-primary">{t("carriers.refresh")}</button>
      </div>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>{t("carriers.demoHint")}</strong></section>

      {canManage && (
        <form onSubmit={createCarrier} className="flex max-w-lg gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-card">
          <input type="number" min="1" required value={carrierNumber} onChange={(event) => setCarrierNumber(event.target.value)} placeholder={t("carriers.carrierNumber")} className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white">{t("carriers.create")}</button>
        </form>
      )}

      {error && <p className="rounded-lg bg-status-error-bg p-3 text-sm text-status-error">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {carriers.map((carrier) => <CarrierCard key={carrier.id} carrier={carrier} order={orderById[carrier.order_id]} t={t} />)}
        {carriers.length === 0 && <p className="rounded-xl border border-neutral-200 bg-white p-8 text-sm text-neutral-400">{t("carriers.noCarriers")}</p>}
      </div>
    </div>
  );
}

function CarrierCard({ carrier, order, t }) {
  const activeStep = carrier.status === "completed" ? 4 : carrier.current_step_no;
  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("carriers.carrierLabel")}</p><h2 className="mt-1 font-mono text-2xl font-bold text-neutral-900">{t("carriers.carrierLabel")} {carrier.carrier_number}</h2></div>
        <StatusPill status={carrier.status} t={t} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric label={t("carriers.order")} value={order?.name || t("carriers.notAssigned")} />
        <MiniMetric label={t("carriers.currentStep")} value={carrier.status === "completed" ? t("carriers.complete") : STEP_LABELS[carrier.current_step_no] || `${t("carriers.step")} ${carrier.current_step_no}`} />
        <MiniMetric label={t("carriers.resource")} value={carrier.current_resource_id ? ROUTE_LABELS[carrier.current_resource_id] || `R${carrier.current_resource_id}` : t("carriers.transport")} />
      </div>
      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t("carriers.routePosition")}</p>
        <div className="relative grid grid-cols-3 text-center text-xs">
          <div className="absolute left-[16.66%] right-[16.66%] top-2 h-0.5 bg-neutral-200" />
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="relative z-10 flex flex-col items-center gap-2">
              <span className={`h-4 w-4 rounded-full border-2 ${step < activeStep ? "border-emerald-500 bg-emerald-500" : step === activeStep ? "border-amber-400 bg-amber-400 ring-4 ring-amber-200" : "border-neutral-300 bg-white"}`} />
              <span className={step === activeStep ? "font-semibold text-neutral-900" : "text-neutral-500"}>{step === 1 ? t("carriers.deckel") : step === 2 ? t("carriers.dosieren") : step === 3 ? t("carriers.pruefen") : t("carriers.fertig")}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

const ROUTE_LABELS = { 1: "S01 Deckelzufuehrung", 2: "S02 Kugeldosierung", 3: "Q01 Endkontrolle" };
const STEP_LABELS = { 1: "Deckelfarbe bereitstellen", 2: "Kugeln dosieren", 3: "Deckel und Kugeln pruefen" };
function MiniMetric({ label, value }) { return <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-neutral-900">{value}</p></div>; }
function StatusPill({ status, t }) { const color = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_process" ? "bg-amber-50 text-amber-700" : status === "assigned" ? "bg-sky-50 text-sky-700" : status === "error" ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"; return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{carrierStatusLabel(status, t)}</span>; }
function carrierStatusLabel(status, t) { return ({ available: t("carriers.available"), assigned: t("carriers.assigned"), in_process: t("carriers.inProcess"), completed: t("carriers.completed"), error: t("carriers.error") })[status] || status; }
