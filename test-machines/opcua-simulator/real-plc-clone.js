const {
  DataType,
  MessageSecurityMode,
  OPCUAServer,
  SecurityPolicy,
  StatusCodes,
  Variant,
} = require('node-opcua');

const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4840);
const advertisedHost = process.env.OPC_UA_SERVER_HOST || '127.0.0.1';
const completionDelayMs = Number(process.env.PLC_AUTO_COMPLETE_MS || 5000);
const applicationUri = 'urn:SIMATIC.S7-1500.OPC-UA.Application:PLC_1';
const siemensNamespaceUri = 'http://www.siemens.com/simatic-s7-opcua';

const processData = {
  iCarrierID: 128,
  iStepNo: 2,
  iResourceID: 2,
  iPar1: 1,
  iPar2: 3,
  iPar3: 5,
  iPar4: 7,
  ldtTimeStamp: new Date('1601-01-01T00:00:00.000Z'),
};

let completionTimer;

const server = new OPCUAServer({
  port,
  alternateHostname: advertisedHost,
  securityModes: [
    MessageSecurityMode.None,
    MessageSecurityMode.Sign,
    MessageSecurityMode.SignAndEncrypt,
  ],
  securityPolicies: [SecurityPolicy.None, SecurityPolicy.Basic256Sha256],
  serverInfo: {
    applicationUri,
    applicationName: { text: 'PLC_1' },
    productUri: 'SIMATIC.S7-1500.OPC-UA.Application',
  },
  buildInfo: {
    productName: 'SIMATIC S7-1500 OPC UA virtual PLC',
    buildNumber: '1',
    buildDate: new Date(),
  },
});

function scheduleCompletion() {
  if (!Number.isFinite(completionDelayMs) || completionDelayMs <= 0) return;
  clearTimeout(completionTimer);
  completionTimer = setTimeout(() => {
    processData.ldtTimeStamp = new Date();
    console.log(
      `Prozess abgeschlossen: carrier=${processData.iCarrierID}, ` +
        `step=${processData.iStepNo}, resource=${processData.iResourceID}`,
    );
  }, completionDelayMs);
}

function addWritableVariable(namespace, parent, name, dataType) {
  namespace.addVariable({
    componentOf: parent,
    browseName: name,
    displayName: name,
    nodeId: `s="dbProcessData"."${name}"`,
    dataType,
    minimumSamplingInterval: 100,
    value: {
      get: () => new Variant({ dataType, value: processData[name] }),
      set: (variant) => {
        processData[name] = variant.value;
        if (name !== 'ldtTimeStamp') scheduleCompletion();
        return StatusCodes.Good;
      },
    },
  });
}

async function start() {
  await server.initialize();
  const addressSpace = server.engine.addressSpace;

  // Keep the namespace order identical to the scanned physical S7-1500.
  addressSpace.registerNamespace('http://opcfoundation.org/UA/DI/');
  const siemens = addressSpace.registerNamespace(siemensNamespaceUri);
  if (siemens.index !== 3) {
    throw new Error(`Siemens namespace must be ns=3, got ns=${siemens.index}`);
  }

  const plc = siemens.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'PLC_1',
    displayName: 'PLC_1',
    nodeId: 's=PLC',
  });
  const dataBlocks = siemens.addObject({
    componentOf: plc,
    browseName: 'DataBlocksGlobal',
    displayName: 'DataBlocksGlobal',
    nodeId: 's=DataBlocksGlobal',
  });
  const dbProcessData = siemens.addObject({
    componentOf: dataBlocks,
    browseName: 'dbProcessData',
    displayName: 'dbProcessData',
    nodeId: 's="dbProcessData"',
  });

  for (const name of [
    'iCarrierID',
    'iStepNo',
    'iResourceID',
    'iPar1',
    'iPar2',
    'iPar3',
    'iPar4',
  ]) {
    addWritableVariable(siemens, dbProcessData, name, DataType.Int16);
  }
  addWritableVariable(
    siemens,
    dbProcessData,
    'ldtTimeStamp',
    DataType.DateTime,
  );

  await server.start();
  console.log(`Virtuelle S7-1500: opc.tcp://${advertisedHost}:${port}`);
  console.log(`Application URI: ${applicationUri}`);
  console.log('dbProcessData ist unter den originalen ns=3 Node-IDs verfuegbar.');
}

async function shutdown() {
  clearTimeout(completionTimer);
  await server.shutdown(1000);
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
start().catch((error) => {
  console.error('Virtuelle SPS konnte nicht gestartet werden:', error);
  process.exit(1);
});
