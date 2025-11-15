const initDatabase = require('../config/initDatabase');
const pool = require('../config/database');

async function runInit() {
  try {
    console.log('🔄 Starting database initialization...');
    await initDatabase();
    console.log('✅ Database initialization completed successfully!');
    
    // Verify tables were created
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

runInit();

