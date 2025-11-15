const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  }
});

// Get all documents for a patient
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

    const result = await pool.query(
      'SELECT * FROM medical_documents WHERE patient_id = $1 ORDER BY created_at DESC',
      [patientId]
    );

    res.json({ documents: result.rows });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload document
router.post('/patient/:patientId/upload', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { document_type } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND caregiver_id = $2',
      [patientId, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await pool.query(
      `INSERT INTO medical_documents (patient_id, document_type, file_name, file_path, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [patientId, document_type, req.file.originalname, req.file.path, req.user.id]
    );

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT md.* FROM medical_documents md
       JOIN patients p ON md.patient_id = p.id
       WHERE md.id = $1 AND p.caregiver_id = $2`,
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const fs = require('fs');
    const document = checkResult.rows[0];
    
    // Delete file from filesystem
    if (document.file_path && fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    await pool.query('DELETE FROM medical_documents WHERE id = $1', [id]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

