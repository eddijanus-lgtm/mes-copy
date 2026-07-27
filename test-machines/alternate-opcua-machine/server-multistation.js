'use strict';

const { DataType, OPCUAServer, StatusCodes, Variant } = require('node-opcua');

const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4841);
const requestedCycleMs = Number(process.env.ALTERNATE_MACHINE_CYCLE_MS || 1200);
const baseCycleMs =
  Number.isFinite(requestedCycleMs) && requestedCycleMs >= 100
    ? requestedCycleMs
    : 1200;
const requestedRejectEvery = Number(
  process.env.ALTERNATE_MACHINE_REJECT_EVERY || 7,
);
const rejectEvery =
  Number.isInteger(requestedRejectEvery) && requestedRejectEvery >= 2
    ? requestedRejectEvery
    : 7;
const mesApiUrl = process.env.MES_API_URL || 'http://127.0.0.1:3000/api/v1';
const mesApiUser = process.env.MES_API_USER || 'admin';
const mesApiPass = process.env.MES_API_PASS || 'admin123!';
const requestedCarrierRefreshMs = Number(
  process.env.ALTERNATE_MACHINE_CARRIER_REFRESH_MS || 500,
);
const carrierRefreshMs =
  Number.isFinite(requestedCarrierRefreshMs) && requestedCarrierRefreshMs >= 200
    ? requestedCarrierRefreshMs
    : 500;

const stationDefinitions = [
  {
    resourceId: 71,
    stationId: 'nx9000-infeed',
    browseName: 'Materialzuführung',
    prefix: 'NX9000.Infeed',
    cycleMs: Math.max(250, Math.round(baseCycleMs * 0.5)),
    initialGoodCount: 42,
    initialRejectCount: 0,
  },
  {
    resourceId: 72,
    stationId: 'nx9000-press-cell',
    browseName: 'Servo-Pressstation',
    prefix: 'NX9000',
    cycleMs: baseCycleMs,
    initialGoodCount: 40,
    initialRejectCount: 3,
    recipe: true,
    pressure: true,
    machineControl: true,
  },
  {
    resourceId: 73,
    stationId: 'nx9000-quality-outfeed',
    browseName: 'Qualitätsprüfung und Ausschleusung',
    prefix: 'NX9000.Quality',
    cycleMs: Math.max(300, Math.round(baseCycleMs * 0.75)),
    initialGoodCount: 40,
    initialRejectCount: 3,
  },
];

function createStationState(definition) {
  return {
    definition,
    running: true,
    paused: false,
    faultActive: false,
    idealCycleTimeMs: definition.cycleMs,
    goodCount: definition.initialGoodCount,
    rejectCount: definition.initialRejectCount,
    cycleNumber: 0,
    pressureBar: 112.5,
    job: {
      carrierNumber: 0,
      resourceNumber: definition.resourceId,
      request: false,
      busy: false,
      accepted: false,
      rejected: false,
      orderNumber: '',
      partNumber: '',
      operationNumber: 0,
      stepNumber: 0,
      nextResourceNumber: 0,
      resultCode: 0,
    },
    recipe: {
      pressForceKn: 75,
      dwellTimeMs: 500,
    },
    process: {
      active: false,
      completedCarrierNumber: 0,
      completed: false,
    },
    control: {
      start: false,
      stop: false,
      reset: false,
      pause: false,
    },
    currentAssignment: null,
    responseHandled: false,
    completionPending: false,
    completionTimer: null,
  };
}

const stationStates = new Map(
  stationDefinitions.map((definition) => [
    definition.resourceId,
    createStationState(definition),
  ]),
);
const requestedAssignments = new Set();
let mesApiToken = null;
let apiPollRunning = false;

const server = new OPCUAServer({
  port,
  resourcePath: '/UA/NovaPress',
  buildInfo: {
    productName: 'NovaPress NX-9000',
    manufacturerName: 'Nova Automation',
    softwareVersion: '3.0.0',
    buildNumber: 'multistation-machine-fixture',
    buildDate: new Date(),
  },
});

function addVariable(
  namespace,
  parent,
  browseName,
  nodeId,
  dataType,
  readValue,
  writeValue,
) {
  const value = {
    get: () => new Variant({ dataType, value: readValue() }),
  };
  if (writeValue) {
    value.set = (variant) => {
      writeValue(variant.value);
      return StatusCodes.Good;
    };
  }
  namespace.addVariable({
    componentOf: parent,
    browseName,
    nodeId: `s=${nodeId}`,
    dataType,
    minimumSamplingInterval: 50,
    value,
  });
}

