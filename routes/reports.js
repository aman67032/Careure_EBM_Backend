const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get adherence report for patient
router.get('/patient/:patientId/adherence', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { start_date, end_date, medication_id } = req.query;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let query = `
      SELECT 
        al.date,
        al.medication_id,
        m.name as medication_name,
        al.total_doses,
        al.taken_doses,
        al.missed_doses,
        al.late_doses,
        al.adherence_percentage
      FROM adherence_logs al
      JOIN medications m ON al.medication_id = m.id
      WHERE al.patient_id = $1
    `;
    const params = [patientId];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      query += ` AND al.date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND al.date <= $${paramCount}`;
      params.push(end_date);
    }

    if (medication_id) {
      paramCount++;
      query += ` AND al.medication_id = $${paramCount}`;
      params.push(medication_id);
    }

    query += ' ORDER BY al.date DESC, m.name';

    const result = await pool.query(query, params);

    // Calculate summary
    const summary = {
      total_doses: 0,
      taken_doses: 0,
      missed_doses: 0,
      overall_adherence: 0
    };

    result.rows.forEach(row => {
      summary.total_doses += parseInt(row.total_doses) || 0;
      summary.taken_doses += parseInt(row.taken_doses) || 0;
      summary.missed_doses += parseInt(row.missed_doses) || 0;
    });

    if (summary.total_doses > 0) {
      summary.overall_adherence = (summary.taken_doses / summary.total_doses) * 100;
    }

    res.json({
      adherence_data: result.rows,
      summary
    });
  } catch (error) {
    console.error('Get adherence report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dose history
router.get('/patient/:patientId/doses', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { start_date, end_date, status } = req.query;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    let query = `
      SELECT 
        d.*,
        m.name as medication_name,
        m.strength,
        r.time_slot
      FROM doses d
      JOIN medications m ON d.medication_id = m.id
      LEFT JOIN reminders r ON d.reminder_id = r.id
      WHERE d.patient_id = $1
    `;
    const params = [patientId];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      query += ` AND d.scheduled_time::date >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND d.scheduled_time::date <= $${paramCount}`;
      params.push(end_date);
    }

    if (status) {
      paramCount++;
      query += ` AND d.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY d.scheduled_time DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({ doses: result.rows });
  } catch (error) {
    console.error('Get dose history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard stats
router.get('/patient/:patientId/dashboard', authenticateToken, async (req, res) => {
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

    // Today's stats
    const todayStats = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'taken') as taken,
        COUNT(*) FILTER (WHERE status = 'missed') as missed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) as total
       FROM doses 
       WHERE patient_id = $1 AND scheduled_time::date = CURRENT_DATE`,
      [patientId]
    );

    // Weekly adherence
    const weeklyAdherence = await pool.query(
      `SELECT 
        DATE_TRUNC('day', date) as date,
        AVG(adherence_percentage) as avg_adherence
       FROM adherence_logs
       WHERE patient_id = $1 
         AND date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY DATE_TRUNC('day', date)
       ORDER BY date`,
      [patientId]
    );

    // Upcoming doses (next 24 hours)
    const upcomingDoses = await pool.query(
      `SELECT 
        d.*,
        m.name as medication_name,
        m.strength,
        r.time_slot
       FROM doses d
       JOIN medications m ON d.medication_id = m.id
       LEFT JOIN reminders r ON d.reminder_id = r.id
       WHERE d.patient_id = $1 
         AND d.status = 'pending'
         AND d.scheduled_time > CURRENT_TIMESTAMP
         AND d.scheduled_time <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
       ORDER BY d.scheduled_time
       LIMIT 10`,
      [patientId]
    );

    res.json({
      today_stats: todayStats.rows[0],
      weekly_adherence: weeklyAdherence.rows,
      upcoming_doses: upcomingDoses.rows
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

