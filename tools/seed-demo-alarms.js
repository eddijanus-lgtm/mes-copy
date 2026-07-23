require('dotenv').config();

const baseUrl = process.env.MES_BASE_URL || 'http://localhost:3000/api';
const username = process.env.DEMO_ADMIN_USERNAME;
const password = process.env.DEMO_ADMIN_PASSWORD;

async function request(path, options = {}, token) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function seed() {
  if (!username || !password) throw new Error('Set DEMO_ADMIN_USERNAME and DEMO_ADMIN_PASSWORD.');
  const login = await request('/auth/login', { method: 'POST', body: { username, password } });
  const token = login.access_token;

  const machines = await request('/machines', {}, token);
  if (!machines.length) throw new Error('No machines found. Run seed:stmes-demo first.');

  console.log('Machines available:', machines.map((m) => m.name));

  const demos = [
    { severity: 'critical', machine_id: machines[0].id, message: 'SPS-Kommunikation unterbrochen — Station reagiert nicht mehr auf Polling', source: 'opcua-adapter' },
    { severity: 'error', machine_id: machines[0].id, message: 'Carrier 128: Deckelfarbe fehlgedruckt — Auftrag muss wiederholt werden', source: 'vision-system' },
    { severity: 'error', machine_id: machines[1].id, message: 'Füller-Positionierung außerhalb Toleranz (±0.5mm) — automatische Abschaltung', source: 'machine-controller' },
    { severity: 'warning', machine_id: machines[1].id, message: 'Kugelfarbe Blau fast aufgebraucht (< 10%) — Nachlage anfordern', source: 'material-monitor' },
    { severity: 'warning', machine_id: machines[machines.length - 1 > 0 ? machines.length - 1 : 0].id, message: 'Endkontrolle: 3 hintereinander defekte Trays — Reinigungszyklus empfohlen', source: 'quality-gate' },
    { severity: 'info', machine_id: machines[1].id, message: 'Opération "Kugeln dosieren" abgeschlossen — Carrier erfolgreich weitergeleitet', source: 'handshake-manager' },
    { severity: 'warning', machine_id: machines[0].id, message: 'Lagertemperatur 4.2°C über Sollwert (35°C) — Klimagerät prüft', source: 'environmental-sensor' },
    { severity: 'critical', machine_id: machines[machines.length - 1 > 0 ? machines.length - 1 : 0].id, message: 'Not-Halt aktiv an Station Q01 — Personal informieren', source: 'safety-controller' },
    { severity: 'info', machine_id: machines[0].id, message: 'Wartung geplant: Nächste Kalibrierung in 12 Stunden', source: 'maintenance-scheduler' },
    { severity: 'error', machine_id: machines[machines.length - 1 > 0 ? machines.length - 1 : 0].id, message: 'Datenbank-Sync fehler: Telemetrie-Puffer voll (350/400 Einträge)', source: 'data-collector' },
    { severity: 'info', machine_id: machines[0].id, message: 'Systemstart abgeschlossen — Alle Adapter verbunden und operational', source: 'system-monitor' },
    { severity: 'warning', machine_id: machines[1].id, message: 'MQTT-Broker Pings mit hoher Latenz (>500ms) — Netzwerk prüfen', source: 'mqtt-adapter' },
  ];

  const results = { created: 0, skipped: [] };

  for (let i = 0; i < demos.length; i++) {
    const d = demos[i];
    try {
      const body = JSON.parse(JSON.stringify(d));
      if (body.acknowledged_at) body.acknowledged_at = new Date(body.acknowledged_at).toISOString();

      console.log(`[${i + 1}/${demos.length}] Creating alarm: severity=${body.severity}, machine=${body.machine_id}`);
      await request('/alarms', { method: 'POST', body }, token);
      results.created++;
      console.log(`  ✓ Created`);
    } catch (e) {
      results.skipped.push({ row: i + 1, error: e.message });
      console.log(`  ✗ ${e.message}`);
    }
  }

  console.log(`\nDEMO Alarme: ${results.created} erstellt, ${results.skipped.length} Fehler.`);

  const allAlarms = await request('/alarms', {}, token);
  const openAlarms = allAlarms.filter((a) => !a.acknowledged);
  const ackedAlarms = allAlarms.filter((a) => a.acknowledged);
  console.log(`Offen: ${openAlarms.length}, Bestätigt: ${ackedAlarms.length}`);

  if (results.skipped.length > 0) {
    console.log('\nFehler详情:')
    results.skipped.forEach((s) => {
      console.log(`  Zeile ${s.row}: ${s.error}`);
    });
  }
}

seed().catch((error) => {
  console.error('DEMO Alarm seed failed:', error.message);
  process.exit(1);
});
