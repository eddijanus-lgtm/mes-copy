# Guide: Phase 2.1 — Orders Page (create/edit/delete Forms)

_Dieser Guide erklärt die komplette Auftragsverwaltung im Frontend: Wie Daten geladen, angezeigt, erstellt, bearbeitet und gelöscht werden._

---

## Übersicht

Die Orders-Seite ist das zentrale Feature für die Produktionsplanung. Sie ermöglicht:

- **Aufträge anlegen** → Neues Produktionselement mit Station, Operation, Priorität und Menge
- **Aufträge bearbeiten** → Status und Fertigmenge aktualisieren
- **Aufträge löschen** → Veraltete Einträge entfernen (nur Admins)
- **Live-Übersicht** → Fortschrittsbalken, Statistiken, Suche und Filter

---

## Dateistruktur

```
frontend/src/
├── pages/Orders.jsx           ← Hauptkomponente (200 Zeilen)
├── api/client.js              ← HTTP-Client mit JWT-Auth und Fehlerbehandlung
├── utils/roles.js             → Rollen-Prüffunktionen
└── providers/AuthProvider.jsx → useAuth-Hook für User-Info
```

---

## Datei: `frontend/src/api/client.js` — Der HTTP-Client

Dieser Client ist die Basis **aller** API-Kommunikation im Frontend.

### Zeile 1–4: Konfiguration und Request-Funktion

```javascript
const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;  // z.B. "/api/v1/orders"
```

- Alle Requests gehen automatisch über `/api` — das ist der Proxy zum Backend (Vite proxys zu `localhost:3000`).
- Die Funktion ist generic und wird von `get`, `post`, `patch`, `del` wiederverwendet.

### Zeile 5–6: JWT-Token einfügen

```javascript
const token = localStorage.getItem('jwt_token');
```

- Liest das JWT aus dem `localStorage`. Wird automatisch an alle Requests gehangen.
- Kein Token → Request geht trotzdem (für öffentliche Endpunkte). Mit Token → authentifiziert.

### Zeile 7–9: Headers konfigurieren

```javascript
const headers = { ...options.headers };
if (token) headers.Authorization = `Bearer ${token}`;
if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
```

- Falls User geloggt ist → `Authorization: Bearer <token>` wird gesetzt.
- Falls Request Body JSON ist → `Content-Type: application/json` automatisch gesetzt.

### Zeile 18–34: Fehlerbehandlung

```javascript
const res = await fetch(url, config);

if (res.status === 401) {
  localStorage.removeItem('jwt_token');
  window.dispatchEvent(new Event('auth:unauthorized'));
}

if (!res.ok) {
  const responseText = await res.text();
  let detail = responseText;
  try {
    const payload = JSON.parse(responseText);
    detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || payload.error || responseText;
  } catch { /* plain text */ }
  const prefix = res.status === 403 ? "Zugriff verweigert (403)" : `Anfrage Fehlgeschlagen (${res.status})`;
  throw new Error(detail ? `${prefix}: ${detail}` : prefix);
}
```

- **401** → Token ungültig: wird gelöscht, Event `'auth:unauthorized'` löst Login-Dialog aus.
- **Andere Errors** → Parsing der Backend-Fehlermeldung. Array von messages → joined; Einzelne message oder `error` → verwendet. Dann als `Error` geworfen und vom Aufrufer angezeigt.

### Zeile 36–45: Response-Parsing und API-Export

```javascript
const text = await res.text();
return text ? JSON.parse(text) : null;

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
```

- Response wird als JSON geparst. Nur `api`-Objekt exportiert — kein direkter `fetch` im Code.

---

## Datei: `frontend/src/pages/Orders.jsx` — Die Orders-Seite

### Zeilen 1–25: Imports und Konstanten

```javascript
import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../providers/AuthProvider.jsx";
import { canDeleteOrders, canManageOrders } from "../utils/roles.js";

const EMPTY_FORM = {
  id: null, name: "", priority: 5, machine_id: "", operation: "",
  quantity: 1, completed_quantity: 0, status: "pending",
  start_time: "", target_complete_time: "",
};

const STATUS_LABELS = {
  pending: "Ausstehend", in_progress: "In Arbeit", completed: "Abgeschlossen",
  cancelled: "Abgebrochen", on_hold: "Pausiert",
};
```

- `EMPTY_FORM` ist **Template für das Formular-state** — beim Erzeugen wird alles zurückgesetzt.
- `STATUS_LABELS` → Deutsche Beschriftungen für alle 5 Order-Status.

### Zeilen 27–38: Component State & Role-Basis

