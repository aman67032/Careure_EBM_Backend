const express = require('express');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Middleware to authenticate patient
const authenticatePatient = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production'
    );

    // Check if token is for a patient
    if (decoded.type !== 'patient') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    // Verify patient exists and is active
    const result = await pool.query(
      'SELECT id, name, patient_credentials_email FROM patients WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Patient not found or inactive' });
    }

    req.patient = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Patient auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get patient profile
router.get('/profile', authenticatePatient, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, age, gender, relationship, allergies, medical_conditions, emergency_contact, doctor_name, doctor_contact, created_at FROM patients WHERE id = $1',
      [req.patient.id]
    );

    res.json({ patient: result.rows[0] });
  } catch (error) {
    console.error('Get patient profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient's medications
router.get('/medications', authenticatePatient, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, 
              STRING_AGG(DISTINCT r.time_slot, ', ' ORDER BY r.time_slot) as time_slots
       FROM medications m
       LEFT JOIN reminders r ON m.id = r.medication_id AND r.is_active = true
       WHERE m.patient_id = $1 AND m.is_active = true
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
      [req.patient.id]
    );

    res.json({ medications: result.rows });
  } catch (error) {
    console.error('Get patient medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get today's doses/reminders
router.get('/doses/today', authenticatePatient, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, m.name as medication_name, m.strength, m.dose_per_intake,
              r.time_slot, r.food_rule
       FROM doses d
       JOIN medications m ON d.medication_id = m.id
       LEFT JOIN reminders r ON d.reminder_id = r.id
       WHERE d.patient_id = $1 
         AND d.scheduled_time::date = CURRENT_DATE
         AND d.status != 'cancelled'
       ORDER BY d.scheduled_time`,
      [req.patient.id]
    );

    res.json({ doses: result.rows });
  } catch (error) {
    console.error('Get today doses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as taken
router.post('/doses/:doseId/taken', authenticatePatient, async (req, res) => {
  try {
    const { doseId } = req.params;
    const { notes } = req.body;

    // Verify dose belongs to patient
    const doseCheck = await pool.query(
      'SELECT id FROM doses WHERE id = $1 AND patient_id = $2',
      [doseId, req.patient.id]
    );

    if (doseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    // Update dose status
    await pool.query(
      `UPDATE doses 
       SET status = 'taken', 
           taken_at = CURRENT_TIMESTAMP,
           notes = COALESCE($1, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [notes, doseId]
    );

    res.json({ message: 'Dose marked as taken' });
  } catch (error) {
    console.error('Mark dose taken error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as missed
router.post('/doses/:doseId/missed', authenticatePatient, async (req, res) => {
  try {
    const { doseId } = req.params;

    // Verify dose belongs to patient
    const doseCheck = await pool.query(
      'SELECT id FROM doses WHERE id = $1 AND patient_id = $2',
      [doseId, req.patient.id]
    );

    if (doseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    // Update dose status
    await pool.query(
      `UPDATE doses 
       SET status = 'missed', 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [doseId]
    );

    res.json({ message: 'Dose marked as missed' });
  } catch (error) {
    console.error('Mark dose missed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient stats
router.get('/stats', authenticatePatient, async (req, res) => {
  try {
    // Get today's stats
    const todayStats = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'taken') as taken,
        COUNT(*) FILTER (WHERE status = 'missed') as missed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM doses 
       WHERE patient_id = $1 AND scheduled_time::date = CURRENT_DATE`,
      [req.patient.id]
    );

    // Get total medications
    const medCount = await pool.query(
      'SELECT COUNT(*) as count FROM medications WHERE patient_id = $1 AND is_active = true',
      [req.patient.id]
    );

    // Get adherence for last 7 days
    const adherence = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'taken') as taken,
        COUNT(*) as total
       FROM doses 
       WHERE patient_id = $1 
         AND scheduled_time >= CURRENT_DATE - INTERVAL '7 days'
         AND scheduled_time < CURRENT_DATE + INTERVAL '1 day'`,
      [req.patient.id]
    );

    res.json({
      today: todayStats.rows[0],
      totalMedications: parseInt(medCount.rows[0].count),
      adherence7Days: adherence.rows[0].total > 0 
        ? Math.round((adherence.rows[0].taken / adherence.rows[0].total) * 100)
        : 0
    });
  } catch (error) {
    console.error('Get patient stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

