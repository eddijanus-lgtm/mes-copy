require('dotenv').config();

const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function createAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password || password.length < 12) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (minimum 12 characters) before running this command.');
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'mes_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'mes_production',
  });

  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (existing.rowCount) throw new Error(`User '${username}' already exists.`);

    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      'INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)',
      [randomUUID(), username, passwordHash, 'admin'],
    );
    console.log(`Admin user '${username}' created.`);
  } finally {
    await client.end();
  }
}

createAdmin().catch((error) => {
  console.error('Admin creation failed:', error.message);
  process.exit(1);
});