```javascript
const { user } = useAuth();
const [orders, setOrders] = useState([]);
const [machines, setMachines] = useState([]);
const [form, setForm] = useState(EMPTY_FORM);
const [modalOpen, setModalOpen] = useState(false);
const [search, setSearch] = useState("");
const [statusFilter, setStatusFilter] = useState("all");
const [error, setError] = useState("");
const [saving, setSaving] = useState(false);
const canManage = canManageOrders(user);
const canDelete = canDeleteOrders(user);
```

| State | Bedeutung |
|-------|-----------|
| `orders` | Alle geladenen Production Orders aus Backend |
| `machines` | Verfügbare Stations zum Zuweisen |
| `form` | current state des Modal-Formulars |
| `modalOpen` | True wenn Create/Edit-Modal sichtbar |
| `search` | Text für die Suche |
| `statusFilter` | Dropdown-Wert (alle/in_progress/completed/...) |
| `error` | Fehlermeldung falls API-Fehler auftrat |
| `saving` | Sperrt Button während Speichern läuft |
| `canManage` | Ob User Orders erstellen/bearbeiten darf |
| `canDelete` | Ob User orders löschen darf |

### Zeilen 40–43: Daten laden beim Mount

```javascript
useEffect(() => {
  refresh();
  api.get("/machines").then((data) => setMachines(Array.isArray(data) ? data : [])).catch(() => setMachines([]));
}, []);
```

- `[]` als dependency → wird **nur einmal** beim ersten Mount ausgeföhrt.
- Ruft zwei API-Calls parallel auf: Orders + Machines. Falls Machines fehltschlagen → leerer Array (kein Fehler geworfen).

### Zeilen 45–47: refresh() — Reload aller Orders

```javascript
function refresh() {
  return api.get("/orders").then((data) => setOrders(Array.isArray(data) ? data : [])).catch((requestError) => setError(requestError.message));
}
```

- Wird nach jedem Create/Edit/Delete aufgerufen. Neue Liste aus Backend geladen und State aktualisiert. Fehler → wird im Error-State gespeichert und oben angezeigt.

### Zeilen 49–53: openCreate() — Neues Order Formular öffnen

```javascript
function openCreate() {
  setError("");
  setForm({ ...EMPTY_FORM, machine_id: machines[0]?.id || "" });
  setModalOpen(true);
}
```

- Leeres Formular. Wenn eine Station existiert → wird diese automatisch vorausgewählt.

### Zeilen 55–70: openEdit(order) — Bestehenden Order laden

```javascript
function openEdit(order) {
  setError("");
  setForm({
    id: order.id, name: order.name, priority: order.priority, machine_id: order.machine_id,
    operation: order.operation, quantity: order.quantity, completed_quantity: order.completed_quantity,
    status: order.status, start_time: toLocalInput(order.start_time), target_complete_time: toLocalInput(order.target_complete_time),
  });
  setModalOpen(true);
}
```

- Alle Order-Felder in das Formular kopieren. `toLocalInput()` wandelt ISO-Daten vom Backend (UTC) zurück zum `datetime-local`-input Format um.

### Zeilen 72–99: submit(event) — Create oder Update ausführen

```javascript
async function submit(event) {
  event.preventDefault();
  setSaving(true);
  setError("");
  
  const payload = {
    name: form.name.trim(), priority: Number(form.priority), machine_id: form.machine_id,
    operation: form.operation.trim(), quantity: Number(form.quantity),
    ...(form.start_time ? { start_time: new Date(form.start_time).toISOString() } : {}),
    ...(form.target_complete_time ? { target_complete_time: new Date(form.target_complete_time).toISOString() } : {}),
  };
  
  if (form.id) {  // Edit-Modus → zusätzliche Felder für Status/Fertigmeng
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
```

| Schritt | Was passiert |
|---------|-------------|
| `event.preventDefault()` | Verhindert page reload auf Submit |
| `setSaving(true)` | Button wird disabled (Spinner/Text "Speichert...") |
| Payload bauen | Felder trimmen, nummern type casten, datetimes als ISO zurück zum Backend |
| `if (form.id) ...` | Edit-Modus: status + completed_quantity werden auch gesendet. Create-Modus: nicht relevant. |
| `api.patch` oder `api.post` | Der eigentliche HTTP-Aufruf ans Backend |

### Zeilen 102–111: remove(order) — Order löschen

```javascript
async function remove(order) {
  if (!confirm(`Auftrag "${order.name}" wirklich löschen?`)) return;
  setError("");
  try {
    await api.del(`/orders/${order.id}`);
    setOrders((current) => current.filter((entry) => entry.id !== order.id));
  } catch (requestError) {
    setError(requestError.message);
  }
}
```

