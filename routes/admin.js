const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(isAdmin);

// Helper function to mask sensitive data
const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return email;
  return `${local.substring(0, 2)}***@${domain}`;
};

const maskPhone = (phone) => {
  if (!phone) return '';
  if (phone.length <= 4) return '***';
  return `***${phone.slice(-4)}`;
};

// Get all caregivers (with privacy masking)
router.get('/caregivers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
      FROM caregivers
      ORDER BY created_at DESC
    `);

    // Mask sensitive data for privacy
    const caregivers = result.rows.map(c => ({
      ...c,
      email: maskEmail(c.email),
      phone: maskPhone(c.phone),
    }));

    res.json({ 
      total: caregivers.length,
      caregivers 
    });
  } catch (error) {
    console.error('Get caregivers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all patients (with privacy masking)
router.get('/patients', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.age,
        p.gender,
        p.relationship,
        p.created_at,
        c.name as caregiver_name,
        c.email as caregiver_email
      FROM patients p
      JOIN caregivers c ON p.caregiver_id = c.id
      ORDER BY p.created_at DESC
    `);

    // Mask sensitive data
    const patients = result.rows.map(p => ({
      ...p,
      caregiver_email: maskEmail(p.caregiver_email),
    }));

    res.json({ 
      total: patients.length,
      patients 
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all medications
router.get('/medications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id,
        m.name,
        m.strength,
        m.dose_per_intake,
        m.frequency,
        m.is_active,
        m.created_at,
        p.name as patient_name,
        c.name as caregiver_name
      FROM medications m
      JOIN patients p ON m.patient_id = p.id
      JOIN caregivers c ON p.caregiver_id = c.id
      ORDER BY m.created_at DESC
    `);

    res.json({ 
      total: result.rows.length,
      medications: result.rows 
    });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all alerts
router.get('/alerts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id,
        a.alert_type,
        a.title,
        a.message,
        a.severity,
        a.is_read,
        a.created_at,
        p.name as patient_name,
        c.name as caregiver_name
      FROM alerts a
      JOIN patients p ON a.patient_id = p.id
      JOIN caregivers c ON p.caregiver_id = c.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);

    res.json({ 
      total: result.rows.length,
      alerts: result.rows 
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get login activity (from caregivers table created_at as proxy)
router.get('/login-activity', async (req, res) => {
  try {
    // Get recent registrations (as proxy for login activity)
    const result = await pool.query(`
      SELECT 
        id,
        name,
        email,
        created_at as last_activity,
        'registration' as activity_type
      FROM caregivers
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Mask sensitive data
    const activity = result.rows.map(a => ({
      ...a,
      email: maskEmail(a.email),
    }));

    res.json({ 
      total: activity.length,
      activity 
    });
  } catch (error) {
    console.error('Get login activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [caregivers, patients, medications, alerts] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM caregivers'),
      pool.query('SELECT COUNT(*) as count FROM patients'),
      pool.query('SELECT COUNT(*) as count FROM medications WHERE is_active = true'),
      pool.query('SELECT COUNT(*) as count FROM alerts WHERE is_read = false'),
    ]);

    res.json({
      stats: {
        totalCaregivers: parseInt(caregivers.rows[0].count),
        totalPatients: parseInt(patients.rows[0].count),
        activeMedications: parseInt(medications.rows[0].count),
        unreadAlerts: parseInt(alerts.rows[0].count),
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

