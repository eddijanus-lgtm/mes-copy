const { DataType, OPCUAServer, StatusCodes, Variant } = require('node-opcua');

const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4840);
const resourcePath = '/UA/WaraMesTest';
const requestedInventoryCapacity = Number(process.env.DEMO_INVENTORY_CAPACITY || 4);
const inventoryCapacity =
  Number.isInteger(requestedInventoryCapacity) && requestedInventoryCapacity > 0
    ? requestedInventoryCapacity
    : 4;
const inventoryValid = process.env.DEMO_INVENTORY_VALID !== 'false';
const inventoryReaderId = process.env.DEMO_INVENTORY_READER_ID || 'DEMO-PALLET-STORE-RFID';
const configuredInventoryCarrierIds = (process.env.DEMO_INVENTORY_CARRIER_IDS || '128,129,130,131')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0)
  .slice(0, inventoryCapacity);
const invalidInventorySlots = new Set(
  (process.env.DEMO_INVENTORY_INVALID_SLOTS || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0),
);

// Simulated OPC UA machine based on the OpenCart webshop specification.
// The node contract is a test-machine stMES/DB151 contract, while the MES connects
// through the same production OpcUaMachineAdapter used for a physical PLC.
// now reflects the configured webshop product: lid color plus red/green/blue balls.
function simulatedRate(envName) {
  const value = Number(process.env[envName] || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}

const stationConfigs = [
  {
    resourceId: 1,
    name: 'S01 Deckelzufuehrung',
    stationType: 'lid_feeder',
    operationNo: 10,
    operation: 'Deckelfarbe bereitstellen',
    cycleTimeMs: 5000,
    scrapRate: simulatedRate('SIMULATOR_SCRAP_RATE_S01'),
  },
  {
    resourceId: 2,
    name: 'S02 Kugeldosierung',
    stationType: 'ball_dispenser',
    operationNo: 20,
    operation: 'Kugeln dosieren',
    cycleTimeMs: 6000,
    scrapRate: simulatedRate('SIMULATOR_SCRAP_RATE_S02'),
  },
  {
    resourceId: 3,
    name: 'Q01 Endkontrolle',
    stationType: 'quality_gate',
    operationNo: 30,
    operation: 'Deckel und Kugeln pruefen',
    cycleTimeMs: 4000,
    scrapRate: simulatedRate('SIMULATOR_SCRAP_RATE_Q01'),
  },
];
const stations = stationConfigs.map(createStationState);

const mesApiUrl = process.env.MES_API_URL || 'http://localhost:3000/api/v1';
const mesApiUser = process.env.MES_API_USER || 'admin';
const mesApiPass = process.env.MES_API_PASS || 'admin123!';
const transferMs = 2000;
const releaseEveryMs = 30000;
const requestedCarrierRefreshMs = Number(
  process.env.DEMO_CARRIER_REFRESH_MS || 15000,
);
const carrierRefreshMs =
  Number.isFinite(requestedCarrierRefreshMs) && requestedCarrierRefreshMs >= 250
    ? requestedCarrierRefreshMs
    : 15000;
let mesApiToken = null;
let lastCarrierPlanSignature = null;
let lastCarrierApiStateSignature = null;

const carrierInventory = {
  valid: inventoryValid,
  revision: 1,
  capacity: inventoryCapacity,
  slots: Array.from({ length: inventoryCapacity }, (_, index) => {
    const slotNumber = index + 1;
    const carrierId = configuredInventoryCarrierIds[index] || 0;
    const occupied = carrierId > 0;
    const rfidReadValid = occupied && !invalidInventorySlots.has(slotNumber);
    return {
      slotNumber,
      slotId: `PALLET-${String(slotNumber).padStart(2, '0')}`,
      occupied,
      carrierId,
      rfidUid: occupied ? `DEMO-RFID-${String(carrierId).padStart(8, '0')}` : '',
      rfidReadValid,
      physicalState: occupied ? (rfidReadValid ? 'stored' : 'rfid_error') : 'empty',
      readerId: occupied ? inventoryReaderId : '',
      lastSeen: occupied ? new Date() : new Date('1970-01-01T00:00:00.000Z'),
    };
  }),
};

function inventoryTotalCount() {
  return carrierInventory.slots.filter((slot) => slot.occupied).length;
}

function inventoryAvailableCount() {
  return carrierInventory.slots.filter(
    (slot) => slot.occupied && slot.rfidReadValid && slot.physicalState === 'stored',
  ).length;
}

function touchInventory(reason) {
  carrierInventory.revision += 1;
  console.log(
    `Carrier-Inventar rev=${carrierInventory.revision}: ${reason}; ` +
    `verfuegbar=${inventoryAvailableCount()}/${inventoryTotalCount()}`,
  );
}

function observeCarrier(carrierId, physicalState, overrides = {}) {
  const slot = carrierInventory.slots.find((entry) => entry.carrierId === carrierId);
  if (!slot) return false;
  Object.assign(slot, {
    occupied: physicalState === 'stored' || physicalState === 'rfid_error',
    physicalState,
    readerId: overrides.readerId ?? (physicalState === 'stored' ? inventoryReaderId : 'DEMO-LINE-RFID'),
    lastSeen: new Date(),
    ...overrides,
  });
  touchInventory(`Carrier ${carrierId} -> ${physicalState}`);
  return true;
}

function registerCarrierInInventory(carrierId) {
  const existing = carrierInventory.slots.find((slot) => slot.carrierId === carrierId);
  if (existing) return existing;
  const emptySlot = carrierInventory.slots.find((slot) => slot.carrierId === 0);
  if (!emptySlot) return null;
  Object.assign(emptySlot, {
    occupied: true,
    carrierId,
    rfidUid: `DEMO-RFID-${String(carrierId).padStart(8, '0')}`,
    rfidReadValid: true,
    physicalState: 'stored',
    readerId: inventoryReaderId,
    lastSeen: new Date(),
  });
  touchInventory(`Carrier ${carrierId} an ${emptySlot.slotId} erkannt`);
  return emptySlot;
}

async function getMesApiToken() {
  if (mesApiToken) return mesApiToken;
  const loginRes = await fetch(`${mesApiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: mesApiUser, password: mesApiPass }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const { access_token } = await loginRes.json();
  mesApiToken = access_token;
  return mesApiToken;
}

async function fetchCarriersFromMes() {
  try {
    const access_token = await getMesApiToken();
    const carriersRes = await fetch(`${mesApiUrl}/carriers`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (carriersRes.status === 401) {
      mesApiToken = null;
      return fetchCarriersFromMes();
    }
    if (!carriersRes.ok) throw new Error(`Fetch carriers failed: ${carriersRes.status}`);
    const carriers = await carriersRes.json();
    const apiStateSignature = carriers
      .map(
        (carrier) =>
          `${carrier.carrier_number}:${carrier.status}:${carrier.order_id || '-'}:${carrier.current_step_no ?? '-'}`,
      )
      .sort()
      .join(',');
    if (apiStateSignature !== lastCarrierApiStateSignature) {
      lastCarrierApiStateSignature = apiStateSignature;
      console.log(`MES-Carrierstatus: ${apiStateSignature || 'keine Carrier'}`);
    }
    const activeCarriers = carriers.filter((c) => c.order_id && (c.status === 'assigned' || c.status === 'in_process'));
    const routesByOrder = new Map();
    for (const carrier of activeCarriers) {
      if (routesByOrder.has(carrier.order_id)) continue;
      const routeRes = await fetch(`${mesApiUrl}/orders/${carrier.order_id}/route`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!routeRes.ok) throw new Error(`Fetch route failed: ${routeRes.status}`);
      routesByOrder.set(carrier.order_id, await routeRes.json());
    }
    return activeCarriers
      .map((c, i) => ({
        carrierId: c.carrier_number,
        partNo: 'WEBSHOP-PRODUCT-DEMO',
        targetResourceId: currentTargetResourceId(c, routesByOrder.get(c.order_id) || []),
        routeResourceId: currentTargetResourceId(c, routesByOrder.get(c.order_id) || []),
        releaseDelay: (i + 1) * 2000,
      }));
  } catch (err) {
    const configuredIds = process.env.DEMO_CARRIER_IDS;
    if (!configuredIds) {
      console.warn(`MES API nicht erreichbar (${err.message}), keine Carrier-Freigabe ohne DEMO_CARRIER_IDS`);
      return [];
    }
    console.warn(`MES API nicht erreichbar (${err.message}), fallback auf DEMO_CARRIER_IDS`);
    const ids = configuredIds.split(',').map(Number);
    return ids.map((id, i) => ({
      carrierId: id,
      partNo: 'WEBSHOP-PRODUCT-DEMO',
      targetResourceId: 1,
      routeResourceId: 1,
      releaseDelay: (i + 1) * 2000,
    }));
  }
}

function currentTargetResourceId(carrier, route) {
  if (carrier.current_resource_id) return carrier.current_resource_id;
  const step = route.find((entry) => entry.step_no === carrier.current_step_no);
  return step?.resource_id || 1;
}

const server = new OPCUAServer({
  port,
  resourcePath,
  buildInfo: {
    productName: 'WARA MES demo production line',
    buildNumber: '3',
    buildDate: new Date(),
  },
});

function createStationState(config) {
  return {
    ...config,
    state: { xAuto: true, xManual: false, xBusy: false, xReset: false, xErrL0: false, xErrL1: false, xErrL2: false },
    control: { xCmdStart: false, xCmdStop: false, xCmdPause: false, xCmdReset: false },
    query: {
      xStart: false, xQryBusy: false, xDone: false, xError: false,
      uiCarrierId: 0, uiResourceId: config.resourceId,
      sOrderNo: '', sPartNo: '', uiOperationNo: 0, iStepNo: 0, uiNextResourceId: 0,
      iPar1: 0, iPar2: 0, iPar3: 0, iPar4: 0, uiResultCode: 0,
    },
    processData: {
      iCarrierID: 0, iStepNo: 0, iResourceID: config.resourceId,
      iPar1: 0, iPar2: 0, iPar3: 0, iPar4: 0,
      xCompleted: false,
      ldtTimeStamp: new Date('1970-01-01T00:00:00.000Z'),
    },
    currentCarrier: null,
    waitingQueue: [],
    pendingCompletion: false,
    producedCount: 0,
    failedCount: 0,
    responseSeen: false,
    xStartBlockedUntil: 0,
    requestTimeout: null,
    rejectCounts: {},
  };
}

function addVariable(namespace, parent, browseName, nodeId, dataType, readValue, writeValue) {
  const value = { get: () => new Variant({ dataType, value: readValue() }) };
  if (writeValue) {
    value.set = (variant) => {
      writeValue(variant.value);
      return StatusCodes.Good;
    };
  }
  namespace.addVariable({ componentOf: parent, browseName, nodeId, dataType, minimumSamplingInterval: 100, value });
}

function addBooleanGroup(namespace, parent, nodePrefix, state, writableNames = []) {
  for (const name of Object.keys(state)) {
    addVariable(
      namespace, parent, name, `${nodePrefix}.${name}`, DataType.Boolean,
      () => state[name], writableNames.includes(name) ? (value) => { state[name] = Boolean(value); } : undefined,
    );
  }
}

function addStation(namespace, station) {
  const stationObject = namespace.addObject({
    organizedBy: server.engine.addressSpace.rootFolder.objects,
    browseName: `Station${station.resourceId} ${station.name}`,
    nodeId: `ns=1;s=Station${station.resourceId}`,
  });
  const lineObject = namespace.addObject({ componentOf: stationObject, browseName: 'LineInfo', nodeId: `ns=1;s=Station${station.resourceId}.LineInfo` });
  addVariable(namespace, lineObject, 'sStationName', `ns=1;s=Station${station.resourceId}.LineInfo.sStationName`, DataType.String, () => station.name);
  addVariable(namespace, lineObject, 'sStationType', `ns=1;s=Station${station.resourceId}.LineInfo.sStationType`, DataType.String, () => station.stationType);
  addVariable(namespace, lineObject, 'sOperation', `ns=1;s=Station${station.resourceId}.LineInfo.sOperation`, DataType.String, () => station.operation);
  addVariable(namespace, lineObject, 'uiCycleTimeMs', `ns=1;s=Station${station.resourceId}.LineInfo.uiCycleTimeMs`, DataType.UInt32, () => station.cycleTimeMs);
  addVariable(namespace, lineObject, 'uiProducedCount', `ns=1;s=Station${station.resourceId}.LineInfo.uiProducedCount`, DataType.UInt32, () => station.producedCount);
  addVariable(namespace, lineObject, 'uiFailedCount', `ns=1;s=Station${station.resourceId}.LineInfo.uiFailedCount`, DataType.UInt32, () => station.failedCount);

  const stMes = namespace.addObject({ componentOf: stationObject, browseName: 'stMES [DEMO]', nodeId: `ns=1;s=Station${station.resourceId}.stMES` });
  const stateObject = namespace.addObject({ componentOf: stMes, browseName: 'State', nodeId: `ns=1;s=Station${station.resourceId}.stMES.State` });
  const controlObject = namespace.addObject({ componentOf: stMes, browseName: 'Control', nodeId: `ns=1;s=Station${station.resourceId}.stMES.Control` });
  const queryObject = namespace.addObject({ componentOf: stMes, browseName: 'Query', nodeId: `ns=1;s=Station${station.resourceId}.stMES.Query` });
  const queryPrefix = `ns=1;s=Station${station.resourceId}.stMES.Query`;

  addBooleanGroup(namespace, stateObject, `ns=1;s=Station${station.resourceId}.stMES.State`, station.state);
  addBooleanGroup(namespace, controlObject, `ns=1;s=Station${station.resourceId}.stMES.Control`, station.control, ['xCmdStart', 'xCmdStop', 'xCmdPause', 'xCmdReset']);
  for (const name of ['xStart', 'xQryBusy', 'xDone', 'xError']) {
    addVariable(
      namespace, queryObject, name, `${queryPrefix}.${name}`, DataType.Boolean,
      () => station.query[name], name === 'xStart' ? undefined : (value) => { station.query[name] = Boolean(value); },
    );
  }

  addVariable(namespace, queryObject, 'uiCarrierId', `${queryPrefix}.uiCarrierId`, DataType.UInt32, () => station.query.uiCarrierId);
  addVariable(namespace, queryObject, 'uiResourceId', `${queryPrefix}.uiResourceId`, DataType.UInt16, () => station.query.uiResourceId);
  for (const [name, dataType] of Object.entries({
    sOrderNo: DataType.String, sPartNo: DataType.String, uiOperationNo: DataType.UInt16,
    iStepNo: DataType.Int16, uiNextResourceId: DataType.UInt16,
    iPar1: DataType.Int16, iPar2: DataType.Int16, iPar3: DataType.Int16, iPar4: DataType.Int16,
    uiResultCode: DataType.UInt16,
  })) {
    addVariable(namespace, queryObject, name, `${queryPrefix}.${name}`, dataType, () => station.query[name], (value) => { station.query[name] = value; });
  }

  const processData = namespace.addObject({
    componentOf: stationObject,
    browseName: 'dbProcessData [DB151]',
    nodeId: `ns=1;s=Station${station.resourceId}.dbProcessData`,
  });
  const processPrefix = `ns=1;s=Station${station.resourceId}.dbProcessData`;
  for (const name of ['iCarrierID', 'iStepNo', 'iResourceID', 'iPar1', 'iPar2', 'iPar3', 'iPar4']) {
    addVariable(namespace, processData, name, `${processPrefix}.${name}`, DataType.Int16, () => station.processData[name], (value) => { station.processData[name] = Number(value); });
  }
  addVariable(
    namespace,
    processData,
    'xCompleted',
    `${processPrefix}.xCompleted`,
    DataType.Boolean,
    () => station.processData.xCompleted,
  );
  addVariable(namespace, processData, 'ldtTimeStamp', `${processPrefix}.ldtTimeStamp`, DataType.DateTime, () => station.processData.ldtTimeStamp, (value) => { station.processData.ldtTimeStamp = new Date(value); });
}

function addCarrierInventory(namespace) {
  const inventoryObject = namespace.addObject({
    organizedBy: server.engine.addressSpace.rootFolder.objects,
    browseName: 'CarrierInventory [DEMO]',
    nodeId: 'ns=1;s=CarrierInventory',
  });
  const summaryObject = namespace.addObject({
    componentOf: inventoryObject,
    browseName: 'Summary',
    nodeId: 'ns=1;s=CarrierInventory.Summary',
  });
  addVariable(namespace, summaryObject, 'xValid', 'ns=1;s=CarrierInventory.Summary.xValid', DataType.Boolean, () => carrierInventory.valid);
  addVariable(namespace, summaryObject, 'udRevision', 'ns=1;s=CarrierInventory.Summary.udRevision', DataType.UInt32, () => carrierInventory.revision);
  addVariable(namespace, summaryObject, 'uiCapacity', 'ns=1;s=CarrierInventory.Summary.uiCapacity', DataType.UInt16, () => carrierInventory.capacity);
  addVariable(namespace, summaryObject, 'uiAvailableCount', 'ns=1;s=CarrierInventory.Summary.uiAvailableCount', DataType.UInt16, inventoryAvailableCount);
  addVariable(namespace, summaryObject, 'uiTotalCount', 'ns=1;s=CarrierInventory.Summary.uiTotalCount', DataType.UInt16, inventoryTotalCount);

  const slotsObject = namespace.addObject({
    componentOf: inventoryObject,
    browseName: 'Slots',
    nodeId: 'ns=1;s=CarrierInventory.Slots',
  });
  for (const slot of carrierInventory.slots) {
    const slotPrefix = `ns=1;s=CarrierInventory.Slots.${slot.slotNumber}`;
    const slotObject = namespace.addObject({
      componentOf: slotsObject,
      browseName: `Slot${slot.slotNumber}`,
      nodeId: slotPrefix,
    });
    addVariable(namespace, slotObject, 'xOccupied', `${slotPrefix}.xOccupied`, DataType.Boolean, () => slot.occupied);
    addVariable(namespace, slotObject, 'sSlotId', `${slotPrefix}.sSlotId`, DataType.String, () => slot.slotId);
    addVariable(namespace, slotObject, 'uiCarrierId', `${slotPrefix}.uiCarrierId`, DataType.UInt32, () => slot.carrierId);
    addVariable(namespace, slotObject, 'sRfidUid', `${slotPrefix}.sRfidUid`, DataType.String, () => slot.rfidUid);
    addVariable(namespace, slotObject, 'xRfidReadValid', `${slotPrefix}.xRfidReadValid`, DataType.Boolean, () => slot.rfidReadValid);
    addVariable(namespace, slotObject, 'sPhysicalState', `${slotPrefix}.sPhysicalState`, DataType.String, () => slot.physicalState);
    addVariable(namespace, slotObject, 'sReaderId', `${slotPrefix}.sReaderId`, DataType.String, () => slot.readerId);
    addVariable(namespace, slotObject, 'ldtLastSeen', `${slotPrefix}.ldtLastSeen`, DataType.DateTime, () => slot.lastSeen);
  }
}

function processNextInQueue(station) {
  if (station.waitingQueue.length === 0) return;
  if (station.query.xStart || station.state.xBusy) return;
  const now = Date.now();
  if (station.xStartBlockedUntil > now) {
    setTimeout(() => processNextInQueue(station), Math.min(100, station.xStartBlockedUntil - now)).unref();
    return;
  }
  const next = station.waitingQueue.shift();
  console.log(`${station.name}: naechster Carrier ${next.carrierId} aus der Queue (${station.waitingQueue.length} verbleibend)`);
  requestMesData(station, next);
}

function requestMesData(station, carrier) {
  if (station.query.xStart || station.state.xBusy) {
    station.waitingQueue.push(carrier);
    console.log(`${station.name}: carrier ${carrier.carrierId} in die Queue (Position ${station.waitingQueue.length})`);
    return;
  }
  const now = Date.now();
  if (station.xStartBlockedUntil > now) {
    station.waitingQueue.push(carrier);
    console.log(`${station.name}: carrier ${carrier.carrierId} in die Queue (xStart blockiert, Position ${station.waitingQueue.length})`);
    setTimeout(() => processNextInQueue(station), Math.min(100, station.xStartBlockedUntil - now)).unref();
    return;
  }
  station.responseSeen = false;
  observeCarrier(carrier.carrierId, 'at_station', {
    occupied: false,
    readerId: `DEMO-STATION-${station.resourceId}-RFID`,
  });
  station.currentCarrier = carrier;
  station.query.uiCarrierId = carrier.carrierId;
  // RFID itself is not simulated. routeResourceId represents the routing
  // value carried by the pallet and read when it reaches a station.
  station.query.uiResourceId = carrier.routeResourceId;
  station.query.sOrderNo = '';
  station.query.sPartNo = '';
  station.query.uiOperationNo = 0;
  station.query.iStepNo = 0;
  station.query.uiNextResourceId = 0;
  station.query.uiResultCode = 0;
  station.query.xDone = false;
  station.query.xError = false;
  station.processData.xCompleted = false;
  station.query.xStart = true;
  station.state.xBusy = true;

  if (station.requestTimeout) clearTimeout(station.requestTimeout);
  station.requestTimeout = setTimeout(() => {
    if (station.query.xStart) {
      const carrierId = station.query.uiCarrierId;
      station.rejectCounts[carrierId] = (station.rejectCounts[carrierId] || 0) + 1;
      console.log(`${station.name}: MES-Timeout nach 15s, Station wird freigegeben (${station.rejectCounts[carrierId]}. Mal)`);
      if (station.rejectCounts[carrierId] >= 3 && station.state.xAuto) {
        console.log(`${station.name}: Carrier ${carrierId} haengt – Station wird gestoppt`);
        station.state.xAuto = false;
        station.state.xErrL0 = true;
      }
      station.query.xStart = false;
      station.state.xBusy = false;
      station.currentCarrier = null;
      station.requestTimeout = null;
      setTimeout(() => processNextInQueue(station), 100).unref();
    }
  }, 15000).unref();

  console.log(`${station.name}: carrier ${carrier.carrierId} angekommen, MES-Daten angefordert`);
}

function completeStationCycle(station) {
  const carrier = station.currentCarrier;
  if (!carrier) return;

  if (!station.state.xAuto || station.state.xErrL0) {
    station.pendingCompletion = true;
    console.log(`${station.name}: Zyklus wartet auf Start/Freigabe, carrier=${carrier.carrierId}`);
    return;
  }

  const failed = station.scrapRate > 0 && Math.random() < station.scrapRate;
  if (failed) station.failedCount += 1;
  else station.producedCount += 1;

  Object.assign(station.processData, {
    iCarrierID: station.query.uiCarrierId,
    iStepNo: station.query.iStepNo,
    iResourceID: station.resourceId,
    iPar1: station.query.iPar1,
    iPar2: station.query.iPar2,
    iPar3: station.query.iPar3,
    iPar4: station.query.iPar4,
    ldtTimeStamp: new Date(),
  });
  station.processData.xCompleted = true;
  setTimeout(() => {
    station.processData.xCompleted = false;
  }, 500).unref();

  const quality = failed ? 'NOK' : 'OK';
  console.log(`${station.name}: ${station.operation} fertig, carrier=${carrier.carrierId}, deckel=${lidColorName(station.query.iPar1)}, rot=${station.query.iPar2}, gruen=${station.query.iPar3}, blau=${station.query.iPar4}, qualitaet=${quality}`);

  station.query.xStart = false;
  station.state.xBusy = false;
  station.currentCarrier = null;
  station.pendingCompletion = false;
  station.xStartBlockedUntil = Date.now() + 600;

  if (!failed && carrier.routeResourceId) {
    const nextStation = stations.find((candidate) => candidate.resourceId === carrier.routeResourceId);
    if (nextStation) {
      observeCarrier(carrier.carrierId, 'in_transit', {
        occupied: false,
        readerId: `DEMO-STATION-${station.resourceId}-EXIT`,
      });
      console.log(`${station.name}: carrier ${carrier.carrierId} wird zu ${nextStation.name} transportiert (${transferMs} ms)`);
      setTimeout(() => requestMesData(nextStation, carrier), transferMs).unref();
    }
  } else if (!failed) {
    console.log(`${station.name}: carrier ${carrier.carrierId} wird ins Palettenlager zuruecktransportiert`);
    setTimeout(
      () => observeCarrier(carrier.carrierId, 'stored', { occupied: true, readerId: inventoryReaderId }),
      transferMs,
    ).unref();
  }

  setTimeout(() => processNextInQueue(station), 100).unref();
}

function simulatePlc(station) {
  
  setInterval(() => {
    if (station.control.xCmdReset) {
      const stuckCarrier = station.currentCarrier || {
        carrierId: station.processData ? station.processData.iCarrierID : 0,
        partNo: 'WEBSHOP-PRODUCT-DEMO',
        routeResourceId: station.resourceId,
      };
      station.query.xStart = false;
      station.query.xQryBusy = false;
      station.query.xDone = false;
      station.query.xError = false;
      station.state.xBusy = false;
      station.state.xReset = true;
      station.state.xErrL0 = false;
      station.state.xAuto = true;
      station.currentCarrier = null;
      station.waitingQueue = [];
      station.responseSeen = false;
      station.control.xCmdReset = false;
      delete station.rejectCounts[stuckCarrier.carrierId];
      if (station.resourceId === 3) {
        console.log(`${station.name}: Reset – Carrier ${stuckCarrier.carrierId} bleibt an Q01, wird fortgesetzt`);
        setTimeout(() => requestMesData(station, stuckCarrier), transferMs).unref();
      } else {
        console.log(`${station.name}: Reset – Carrier ${stuckCarrier.carrierId} wird zu S01 transportiert`);
        setTimeout(() => releaseCarrier(stuckCarrier), transferMs).unref();
      }
    }

    if (station.control.xCmdStop) {
      station.state.xAuto = false;
      station.state.xErrL0 = true;
      station.control.xCmdStop = false;
      console.log(`${station.name}: Stop-Befehl vom MES ausgefuehrt${station.currentCarrier ? `, carrier=${station.currentCarrier.carrierId} bleibt an Station` : ''}`);
    }

    if (station.control.xCmdPause) {
      station.state.xAuto = false;
      station.control.xCmdPause = false;
      console.log(`${station.name}: Pause-Befehl vom MES ausgefuehrt${station.currentCarrier ? `, carrier=${station.currentCarrier.carrierId} bleibt an Station` : ''}`);
    }

    if (station.control.xCmdStart) {
      station.state.xAuto = true;
      station.state.xReset = false;
      station.state.xErrL0 = false;
      station.control.xCmdStart = false;
      console.log(`${station.name}: Start-Befehl vom MES ausgefuehrt`);
      if (station.pendingCompletion && station.currentCarrier) {
        station.pendingCompletion = false;
        setTimeout(() => completeStationCycle(station), 1000).unref();
      }
    }

    if (station.query.xStart && (station.query.xDone || station.query.xError) && !station.responseSeen) {
      station.responseSeen = true;
      if (station.requestTimeout) { clearTimeout(station.requestTimeout); station.requestTimeout = null; }
      console.log(`${station.name}: MES-Antwort result=${station.query.uiResultCode}, order=${station.query.sOrderNo || '-'}`);
      if (station.query.xDone) {
        delete station.rejectCounts[station.query.uiCarrierId];
        // Model the PLC writing the MES routing answer onto the carrier.
        station.currentCarrier.routeResourceId = station.query.uiNextResourceId;
        console.log(`${station.name}: ${station.operation} gestartet, cycleTime=${station.cycleTimeMs} ms`);
        setTimeout(() => completeStationCycle(station), station.cycleTimeMs).unref();
      } else {
        const carrierId = station.query.uiCarrierId;
        station.rejectCounts[carrierId] = (station.rejectCounts[carrierId] || 0) + 1;
        console.log(`${station.name}: carrier ${carrierId} abgewiesen (${station.rejectCounts[carrierId]}. Mal)`);
        if (station.rejectCounts[carrierId] >= 3 && station.state.xAuto) {
          console.log(`${station.name}: Carrier ${carrierId} haengt – Station wird gestoppt`);
          station.state.xAuto = false;
          station.state.xErrL0 = true;
        }
        station.query.xStart = false;
        station.state.xBusy = false;
        station.currentCarrier = null;
        setTimeout(() => processNextInQueue(station), 100).unref();
      }
    }
  }, 100).unref();
}

function releaseCarrier(carrier) {
  if (deactivatedCarrierIds.has(carrier.carrierId)) return;
  const inventorySlot = carrierInventory.slots.find((slot) => slot.carrierId === carrier.carrierId);
  if (!inventorySlot) {
    console.log(`Palettenlager: carrier ${carrier.carrierId} ist nicht im Inventar bekannt`);
    return;
  }
  if (!inventorySlot.occupied || inventorySlot.physicalState !== 'stored' || !inventorySlot.rfidReadValid) {
    return;
  }
  observeCarrier(carrier.carrierId, 'in_transit', { occupied: false, readerId: 'DEMO-PALLET-STORE-EXIT' });
  console.log(`Wareneingang: carrier ${carrier.carrierId} (${carrier.partNo}) in die Linie freigegeben`);
  const targetStation = stations.find((station) => station.resourceId === carrier.targetResourceId) || stations[0];
  carrier.routeResourceId = carrier.targetResourceId || targetStation.resourceId;
  requestMesData(targetStation, carrier);
}

function lidColorName(value) {
  return ({ 1: 'rot', 2: 'gruen', 4: 'blau' })[value] || 'unbekannt';
}

function scheduleCarrierReleases(carrier) {
  setTimeout(() => {
    releaseCarrier(carrier);
    setInterval(() => releaseCarrier(carrier), releaseEveryMs).unref();
  }, carrier.releaseDelay).unref();
}

const knownCarrierIds = new Set();
const deactivatedCarrierIds = new Set();
const knownCarrierPlans = new Map();

function scheduleNewCarrier(carrierPlan) {
  if (knownCarrierIds.has(carrierPlan.carrierId)) {
    Object.assign(knownCarrierPlans.get(carrierPlan.carrierId), carrierPlan);
    deactivatedCarrierIds.delete(carrierPlan.carrierId);
    return;
  }
  knownCarrierIds.add(carrierPlan.carrierId);
  knownCarrierPlans.set(carrierPlan.carrierId, carrierPlan);
  registerCarrierInInventory(carrierPlan.carrierId);
  scheduleCarrierReleases(knownCarrierPlans.get(carrierPlan.carrierId));
  console.log(`Neuer Carrier ${carrierPlan.carrierId} automatisch aufgenommen`);
}

async function refreshCarriers() {
  try {
    const plans = await fetchCarriersFromMes();
    const signature = plans
      .map((plan) => `${plan.carrierId}:${plan.targetResourceId}`)
      .sort()
      .join(',');
    if (signature !== lastCarrierPlanSignature) {
      lastCarrierPlanSignature = signature;
      console.log(
        `MES-Carrierplan: ${signature || 'keine aktiven Carrier'}`,
      );
    }
    const activeIds = new Set(plans.map((p) => p.carrierId));
    for (const id of knownCarrierIds) {
      if (!activeIds.has(id)) deactivatedCarrierIds.add(id);
    }
    for (const plan of plans) scheduleNewCarrier(plan);
  } catch (err) {
    console.warn(`Carrierplan konnte nicht aktualisiert werden: ${err.message}`);
    // silent – fetchCarriersFromMes already logs warnings
  }
}

async function start() {
  await server.initialize();
  const namespace = server.engine.addressSpace.getOwnNamespace();
  addCarrierInventory(namespace);
  stations.forEach((station) => addStation(namespace, station));
  await server.start();

  console.log(`WARA MES OPC UA demo production line: opc.tcp://localhost:${port}${resourcePath}`);
  console.log('Product: WEBSHOP-PRODUCT-DEMO / Deckelfarbe + rote/gruene/blaue Kugeln');
  console.log('Route: 10 Deckelfarbe bereitstellen -> 20 Kugeln dosieren -> 30 Endkontrolle');
  console.log(
    `Carrier-Inventar: capacity=${carrierInventory.capacity}, ` +
    `total=${inventoryTotalCount()}, available=${inventoryAvailableCount()}, reader=${inventoryReaderId}`,
  );
  console.log('Stations:');
  for (const station of stations) {
    console.log(`- Resource ${station.resourceId}: ${station.name}, operation=${station.operation}, cycle=${station.cycleTimeMs} ms, scrapRate=${station.scrapRate}`);
    simulatePlc(station);
  }
  await refreshCarriers();
  console.log(
    `Carrier automatisch von ${mesApiUrl} geladen, Polling alle ${carrierRefreshMs} ms`,
  );
  setInterval(() => void refreshCarriers(), carrierRefreshMs).unref();
}

async function shutdown() {
  await server.shutdown(1000);
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
start().catch((error) => {
  console.error('OPC UA demo server failed:', error);
  process.exit(1);
});
