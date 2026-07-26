require('dotenv').config();

// DEMO DATA ONLY: remove this seed and replace the node contract when the real stMES UDT is available.
const baseUrl = process.env.MES_BASE_URL || 'http://localhost:3000/api';
const username = process.env.DEMO_ADMIN_USERNAME;
const password = process.env.DEMO_ADMIN_PASSWORD;

async function request(path, options = {}, token) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function seed() {
  if (!username || !password) throw new Error('Set DEMO_ADMIN_USERNAME and DEMO_ADMIN_PASSWORD.');
  const login = await request('/auth/login', { method: 'POST', body: { username, password } });
  const token = login.access_token;

  const machines = await request('/machines', {}, token);
  const stationIds = {};
  const stationDefinitions = [
    {
      resource_id: 1,
      name: 'S01 Deckelzufuehrung',
      status: 'online',
      type: 'lid_feeder',
      location: 'Webshop Demo Linie',
      model: 'WARA-DEMO-S01',
      opcua_endpoint_url: 'opc.tcp://localhost:4840/UA/WaraMesTest',
      opcua_node_prefix: 'ns=1;s=Station1',
      opcua_enabled: true,
    },
    {
      resource_id: 2,
      name: 'S02 Kugeldosierung',
      status: 'online',
      type: 'ball_dispenser',
      location: 'Webshop Demo Linie',
      model: 'WARA-DEMO-S02',
      opcua_endpoint_url: 'opc.tcp://localhost:4840/UA/WaraMesTest',
      opcua_node_prefix: 'ns=1;s=Station2',
      opcua_enabled: true,
    },
    {
      resource_id: 3,
      name: 'Q01 Endkontrolle',
      status: 'online',
      type: 'quality_gate',
      location: 'Webshop Demo Linie',
      model: 'WARA-DEMO-Q01',
      opcua_endpoint_url: 'opc.tcp://localhost:4840/UA/WaraMesTest',
      opcua_node_prefix: 'ns=1;s=Station3',
      opcua_enabled: true,
    },
  ];
  for (const definition of stationDefinitions) {
    const resourceId = definition.resource_id;
    let station = machines.find((machine) => machine.resource_id === resourceId);
    if (!station) {
      station = await request('/machines', {
        method: 'POST',
        body: definition,
      }, token);
    } else {
      station = await request(`/machines/${station.id}`, {
        method: 'PATCH',
        body: definition,
      }, token);
    }
    stationIds[resourceId] = station.id;
  }

  const products = await request('/products', {}, token);
  const productRoute = [
    { step_no: 1, resource_id: 1, operation_no: 10, operation: 'Deckelfarbe bereitstellen', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
    { step_no: 2, resource_id: 2, operation_no: 20, operation: 'Kugeln dosieren', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
    { step_no: 3, resource_id: 3, operation_no: 30, operation: 'Deckel und Kugeln pruefen', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
  ];
  const productBody = {
    part_no: 'WEBSHOP-PRODUCT',
    name: 'Webshop-Produkt',
    description: 'Deckelfarbe plus rote/gruene/blaue Kugeln',
    is_active: true,
    parameter_definitions: [
      { key: 'iPar1', label: 'Deckelfarbe', type: 'select', default_value: 1, options: [{ label: 'Rot', value: 1 }, { label: 'Gruen', value: 2 }, { label: 'Blau', value: 4 }] },
      { key: 'iPar2', label: 'Rote Kugeln', type: 'number', default_value: 3, min_value: 0, max_value: 99, unit: 'Stk' },
      { key: 'iPar3', label: 'Gruene Kugeln', type: 'number', default_value: 5, min_value: 0, max_value: 99, unit: 'Stk' },
      { key: 'iPar4', label: 'Blaue Kugeln', type: 'number', default_value: 7, min_value: 0, max_value: 99, unit: 'Stk' },
    ],
    route_steps: productRoute,
  };
  let product = products.find((entry) => entry.part_no === productBody.part_no);
  if (!product) {
    product = await request('/products', { method: 'POST', body: productBody }, token);
  } else {
    product = await request(`/products/${product.id}`, { method: 'PATCH', body: productBody }, token);
  }

  const orders = await request('/orders', {}, token);
  let order = orders.find((entry) => entry.name === 'DEMO-ORDER-001');
  if (!order) {
    order = await request('/orders', {
      method: 'POST',
        body: { name: 'DEMO-ORDER-001', priority: 1, machine_id: stationIds[1], product_id: product.id, operation: 'Webshop-Produkt konfigurieren', quantity: 2 },
    }, token);
  }
  await request(`/orders/${order.id}`, {
    method: 'PATCH',
    body: { name: 'DEMO-ORDER-001', priority: 1, machine_id: stationIds[1], product_id: product.id, operation: 'Webshop-Produkt konfigurieren', quantity: 2 },
  }, token);
  await request(`/orders/${order.id}`, {
    method: 'PATCH',
    body: { status: 'in_progress', completed_quantity: 0 },
  }, token);
  await request(`/orders/${order.id}/route`, {
    method: 'PATCH',
    body: {
      steps: [
        { step_no: 1, resource_id: 1, operation_no: 10, operation: 'Deckelfarbe bereitstellen', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
        { step_no: 2, resource_id: 2, operation_no: 20, operation: 'Kugeln dosieren', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
        { step_no: 3, resource_id: 3, operation_no: 30, operation: 'Deckel und Kugeln pruefen', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
      ],
    },
  }, token);

  const carriers = await request('/carriers', {}, token);
  for (const [carrierNumber, currentStep] of [[128, 1], [129, 1]]) {
    let carrier = carriers.find((entry) => entry.carrier_number === carrierNumber);
    if (!carrier) carrier = await request('/carriers', { method: 'POST', body: { carrier_number: carrierNumber } }, token);
    await request(`/carriers/${carrier.id}/assignment`, {
      method: 'POST',
      body: { order_id: order.id, current_step_no: currentStep },
    }, token);
  }

  console.log('DEMO data ready: webshop product on resources 1/2/3, carriers 128/129 start at step 1.');
}

seed().catch((error) => {
  console.error('DEMO seed failed:', error.message);
  process.exit(1);
});
