require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const client = new Client({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS red_balls integer NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS green_balls integer NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS blue_balls integer NOT NULL DEFAULT 0;
    `);
    console.log('Order ball quantities migration completed.');
  } finally { await client.end(); }
}
migrate().catch((error) => { console.error(error); process.exitCode = 1; });
