const { Pool } = require('pg');
require('dotenv').config();

// Configure SSL based on environment
// Railway PostgreSQL requires SSL in production
const sslConfig = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('railway')
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

// Test connection
pool.on('connect', () => {
  const dbType = process.env.DATABASE_URL?.includes('railway') ? 'Railway' : 'Neon';
  console.log(`✅ Connected to ${dbType} PostgreSQL database`);
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;

