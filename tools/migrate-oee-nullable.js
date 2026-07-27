require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'mes_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'mes_production',
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    for (const column of [
      'oee_availability',
      'oee_performance',
      'oee_quality',
      'oee_total',
    ]) {
      await client.query(
        `ALTER TABLE shift_reports ALTER COLUMN ${column} DROP NOT NULL`,
      );
    }
    await client.query('COMMIT');
    console.log('shift_reports OEE columns now accept unavailable values.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
