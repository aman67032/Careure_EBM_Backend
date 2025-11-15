const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all alerts for caregiver
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type, is_read, patient_id } = req.query;

    let query = `
      SELECT a.*, p.name as patient_name
      FROM alerts a
      LEFT JOIN patients p ON a.patient_id = p.id
      WHERE a.caregiver_id = $1
    `;
    const params = [req.user.id];
    let paramCount = 1;

    if (type) {
      paramCount++;
      query += ` AND a.alert_type = $${paramCount}`;
      params.push(type);
    }

    if (is_read !== undefined) {
      paramCount++;
      query += ` AND a.is_read = $${paramCount}`;
      params.push(is_read === 'true');
    }

    if (patient_id) {
      paramCount++;
      query += ` AND a.patient_id = $${paramCount}`;
      params.push(patient_id);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);

    res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark alert as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE alerts 
       SET is_read = true 
       WHERE id = $1 AND caregiver_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ message: 'Alert marked as read', alert: result.rows[0] });
  } catch (error) {
    console.error('Mark alert read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all alerts as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE alerts SET is_read = true WHERE caregiver_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({ message: 'All alerts marked as read' });
  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM alerts WHERE caregiver_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

