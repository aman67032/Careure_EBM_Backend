const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validatePatient } = require('../middleware/validate');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

// Get all patients for caregiver
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
              COUNT(DISTINCT m.id) as medication_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'taken' AND d.scheduled_time::date = CURRENT_DATE) as today_taken,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'missed' AND d.scheduled_time::date = CURRENT_DATE) as today_missed
       FROM patients p
       LEFT JOIN medications m ON p.id = m.patient_id AND m.is_active = true
       LEFT JOIN doses d ON p.id = d.patient_id
       WHERE p.caregiver_id = $1 AND p.is_active = true
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json({ patients: result.rows });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single patient
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify patient belongs to caregiver
    const patientResult = await pool.query(
      'SELECT * FROM patients WHERE id = $1 AND caregiver_id = $2',
      [id, req.user.id]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];

    // Get medications count
    const medCount = await pool.query(
      'SELECT COUNT(*) FROM medications WHERE patient_id = $1 AND is_active = true',
      [id]
    );

    // Get today's adherence
    const todayDoses = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'taken') as taken,
        COUNT(*) FILTER (WHERE status = 'missed') as missed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM doses 
       WHERE patient_id = $1 AND scheduled_time::date = CURRENT_DATE`,
      [id]
    );

    // Get device status
    const device = await pool.query(
      'SELECT * FROM devices WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
      [id]
    );

    res.json({
      patient: {
        ...patient,
        medication_count: parseInt(medCount.rows[0].count),
        today_stats: todayDoses.rows[0],
        device: device.rows[0] || null
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create patient (paid feature - 50rs)
router.post('/', authenticateToken, validatePatient, async (req, res) => {
  try {
    const {
      name,
      age,
      gender,
      relationship,
      allergies,
      medical_conditions,
      emergency_contact,
      doctor_name,
      doctor_contact
    } = req.body;

    // Generate patient credentials
    const patientEmail = `patient_${crypto.randomBytes(8).toString('hex')}@caresure.local`;
    // Generate a more user-friendly password (alphanumeric + some special chars, no problematic base64 chars)
    const passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let patientPassword = '';
    for (let i = 0; i < 12; i++) {
      patientPassword += passwordChars.charAt(Math.floor(Math.random() * passwordChars.length));
    }
    const passwordHash = await bcrypt.hash(patientPassword, 10);

    // Create patient
    const result = await pool.query(
      `INSERT INTO patients (
        caregiver_id, name, age, gender, relationship, allergies, 
        medical_conditions, emergency_contact, doctor_name, doctor_contact,
        patient_credentials_email, patient_credentials_password
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.user.id, name, age, gender, relationship, allergies,
        medical_conditions, emergency_contact, doctor_name, doctor_contact,
        patientEmail, passwordHash
      ]
    );

    const patient = result.rows[0];

    // Note: In production, integrate payment gateway here (50rs charge)
    // For now, we'll just create the patient

    res.status(201).json({
      message: 'Patient created successfully',
      patient: {
        ...patient,
        patient_credentials: {
          email: patientEmail,
          password: patientPassword // Only shown once
        }
      }
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, age, gender, relationship, allergies,
      medical_conditions, emergency_contact, doctor_name, doctor_contact
    } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `UPDATE patients 
       SET name = COALESCE($1, name),
           age = COALESCE($2, age),
           gender = COALESCE($3, gender),
           relationship = COALESCE($4, relationship),
           allergies = COALESCE($5, allergies),
           medical_conditions = COALESCE($6, medical_conditions),
           emergency_contact = COALESCE($7, emergency_contact),
           doctor_name = COALESCE($8, doctor_name),
           doctor_contact = COALESCE($9, doctor_contact),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [name, age, gender, relationship, allergies, medical_conditions,
       emergency_contact, doctor_name, doctor_contact, id]
    );

    res.json({
      message: 'Patient updated successfully',
      patient: result.rows[0]
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete patient (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await pool.query(
      'UPDATE patients SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

