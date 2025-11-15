const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get device for a patient
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

    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
      [patientId]
    );

    if (deviceResult.rows.length === 0) {
      return res.json({ device: null, compartments: [] });
    }

    const device = deviceResult.rows[0];

    // Get compartments
    const compartments = await pool.query(
      `SELECT dc.*, m.name as medication_name
       FROM device_compartments dc
       LEFT JOIN medications m ON dc.medication_id = m.id
       WHERE dc.device_id = $1
       ORDER BY dc.compartment_number`,
      [device.id]
    );

    // Get recent events
    const events = await pool.query(
      `SELECT * FROM device_events
       WHERE device_id = $1
       ORDER BY timestamp DESC
       LIMIT 20`,
      [device.id]
    );

    res.json({
      device: {
        ...device,
        compartments: compartments.rows,
        recent_events: events.rows
      }
    });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register/Connect device
router.post('/patient/:patientId/connect', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { device_id, device_name, connection_type = 'wifi' } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Check if device already exists
    let deviceResult = await pool.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (deviceResult.rows.length > 0) {
      // Update existing device
      await pool.query(
        `UPDATE devices 
         SET patient_id = $1, device_name = COALESCE($2, device_name),
             connection_type = $3, is_connected = true,
             last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE device_id = $4`,
        [patientId, device_name, connection_type, device_id]
      );
      deviceResult = await pool.query(
        'SELECT * FROM devices WHERE device_id = $1',
        [device_id]
      );
    } else {
      // Create new device
      deviceResult = await pool.query(
        `INSERT INTO devices (patient_id, device_id, device_name, connection_type, is_connected, last_sync)
         VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
         RETURNING *`,
        [patientId, device_id, device_name, connection_type]
      );
    }

    res.status(201).json({
      message: 'Device connected successfully',
      device: deviceResult.rows[0]
    });
  } catch (error) {
    console.error('Connect device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device status (called by hardware)
router.post('/:deviceId/status', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { battery_level, is_connected, compartments } = req.body;

    // Update device status
    await pool.query(
      `UPDATE devices 
       SET battery_level = COALESCE($1, battery_level),
           is_connected = COALESCE($2, is_connected),
           last_sync = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE device_id = $3`,
      [battery_level, is_connected, deviceId]
    );

    // Update compartments if provided
    if (compartments && Array.isArray(compartments)) {
      const deviceResult = await pool.query(
        'SELECT id FROM devices WHERE device_id = $1',
        [deviceId]
      );

      if (deviceResult.rows.length > 0) {
        const deviceDbId = deviceResult.rows[0].id;

        for (const comp of compartments) {
          await pool.query(
            `INSERT INTO device_compartments (device_id, compartment_number, current_stock, medication_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (device_id, compartment_number)
             DO UPDATE SET current_stock = $3, medication_id = $4, updated_at = CURRENT_TIMESTAMP`,
            [deviceDbId, comp.number, comp.stock, comp.medication_id]
          );
        }
      }
    }

    // Check for low battery
    if (battery_level < 20) {
      const deviceResult = await pool.query(
        'SELECT patient_id FROM devices WHERE device_id = $1',
        [deviceId]
      );

      if (deviceResult.rows.length > 0) {
        const patientId = deviceResult.rows[0].patient_id;
        const caregiverResult = await pool.query(
          'SELECT caregiver_id FROM patients WHERE id = $1',
          [patientId]
        );

        if (caregiverResult.rows.length > 0) {
          await pool.query(
            `INSERT INTO alerts (caregiver_id, patient_id, alert_type, title, message, severity)
             VALUES ($1, $2, 'low_battery', 'Low Battery', 
                     'Device battery is below 20%', 'medium')
             ON CONFLICT DO NOTHING`,
            [caregiverResult.rows[0].caregiver_id, patientId]
          );
        }
      }
    }

    res.json({ message: 'Device status updated' });
  } catch (error) {
    console.error('Update device status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Device event (lid opened, medication taken, etc.)
router.post('/:deviceId/event', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { event_type, compartment_number, event_data } = req.body;

    const deviceResult = await pool.query(
      'SELECT id, patient_id FROM devices WHERE device_id = $1',
      [deviceId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceDbId = deviceResult.rows[0].id;
    const patientId = deviceResult.rows[0].patient_id;

    // Log event
    await pool.query(
      `INSERT INTO device_events (device_id, event_type, compartment_number, event_data)
       VALUES ($1, $2, $3, $4)`,
      [deviceDbId, event_type, compartment_number, JSON.stringify(event_data || {})]
    );

    // If lid opened, try to match with scheduled dose
    if (event_type === 'lid_opened' && compartment_number) {
      const compResult = await pool.query(
        'SELECT medication_id FROM device_compartments WHERE device_id = $1 AND compartment_number = $2',
        [deviceDbId, compartment_number]
      );

      if (compResult.rows.length > 0 && compResult.rows[0].medication_id) {
        const medicationId = compResult.rows[0].medication_id;
        const now = new Date();
        const windowStart = new Date(now.getTime() - 15 * 60000); // 15 min before
        const windowEnd = new Date(now.getTime() + 15 * 60000); // 15 min after

        // Find matching pending dose
        const doseResult = await pool.query(
          `SELECT id FROM doses
           WHERE patient_id = $1 
             AND medication_id = $2
             AND status = 'pending'
             AND scheduled_time BETWEEN $3 AND $4
           ORDER BY ABS(EXTRACT(EPOCH FROM (scheduled_time - $5)))
           LIMIT 1`,
          [patientId, medicationId, windowStart, windowEnd, now]
        );

        if (doseResult.rows.length > 0) {
          // Mark dose as taken
          await pool.query(
            `UPDATE doses 
             SET status = 'taken',
                 taken_at = CURRENT_TIMESTAMP,
                 taken_by = 'device',
                 device_verified = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [doseResult.rows[0].id]
          );

          // Decrease stock
          await pool.query(
            `UPDATE device_compartments 
             SET current_stock = GREATEST(0, current_stock - 1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE device_id = $1 AND compartment_number = $2`,
            [deviceDbId, compartment_number]
          );

          // Check low stock
          const stockResult = await pool.query(
            'SELECT current_stock, low_stock_threshold FROM device_compartments WHERE device_id = $1 AND compartment_number = $2',
            [deviceDbId, compartment_number]
          );

          if (stockResult.rows.length > 0 && 
              stockResult.rows[0].current_stock <= stockResult.rows[0].low_stock_threshold) {
            const caregiverResult = await pool.query(
              'SELECT caregiver_id FROM patients WHERE id = $1',
              [patientId]
            );

            if (caregiverResult.rows.length > 0) {
              await pool.query(
                `INSERT INTO alerts (caregiver_id, patient_id, alert_type, title, message, severity)
                 VALUES ($1, $2, 'low_stock', 'Low Stock Alert', 
                         'Medication in compartment ${compartment_number} is running low', 'medium')
                 ON CONFLICT DO NOTHING`,
                [caregiverResult.rows[0].caregiver_id, patientId]
              );
            }
          }
        }
      }
    }

    res.json({ message: 'Event recorded' });
  } catch (error) {
    console.error('Device event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign medication to compartment
router.post('/patient/:patientId/compartment', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { compartment_number, medication_id, current_stock } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const deviceResult = await pool.query(
      'SELECT id FROM devices WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1',
      [patientId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'No device connected' });
    }

    await pool.query(
      `INSERT INTO device_compartments (device_id, compartment_number, medication_id, current_stock, last_refill)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (device_id, compartment_number)
       DO UPDATE SET medication_id = $3, current_stock = $4, last_refill = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      [deviceResult.rows[0].id, compartment_number, medication_id, current_stock]
    );

    res.json({ message: 'Compartment assigned successfully' });
  } catch (error) {
    console.error('Assign compartment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

