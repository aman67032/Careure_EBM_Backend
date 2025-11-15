const pool = require('./database');

const initDatabase = async () => {
  try {
    console.log('🔄 Initializing database schema...');

    // Create Caregivers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS caregivers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        emergency_contact VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Patients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        caregiver_id INTEGER REFERENCES caregivers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        age INTEGER,
        gender VARCHAR(20),
        relationship VARCHAR(100),
        allergies TEXT,
        medical_conditions TEXT,
        emergency_contact VARCHAR(255),
        doctor_name VARCHAR(255),
        doctor_contact VARCHAR(255),
        patient_credentials_email VARCHAR(255),
        patient_credentials_password VARCHAR(255),
        password_changed BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add password_changed column if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='patients' AND column_name='password_changed'
          ) THEN
            ALTER TABLE patients ADD COLUMN password_changed BOOLEAN DEFAULT false;
          END IF;
        END $$;
      `);
    } catch (error) {
      // Column might already exist, ignore error
      console.log('Note: password_changed column check completed');
    }

    // Create Medications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medications (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        strength VARCHAR(100),
        dose_per_intake VARCHAR(50),
        frequency VARCHAR(50),
        food_rule VARCHAR(50),
        duration_days INTEGER,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Reminders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        medication_id INTEGER REFERENCES medications(id) ON DELETE CASCADE,
        time_slot VARCHAR(50) NOT NULL,
        exact_time TIME,
        time_window_start TIME,
        time_window_end TIME,
        food_rule VARCHAR(50),
        delay_on_meal_missed BOOLEAN DEFAULT false,
        notify_device BOOLEAN DEFAULT true,
        notify_mobile BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Doses table (tracks each scheduled dose)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doses (
        id SERIAL PRIMARY KEY,
        reminder_id INTEGER REFERENCES reminders(id) ON DELETE CASCADE,
        medication_id INTEGER REFERENCES medications(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        scheduled_time TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        taken_at TIMESTAMP,
        taken_by VARCHAR(50),
        missed_at TIMESTAMP,
        device_verified BOOLEAN DEFAULT false,
        delay_minutes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        device_name VARCHAR(255),
        device_id VARCHAR(255) UNIQUE NOT NULL,
        connection_type VARCHAR(50),
        battery_level INTEGER DEFAULT 100,
        is_connected BOOLEAN DEFAULT false,
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Device Compartments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_compartments (
        id SERIAL PRIMARY KEY,
        device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
        medication_id INTEGER REFERENCES medications(id) ON DELETE SET NULL,
        compartment_number INTEGER NOT NULL,
        current_stock INTEGER DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 5,
        last_refill TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Device Events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_events (
        id SERIAL PRIMARY KEY,
        device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        compartment_number INTEGER,
        event_data JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Alerts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        caregiver_id INTEGER REFERENCES caregivers(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        alert_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        severity VARCHAR(20) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Medical Documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_documents (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        document_type VARCHAR(50),
        file_name VARCHAR(255),
        file_path TEXT,
        uploaded_by INTEGER REFERENCES caregivers(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Medical Cards table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medical_cards (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        qr_code VARCHAR(255) UNIQUE,
        consent_given BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Adherence Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS adherence_logs (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        medication_id INTEGER REFERENCES medications(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        total_doses INTEGER DEFAULT 0,
        taken_doses INTEGER DEFAULT 0,
        missed_doses INTEGER DEFAULT 0,
        late_doses INTEGER DEFAULT 0,
        adherence_percentage DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(patient_id, medication_id, date)
      )
    `);

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_caregiver ON patients(caregiver_id);
      CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_medication ON reminders(medication_id);
      CREATE INDEX IF NOT EXISTS idx_doses_patient ON doses(patient_id);
      CREATE INDEX IF NOT EXISTS idx_doses_scheduled_time ON doses(scheduled_time);
      CREATE INDEX IF NOT EXISTS idx_doses_status ON doses(status);
      CREATE INDEX IF NOT EXISTS idx_devices_patient ON devices(patient_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_caregiver ON alerts(caregiver_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id);
      CREATE INDEX IF NOT EXISTS idx_adherence_patient_date ON adherence_logs(patient_id, date);
    `);

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase;