function addStateVariable(
  namespace,
  parent,
  browseName,
  nodeId,
  dataType,
  source,
  key,
  writable = false,
) {
  addVariable(
    namespace,
    parent,
    browseName,
    nodeId,
    dataType,
    () => source[key],
    writable
      ? (value) => {
          source[key] = value;
        }
      : undefined,
  );
}

function addStationAddressSpace(namespace, parent, state) {
  const { definition } = state;
  const prefix = definition.prefix;
  const station =
    prefix === 'NX9000'
      ? parent
      : namespace.addObject({
          componentOf: parent,
          browseName: definition.browseName,
          nodeId: `s=${prefix}`,
        });
  const status = namespace.addObject({
    componentOf: station,
    browseName: 'MachineryItemState',
    nodeId: `s=${prefix}.Status`,
  });
  const production = namespace.addObject({
    componentOf: station,
    browseName: 'OperationCounters',
    nodeId: `s=${prefix}.Production`,
  });
  const process = namespace.addObject({
    componentOf: station,
    browseName: 'ProcessValues',
    nodeId: `s=${prefix}.Process`,
  });
  const job = namespace.addObject({
    componentOf: station,
    browseName: 'JobOrderInterface',
    nodeId: `s=${prefix}.Job`,
  });

  addStateVariable(
    namespace,
    status,
    'Running',
    `${prefix}.Status.Run`,
    DataType.Boolean,
    state,
    'running',
  );
  if (definition.machineControl) {
    addStateVariable(
      namespace,
      status,
      'FaultActive',
      `${prefix}.Status.Fault`,
      DataType.Boolean,
      state,
      'faultActive',
    );
  }
  addStateVariable(
    namespace,
    production,
    'IdealCycleTime',
    `${prefix}.Production.IdealCycleMs`,
    DataType.UInt32,
    state,
    'idealCycleTimeMs',
  );
  addStateVariable(
    namespace,
    production,
    'AcceptedParts',
    `${prefix}.Production.Accepted`,
    DataType.UInt32,
    state,
    'goodCount',
  );
  addStateVariable(
    namespace,
    production,
    'RejectedParts',
    `${prefix}.Production.Rejected`,
    DataType.UInt32,
    state,
    'rejectCount',
  );
  if (definition.pressure) {
    addStateVariable(
      namespace,
      process,
      'PressureBar',
      `${prefix}.Process.PressureBar`,
      DataType.Double,
      state,
      'pressureBar',
    );
  }
  addStateVariable(
    namespace,
    process,
    'Active',
    `${prefix}.Process.Active`,
    DataType.Boolean,
    state.process,
    'active',
  );
  addStateVariable(
    namespace,
    process,
    'CompletedCarrierNumber',
    `${prefix}.Process.CompletedCarrierNumber`,
    DataType.UInt32,
    state.process,
    'completedCarrierNumber',
  );
  addStateVariable(
    namespace,
    process,
    'Completed',
    `${prefix}.Process.Completed`,
    DataType.Boolean,
    state.process,
    'completed',
  );

  const jobVariables = [
    ['CarrierNumber', DataType.UInt32, 'carrierNumber', false],
    ['ResourceNumber', DataType.UInt16, 'resourceNumber', false],
    ['Request', DataType.Boolean, 'request', false],
    ['Busy', DataType.Boolean, 'busy', true],
    ['Accepted', DataType.Boolean, 'accepted', true],
    ['Rejected', DataType.Boolean, 'rejected', true],
    ['OrderNumber', DataType.String, 'orderNumber', true],
    ['PartNumber', DataType.String, 'partNumber', true],
    ['OperationNumber', DataType.UInt16, 'operationNumber', true],
    ['StepNumber', DataType.Int16, 'stepNumber', true],
    ['NextResourceNumber', DataType.UInt16, 'nextResourceNumber', true],
    ['ResultCode', DataType.UInt16, 'resultCode', true],
  ];
  for (const [browseName, dataType, key, writable] of jobVariables) {
    addStateVariable(
      namespace,
      job,
      browseName,
      `${prefix}.Job.${browseName}`,
      dataType,
      state.job,
      key,
      writable,
    );
  }

  if (definition.recipe) {
    const recipe = namespace.addObject({
      componentOf: station,
      browseName: 'Recipe',
      nodeId: `s=${prefix}.Recipe`,
    });
    addStateVariable(
      namespace,
      recipe,
      'TargetForceKn',
      `${prefix}.Recipe.TargetForceKn`,
      DataType.Double,
      state.recipe,
      'pressForceKn',
      true,
    );
    addStateVariable(
      namespace,
      recipe,
      'DwellTimeMs',
      `${prefix}.Recipe.DwellTimeMs`,
      DataType.UInt32,
      state.recipe,
      'dwellTimeMs',
      true,
    );
  }

  if (definition.machineControl) {
    const control = namespace.addObject({
      componentOf: station,
      browseName: 'MachineControl',
      nodeId: `s=${prefix}.Control`,
    });
    for (const [browseName, key] of [
      ['Start', 'start'],
      ['Stop', 'stop'],
      ['Reset', 'reset'],
      ['Pause', 'pause'],
    ]) {
      addStateVariable(
        namespace,
        control,
        browseName,
        `${prefix}.Control.${browseName}`,
        DataType.Boolean,
        state.control,
        key,
        true,
      );
    }
  }
}

