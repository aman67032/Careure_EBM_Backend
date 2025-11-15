const bcrypt = require('bcryptjs');
const pool = require('../config/database');
require('dotenv').config();

async function createAdmin() {
  try {
    console.log('🔄 Creating admin user...');

    const adminEmail = 'admin@jklu.edu.in';
    const adminPassword = 'Asujam@67';
    const adminName = 'Admin User';

    // Check if admin already exists
    const existingAdmin = await pool.query(
      'SELECT id FROM caregivers WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('✅ Admin user already exists');
      return;
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    // Create admin user
    const result = await pool.query(
      `INSERT INTO caregivers (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, created_at`,
      [adminName, adminEmail, passwordHash, null]
    );

    const admin = result.rows[0];

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', admin.email);
    console.log('🆔 ID:', admin.id);
    console.log('📅 Created:', admin.created_at);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdmin();

