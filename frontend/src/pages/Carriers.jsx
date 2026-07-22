import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { hasRole, ROLES } from "../utils/roles.js";

export default function CarriersPage() {
  const { user } = useAuth();
  const canManage = hasRole(user, ROLES.ADMIN, ROLES.OPERATOR);
  const [carriers, setCarriers] = useState([]);
  const [carrierNumber, setCarrierNumber] = useState("");
  const [error, setError] = useState("");

  const load = () => api.get("/carriers").then(setCarriers).catch((requestError) => setError(requestError.message));
  useEffect(() => { load(); }, []);

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

  return (
    <div className="min-h-screen bg-neutral-50 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Werkstückträger</h1>
        <p className="mt-1 text-sm text-neutral-500">Carrier-Zuordnung und aktueller Routenschritt</p>
      </div>

      {canManage && (
        <form onSubmit={createCarrier} className="flex max-w-lg gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-card">
          <input type="number" min="1" required value={carrierNumber} onChange={(event) => setCarrierNumber(event.target.value)} placeholder="Carrier-Nummer" className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white">Anlegen</button>
        </form>
      )}

      {error && <p className="rounded-lg bg-status-error-bg p-3 text-sm text-status-error">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="px-4 py-3">Carrier</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Schritt</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Auftrag</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {carriers.map((carrier) => (
              <tr key={carrier.id}>
                <td className="px-4 py-3 font-mono font-semibold">{carrier.carrier_number}</td>
                <td className="px-4 py-3">{carrier.status}</td>
                <td className="px-4 py-3">{carrier.current_step_no}</td>
                <td className="px-4 py-3">{carrier.current_resource_id ?? "–"}</td>
                <td className="px-4 py-3 font-mono text-xs">{carrier.order_id || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
