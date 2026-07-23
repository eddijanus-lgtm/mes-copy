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

const total = parseInt(process.env.BENCHMARK_COUNT || '10000', 10);
const batchSize = parseInt(process.env.BENCHMARK_BATCH_SIZE || '500', 10);

async function createBenchmarkTable() {
  await pool.query('DROP TABLE IF EXISTS data_points_bench');
  await pool.query(`CREATE TABLE data_points_bench (
    id uuid DEFAULT gen_random_uuid(),
    machine_id text NOT NULL,
    node_id text NOT NULL,
    value double precision NOT NULL,
    quality text DEFAULT 'good',
    timestamp timestamptz DEFAULT now(),
    collected_at timestamptz DEFAULT now()
  )`);
  await pool.query('CREATE UNIQUE INDEX data_points_bench_timestamp_id_idx ON data_points_bench (timestamp, id)');
  await pool.query("SELECT create_hypertable('data_points_bench', 'timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE)");
}

function buildBatch(size) {
  const values = [];
  const params = [];
  for (let i = 0; i < size; i += 1) {
    const offset = i * 5;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
    params.push('benchmark-machine', `node_${i % 4}`, Math.random() * 1000, 'good', new Date());
  }
  return { values: values.join(','), params };
}

async function benchmark() {
  await createBenchmarkTable();

  console.log('\n=== Write Throughput Benchmark ===');
  console.log(`Rows: ${total}`);
  console.log(`Batch size: ${batchSize}`);

  const started = Date.now();
  let inserted = 0;
  while (inserted < total) {
    const currentBatch = Math.min(batchSize, total - inserted);
    const batch = buildBatch(currentBatch);
    await pool.query(
      `INSERT INTO data_points_bench (machine_id, node_id, value, quality, timestamp) VALUES ${batch.values}`,
      batch.params,
    );
    inserted += currentBatch;
  }

  const seconds = (Date.now() - started) / 1000;
  const writesPerSecond = Math.round(total / seconds);
  const size = await pool.query("SELECT pg_size_pretty(pg_total_relation_size('data_points_bench')) AS size");
  const chunks = await pool.query(
    "SELECT num_chunks FROM timescaledb_information.hypertables WHERE hypertable_name = 'data_points_bench'",
  );

  console.log(`\nResult: ${total} rows in ${seconds.toFixed(2)}s = ~${writesPerSecond} writes/sec`);
  console.log(`Chunks: ${chunks.rows[0]?.num_chunks ?? 0}`);
  console.log(`Table size: ${size.rows[0].size}`);

  await pool.query('DROP TABLE IF EXISTS data_points_bench');
}

benchmark()
  .catch((error) => {
    console.error('Benchmark failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
