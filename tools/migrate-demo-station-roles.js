require('dotenv').config({ quiet: true });
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
    const machines = await client.query(`
      UPDATE machines SET
        name = CASE resource_id WHEN 1 THEN 'S01 Kugelbefuellung' ELSE 'S02 Deckelbereitstellung' END,
        type = CASE resource_id WHEN 1 THEN 'ball_dispenser' ELSE 'lid_feeder' END
      WHERE (resource_id = 1 AND name IN ('S01 Deckelzufuehrung', 'S01 Deckelzuführung'))
         OR (resource_id = 2 AND name = 'S02 Kugeldosierung')
    `);
    const routes = await client.query(`
      UPDATE order_route_steps AS step SET operation =
        CASE step.resource_id WHEN 1 THEN 'Kugeln dosieren' ELSE 'Deckelfarbe bereitstellen' END
      FROM orders AS production_order
      WHERE step.order_id = production_order.id
        AND step.resource_id IN (1, 2)
        AND step.operation = CASE step.resource_id WHEN 1 THEN 'Deckelfarbe bereitstellen' ELSE 'Kugeln dosieren' END
        AND production_order.status IN ('pending', 'in_progress')
        AND production_order.completed_quantity = 0
        AND NOT EXISTS (
          SELECT 1 FROM carriers AS carrier WHERE carrier.order_id = production_order.id
            AND (carrier.status <> 'assigned' OR carrier.current_step_no <> 1 OR carrier.current_resource_id IS NOT NULL)
        )
    `);
    await client.query('COMMIT');
    console.log(`Updated ${machines.rowCount} demo stations and ${routes.rowCount} unstarted route steps.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
