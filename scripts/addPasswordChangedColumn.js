const pool = require('../config/database');
require('dotenv').config();

const addPasswordChangedColumn = async () => {
  try {
    console.log('🔄 Adding password_changed column to patients table...');
    const client = await pool.connect();

    // Check if column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='patients' AND column_name='password_changed'
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✅ Column password_changed already exists. Skipping.');
      client.release();
      return;
    }

    // Add the column
    await client.query(`
      ALTER TABLE patients 
      ADD COLUMN password_changed BOOLEAN DEFAULT false
    `);

    console.log('✅ Successfully added password_changed column to patients table');
    client.release();
  } catch (error) {
    console.error('❌ Failed to add password_changed column:', error);
    process.exit(1);
  } finally {
    pool.end();
  }
};

addPasswordChangedColumn();

