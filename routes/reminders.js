const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const cron = require('node-cron');

const router = express.Router();

// Get reminders for a medication
router.get('/medication/:medicationId', authenticateToken, async (req, res) => {
  try {
    const { medicationId } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT m.id FROM medications m
       JOIN patients p ON m.patient_id = p.id
       WHERE m.id = $1 AND p.caregiver_id = $2`,
      [medicationId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const result = await pool.query(
      'SELECT * FROM reminders WHERE medication_id = $1 AND is_active = true ORDER BY exact_time',
      [medicationId]
    );

    res.json({ reminders: result.rows });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set reminders for a medication
router.post('/medication/:medicationId', authenticateToken, async (req, res) => {
  try {
    const { medicationId } = req.params;
    const { reminders } = req.body; // Array of reminder objects

    // Verify ownership
    const medResult = await pool.query(
      `SELECT m.*, p.id as patient_id FROM medications m
       JOIN patients p ON m.patient_id = p.id
       WHERE m.id = $1 AND p.caregiver_id = $2`,
      [medicationId, req.user.id]
    );

    if (medResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const medication = medResult.rows[0];
    const patientId = medication.patient_id;

    // Delete existing reminders
    await pool.query(
      'UPDATE reminders SET is_active = false WHERE medication_id = $1',
      [medicationId]
    );

    // Create new reminders
    const createdReminders = [];
    for (const reminder of reminders) {
      const result = await pool.query(
        `INSERT INTO reminders (
          medication_id, time_slot, exact_time, time_window_start, time_window_end,
          food_rule, delay_on_meal_missed, notify_device, notify_mobile
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          medicationId,
          reminder.time_slot,
          reminder.exact_time,
          reminder.time_window_start,
          reminder.time_window_end,
          reminder.food_rule,
          reminder.delay_on_meal_missed || false,
          reminder.notify_device !== false,
          reminder.notify_mobile !== false
        ]
      );
      createdReminders.push(result.rows[0]);

      // Schedule doses for next 30 days
      await scheduleDoses(patientId, medicationId, result.rows[0].id, reminder);
    }

    res.status(201).json({
      message: 'Reminders set successfully',
      reminders: createdReminders
    });
  } catch (error) {
    console.error('Set reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to schedule doses
async function scheduleDoses(patientId, medicationId, reminderId, reminder) {
  try {
    const [hours, minutes] = reminder.exact_time.split(':').map(Number);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    console.log(`📅 Scheduling doses for patient ${patientId}, medication ${medicationId}, reminder ${reminderId}, time ${timeStr}`);
    
    // Use PostgreSQL to create dates properly to avoid timezone issues
    // Schedule doses for the next 30 days starting from TODAY (i=0 is today)
    for (let i = 0; i < 30; i++) {
      try {
        // Check if dose already exists for this reminder, patient, and date
        // Use parameterized query for safety
        let existingQuery;
        if (i === 0) {
          // For today, check against CURRENT_DATE directly
          existingQuery = await pool.query(
            `SELECT id FROM doses 
             WHERE reminder_id = $1 
               AND patient_id = $2 
               AND scheduled_time::date = CURRENT_DATE`,
            [reminderId, patientId]
          );
        } else {
          // For future days, use interval
          existingQuery = await pool.query(
            `SELECT id FROM doses 
             WHERE reminder_id = $1 
               AND patient_id = $2 
               AND scheduled_time::date = CURRENT_DATE + $3::interval`,
            [reminderId, patientId, `${i} days`]
          );
        }

        if (existingQuery.rows.length === 0) {
          // Insert the dose
          let insertQuery;
          if (i === 0) {
            // For today, use CURRENT_DATE directly
            insertQuery = await pool.query(
              `INSERT INTO doses (reminder_id, medication_id, patient_id, scheduled_time, status)
               VALUES ($1, $2, $3, 
                 CURRENT_DATE::timestamp + $4::time,
                 'pending'
               )
               RETURNING id, scheduled_time, status`,
              [reminderId, medicationId, patientId, timeStr]
            );
          } else {
            // For future days, add interval
            insertQuery = await pool.query(
              `INSERT INTO doses (reminder_id, medication_id, patient_id, scheduled_time, status)
               VALUES ($1, $2, $3, 
                 (CURRENT_DATE + $4::interval)::timestamp + $5::time,
                 'pending'
               )
               RETURNING id, scheduled_time, status`,
              [reminderId, medicationId, patientId, `${i} days`, timeStr]
            );
          }
          
          const result = insertQuery;
          if (i === 0) {
            console.log(`✅ Created dose for TODAY: ${result.rows[0].scheduled_time}, Status: ${result.rows[0].status}`);
            // Verify it will show up in today's query
            const verifyQuery = await pool.query(
              `SELECT id FROM doses 
               WHERE id = $1 
                 AND scheduled_time::date = CURRENT_DATE`,
              [result.rows[0].id]
            );
            if (verifyQuery.rows.length > 0) {
              console.log(`✅ Verified: Dose will appear in today's schedule`);
            } else {
              console.log(`⚠️ Warning: Dose created but may not match CURRENT_DATE filter`);
            }
          } else {
            console.log(`Created dose for day ${i}: ${result.rows[0].scheduled_time}`);
          }
        } else {
          if (i === 0) {
            console.log(`⚠️ Dose already exists for today`);
          }
        }
      } catch (err) {
        console.error(`❌ Error inserting dose for day ${i}:`, err);
        console.error(`Error details:`, err.message);
        console.error(`Error stack:`, err.stack);
      }
    }
    console.log(`✅ Finished scheduling doses for reminder ${reminderId}`);
  } catch (error) {
    console.error('❌ Schedule doses error:', error);
    console.error('Error stack:', error.stack);
  }
}

// Get today's reminders for a patient
router.get('/patient/:patientId/today', authenticateToken, async (req, res) => {
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

    const result = await pool.query(
      `SELECT d.*, m.name as medication_name, m.strength, m.dose_per_intake,
              r.time_slot, r.food_rule
       FROM doses d
       JOIN medications m ON d.medication_id = m.id
       JOIN reminders r ON d.reminder_id = r.id
       WHERE d.patient_id = $1 
         AND d.scheduled_time::date = CURRENT_DATE
         AND d.status != 'cancelled'
       ORDER BY d.scheduled_time`,
      [patientId]
    );

    res.json({ doses: result.rows });
  } catch (error) {
    console.error('Get today reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as taken
router.post('/dose/:doseId/taken', authenticateToken, async (req, res) => {
  try {
    const { doseId } = req.params;
    const { taken_by = 'manual' } = req.body;

    // Verify ownership
    const doseResult = await pool.query(
      `SELECT d.* FROM doses d
       JOIN patients p ON d.patient_id = p.id
       WHERE d.id = $1 AND p.caregiver_id = $2`,
      [doseId, req.user.id]
    );

    if (doseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    const dose = doseResult.rows[0];
    const delayMinutes = Math.floor((new Date() - new Date(dose.scheduled_time)) / 60000);

    await pool.query(
      `UPDATE doses 
       SET status = 'taken',
           taken_at = CURRENT_TIMESTAMP,
           taken_by = $1,
           delay_minutes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [taken_by, delayMinutes, doseId]
    );

    // Update adherence log
    await updateAdherenceLog(dose.patient_id, dose.medication_id, dose.scheduled_time, 'taken');

    // If delay > 15 minutes, shift future doses
    if (delayMinutes > 15) {
      await shiftFutureDoses(dose.reminder_id, delayMinutes);
    }

    res.json({ message: 'Dose marked as taken' });
  } catch (error) {
    console.error('Mark dose taken error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as missed
router.post('/dose/:doseId/missed', authenticateToken, async (req, res) => {
  try {
    const { doseId } = req.params;

    // Verify ownership
    const doseResult = await pool.query(
      `SELECT d.* FROM doses d
       JOIN patients p ON d.patient_id = p.id
       WHERE d.id = $1 AND p.caregiver_id = $2`,
      [doseId, req.user.id]
    );

    if (doseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    const dose = doseResult.rows[0];

    await pool.query(
      `UPDATE doses 
       SET status = 'missed',
           missed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [doseId]
    );

    // Update adherence log
    await updateAdherenceLog(dose.patient_id, dose.medication_id, dose.scheduled_time, 'missed');

    // Create alert
    await pool.query(
      `INSERT INTO alerts (caregiver_id, patient_id, alert_type, title, message, severity)
       VALUES ($1, $2, 'missed_dose', 'Missed Dose', 
               'Patient missed ${dose.medication_id} dose at scheduled time', 'high')`,
      [req.user.id, dose.patient_id]
    );

    res.json({ message: 'Dose marked as missed' });
  } catch (error) {
    console.error('Mark dose missed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Update adherence log
async function updateAdherenceLog(patientId, medicationId, scheduledTime, status) {
  try {
    const date = scheduledTime.toISOString().split('T')[0];
    
    await pool.query(
      `INSERT INTO adherence_logs (patient_id, medication_id, date, total_doses, taken_doses, missed_doses)
       VALUES ($1, $2, $3, 1, 
               CASE WHEN $4 = 'taken' THEN 1 ELSE 0 END,
               CASE WHEN $4 = 'missed' THEN 1 ELSE 0 END)
       ON CONFLICT (patient_id, medication_id, date)
       DO UPDATE SET
         total_doses = adherence_logs.total_doses + 1,
         taken_doses = adherence_logs.taken_doses + CASE WHEN $4 = 'taken' THEN 1 ELSE 0 END,
         missed_doses = adherence_logs.missed_doses + CASE WHEN $4 = 'missed' THEN 1 ELSE 0 END,
         adherence_percentage = (adherence_logs.taken_doses::DECIMAL / NULLIF(adherence_logs.total_doses, 0) * 100),
         updated_at = CURRENT_TIMESTAMP`,
      [patientId, medicationId, date, status]
    );
  } catch (error) {
    console.error('Update adherence log error:', error);
  }
}

// Helper: Shift future doses if delay > 15 minutes
async function shiftFutureDoses(reminderId, delayMinutes) {
  try {
    await pool.query(
      `UPDATE doses 
       SET scheduled_time = scheduled_time + INTERVAL '${delayMinutes} minutes',
           updated_at = CURRENT_TIMESTAMP
       WHERE reminder_id = $1 
         AND status = 'pending'
         AND scheduled_time > CURRENT_TIMESTAMP`,
      [reminderId]
    );
  } catch (error) {
    console.error('Shift future doses error:', error);
  }
}

module.exports = router;

