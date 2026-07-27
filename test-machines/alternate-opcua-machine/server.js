'use strict';

const {
  DataType,
  OPCUAServer,
  StatusCodes,
  Variant,
} = require('node-opcua');

const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4841);
const resourceId = 71;
const requestedCycleMs = Number(process.env.ALTERNATE_MACHINE_CYCLE_MS || 1200);
const cycleMs =
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
const autonomousTelemetry =
  process.env.ALTERNATE_MACHINE_AUTONOMOUS_TELEMETRY === 'true';
const mesApiUrl =
  process.env.MES_API_URL || 'http://127.0.0.1:3000/api/v1';
const mesApiUser = process.env.MES_API_USER || 'admin';
const mesApiPass = process.env.MES_API_PASS || 'admin123!';
const requestedCarrierRefreshMs = Number(
  process.env.ALTERNATE_MACHINE_CARRIER_REFRESH_MS || 750,
);
const carrierRefreshMs =
  Number.isFinite(requestedCarrierRefreshMs) &&
  requestedCarrierRefreshMs >= 250
    ? requestedCarrierRefreshMs
    : 750;

const state = {
  running: true,
  paused: false,
  faultActive: false,
  idealCycleTimeMs: cycleMs,
  goodCount: 40,
  rejectCount: 3,
  pressureBar: 112.5,
  cycleNumber: 0,
  job: {
    carrierNumber: 0,
    resourceNumber: resourceId,
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

let mesApiToken = null;
let apiPollRunning = false;
const requestedAssignments = new Set();

const server = new OPCUAServer({
  port,
  resourcePath: '/UA/NovaPress',
  buildInfo: {
    productName: 'NovaPress NX-9000',
    manufacturerName: 'Nova Automation',
    softwareVersion: '2.4.0',
    buildNumber: 'alternate-machine-fixture',
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
    nodeId,
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

function addAddressSpace(namespace, addressSpace) {
  const machine = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'NX-9000 Servo Press',
    nodeId: 's=NX9000',
  });
  const status = namespace.addObject({
    componentOf: machine,
    browseName: 'MachineStatus',
    nodeId: 's=NX9000.Status',
  });
  const production = namespace.addObject({
    componentOf: machine,
    browseName: 'ProductionStatistics',
    nodeId: 's=NX9000.Production',
  });
  const process = namespace.addObject({
    componentOf: machine,
    browseName: 'ProcessValues',
    nodeId: 's=NX9000.Process',
  });
  const job = namespace.addObject({
    componentOf: machine,
    browseName: 'MesJobInterface',
    nodeId: 's=NX9000.Job',
  });
  const recipe = namespace.addObject({
    componentOf: machine,
    browseName: 'Recipe',
    nodeId: 's=NX9000.Recipe',
  });
  const control = namespace.addObject({
    componentOf: machine,
    browseName: 'MachineControl',
    nodeId: 's=NX9000.Control',
  });

  addStateVariable(
    namespace,
    status,
    'Running',
    's=NX9000.Status.Run',
    DataType.Boolean,
    state,
    'running',
  );
  addStateVariable(
    namespace,
    status,
    'FaultActive',
    's=NX9000.Status.Fault',
    DataType.Boolean,
    state,
    'faultActive',
  );
  addStateVariable(
    namespace,
    production,
    'IdealCycleTime',
    's=NX9000.Production.IdealCycleMs',
    DataType.UInt32,
    state,
    'idealCycleTimeMs',
  );
  addStateVariable(
    namespace,
    production,
    'AcceptedParts',
    's=NX9000.Production.Accepted',
    DataType.UInt32,
    state,
    'goodCount',
  );
  addStateVariable(
    namespace,
    production,
    'RejectedParts',
    's=NX9000.Production.Rejected',
    DataType.UInt32,
    state,
    'rejectCount',
  );
  addStateVariable(
    namespace,
    process,
    'HydraulicPressure',
    's=NX9000.Process.PressureBar',
    DataType.Double,
    state,
    'pressureBar',
  );
  addStateVariable(
    namespace,
    process,
    'Active',
    's=NX9000.Process.Active',
    DataType.Boolean,
    state.process,
    'active',
  );
  addStateVariable(
    namespace,
    process,
    'CompletedCarrierNumber',
    's=NX9000.Process.CompletedCarrierNumber',
    DataType.UInt32,
    state.process,
    'completedCarrierNumber',
  );
  addStateVariable(
    namespace,
    process,
    'Completed',
    's=NX9000.Process.Completed',
    DataType.Boolean,
    state.process,
    'completed',
  );

  const jobVariables = [
    ['CarrierNumber', 's=NX9000.Job.CarrierNumber', DataType.UInt32, 'carrierNumber', false],
    ['ResourceNumber', 's=NX9000.Job.ResourceNumber', DataType.UInt16, 'resourceNumber', false],
    ['Request', 's=NX9000.Job.Request', DataType.Boolean, 'request', false],
    ['Busy', 's=NX9000.Job.Busy', DataType.Boolean, 'busy', true],
    ['Accepted', 's=NX9000.Job.Accepted', DataType.Boolean, 'accepted', true],
    ['Rejected', 's=NX9000.Job.Rejected', DataType.Boolean, 'rejected', true],
    ['OrderNumber', 's=NX9000.Job.OrderNumber', DataType.String, 'orderNumber', true],
    ['PartNumber', 's=NX9000.Job.PartNumber', DataType.String, 'partNumber', true],
    ['OperationNumber', 's=NX9000.Job.OperationNumber', DataType.UInt16, 'operationNumber', true],
    ['StepNumber', 's=NX9000.Job.StepNumber', DataType.Int16, 'stepNumber', true],
    ['NextResourceNumber', 's=NX9000.Job.NextResourceNumber', DataType.UInt16, 'nextResourceNumber', true],
    ['ResultCode', 's=NX9000.Job.ResultCode', DataType.UInt16, 'resultCode', true],
  ];
  for (const [browseName, nodeId, dataType, key, writable] of jobVariables) {
    addStateVariable(
      namespace,
      job,
      browseName,
      nodeId,
      dataType,
      state.job,
      key,
      writable,
    );
  }

  addStateVariable(
    namespace,
    recipe,
    'TargetForceKn',
    's=NX9000.Recipe.TargetForceKn',
    DataType.Double,
    state.recipe,
    'pressForceKn',
    true,
  );
  addStateVariable(
    namespace,
    recipe,
    'DwellTimeMs',
    's=NX9000.Recipe.DwellTimeMs',
    DataType.UInt32,
    state.recipe,
    'dwellTimeMs',
    true,
  );

  for (const [browseName, nodeId, key] of [
    ['Start', 's=NX9000.Control.Start', 'start'],
    ['Stop', 's=NX9000.Control.Stop', 'stop'],
    ['Reset', 's=NX9000.Control.Reset', 'reset'],
    ['Pause', 's=NX9000.Control.Pause', 'pause'],
  ]) {
    addStateVariable(
      namespace,
      control,
      browseName,
      nodeId,
      DataType.Boolean,
      state.control,
      key,
      true,
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

async function findNextAssignment() {
  const carriers = await mesGet('/carriers');
  const candidates = carriers.filter(
    (carrier) =>
      carrier.order_id &&
      (carrier.status === 'assigned' || carrier.status === 'in_process') &&
      carrier.current_step_no != null,
  );
  for (const carrier of candidates) {
    const signature = `${carrier.order_id}:${carrier.carrier_number}:${carrier.current_step_no}`;
    if (requestedAssignments.has(signature)) continue;
    const route = await mesGet(`/orders/${carrier.order_id}/route`);
    const step = route.find(
      (entry) => entry.step_no === carrier.current_step_no,
    );
    if (step?.resource_id === resourceId) {
      return {
        signature,
        orderId: carrier.order_id,
        carrierNumber: carrier.carrier_number,
        stepNumber: carrier.current_step_no,
      };
    }
  }
  return null;
}

function requestAssignment(assignment) {
  requestedAssignments.add(assignment.signature);
  state.currentAssignment = assignment;
  state.responseHandled = false;
  state.job.carrierNumber = assignment.carrierNumber;
  state.job.resourceNumber = resourceId;
  state.job.request = true;
  state.job.busy = false;
  state.job.accepted = false;
  state.job.rejected = false;
  state.job.orderNumber = '';
  state.job.partNumber = '';
  state.job.operationNumber = 0;
  state.job.stepNumber = 0;
  state.job.nextResourceNumber = 0;
  state.job.resultCode = 0;
  state.process.completed = false;
  console.log(
    `NovaPress: Carrier ${assignment.carrierNumber} erkannt, MES-Freigabe angefordert`,
  );
}

async function pollMesAssignments() {
  if (
    apiPollRunning ||
    state.currentAssignment ||
    state.job.request ||
    state.process.active
  ) {
    return;
  }
  apiPollRunning = true;
  try {
    const assignment = await findNextAssignment();
    if (assignment) requestAssignment(assignment);
  } catch (error) {
    console.warn(`NovaPress MES-Abfrage: ${error.message}`);
  } finally {
    apiPollRunning = false;
  }
}

function finishCycle() {
  if (!state.currentAssignment) return;
  if (!state.running || state.paused || state.faultActive) {
    state.completionPending = true;
    return;
  }
  state.completionPending = false;
  state.cycleNumber += 1;
  const rejected = state.cycleNumber % rejectEvery === 0;
  if (rejected) state.rejectCount += 1;
  else state.goodCount += 1;
  state.pressureBar = 111.5 + ((state.cycleNumber * 17) % 25) / 10;
  state.process.active = false;
  state.process.completedCarrierNumber =
    state.currentAssignment.carrierNumber;
  state.process.completed = true;
  const result = rejected ? 'NOK' : 'OK';
  console.log(
    `NovaPress: Auftrag ${state.job.orderNumber}, Carrier ${state.currentAssignment.carrierNumber}, ` +
      `Kraft ${state.recipe.pressForceKn} kN, Haltezeit ${state.recipe.dwellTimeMs} ms, Ergebnis ${result}`,
  );
  state.job.request = false;
  state.currentAssignment = null;
  setTimeout(() => {
    state.process.completed = false;
  }, 750).unref();
}

function startAcceptedCycle() {
  state.job.request = false;
  state.process.active = true;
  state.completionPending = false;
  console.log(
    `NovaPress: MES-Freigabe ${state.job.resultCode}, Auftrag ${state.job.orderNumber}, Zyklus gestartet`,
  );
  if (state.completionTimer) clearTimeout(state.completionTimer);
  state.completionTimer = setTimeout(() => {
    state.completionTimer = null;
    finishCycle();
  }, cycleMs + Number(state.recipe.dwellTimeMs || 0));
  state.completionTimer.unref();
}

function rejectAssignment() {
  console.log(
    `NovaPress: Carrier ${state.job.carrierNumber} abgewiesen, Resultcode ${state.job.resultCode}`,
  );
  state.job.request = false;
  state.process.active = false;
  state.currentAssignment = null;
}

function resetMachine() {
  if (state.completionTimer) {
    clearTimeout(state.completionTimer);
    state.completionTimer = null;
  }
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
  console.log('NovaPress: Reset ausgeführt');
}

function simulateMachineControl() {
  setInterval(() => {
    if (state.control.reset) {
      state.control.reset = false;
      resetMachine();
    }
    if (state.control.stop) {
      state.control.stop = false;
      state.running = false;
      state.paused = false;
      console.log('NovaPress: Stop-Befehl ausgeführt');
    }
    if (state.control.pause) {
      state.control.pause = false;
      state.paused = true;
      state.running = false;
      console.log('NovaPress: Pause-Befehl ausgeführt');
    }
    if (state.control.start) {
      state.control.start = false;
      state.running = true;
      state.paused = false;
      state.faultActive = false;
      console.log('NovaPress: Start-Befehl ausgeführt');
      if (state.completionPending) {
        setTimeout(finishCycle, 100).unref();
      }
    }
    if (
      state.job.request &&
      !state.responseHandled &&
      (state.job.accepted || state.job.rejected)
    ) {
      state.responseHandled = true;
      if (state.job.accepted) startAcceptedCycle();
      else rejectAssignment();
    }
  }, 50).unref();
}

function simulateTelemetry() {
  setInterval(() => {
    if (!state.running || state.faultActive) return;
    state.pressureBar =
      111.5 + ((Date.now() / 100) % 25) / 10;
    if (!autonomousTelemetry || state.process.active) return;
    state.cycleNumber += 1;
    if (state.cycleNumber % rejectEvery === 0) state.rejectCount += 1;
    else state.goodCount += 1;
  }, cycleMs).unref();
}

async function start() {
  await server.initialize();
  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.registerNamespace(
    'urn:nova-automation:machines:nx9000:v2',
  );
  addAddressSpace(namespace, addressSpace);

  await server.start();
  console.log('NovaPress NX-9000 OPC UA machine:');
  console.log(`- endpoint: opc.tcp://127.0.0.1:${port}/UA/NovaPress`);
  console.log(`- namespace: ${namespace.namespaceUri}`);
  console.log(`- cycle: ${cycleMs} ms`);
  console.log(`- deterministic reject: every ${rejectEvery} cycles`);
  console.log(`- MES job polling: ${mesApiUrl}, every ${carrierRefreshMs} ms`);
  console.log(
    `- autonomous telemetry: ${autonomousTelemetry ? 'enabled' : 'disabled'}`,
  );

  simulateMachineControl();
  simulateTelemetry();
  setInterval(() => void pollMesAssignments(), carrierRefreshMs).unref();
  void pollMesAssignments();
}

async function shutdown(signal) {
  console.log(`NovaPress received ${signal}, shutting down`);
  if (state.completionTimer) clearTimeout(state.completionTimer);
  await server.shutdown(0);
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error) => {
  console.error('NovaPress OPC UA server failed:', error);
  process.exitCode = 1;
});
