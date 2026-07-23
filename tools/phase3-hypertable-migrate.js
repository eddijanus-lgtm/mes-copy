#!/usr/bin/env node
require('dotenv').config();

const { Pool, Client } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME || 'mes_admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'mes_production',
});

async function run() {
  console.log('=== Phase 3: Hypertable Migration ===\n');

  const client = new Client(pool.defaults);
  await client.connect();

  try {
    // --- Check if TimescaleDB extension is available ---
    const extCheck = await client.query(`SELECT * FROM pg_extension WHERE extname = 'timescaledb'`);
    if (extCheck.rowCount === 0) {
      console.log('[1/6] Creating timescaledb extension...');
      await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
      console.log('  ✓ Extension created.\n');
    } else {
      console.log('[1/6] timescaledb already installed.\n');
    }

    // --- Convert data_points to Hypertable ---
    const tableCheck = await client.query(`SELECT hypertable_name FROM timescaledb_information.hypertables WHERE table_name = 'data_points'`);
    if (tableCheck.rowCount === 0) {
      console.log('[2/6] Creating Hypertable for data_points...');
      // First add chunk_time_interval if not exists
      await client.query(`SELECT create_hypertable('data_points', 'timestamp', chunk_time_interval => '1 day', if_not_exists => TRUE);`);
      console.log('  ✓ Hypertable created (daily chunks).\n');
    } else {
      console.log('[2/6] data_points is already a hypertable.\n');
    }

    // --- Compression: enable on chunk history older than 7 days ---
    const compCheck = await client.query(`SELECT true FROM pg_options WHERE option_name = 'compression_enabled' AND obj_description(pg_class.oid, 'pg_class') IS NOT NULL`);
    const compQuery = await client.query(`SELECT result FROM compression_compression_policies;`);
    
    if (compQuery.rowCount === 0) {
      console.log('[3/6] Enabling compression for chunks older than 7 days...');
      await client.query(`SELECT set_chunk_time_interval('data_points', INTERVAL '1 day');`);
      await client.query(`ALTER TABLE data_points SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'machine_id,node_id',
        timescaledb.compress_orderby = 'timestamp DESC'
      );`);
      await client.query(`SELECT add_compression_policy('data_points', INTERVAL '7 days');`);
      console.log('  ✓ Compression policy added.\n');
    } else {
      console.log('[3/6] Compression already configured.\n');
    }

    // --- Continuous Aggregates: 1-minute averages per machine/node ---
    console.log('[4/6] Creating continuous aggregate (1-min average)...');
    await client.query(`DROP MATERIALIZED VIEW IF EXISTS data_points_1min;`);
    await client.query(`CREATE MATERIALIZED VIEW data_points_1min
      WITH (timescaledb.continuous) AS
      SELECT
        machine_id,
        node_id,
        time_bucket('1 minute', timestamp) AS bucket,
        AVG(value) AS avg_value,
        MIN(value) AS min_value,
        MAX(value) AS max_value,
        COUNT(*) AS sample_count
      FROM data_points
      GROUP BY machine_id, node_id, time_bucket('1 minute', timestamp);`);
    await client.query(`GRANT SELECT ON data_points_1min TO PUBLIC;`);
    console.log('  ✓ Continuous aggregate created.\n');

    // --- Retention Policy: drop raw data older than 90 days ---
    const retCheck = await client.query(`SELECT remove_retention_policy('data_points', if_exists => TRUE);`);
    await client.query(`SELECT add_retention_policy('data_points', INTERVAL '90 days');`);
    console.log('[5/6] Retention policy: raw data dropped after 90 days.\n');

    // --- Refresh continuous aggregate ---
    console.log('[6/6] Refreshing continuous aggregate...');
    await client.query(`REFRESH_MAT_VIEW data_points_1min;`);
    console.log('  ✓ Aggregate refreshed.\n');

    // --- Summary ---
    const htSummary = await client.query(`SELECT hypertable_name, num_chunks FROM timescaledb_information.hypertables WHERE table_name = 'data_points'`);
    const row = (await htSummary).rows[0];
    console.log('=== Migration Summary ===');
    console.log(`Hypertable: ${row?.hypertable_name || '(none)'}`);
    console.log(`Chunks: ${row?.num_chunks || 0}`);
    const matView = await client.query(`SELECT COUNT(*) FROM data_points_1min`);
    console.log(`Continuous aggregate rows (1-min avg): ${(await matView).rows[0].count}`);
    const tableRows = await client.query(`SELECT COUNT(*) FROM data_points`);
    console.log(`Raw data points: ${(await tableRows).rows[0].count}`);
    console.log('\n✅ Phase 3 migration complete.');

  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