- Browser `confirm()` Dialog als Safe-Guard.
- Nach erfolgreichem delete: optimistic update → Order aus dem frontend-Liste entfernen (keine API-Rereload nötig).

### Zeilen 139–145: Suchleiste und Status-Filter

```javascript
<div className="grid gap-3 rounded-xl border ...">
  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Auftrag oder Operation suchen..." />
  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
    <option value="all">Alle Status</option>
    {Object.entries(STATUS_LABELS).map(([value, label]) => <option ...>)}
  </select>
</div>
```

- **Suche**: filtert `orders` über name oder operation (case-insensitive). Filter-Logik: Zeilen 144–146.
- **Filter-dropdown**: mappt alle 5 Status aus `STATUS_LABELS`.

### Zeilen 147–167: Orders-Tabelle

```javascript
<table>
  <thead>
    <tr>
      <th>Auftrag</th><th>Station</th><th>Operation</th><th>Priorität</th><th>Fortschritt</th><th>Status</th>
      {canManage && <th>Aktionen</th>}
    </tr>
  </thead>
  <tbody>
    {filtered.map((order) => (
      <tr>
        <td>{order.name}</td>           {/* + UUID first chars */}
        <td>{machineNames[order.machine_id]}</td>
        <td>{order.operation}</td>
        <td>P{order.priority}</td>
        <td><Fortschrittsbalken {progress(order)}% /></td>
        <td><StatusBadge status={order.status} /></td>
        {canManage && <td><Bearbeiten /><Löschen /></td>}
      </tr>
    ))}
  </tbody>
</table>
```

