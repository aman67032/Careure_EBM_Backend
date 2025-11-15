const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Format validation errors for better client-side handling
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    return res.status(400).json({ 
      error: errorMessages || 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
};

// Validation rules
const validateRegister = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

const validatePatient = [
  body('name').trim().notEmpty().withMessage('Patient name is required'),
  body('age').isInt({ min: 1, max: 150 }).withMessage('Valid age is required'),
  handleValidationErrors
];

const validateMedication = [
  body('name').trim().notEmpty().withMessage('Medicine name is required'),
  body('frequency').notEmpty().withMessage('Frequency is required'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validatePatient,
  validateMedication
};

