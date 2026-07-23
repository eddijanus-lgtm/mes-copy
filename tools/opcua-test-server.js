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

const carrierPlans = [
  { carrierId: 128, partNo: 'WEBSHOP-PRODUCT-DEMO', releaseDelay: 3000 },
  { carrierId: 129, partNo: 'WEBSHOP-PRODUCT-DEMO', releaseDelay: 10000 },
];
const transferMs = 2000;
const releaseEveryMs = 30000;

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
      ldtTimeStamp: new Date('1970-01-01T00:00:00.000Z'),
    },
    currentCarrier: null,
    pendingCompletion: false,
    producedCount: 0,
    failedCount: 0,
    responseSeen: false,
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
  addVariable(namespace, processData, 'ldtTimeStamp', `${processPrefix}.ldtTimeStamp`, DataType.DateTime, () => station.processData.ldtTimeStamp, (value) => { station.processData.ldtTimeStamp = new Date(value); });
}

function requestMesData(station, carrier) {
  if (station.query.xStart || station.state.xBusy) {
    setTimeout(() => requestMesData(station, carrier), 250).unref();
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

  const quality = failed ? 'NOK' : 'OK';
  console.log(`${station.name}: ${station.operation} fertig, carrier=${carrier.carrierId}, deckel=${lidColorName(station.query.iPar1)}, rot=${station.query.iPar2}, gruen=${station.query.iPar3}, blau=${station.query.iPar4}, qualitaet=${quality}`);

  station.query.xStart = false;
  station.state.xBusy = false;
  station.currentCarrier = null;
  station.pendingCompletion = false;

  if (!failed && station.query.uiNextResourceId) {
    const nextStation = stations.find((candidate) => candidate.resourceId === station.query.uiNextResourceId);
    if (nextStation) {
      console.log(`${station.name}: carrier ${carrier.carrierId} wird zu ${nextStation.name} transportiert (${transferMs} ms)`);
      setTimeout(() => requestMesData(nextStation, carrier), transferMs).unref();
    }
  }
}

function simulatePlc(station) {
  
  setInterval(() => {
    if (station.control.xCmdReset) {
      station.query.xStart = false;
      station.query.xQryBusy = false;
      station.query.xDone = false;
      station.query.xError = false;
      station.state.xBusy = false;
      station.state.xReset = true;
      station.state.xErrL0 = false;
      station.currentCarrier = null;
      station.responseSeen = false;
      station.control.xCmdReset = false;
      console.log(`${station.name}: Reset-Befehl vom MES ausgefuehrt`);
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
      console.log(`${station.name}: MES-Antwort result=${station.query.uiResultCode}, order=${station.query.sOrderNo || '-'}`);
      if (station.query.xDone) {
        console.log(`${station.name}: ${station.operation} gestartet, cycleTime=${station.cycleTimeMs} ms`);
        setTimeout(() => completeStationCycle(station), station.cycleTimeMs).unref();
      } else {
        console.log(`${station.name}: carrier ${station.query.uiCarrierId} abgewiesen`);
        station.query.xStart = false;
        station.state.xBusy = false;
        station.currentCarrier = null;
      }
    }
  }, 100).unref();
}

function releaseCarrier(carrier) {
  console.log(`Wareneingang: carrier ${carrier.carrierId} (${carrier.partNo}) in die Linie freigegeben`);
  requestMesData(stations[0], carrier);
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

async function start() {
  await server.initialize();
  const namespace = server.engine.addressSpace.getOwnNamespace();
  stations.forEach((station) => addStation(namespace, station));
  await server.start();

  console.log(`WARA MES OPC UA demo production line: opc.tcp://localhost:${port}${resourcePath}`);
  console.log('Product: WEBSHOP-PRODUCT-DEMO / Deckelfarbe + rote/gruene/blaue Kugeln');
  console.log('Route: 10 Deckelfarbe bereitstellen -> 20 Kugeln dosieren -> 30 Endkontrolle');
  console.log('Stations:');
  for (const station of stations) {
    console.log(`- Resource ${station.resourceId}: ${station.name}, operation=${station.operation}, cycle=${station.cycleTimeMs} ms`);
    simulatePlc(station);
  }
  for (const carrier of carrierPlans) {
    scheduleCarrierReleases(carrier);
  }
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
