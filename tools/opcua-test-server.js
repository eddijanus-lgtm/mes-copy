require('dotenv').config({ quiet: true });
const { DataType, OPCUAServer, StatusCodes, Variant } = require('node-opcua');

const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4840);
const resourcePath = '/UA/WaraMesTest';

// Local demo line based on the OpenCart webshop specification.
// The node contract is still a demo stMES/DB151 contract, but the process model
// now reflects the configured webshop product: lid color plus red/green/blue balls.
const stationConfigs = [
  {
    resourceId: 1,
    name: 'S01 Deckelzufuehrung',
    stationType: 'lid_feeder',
    operationNo: 10,
    operation: 'Deckelfarbe bereitstellen',
    cycleTimeMs: 5000,
    scrapRate: 0,
  },
  {
    resourceId: 2,
    name: 'S02 Kugeldosierung',
    stationType: 'ball_dispenser',
    operationNo: 20,
    operation: 'Kugeln dosieren',
    cycleTimeMs: 6000,
    scrapRate: 0,
  },
  {
    resourceId: 3,
    name: 'Q01 Endkontrolle',
    stationType: 'quality_gate',
    operationNo: 30,
    operation: 'Deckel und Kugeln pruefen',
    cycleTimeMs: 4000,
    scrapRate: 0,
  },
];
const stations = stationConfigs.map(createStationState);

const mesApiUrl = process.env.MES_API_URL || process.env.MES_BASE_URL || 'http://localhost:3000/api';
const mesApiUser = process.env.MES_API_USER || process.env.DEMO_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
const mesApiPass = process.env.MES_API_PASS || process.env.DEMO_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const configuredCarriers = process.env.DEMO_CARRIER_IDS?.split(',').map((id) => Number(id.trim()));
const transferMs = 2000;
const releaseEveryMs = 30000;
const handshakeResetMs = 600;
const carriersInLine = new Set();
const completedFixedCarriers = new Set();

