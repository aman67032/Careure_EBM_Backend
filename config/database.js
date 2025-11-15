const { Pool } = require('pg');
require('dotenv').config();

// Database configuration - supports both local and Render/cloud deployments
const getDatabaseConfig = () => {
  // If DATABASE_URL is provided (Render/cloud), use it
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    };
  }
  
  // Otherwise, use individual connection parameters (local development)
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'caresure_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: false
  };
};

const pool = new Pool(getDatabaseConfig());

// Test connection
pool.on('connect', () => {
  const dbType = process.env.DATABASE_URL ? 'Cloud' : 'Local';
  console.log(`✅ Connected to ${dbType} PostgreSQL database`);
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;

