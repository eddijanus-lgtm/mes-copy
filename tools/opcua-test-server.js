const { DataType, OPCUAServer, StatusCodes, Variant } = require('node-opcua');

// DEMO CONTRACT ONLY: replace these invented stMES fields with the real PLC UDT specification.
const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4840);
const resourcePath = '/UA/WaraMesTest';
const stations = [createStationState(1, 128), createStationState(2, 129)];

const server = new OPCUAServer({
  port,
  resourcePath,
  buildInfo: {
    productName: 'WARA MES multi-station demo server',
    buildNumber: '2',
    buildDate: new Date(),
  },
});

function createStationState(resourceId, carrierId) {
  return {
    resourceId,
    state: { xAuto: true, xManual: false, xBusy: false, xReset: false, xErrL0: false, xErrL1: false, xErrL2: false },
    query: {
      xStart: false, xQryBusy: false, xDone: false, xError: false,
      uiCarrierId: carrierId, uiResourceId: resourceId,
      sOrderNo: '', sPartNo: '', uiOperationNo: 0, iStepNo: 0, uiNextResourceId: 0,
      iPar1: 0, iPar2: 0, iPar3: 0, iPar4: 0, uiResultCode: 0,
    },
    processData: {
      iCarrierID: carrierId, iStepNo: 1, iResourceID: resourceId,
      iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7,
      ldtTimeStamp: new Date('1970-01-01T00:00:00.000Z'),
    },
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
    browseName: `Station${station.resourceId}`,
    nodeId: `ns=1;s=Station${station.resourceId}`,
  });
  const stMes = namespace.addObject({ componentOf: stationObject, browseName: 'stMES [DEMO]', nodeId: `ns=1;s=Station${station.resourceId}.stMES` });
  const stateObject = namespace.addObject({ componentOf: stMes, browseName: 'State', nodeId: `ns=1;s=Station${station.resourceId}.stMES.State` });
  const queryObject = namespace.addObject({ componentOf: stMes, browseName: 'Query', nodeId: `ns=1;s=Station${station.resourceId}.stMES.Query` });
  const queryPrefix = `ns=1;s=Station${station.resourceId}.stMES.Query`;

  addBooleanGroup(namespace, stateObject, `ns=1;s=Station${station.resourceId}.stMES.State`, station.state);
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

function simulatePlc(station, requests) {
  const trigger = (carrierId) => {
    if (station.query.xStart) {
      setTimeout(() => trigger(carrierId), 250).unref();
      return;
    }
    station.responseSeen = false;
    station.query.uiCarrierId = carrierId;
    station.query.xStart = true;
    station.state.xBusy = true;
    console.log(`Station ${station.resourceId}: xStart=true, carrier=${station.query.uiCarrierId}`);
  };
  for (const request of requests) {
    setTimeout(() => trigger(request.carrierId), request.delay).unref();
  }

  setInterval(() => {
    if (station.query.xStart && (station.query.xDone || station.query.xError) && !station.responseSeen) {
      station.responseSeen = true;
      console.log(`Station ${station.resourceId}: MES response result=${station.query.uiResultCode}`);
      if (station.query.xDone) {
        Object.assign(station.processData, {
          iCarrierID: station.query.uiCarrierId,
          iStepNo: station.query.iStepNo,
          iResourceID: station.query.uiNextResourceId,
          iPar1: station.query.iPar1,
          iPar2: station.query.iPar2,
          iPar3: station.query.iPar3,
          iPar4: station.query.iPar4,
          ldtTimeStamp: new Date(),
        });
      }
      setTimeout(() => {
        station.query.xStart = false;
        station.state.xBusy = false;
      }, 750).unref();
    }
  }, 100).unref();
}

async function start() {
  await server.initialize();
  const namespace = server.engine.addressSpace.getOwnNamespace();
  stations.forEach((station) => addStation(namespace, station));
  await server.start();

  console.log(`WARA MES OPC UA demo server: opc.tcp://localhost:${port}${resourcePath}`);
  console.log('DEMO ONLY: invented stMES contract; replace with the real PLC UDT specification.');
  console.log('Stations: Station1 (carrier 128), Station2 (carrier 129)');
  // The simulator behaves like a PLC: it initiates requests and reports process completion.
  // Application code only reacts to these standard stMES/DB151 signals.
  simulatePlc(stations[0], [
    { delay: 3000, carrierId: 128 },
    { delay: 18000, carrierId: 128 },
  ]);
  simulatePlc(stations[1], [
    { delay: 7000, carrierId: 129 },
    { delay: 12000, carrierId: 128 },
    { delay: 22000, carrierId: 999 },
  ]);
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
