const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Generate medical card for patient
router.post('/patient/:patientId/generate', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { consent_given = false } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!consent_given) {
      return res.status(400).json({ error: 'Data sharing consent required' });
    }

    // Generate QR code
    const qrCode = `CARESURE_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Valid for 1 year

    // Check if card exists
    const existingCard = await pool.query(
      'SELECT * FROM medical_cards WHERE patient_id = $1 AND is_active = true',
      [patientId]
    );

    let card;
    if (existingCard.rows.length > 0) {
      // Update existing card
      await pool.query(
        `UPDATE medical_cards 
         SET qr_code = $1, consent_given = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP
         WHERE patient_id = $4`,
        [qrCode, consent_given, expiresAt, patientId]
      );
      card = existingCard.rows[0];
      card.qr_code = qrCode;
    } else {
      // Create new card
      const result = await pool.query(
        `INSERT INTO medical_cards (patient_id, qr_code, consent_given, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [patientId, qrCode, consent_given, expiresAt]
      );
      card = result.rows[0];
    }

    // Get patient data for card
    const patientResult = await pool.query(
      'SELECT * FROM patients WHERE id = $1',
      [patientId]
    );

    const medicationsResult = await pool.query(
      `SELECT m.*, STRING_AGG(r.time_slot, ', ') as time_slots
       FROM medications m
       LEFT JOIN reminders r ON m.id = r.medication_id AND r.is_active = true
       WHERE m.patient_id = $1 AND m.is_active = true
       GROUP BY m.id`,
      [patientId]
    );

    res.json({
      message: 'Medical card generated successfully',
      card: {
        ...card,
        patient: patientResult.rows[0],
        medications: medicationsResult.rows
      }
    });
  } catch (error) {
    console.error('Generate medical card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get medical card
router.get('/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const cardResult = await pool.query(
      'SELECT * FROM medical_cards WHERE patient_id = $1 AND is_active = true',
      [patientId]
    );

    if (cardResult.rows.length === 0) {
      return res.json({ card: null });
    }

    const card = cardResult.rows[0];

    // Get patient data
    const patientResult = await pool.query(
      'SELECT * FROM patients WHERE id = $1',
      [patientId]
    );

    const medicationsResult = await pool.query(
      `SELECT m.*, STRING_AGG(r.time_slot, ', ') as time_slots
       FROM medications m
       LEFT JOIN reminders r ON m.id = r.medication_id AND r.is_active = true
       WHERE m.patient_id = $1 AND m.is_active = true
       GROUP BY m.id`,
      [patientId]
    );

    res.json({
      card: {
        ...card,
        patient: patientResult.rows[0],
        medications: medicationsResult.rows
      }
    });
  } catch (error) {
    console.error('Get medical card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public view (for doctors scanning QR)
router.get('/qr/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;

    const cardResult = await pool.query(
      `SELECT * FROM medical_cards 
       WHERE qr_code = $1 
         AND is_active = true 
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [qrCode]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medical card not found or expired' });
    }

    const card = cardResult.rows[0];

    if (!card.consent_given) {
      return res.status(403).json({ error: 'Data sharing consent not given' });
    }

    // Get patient data (limited info for privacy)
    const patientResult = await pool.query(
      `SELECT name, age, gender, allergies, medical_conditions, emergency_contact
       FROM patients WHERE id = $1`,
      [card.patient_id]
    );

    const medicationsResult = await pool.query(
      `SELECT m.name, m.strength, m.dose_per_intake, m.frequency,
              STRING_AGG(r.time_slot, ', ') as time_slots
       FROM medications m
       LEFT JOIN reminders r ON m.id = r.medication_id AND r.is_active = true
       WHERE m.patient_id = $1 AND m.is_active = true
       GROUP BY m.id`,
      [card.patient_id]
    );

    res.json({
      card: {
        qr_code: card.qr_code,
        patient: patientResult.rows[0],
        medications: medicationsResult.rows,
        generated_at: card.created_at
      }
    });
  } catch (error) {
    console.error('Get QR medical card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

