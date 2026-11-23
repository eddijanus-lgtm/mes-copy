require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE machines ADD COLUMN IF NOT EXISTS is_machine boolean NOT NULL DEFAULT false;
      ALTER TABLE machines ADD COLUMN IF NOT EXISTS parent_machine_id uuid;
      ALTER TABLE machines ADD COLUMN IF NOT EXISTS ip_address varchar;
      ALTER TABLE machines ADD COLUMN IF NOT EXISTS connection_port integer;
      ALTER TABLE machines ADD COLUMN IF NOT EXISTS connection_protocol varchar;
    `);
    const existing = await client.query("SELECT id FROM machines WHERE is_machine = true AND name = 'Basismaschine' LIMIT 1");
    let baseId = existing.rows[0]?.id;
    if (!baseId) {
      const inserted = await client.query(`INSERT INTO machines (id, name, status, type, location, is_machine, opcua_enabled, telemetry, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Basismaschine', 'online', 'Produktionsmaschine', 'Produktionslinie', true, false, '{}', NOW(), NOW()) RETURNING id`);
      baseId = inserted.rows[0].id;
    }
    await client.query('UPDATE machines SET parent_machine_id = $1 WHERE is_machine = false AND parent_machine_id IS NULL', [baseId]);
    console.log(`Machine hierarchy ready. Base machine: ${baseId}`);
  } finally { await client.end(); }
}
migrate().catch((error) => { console.error(error); process.exitCode = 1; });
