const EQUIPMENT_LEVELS = {
  machine: "Maschine",
  work_unit: "Work Unit",
  component: "Komponente",
};

const EXECUTION_STATES = {
  waiting: "Wartet",
  ready: "Bereit",
  running: "In Arbeit",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  failed: "Fehler",
  cancelled: "Abgebrochen",
};

const TERMINAL_EXECUTION_STATES = new Set(["completed", "failed", "cancelled"]);

export function equipmentLevel(item) {
  const raw = item?.equipment_level ?? item?.equipmentLevel;
  if (raw === "machine" || raw === "work_unit" || raw === "component") return raw;
  return item?.parent_resource_id != null || item?.parentResourceId != null ? "work_unit" : "work_unit";
}

export function equipmentLevelLabel(item) {
  return EQUIPMENT_LEVELS[equipmentLevel(item)] || "Ressource";
}

export function equipmentCapabilities(item) {
  if (Array.isArray(item?.capabilities)) return new Set(item.capabilities);
  if (item?.capabilities && typeof item.capabilities === "object") {
    return new Set(Object.entries(item.capabilities).filter(([, enabled]) => Boolean(enabled)).map(([name]) => name));
  }
  return new Set();
}

export function isRoutableEquipment(item) {
  const capabilities = equipmentCapabilities(item);
  return item?.routing_enabled === true
    || item?.routingEnabled === true
    || capabilities.has("routing")
    || capabilities.has("routable");
}

export function isControllableEquipment(item) {
  const capabilities = equipmentCapabilities(item);
  return capabilities.has("control")
    || capabilities.has("controllable")
    || (item?.availableCommands || item?.available_commands || []).length > 0;
}

export function equipmentExecutionModel(item) {
  return item?.execution_model ?? item?.executionModel ?? null;
}

export function equipmentJobInterface(item) {
  return item?.job_interface ?? item?.jobInterface ?? null;
}

export function buildEquipmentTree(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const byResourceId = new Map();
  const byId = new Map();
  const nodes = safeItems.map((item) => {
    const node = { ...item, children: [] };
    if (item?.resource_id != null) byResourceId.set(String(item.resource_id), node);
    if (item?.resourceId != null) byResourceId.set(String(item.resourceId), node);
    if (item?.id != null) byId.set(String(item.id), node);
    return node;
  });
  const roots = [];
  for (const node of nodes) {
    const parentResourceId = node.parent_resource_id ?? node.parentResourceId;
    const parentId = node.parent_id ?? node.parentId;
    const parent = parentResourceId != null
      ? byResourceId.get(String(parentResourceId))
      : parentId != null
        ? byId.get(String(parentId))
        : null;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (entries) => {
    entries.sort(compareEquipment);
    for (const entry of entries) sortNodes(entry.children);
  };
  sortNodes(roots);
  return roots;
}

export function flattenEquipmentTree(tree) {
  const result = [];
  const visit = (nodes, depth) => {
    for (const node of nodes) {
      result.push({ ...node, depth });
      visit(node.children || [], depth + 1);
    }
  };
  visit(tree || [], 0);
  return result;
}

export function filterEquipmentTree(tree, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return tree || [];
  return (tree || []).flatMap((node) => {
    const children = filterEquipmentTree(node.children || [], needle);
    const haystack = `${node.name ?? ""} ${node.displayName ?? ""} ${node.type ?? ""} ${node.model ?? ""} ${node.resource_id ?? node.resourceId ?? ""}`.toLowerCase();
    return haystack.includes(needle) || children.length > 0 ? [{ ...node, children }] : [];
  });
}

export function normalizeExecutionStep(step, defaults = {}) {
  if (!step) return null;
  const state = normalizeExecutionState(step.state ?? step.status);
  const resourceId = step.resource_id ?? step.resourceId ?? defaults.resource_id ?? null;
  return {
    id: step.id ?? null,
    order_id: step.order_id ?? step.orderId ?? defaults.order_id ?? null,
    order_name: step.order_name ?? step.orderName ?? defaults.order_name ?? null,
    carrier_id: step.carrier_id ?? step.carrierId ?? defaults.carrier_id ?? null,
    carrier_number: step.carrier_number ?? step.carrierNumber ?? defaults.carrier_number ?? null,
    resource_id: resourceId == null ? null : Number(resourceId),
    resource_name: step.resource_name ?? step.resourceName ?? defaults.resource_name ?? null,
    parent_resource_id: step.parent_resource_id ?? step.parentResourceId ?? defaults.parent_resource_id ?? null,
    operation_no: step.operation_no ?? step.operationNo ?? defaults.operation_no ?? null,
    operation: step.operation ?? step.operation_name ?? step.operationName ?? defaults.operation ?? "Arbeitsschritt",
    step_no: step.step_no ?? step.stepNo ?? defaults.step_no ?? null,
    state,
    source: step.source ?? defaults.source ?? "mes_routing",
    started_at: step.started_at ?? step.startedAt ?? step.requested_at ?? defaults.started_at ?? null,
    ended_at: step.ended_at ?? step.endedAt ?? step.responded_at ?? defaults.ended_at ?? null,
    elapsed_ms: step.elapsed_ms ?? step.elapsedMs ?? defaults.elapsed_ms ?? null,
    result: step.result ?? step.result_message ?? step.resultMessage ?? step.error_message ?? defaults.result ?? null,
  };
}

export function normalizeExecutionSteps(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : payload?.execution_steps ?? payload?.executionSteps ?? payload?.items ?? [];
  return entries.map((step) => normalizeExecutionStep(step)).filter(Boolean);
}

export function executionStateLabel(state) {
  return EXECUTION_STATES[normalizeExecutionState(state)] || state || "Unbekannt";
}

export function isActiveExecutionStep(step) {
  return Boolean(step) && !TERMINAL_EXECUTION_STATES.has(normalizeExecutionState(step.state));
}

export function activeExecutionForResource(steps, resourceId) {
  const matching = (steps || []).filter((step) => String(step.resource_id) === String(resourceId));
  return matching.find(isActiveExecutionStep) || matching[0] || null;
}

export function executionSourceLabel(source) {
  if (source === "machine" || source === "machine_report") return "Maschinenmeldung";
  if (source === "work_unit_job" || source === "job_control") return "Work-Unit-Job";
  if (source === "mes_routing") return "MES-Routing";
  return source || "Ausführung";
}

function normalizeExecutionState(state) {
  if (!state) return "waiting";
  const normalized = String(state).toLowerCase();
  if (normalized === "in_progress" || normalized === "active") return "running";
  if (normalized === "done" || normalized === "ended" || normalized === "acknowledged" || normalized === "responded") return "completed";
  if (normalized === "error") return "failed";
  if (normalized === "pending") return "waiting";
  return normalized;
}

function compareEquipment(a, b) {
  const sequenceA = Number(a.route_sequence ?? a.routeSequence ?? Number.MAX_SAFE_INTEGER);
  const sequenceB = Number(b.route_sequence ?? b.routeSequence ?? Number.MAX_SAFE_INTEGER);
  if (sequenceA !== sequenceB) return sequenceA - sequenceB;
  const resourceA = Number(a.resource_id ?? a.resourceId ?? Number.MAX_SAFE_INTEGER);
  const resourceB = Number(b.resource_id ?? b.resourceId ?? Number.MAX_SAFE_INTEGER);
  if (resourceA !== resourceB) return resourceA - resourceB;
  return String(a.name ?? a.displayName ?? "").localeCompare(String(b.name ?? b.displayName ?? ""), "de");
}
