#!/usr/bin/env node
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'mes_admin',
  password: String(process.env.DB_PASSWORD || ''),
  database: process.env.DB_DATABASE || 'mes_production',
});

async function query(sql, params) {
  return pool.query(sql, params);
}

async function ensureTimescaleExtension() {
  await query('CREATE EXTENSION IF NOT EXISTS timescaledb');
  console.log('[1/7] TimescaleDB extension ready');
}

async function ensureHypertable() {
  const existing = await query(
    "SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = 'public' AND hypertable_name = 'data_points'",
  );
  if (existing.rowCount > 0) {
    console.log('[2/7] data_points is already a hypertable');
    return;
  }

  const pk = await query("SELECT conname FROM pg_constraint WHERE contype = 'p' AND conrelid = 'data_points'::regclass");
  if (pk.rowCount > 0) {
    await query(`ALTER TABLE data_points DROP CONSTRAINT "${pk.rows[0].conname}"`);
  }
  await query('CREATE UNIQUE INDEX IF NOT EXISTS data_points_timestamp_id_idx ON data_points (timestamp, id)');
  await query("SELECT create_hypertable('data_points', 'timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE)");
  console.log('[2/7] data_points hypertable created');
}

async function ensureChunking() {
  await query("SELECT set_chunk_time_interval('data_points', INTERVAL '1 day')");
  console.log('[3/7] Daily chunk interval configured');
}

async function ensureCompression() {
  await query(`ALTER TABLE data_points SET (
    timescaledb.compress = true,
    timescaledb.compress_segmentby = 'machine_id,node_id',
    timescaledb.compress_orderby = 'timestamp DESC'
  )`);

  const policy = await query(
    "SELECT 1 FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression' AND hypertable_name = 'data_points'",
  ).catch(() => ({ rowCount: 0 }));
  if (policy.rowCount === 0) {
    await query("SELECT add_compression_policy('data_points', INTERVAL '7 days')").catch((error) => {
      if (!String(error.message).includes('already exists')) throw error;
    });
  }
  console.log('[4/7] Compression enabled; chunks compress after 7 days');
}

async function ensureRetention() {
  await query("SELECT remove_retention_policy('data_points', if_exists => TRUE)").catch(() => {});
  await query("SELECT add_retention_policy('data_points', INTERVAL '90 days')");
  console.log('[5/7] Retention policy configured; raw data kept for 90 days');
}

async function ensureContinuousAggregate() {
  const existing = await query(
    "SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'data_points_1min'",
  );
  if (existing.rowCount === 0) {
    await query(`CREATE MATERIALIZED VIEW data_points_1min WITH (timescaledb.continuous) AS
      SELECT
        machine_id,
        node_id,
        time_bucket('1 minute', timestamp) AS bucket,
        AVG(value) AS avg_value,
        MIN(value) AS min_value,
        MAX(value) AS max_value,
        COUNT(*) AS sample_count
      FROM data_points
      GROUP BY machine_id, node_id, time_bucket('1 minute', timestamp)`);
  }

  await query("CALL refresh_continuous_aggregate('data_points_1min', NULL, NULL)").catch((error) => {
    if (!String(error.message).includes('already up-to-date')) throw error;
  });
  console.log('[6/7] Continuous aggregate data_points_1min ready');
}

async function printSummary() {
  const hypertable = await query(
    "SELECT num_chunks, compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'data_points'",
  );
  const aggregateRows = await query('SELECT COUNT(*)::int AS count FROM data_points_1min');
  const rawRows = await query('SELECT COUNT(*)::int AS count FROM data_points');

  console.log('[7/7] Verification complete');
  console.log('\n=== Phase 3 Summary ===');
  console.log(`Hypertable chunks: ${hypertable.rows[0]?.num_chunks ?? 0}`);
  console.log(`Compression enabled: ${hypertable.rows[0]?.compression_enabled ?? false}`);
  console.log(`Raw rows: ${rawRows.rows[0].count}`);
  console.log(`1-min aggregate rows: ${aggregateRows.rows[0].count}`);
}

async function main() {
  await ensureTimescaleExtension();
  await ensureHypertable();
  await ensureChunking();
  await ensureCompression();
  await ensureRetention();
  await ensureContinuousAggregate();
  await printSummary();
}

main()
  .catch((error) => {
    console.error('Phase 3 migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
