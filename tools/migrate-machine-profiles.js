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
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`
      CREATE TABLE IF NOT EXISTS machine_profile_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id uuid NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        machine_id varchar NOT NULL,
        status varchar NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'structurally_valid', 'live_validated', 'active', 'disabled')),
        active boolean NOT NULL DEFAULT false,
        document jsonb NOT NULL,
        validation_result jsonb,
        live_validation_result jsonb,
        created_by varchar NOT NULL,
        change_summary varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_machine_profile_version UNIQUE (profile_id, version)
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_profile_single_active
      ON machine_profile_versions (active) WHERE active = true
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_machine_profile_versions_profile
      ON machine_profile_versions (profile_id, version DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_machine_profile_versions_machine
      ON machine_profile_versions (machine_id)
    `);
    await client.query('COMMIT');
    console.log('Machine profile version storage is ready.');
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
