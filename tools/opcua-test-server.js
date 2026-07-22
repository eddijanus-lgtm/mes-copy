const {
  DataType,
  OPCUAServer,
  Variant,
} = require('node-opcua');

const port = Number(process.env.OPC_UA_TEST_SERVER_PORT || 4840);
const resourcePath = '/UA/WaraMesTest';
const state = {
  temperature: 42,
  pressure: 5.2,
  running: true,
  producedCount: 0,
};

const server = new OPCUAServer({
  port,
  resourcePath,
  buildInfo: {
    productName: 'WARA MES OPC UA Test Server',
    buildNumber: '1',
    buildDate: new Date(),
  },
});

function addVariable(namespace, parent, browseName, nodeId, dataType, readValue) {
  namespace.addVariable({
    componentOf: parent,
    browseName,
    nodeId,
    dataType,
    minimumSamplingInterval: 1000,
    value: {
      get: () => new Variant({ dataType, value: readValue() }),
    },
  });
}

async function start() {
  await server.initialize();

  const namespace = server.engine.addressSpace.getOwnNamespace();
  const machine = namespace.addObject({
    organizedBy: server.engine.addressSpace.rootFolder.objects,
    browseName: 'Machine1',
  });

  addVariable(namespace, machine, 'Temperature', 'ns=1;s=Machine1.Temperature', DataType.Double, () => state.temperature);
  addVariable(namespace, machine, 'Pressure', 'ns=1;s=Machine1.Pressure', DataType.Double, () => state.pressure);
  addVariable(namespace, machine, 'Running', 'ns=1;s=Machine1.Running', DataType.Boolean, () => state.running);
  addVariable(namespace, machine, 'ProducedCount', 'ns=1;s=Machine1.ProducedCount', DataType.UInt32, () => state.producedCount);

  setInterval(() => {
    state.temperature = Number((40 + Math.random() * 8).toFixed(2));
    state.pressure = Number((4.8 + Math.random()).toFixed(2));
    if (state.running) state.producedCount += 1;
  }, 1000).unref();

  await server.start();
  console.log(`WARA MES OPC UA test server: opc.tcp://localhost:${port}${resourcePath}`);
  console.log('Nodes: ns=1;s=Machine1.Temperature, Pressure, Running, ProducedCount');
}

async function shutdown() {
  await server.shutdown(1000);
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

start().catch((error) => {
  console.error('OPC UA test server failed:', error);
  process.exit(1);
});