function addAddressSpace(namespace, addressSpace) {
  const machine = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'NovaPress NX-9000',
    nodeId: 's=NX9000',
  });
  const components = namespace.addObject({
    componentOf: machine,
    browseName: 'Components',
    nodeId: 's=NX9000.Components',
  });
  for (const state of stationStates.values()) {
    addStationAddressSpace(
      namespace,
      state.definition.prefix === 'NX9000' ? machine : components,
      state,
    );
  }
}

async function getMesApiToken() {
  if (mesApiToken) return mesApiToken;
  const response = await fetch(`${mesApiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: mesApiUser,
      password: mesApiPass,
    }),
  });
  if (!response.ok) {
    throw new Error(`MES login failed with ${response.status}`);
  }
  const body = await response.json();
  mesApiToken = body.access_token;
  return mesApiToken;
}

async function mesGet(path) {
  const token = await getMesApiToken();
  const response = await fetch(`${mesApiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    mesApiToken = null;
    return mesGet(path);
  }
  if (!response.ok) {
    throw new Error(`MES GET ${path} failed with ${response.status}`);
  }
  return response.json();
}

async function findAssignments() {
  const carriers = await mesGet('/carriers');
  const assignments = [];
  for (const carrier of carriers) {
    if (
      !carrier.order_id ||
      !['assigned', 'in_process'].includes(carrier.status) ||
      carrier.current_step_no == null
    ) {
      continue;
    }
    const signature =
      `${carrier.order_id}:${carrier.carrier_number}:` +
      `${carrier.current_step_no}`;
    if (requestedAssignments.has(signature)) continue;
    const route = await mesGet(`/orders/${carrier.order_id}/route`);
    const step = route.find(
      (entry) => entry.step_no === carrier.current_step_no,
    );
    const state = stationStates.get(step?.resource_id);
    if (
      !state ||
      state.currentAssignment ||
      state.job.request ||
      state.process.active
    ) {
      continue;
    }
    assignments.push({
      signature,
      orderId: carrier.order_id,
      carrierNumber: carrier.carrier_number,
      stepNumber: carrier.current_step_no,
      resourceId: step.resource_id,
    });
  }
  return assignments;
}

function requestAssignment(assignment) {
  const state = stationStates.get(assignment.resourceId);
  if (!state) return;
  requestedAssignments.add(assignment.signature);
  state.currentAssignment = assignment;
  state.responseHandled = false;
  Object.assign(state.job, {
    carrierNumber: assignment.carrierNumber,
    resourceNumber: assignment.resourceId,
    request: true,
    busy: false,
    accepted: false,
    rejected: false,
    orderNumber: '',
    partNumber: '',
    operationNumber: 0,
    stepNumber: 0,
    nextResourceNumber: 0,
    resultCode: 0,
  });
  state.process.completed = false;
  console.log(
    `NovaPress R${assignment.resourceId}: Carrier ` +
      `${assignment.carrierNumber}, MES-Freigabe angefordert`,
  );
}

async function pollMesAssignments() {
  if (apiPollRunning) return;
  apiPollRunning = true;
  try {
    const assignments = await findAssignments();
    for (const assignment of assignments) requestAssignment(assignment);
  } catch (error) {
    console.warn(`NovaPress MES-Abfrage: ${error.message}`);
  } finally {
    apiPollRunning = false;
  }
}

function finishCycle(state) {
  if (!state.currentAssignment) return;
  if (!state.running || state.paused || state.faultActive) {
    state.completionPending = true;
    return;
  }
  state.completionPending = false;
  state.cycleNumber += 1;
  const rejected =
    state.definition.resourceId === 73 && state.cycleNumber % rejectEvery === 0;
  if (rejected) state.rejectCount += 1;
  else state.goodCount += 1;
  if (state.definition.pressure) {
    state.pressureBar = 111.5 + ((state.cycleNumber * 17) % 25) / 10;
  }
  state.process.active = false;
  state.process.completedCarrierNumber = state.currentAssignment.carrierNumber;
  state.process.completed = true;
  console.log(
    `NovaPress R${state.definition.resourceId}: Auftrag ` +
      `${state.job.orderNumber}, Carrier ` +
      `${state.currentAssignment.carrierNumber}, Schritt abgeschlossen`,
  );
  state.job.request = false;
  state.currentAssignment = null;
  setTimeout(() => {
    state.process.completed = false;
  }, 600).unref();
}

function startAcceptedCycle(state) {
  state.job.request = false;
  state.process.active = true;
  state.completionPending = false;
  const recipeDelay = state.definition.recipe
    ? Number(state.recipe.dwellTimeMs || 0)
    : 0;
  console.log(
    `NovaPress R${state.definition.resourceId}: Auftrag ` +
      `${state.job.orderNumber}, Operation ${state.job.operationNumber} gestartet`,
  );
  if (state.completionTimer) clearTimeout(state.completionTimer);
  state.completionTimer = setTimeout(() => {
    state.completionTimer = null;
    finishCycle(state);
  }, state.definition.cycleMs + recipeDelay);
  state.completionTimer.unref();
}

function rejectAssignment(state) {
  console.log(
    `NovaPress R${state.definition.resourceId}: Carrier ` +
      `${state.job.carrierNumber} abgewiesen, Code ${state.job.resultCode}`,
  );
  state.job.request = false;
  state.process.active = false;
  state.currentAssignment = null;
}

function resetStation(state) {
  if (state.completionTimer) clearTimeout(state.completionTimer);
  if (state.currentAssignment) {
    requestedAssignments.delete(state.currentAssignment.signature);
  }
  state.completionTimer = null;
  state.running = true;
  state.paused = false;
  state.faultActive = false;
  state.job.request = false;
  state.job.busy = false;
  state.job.accepted = false;
  state.job.rejected = false;
  state.process.active = false;
  state.process.completed = false;
  state.currentAssignment = null;
  state.responseHandled = false;
  state.completionPending = false;
}

function applyMachineControl(command) {
  for (const state of stationStates.values()) {
    if (command === 'reset') {
      resetStation(state);
    } else if (command === 'stop') {
      state.running = false;
      state.paused = false;
    } else if (command === 'pause') {
      state.running = false;
      state.paused = true;
    } else if (command === 'start') {
      state.running = true;
      state.paused = false;
      state.faultActive = false;
      if (state.completionPending) {
        setTimeout(() => finishCycle(state), 100).unref();
      }
    }
  }
  console.log(`NovaPress Maschinensteuerung: ${command}`);
}

function simulateControlAndJobs() {
  const controlState = stationStates.get(72);
  setInterval(() => {
    for (const [key, command] of [
      ['reset', 'reset'],
      ['stop', 'stop'],
      ['pause', 'pause'],
      ['start', 'start'],
    ]) {
      if (controlState.control[key]) {
        controlState.control[key] = false;
        applyMachineControl(command);
      }
    }
    for (const state of stationStates.values()) {
      if (
        state.job.request &&
        !state.responseHandled &&
        (state.job.accepted || state.job.rejected)
      ) {
        state.responseHandled = true;
        if (state.job.accepted) startAcceptedCycle(state);
        else rejectAssignment(state);
      }
    }
  }, 50).unref();
}

function simulateTelemetry() {
  setInterval(() => {
    const press = stationStates.get(72);
    if (press.running && !press.faultActive) {
      press.pressureBar = 111.5 + ((Date.now() / 100) % 25) / 10;
    }
  }, 250).unref();
}

async function start() {
  await server.initialize();
  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.registerNamespace(
    'urn:nova-automation:machines:nx9000:v2',
  );
  addAddressSpace(namespace, addressSpace);
  await server.start();

  console.log('NovaPress NX-9000 multi-station OPC UA machine:');
  console.log(`- endpoint: opc.tcp://127.0.0.1:${port}/UA/NovaPress`);
  for (const definition of stationDefinitions) {
    console.log(
      `- R${definition.resourceId}: ${definition.browseName}, ` +
        `${definition.cycleMs} ms`,
    );
  }
  console.log(`- MES polling: ${mesApiUrl}, every ${carrierRefreshMs} ms`);

  simulateControlAndJobs();
  simulateTelemetry();
  setInterval(() => void pollMesAssignments(), carrierRefreshMs).unref();
  void pollMesAssignments();
}

async function shutdown(signal) {
  console.log(`NovaPress received ${signal}, shutting down`);
  for (const state of stationStates.values()) {
    if (state.completionTimer) clearTimeout(state.completionTimer);
  }
  await server.shutdown(0);
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error) => {
  console.error('NovaPress OPC UA server failed:', error);
  process.exitCode = 1;
});
