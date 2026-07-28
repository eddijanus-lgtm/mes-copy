import { api } from "../api/client.js";

function asArray(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.items) ? value.items : [];
}

function text(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function status(value) {
  return text(value).replaceAll("_", " ").toUpperCase();
}

function shortId(value) {
  return text(value).slice(0, 8).toUpperCase();
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function time(value) {
  return text(value).slice(0, 5);
}

function traceValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[DATEN]";
  }
}

async function loadMachines() {
  const machines = asArray(await api.getSilent("/machines"));
  return machines.map((machine, index) => [
    text(machine.resource_id, String(index + 1).padStart(2, "0")),
    text(machine.name),
    status(machine.status),
    text(machine.location),
    dateTime(machine.last_heartbeat),
  ]);
}

async function loadOrders() {
  const orders = asArray(await api.getSilent("/orders"));
  return orders.map((order) => [
    text(order.name, shortId(order.id)),
    text(order.operation),
    text(order.quantity, "0"),
    `${text(order.completed_quantity, "0")} / ${text(order.quantity, "0")}`,
    status(order.status),
  ]);
}

async function loadAlarms() {
  const alarms = asArray(await api.getSilent("/alarms"));
  return alarms.map((alarm) => [
    dateTime(alarm.created_at),
    text(alarm.source, shortId(alarm.machine_id)),
    text(alarm.message),
    status(alarm.severity),
    alarm.acknowledged ? "QUITT." : "AKTIV",
  ]);
}

async function loadMaterialsAndCarriers() {
  const [materialsResult, carriersResult] = await Promise.all([
    api.getSilent("/materials"),
    api.getSilent("/carriers"),
  ]);

  const materialRows = asArray(materialsResult).map((material) => {
    const minimum = Number(material.minimum_stock ?? 0);
    const stock = Number(material.stock_quantity ?? 0);
    return [
      text(material.sku, shortId(material.id)),
      "MATERIAL",
      text(material.name),
      `${stock} ${text(material.unit, "STK").toUpperCase()}`,
      minimum > 0 && stock <= minimum ? "MINDESTBESTAND" : status(material.type),
    ];
  });

  const carrierRows = asArray(carriersResult).map((carrier) => [
    `WT-${String(carrier.carrier_number).padStart(5, "0")}`,
    "TRÄGER",
    carrier.order_id ? shortId(carrier.order_id) : "FREI",
    text(carrier.storage_slot, text(carrier.current_resource_id)),
    status(carrier.physical_state || carrier.status),
  ]);

  return [...materialRows, ...carrierRows];
}

async function loadTraces() {
  const traces = asArray(await api.getSilent("/traces"));
  return traces.slice(0, 100).map((trace) => [
    dateTime(trace.collected_at),
    text(trace.key_data_point),
    status(trace.category),
    shortId(trace.machine_id),
    traceValue(trace.value),
  ]);
}

async function loadShifts() {
  const shifts = asArray(await api.getSilent("/shifts"));
  return shifts.map((shift) => [
    text(shift.name),
    `${time(shift.start_time)} – ${time(shift.end_time)}`,
    text(shift.manager_name),
    text(shift.date),
    shift.closed ? "BEENDET" : "AKTIV",
  ]);
}

async function loadUsersAndSystem() {
  const [usersResult, healthResult] = await Promise.allSettled([
    api.getSilent("/users"),
    api.getSilent("/health/combined"),
  ]);

  const userRows = usersResult.status === "fulfilled"
    ? asArray(usersResult.value).map((user) => [
        text(user.username).toUpperCase(),
        text(user.username),
        status(user.role),
        dateTime(user.created_at),
        "ANGELEGT",
      ])
    : [];

  const health = healthResult.status === "fulfilled" ? healthResult.value : null;
  const databaseState = health?.database?.database?.status || health?.database?.database || "unbekannt";
  const systemRows = health
    ? [
        ["MES-DB", "Datenbank", "SYSTEM", dateTime(health.timestamp), status(databaseState)],
        ["MES-OPC", "OPC-UA Gateway", "SYSTEM", dateTime(health.timestamp), status(health.shopfloor?.opcua)],
        ["MES-MQTT", "MQTT Gateway", "SYSTEM", dateTime(health.timestamp), status(health.shopfloor?.mqtt)],
        ["MES-CORE", "MES Server", "SYSTEM", `${Math.floor((health.uptime_seconds || 0) / 60)} MIN`, "ONLINE"],
      ]
    : [];

  if (userRows.length === 0 && systemRows.length === 0) {
    throw new Error("Benutzer- und Systemdaten sind nicht erreichbar.");
  }

  return [...userRows, ...systemRows];
}

const LOADERS = {
  machines: loadMachines,
  orders: loadOrders,
  alarms: loadAlarms,
  material: loadMaterialsAndCarriers,
  traces: loadTraces,
  shifts: loadShifts,
  system: loadUsersAndSystem,
};

export async function loadDosModuleRows(moduleKey) {
  const loader = LOADERS[moduleKey];
  if (!loader) throw new Error(`Unbekanntes DOS-Modul: ${moduleKey}`);
  return loader();
}
