import { useState, useEffect } from "react";
import { api } from "../api/client.js";
import { useTranslation } from "../i18n/I18nProvider.jsx";
import PageInfo from "../components/PageInfo.jsx";

export default function TracesPage() {
  const { t, locale } = useTranslation();
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [keyFilter, setKeyFilter] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    const params = new URLSearchParams({ include_data_points: "true" });
    if (filter !== "all") params.set("category", filter);
    if (keyFilter) params.set("key_data_point", keyFilter);
    if (minValue) params.set("min_value", minValue);
    if (maxValue) params.set("max_value", maxValue);
    api.getSilent(`/traces?${params.toString()}`)
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Invalid traces response");
        if (active) setTraces(data);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filter, keyFilter, minValue, maxValue]);

  function catClass(c) {
    if (c === "process_data") return "bg-status-info-bg text-status-info";
    if (c === "quality") return "bg-status-success-bg text-status-success";
    if (c === "energy") return "bg-status-info-bg text-status-info";
    if (c === "op_input") return "bg-brand-primary/10 text-brand-primary";
    return "bg-neutral-100 text-neutral-600";
  }

  function formatValue(val) {
    if (val == null) return "-";
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (typeof val === "object") return String(val.numeric_value ?? JSON.stringify(val)).slice(0, 100);
    try { const obj = JSON.parse(val); if (typeof obj === "object" && obj !== null) { const numericValue = obj.numeric_value; return numericValue != null ? String(numericValue) : JSON.stringify(obj).slice(0, 100); } } catch {}
    return String(val).slice(0, 100);
  }

  function formatDate(d) { if (!d) return "-"; return new Date(d).toLocaleString(locale === "de" ? "de-DE" : "en-US"); }

  const categories = ["all", "process_data", "quality", "material", "energy", "op_input"];

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 inline-flex items-center">{t("traces.title")}<PageInfo page="traces" /></h1>
          <p className="text-sm text-neutral-500 mt-0.5">{t("traces.subtitle")}</p>
        </div>

        <div className="flex gap-2 flex-wrap items-end bg-white p-4 rounded-lg border border-neutral-200 shadow-sm">
          <div><label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">{t("traces.keyDataPoint")}</label><input type="text" value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} placeholder={t("traces.placeholderKey")} className="px-3 py-2 border border-neutral-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary w-48" /></div>
          <div><label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">{t("traces.minValue")}</label><input type="number" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder={t("traces.placeholderMin")} className="px-3 py-2 border border-neutral-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary w-24" /></div>
          <div><label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">{t("traces.maxValue")}</label><input type="number" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder={t("traces.placeholderMax")} className="px-3 py-2 border border-neutral-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary w-24" /></div>
          <button onClick={() => { setFilter("all"); setKeyFilter(""); setMinValue(""); setMaxValue(""); }} className="px-3 py-2 bg-neutral-100 text-neutral-600 rounded-md text-xs font-semibold hover:bg-neutral-200 transition-colors">{t("traces.resetFilters")}</button>
        </div>

        <div className="flex gap-1.5 flex-wrap" role="group">
          {categories.map((c) => (<button key={c} onClick={() => setFilter(c)} className={`px-3.5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${filter === c ? "bg-brand-primary text-white" : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"}`}>{c === "all" ? t("traces.filterAll") : c}</button>))}
        </div>

        {loading && <p className="text-center text-neutral-400 py-12 text-sm">{t("traces.loading")}</p>}
        {!loading && loadFailed && <p role="alert" className="text-center text-status-error py-12 text-sm">{t("traces.loadError")}</p>}
        {!loading && !loadFailed && traces.length === 0 && <p className="text-center text-neutral-400 py-12 text-sm">{t("traces.noTraces")}</p>}

        {!loading && !loadFailed && traces.length > 0 && (
          <div className="bg-white rounded-lg shadow-card border border-neutral-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("traces.id")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("traces.machine")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("traces.keyDataPointCol")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("traces.value")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("traces.category")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">{t("traces.timestamp")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {traces.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-3.5 text-xs font-mono text-neutral-500">{(t.id || "").substring(0, 8)}</td>
                    <td className="px-5 py-3.5 text-sm text-neutral-700">{t.machine_id || "-"}</td>
                    <td className="px-5 py-3.5 text-sm font-mono text-neutral-700">{t.key_data_point || "-"}</td>
                    <td className="px-5 py-3.5 text-sm font-mono text-neutral-700">{formatValue(t.value)}</td>
                    <td className="px-5 py-3.5"><span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${catClass(t.category)}`}>{t.category ? t.category.charAt(0).toUpperCase() + t.category.slice(1) : "-"}</span></td>
                    <td className="px-5 py-3.5 text-xs text-neutral-500">{formatDate(t.collected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