async function fetchCarriersFromMes() {
  if (configuredCarriers) {
    return [...new Set(configuredCarriers)]
      .filter((id) => !completedFixedCarriers.has(id))
      .map((carrierId) => ({ carrierId, resourceId: 1 }));
  }
  try {
    const loginRes = await fetch(`${mesApiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: mesApiUser, password: mesApiPass }),
      signal: AbortSignal.timeout(5000),
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const { access_token } = await loginRes.json();
    const get = async (path) => {
      const response = await fetch(mesApiUrl + path, {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
      return response.json();
    };
    const carriers = await get('/carriers');
    const routes = new Map();
    return await Promise.all(carriers
      .filter((c) => c.order_id && (c.status === 'assigned' || c.status === 'in_process') && !carriersInLine.has(c.carrier_number))
      .map(async (c) => {
        let resourceId = c.current_resource_id;
        if (resourceId == null) {
          if (!routes.has(c.order_id)) routes.set(c.order_id, get(`/orders/${c.order_id}/route`));
          const route = await routes.get(c.order_id);
          resourceId = route.find((step) => step.step_no === c.current_step_no)?.resource_id;
        }
        return { carrierId: c.carrier_number, resourceId };
      }));
  } catch (err) {
    console.warn(`Carrier konnten nicht vom MES geladen werden: ${err.message}`);
    return null;
  }
}

const servers = new Map(stations.map((station) => [station.resourceId, new OPCUAServer({
  port: port + station.resourceId - 1,
  resourcePath,
  buildInfo: { productName: `WARA MES station ${station.resourceId}`, buildNumber: '3', buildDate: new Date() },
})]));

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
    cycleTimer: null,
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

function addStation(server, namespace, station) {
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
  addVariable(namespace, processData, 'ldtTimeStamp', `${processPrefix}.ldtTimeStamp`, DataType.DateTime, () => station.processData.ldtTimeStamp, (value) => { station.processData.ldtTimeStamp = new Date(value); });
}

function processNextInQueue(station) {
  if (station.waitingQueue.length === 0) return;
  if (!station.state.xAuto || station.query.xStart || station.state.xBusy) return;
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
  if (!station.state.xAuto || station.query.xStart || station.state.xBusy) {
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
  station.currentCarrier = carrier;
  station.query.uiCarrierId = carrier.carrierId;
  station.query.uiResourceId = station.resourceId;
  station.query.sOrderNo = '';
  station.query.sPartNo = '';
  station.query.uiOperationNo = 0;
  station.query.iStepNo = 0;
  station.query.uiNextResourceId = 0;
  station.query.uiResultCode = 0;
  station.query.xDone = false;
  station.query.xError = false;
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
      station.xStartBlockedUntil = Date.now() + handshakeResetMs;
      station.state.xBusy = false;
      station.currentCarrier = null;
      carriersInLine.delete(carrierId);
      station.requestTimeout = null;
      setTimeout(() => processNextInQueue(station), 100).unref();
    }
  }, 15000).unref();

  console.log(`${station.name}: carrier ${carrier.carrierId} angekommen, MES-Daten angefordert`);
}

function completeStationCycle(station) {
  station.cycleTimer = null;
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

  const quality = failed ? 'NOK' : 'OK';
  console.log(`${station.name}: ${station.operation} fertig, carrier=${carrier.carrierId}, deckel=${lidColorName(station.query.iPar1)}, rot=${station.query.iPar2}, gruen=${station.query.iPar3}, blau=${station.query.iPar4}, qualitaet=${quality}`);

  station.query.xStart = false;
  station.state.xBusy = false;
  station.currentCarrier = null;
  station.pendingCompletion = false;
  station.xStartBlockedUntil = Date.now() + handshakeResetMs;

  const nextStation = !failed && stations.find((candidate) => candidate.resourceId === station.query.uiNextResourceId);
  if (nextStation) {
    console.log(`${station.name}: carrier ${carrier.carrierId} wird zu ${nextStation.name} transportiert (${transferMs} ms)`);
    setTimeout(() => requestMesData(nextStation, carrier), transferMs).unref();
  } else {
    carriersInLine.delete(carrier.carrierId);
    if (configuredCarriers && !failed && station.query.uiNextResourceId === 0) {
      completedFixedCarriers.add(carrier.carrierId);
    }
  }

  setTimeout(() => processNextInQueue(station), 100).unref();
}

function simulatePlc(station) {
  
  setInterval(() => {
    if (station.control.xCmdReset) {
      const stuckCarrier = station.currentCarrier;
      clearTimeout(station.requestTimeout);
      clearTimeout(station.cycleTimer);
      station.requestTimeout = null;
      station.cycleTimer = null;
      station.pendingCompletion = false;
      station.query.xStart = false;
      station.query.xQryBusy = false;
      station.query.xDone = false;
      station.query.xError = false;
      station.state.xBusy = false;
      station.state.xReset = true;
      station.state.xErrL0 = false;
      station.state.xAuto = true;
      station.currentCarrier = null;
      station.responseSeen = false;
      station.control.xCmdReset = false;
      station.rejectCounts = {};
      station.xStartBlockedUntil = Date.now() + handshakeResetMs;
      if (stuckCarrier) {
        station.waitingQueue.unshift(stuckCarrier);
      }
      processNextInQueue(station);
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
        station.cycleTimer = setTimeout(() => completeStationCycle(station), 1000).unref();
      }
      processNextInQueue(station);
    }

    if (station.query.xStart && (station.query.xDone || station.query.xError) && !station.responseSeen) {
      station.responseSeen = true;
      if (station.requestTimeout) { clearTimeout(station.requestTimeout); station.requestTimeout = null; }
      console.log(`${station.name}: MES-Antwort result=${station.query.uiResultCode}, order=${station.query.sOrderNo || '-'}`);
      if (station.query.xDone) {
        delete station.rejectCounts[station.query.uiCarrierId];
        const cycleTimeMs = Math.max(1, Math.round(station.cycleTimeMs * (0.9 + Math.random() * 0.2)));
        console.log(`${station.name}: ${station.operation} gestartet, cycleTime=${cycleTimeMs} ms`);
        station.cycleTimer = setTimeout(() => completeStationCycle(station), cycleTimeMs).unref();
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
        station.xStartBlockedUntil = Date.now() + handshakeResetMs;
        station.state.xBusy = false;
        station.currentCarrier = null;
        carriersInLine.delete(carrierId);
        setTimeout(() => processNextInQueue(station), 100).unref();
      }
    }
  }, 100).unref();
}

function releaseCarrier(carrier) {
  const station = stations.find((candidate) => candidate.resourceId === carrier.resourceId);
  if (!station || carriersInLine.has(carrier.carrierId)) return;
  carriersInLine.add(carrier.carrierId);
  requestMesData(station, carrier);
}

function lidColorName(value) {
  return ({ 1: 'rot', 2: 'gruen', 4: 'blau' })[value] || 'unbekannt';
}

const nextCarrierRelease = new Map();
async function refreshCarriers() {
  const plans = await fetchCarriersFromMes();
  if (!plans) return;
  const activeIds = new Set(plans.map(({ carrierId }) => carrierId));
  for (const id of nextCarrierRelease.keys()) {
    if (!activeIds.has(id) && !carriersInLine.has(id)) nextCarrierRelease.delete(id);
  }
  const now = Date.now();
  for (const plan of plans) {
    if ((nextCarrierRelease.get(plan.carrierId) ?? 0) > now) continue;
    releaseCarrier(plan);
    nextCarrierRelease.set(plan.carrierId, now + releaseEveryMs);
  }
}

async function pollCarriers() {
  await refreshCarriers();
  setTimeout(() => void pollCarriers(), 15000).unref();
}

async function start() {
  if (configuredCarriers?.some((id) => !Number.isInteger(id) || id < 1 || id > 32767)) {
    throw new Error('DEMO_CARRIER_IDS must contain comma-separated integers from 1 to 32767.');
  }
  if (!configuredCarriers && (!mesApiUser || !mesApiPass)) {
    throw new Error('Set DEMO_CARRIER_IDS or configure DEMO_ADMIN_USERNAME and DEMO_ADMIN_PASSWORD.');
  }
  for (const station of stations) {
    const server = servers.get(station.resourceId);
    await server.initialize();
    addStation(server, server.engine.addressSpace.getOwnNamespace(), station);
    await server.start();
    console.log(`Station ${station.resourceId}: opc.tcp://localhost:${port + station.resourceId - 1}${resourcePath}`);
  }
  console.log('Product: WEBSHOP-PRODUCT-DEMO / Deckelfarbe + rote/gruene/blaue Kugeln');
  console.log('Route: 10 Deckelfarbe bereitstellen -> 20 Kugeln dosieren -> 30 Endkontrolle');
  console.log('Stations:');
  for (const station of stations) {
    console.log(`- Resource ${station.resourceId}: ${station.name}, operation=${station.operation}, cycle=${station.cycleTimeMs} ms`);
    simulatePlc(station);
  }
  console.log(configuredCarriers
    ? `Simulierter Wareneingang: Carrier ${configuredCarriers.join(', ')}`
    : `Carrier automatisch von ${mesApiUrl} geladen, Polling alle 15s`);
  await pollCarriers();
}

async function shutdown() {
  await Promise.all([...servers.values()].map((server) => server.shutdown(1000)));
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
start().catch((error) => {
  console.error('OPC UA demo server failed:', error);
  process.exit(1);
});
