const pool = require('../config/database');

// Check if user is admin (by email or role)
const isAdmin = async (req, res, next) => {
  try {
    // Get admin emails from environment or use default
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim())
      : ['admin@jklu.edu.in', 'admin@caresure.com']; // Default admin emails

    // Check if user email is in admin list
    if (!req.user || !req.user.email) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isAdminUser = adminEmails.includes(req.user.email.toLowerCase());

    if (!isAdminUser) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { isAdmin };

