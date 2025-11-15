const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateMedication } = require('../middleware/validate');

const router = express.Router();

// Get all medications for a patient
router.get('/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify patient belongs to caregiver
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `SELECT m.*, 
              COUNT(r.id) as reminder_count,
              STRING_AGG(DISTINCT r.time_slot, ', ') as time_slots
       FROM medications m
       LEFT JOIN reminders r ON m.id = r.medication_id AND r.is_active = true
       WHERE m.patient_id = $1 AND m.is_active = true
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
      [patientId]
    );

    res.json({ medications: result.rows });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single medication with reminders
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const medResult = await pool.query(
      `SELECT m.*, p.caregiver_id 
       FROM medications m
       JOIN patients p ON m.patient_id = p.id
       WHERE m.id = $1`,
      [id]
    );

    if (medResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    if (medResult.rows[0].caregiver_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const reminders = await pool.query(
      'SELECT * FROM reminders WHERE medication_id = $1 AND is_active = true ORDER BY exact_time',
      [id]
    );

    res.json({
      medication: medResult.rows[0],
      reminders: reminders.rows
    });
  } catch (error) {
    console.error('Get medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add medication (manual entry)
router.post('/patient/:patientId', authenticateToken, validateMedication, async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      name, strength, dose_per_intake, frequency,
      food_rule, duration_days, notes
    } = req.body;

    // Verify patient belongs to caregiver
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const result = await pool.query(
      `INSERT INTO medications (
        patient_id, name, strength, dose_per_intake, frequency,
        food_rule, duration_days, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [patientId, name, strength, dose_per_intake, frequency,
       food_rule, duration_days, notes]
    );

    res.status(201).json({
      message: 'Medication added successfully',
      medication: result.rows[0]
    });
  } catch (error) {
    console.error('Add medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OCR Prescription Upload (simulated)
router.post('/patient/:patientId/ocr', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { medicines } = req.body; // Array of extracted medicines

    // Verify patient belongs to caregiver
    const patientCheck = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'No medicines found in prescription' });
    }

    // Create medications from OCR results
    const createdMedications = [];
    for (const med of medicines) {
      const result = await pool.query(
        `INSERT INTO medications (
          patient_id, name, strength, dose_per_intake, frequency,
          food_rule, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          patientId,
          med.name || 'Unknown Medicine',
          med.strength || null,
          med.dose_per_intake || '1',
          med.frequency || 'once',
          med.food_rule || null,
          med.notes || 'Extracted from prescription'
        ]
      );
      createdMedications.push(result.rows[0]);
    }

    res.status(201).json({
      message: 'Medications extracted and saved',
      medications: createdMedications
    });
  } catch (error) {
    console.error('OCR medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update medication
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, strength, dose_per_intake, frequency,
      food_rule, duration_days, notes
    } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT m.id FROM medications m
       JOIN patients p ON m.patient_id = p.id
       WHERE m.id = $1 AND p.caregiver_id = $2`,
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const result = await pool.query(
      `UPDATE medications 
       SET name = COALESCE($1, name),
           strength = COALESCE($2, strength),
           dose_per_intake = COALESCE($3, dose_per_intake),
           frequency = COALESCE($4, frequency),
           food_rule = COALESCE($5, food_rule),
           duration_days = COALESCE($6, duration_days),
           notes = COALESCE($7, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, strength, dose_per_intake, frequency, food_rule, duration_days, notes, id]
    );

    res.json({
      message: 'Medication updated successfully',
      medication: result.rows[0]
    });
  } catch (error) {
    console.error('Update medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete medication
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT m.id FROM medications m
       JOIN patients p ON m.patient_id = p.id
       WHERE m.id = $1 AND p.caregiver_id = $2`,
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    await pool.query(
      'UPDATE medications SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({ message: 'Medication deleted successfully' });
  } catch (error) {
    console.error('Delete medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