Die Spalten zeigen:
- **Auftrag**: Name + verkürzte UUID
- **Station**: Maschinename aus der vorhin geladenen `machineNames` Map
- **Operation**: Auftragstyp/Beschreibung
- **Priorität**: P1 bis P5 mit fettgedruckter Schrift
- **Fortschritt**: `<Fortschnittsbalken mit Prozent und Fertigmenge / Gesamtmenge

### Zeilen 174–193: OrderModal (Erstell Formular)

```javascript
<div className="fixed inset-0 z-50 flex items-center justify-center ... bg-neutral-950/50">
  <div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
    <div className="border-b px-6 py-5">
      <p>Produktionsplanung
      <h2>{form.id ? "Auftrag bearbeiten" : "Neuen Auftrag anlegen"}</h2>
    </div>
    <form onSubmit={onSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
      <Field label="Auftragsname" ... />
      <Field label="Station" ... />
      <Field label="Operation" ... />
      <Field label="Priorität" ... />
      <Field label="Menge" ... />
      {form.id && <Field label="Fertigmeng ..." />}    {/* Edit-Modus nur */}
      {form.id && <Field label="Status" ... />}       {/* Edit-Modus nur */}
      <Field label="Geplanter Start" ... />
      <Field label="Zieltermin" ... />
      <div className="flex justify-end gap-2">
        <button onClick={onClose}>Abbrechen</button>
        <button type="submit">{saving ? "Speichert..." : "Speichern"}</button>
      </div>
    </form>
  </div>
</div>
```

Modal mit zwei-spaltigem Grid (responsive) Layout. Nur im Edit-Modus werden Fertigmenge und Status-Felder angezeigt. Modal schließt bei Klick auf Overlay oder "Abbrechen"-Button.

### Hilfsfunktionen (Zeilen 196–200)

```javascript
function Field({ label, children }) { ... }                    {/* Label Wrapper */}
function OrderStat({ label, value, accent }) { ... }           {/* Statistik-Karten */}
function StatusBadge({ status }) { ... }                       {/* Farbcodierte Badges */}
function progress(order) { return order.quantity ? Math.min(100, Math.round((completed_quantity / quantity) * 100)) : 0; }     {/* Fortschritt Berechnung */}
function toLocalInput(value) { ... }                           {/* UTC -> datetime-local input format */}
```

---

## Backend: Wie die API funktioniert

### Orders Controller (`src/orders/orders.controller.ts`)


| Endpoint | Methode | Funktion |
|----------|---------|---------|
| `/api/v1/orders` | GET | Alle Orders |
| `/api/v1/orders/active` | GET | Aktive orders (`status !== completed && cancelled`) |
| `/api/v1/orders/line/:machineId/pending` | GET | Pending Orders für eine Station (für Routing) |
| `/api/v1/orders/:id` | GET | Einzelne Order |
| `/api/v1/orders/:id/route` | POST | Route-Zuweisung an Carrier |
| `/api/v1/orders` | POST | **Neuen Order erstellen** |
| `/api/v1/orders/:id` | PATCH | **Order aktualisieren** (status + completed_quantity) |
| `/api/v1/orders/:id` | DELETE | **Order löschen** |

### Orders Service (`src/orders/order.service.ts`)

Die Logik im Backend ist einfach:

1. `create()`: Ernew Order-Entity mit allen DTO-Feldern; speichert via `save()`
2. `update(id, dto)`: Findet Order; setzt falls `completed` oder `cancelled` → wird der `end_time` gesetzt. Rest per `partialUpdate()`.
3. `remove(id)`: Ruft `repository.delete(id)` auf.

### Order Entity (`src/orders/order.entity.ts`)

Das Daten-Modell pro Zeile:

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `id` | UUID | Primärschlüssel, automatisch generiert |
| `name` | varchar | Anzeigename des Auftrags |
| `operation` | varchar | Prozess-Schritt (z.B. "Montage A") |
| `machine_id` | uuid fk | Verweis auf Station aus machines table |
| `status` | enum | pending, in_progress, completed, cancelled, on_hold |
| `priority` | smallint | 1 (höchste) – 5 (niedrigste) |
| `quantity` | int    | Gesamtmenge  
| `completed_quantity` | int    | Fertigelemente seitletztlich |
| `start_time`     | datetime     | Geplanter Start-Zeitpunkt |
| `target_complete_time` | datetime  | Geplante Finish-Zeitpunkt |
| `end_time`       | datetime     | Tatsächlich Ende (wird beim Update auf completed/ cancelled automatisch gesetzt) |

---

## User-Rights & Berechtigungen

### Rolle    -> darf        -> darf  
| Admin          | Orders create/edit/delete   | ✅           | ✅  |
| Operator       | Orders                    | ❌           | ❌  |
| Viewer         | kei      | ❌               | ❌              |

- Die `canManageOrders()` und `canDeleteOrders()` functions in `utils/roles.js` prüfen die Rolle des aktuell geloggten Users.
- Buttons für Bearbeiten/Loschens werden basierend auf diesen Rollen dynamisch ein-/ausgehakt.

---

## User Flow: Neuer Order anlegen

1. **Admin klickt "+ Neuer Auftrag"**
2. Modal erscheint mit leerem Formular
3. Admin füllt Felder aus (Name, Operation, Station, Menge...)
4. **"Speichern" wird geklickt**
5. `submit()` setzt `saving=true`, baut JSON-Payload
6. `api.post("/orders", payload)` schickt request zum Backend
7. Backend validiert DTOs und speichert via TypeORM
8. Response zurück → Orders-Seite führt `refresh()` aus um neue Liste zu laden
9. Modal wird geschlossen, Formular resettet

---

## User Flow: Order bearbeiten

11. **Admin klickt "Bearbeiten" neben einem Order in der Liste**
2. Modal öffnet sich mit existing Daten gefüllt (via `openEdit()`)
3. Admin ändert Felder → Status z.B. auf "in_progress", oder setze Fertigmenge
4. **"Speichern" → api.patch** sendet nur die geänderten Werte zurück
5. Backend setzt falls nötig den `end_time` und aktualisiert die restlichen fields

### User Flow: Order löschen

1. **Admin klickt "Löschen"**
2. Browser-`confirm()` Dialog erscheint (Safe-Guard)
3. Bei OK: `api.del("/orders/:id")` sends DELETE request
4. Success: Optimistic Update — Order wird sofort aus frontend-Liste entfernt ohne API-Rereload. Error → wird im Error-State gespeichert und als Alert angezeigt.

---

## Vite Proxy Konfiguration (wichtig!)

### Frontend `vite.config.js

```javascript 
export default defineConfig({
  server:{
    proxy: {
      '/api': {
        target: 'http://localhost:3000',   // <-- Backend-Port
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
```

Das Frontend läuft auf Port `5173`, aber das Backend auf `3000`. Der Vite-Dev-Server leitet alle `/api/*` automatisch zum Backend weiter. `api.get("/orders")` wird dadurch zu `GET /api/v1/orders → http://localhost:3000/api/v1/orders`.

---

## Zusammenfassung

Phase 2.1 implementiert eine vollständige Auftragsverwaltung (CRUD): 

- **Create**: Modal mit Validierung und API POST
- **Read**: Liste mit Suche, Filtern, Fortschrittsbalken und Statistik-Karten
- **Update**: Edit-Modal mit Status/Endmenge Änderung via PATCH
- **Delete**: Löschen mit confirm()-Dialog und DELETE request
- **Sicherheit**: Rollenbasierte Button-Sichtbarkeit (Admin vs. Operator)
- **Fehlerbehandlung**: Zentrales API-Client mit 401-AutoLogout, 403/other Error-Parsing und User-freundlichen Messages
- **UX**: Loading-Zustand (saving-Btn), optimistic Updates nach delete, responsive Layout
