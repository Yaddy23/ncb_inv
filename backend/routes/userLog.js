const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { roleBasedLimiter } = require('../middleware/rateLimit');
const {
  getUserLogs,
  exportUserLogs,
  getLogActions,
  getLogUsers
} = require('../controllers/userLogController');

// Admin only routes - User Logs
router.get('/', protect, admin, roleBasedLimiter, getUserLogs);
router.get('/export', protect, admin, roleBasedLimiter, exportUserLogs);
router.get('/actions', protect, admin, roleBasedLimiter, getLogActions);
router.get('/users', protect, admin, roleBasedLimiter, getLogUsers);

module.exports = router;