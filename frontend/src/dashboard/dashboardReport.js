function escapeHtml(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reportCard(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

export function openDashboardReport({ scope, stats, machines, carriers, kpis }) {
  const title = scope === "day" ? "MES Tagesbericht" : "MES Schichtbericht";
  const status = kpis?.machines?.status || {};
  const stations = [...machines]
    .filter((machine) => machine.resource_id != null)
    .sort((a, b) => Number(a.resource_id) - Number(b.resource_id));
  const stationRows = stations.map((station) => {
    const carrier = carriers.find((entry) => entry.current_resource_id === station.resource_id);
    return `<tr><td>${escapeHtml(station.name)}</td><td>${escapeHtml(station.resource_id)}</td><td>${escapeHtml(station.status)}</td><td>${escapeHtml(carrier?.carrier_number)}</td></tr>`;
  }).join("") || `<tr><td colspan="4">Keine Stationen gefunden.</td></tr>`;
  const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!reportWindow) return;

  reportWindow.document.write(`<!doctype html>
    <html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      body{color:#101318;font:14px Arial,sans-serif;margin:32px}h1{font-size:25px;margin:0 0 6px}.meta{color:#68707c;font-size:12px;margin-bottom:24px}
      .grid{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}.card{border:1px solid #d9dde3;border-radius:8px;padding:14px}
      .label{color:#68707c;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.value{font-size:22px;font-weight:700;margin-top:6px}
      h2{border-bottom:1px solid #d9dde3;font-size:15px;margin-top:28px;padding-bottom:8px}table{border-collapse:collapse;font-size:12px;width:100%}
      th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}th{background:#f6f7f8}@media print{button{display:none}body{margin:18mm}}
    </style></head><body>
      <button onclick="window.print()" style="float:right;padding:8px 12px">Als PDF speichern</button>
      <h1>${escapeHtml(title)}</h1><div class="meta">Erstellt: ${new Date().toLocaleString("de-DE")}</div>
      <div class="grid">
        ${reportCard("OEE", `${kpis?.oee?.total ?? 0}%`)}
        ${reportCard("Verfügbarkeit", `${kpis?.oee?.availability ?? 0}%`)}
        ${reportCard("Leistung", `${kpis?.oee?.performance ?? 0}%`)}
        ${reportCard("Qualität", `${kpis?.oee?.quality ?? 0}%`)}
        ${reportCard("Durchsatz", `${kpis?.throughput?.unitsPerHour ?? 0} /h`)}
        ${reportCard("Aktive Alarme", stats.alarms)}
        ${reportCard("Gateway", stats.health ? "Online" : "Inaktiv")}
        ${reportCard("Aktive Aufträge", kpis?.orders?.activeOrders ?? 0)}
      </div>
      <h2>Maschinenstatus</h2><div class="grid">
        ${reportCard("Online", status.online || 0)}${reportCard("Bereit", status.idle || 0)}
        ${reportCard("Störung", status.error || 0)}${reportCard("Offline", status.offline || 0)}
      </div>
      <h2>Stationen Live</h2>
      <table><thead><tr><th>Station</th><th>Resource</th><th>Status</th><th>Carrier</th></tr></thead><tbody>${stationRows}</tbody></table>
      <script>setTimeout(()=>window.print(),300)</script>
    </body></html>`);
  reportWindow.document.close();
}
