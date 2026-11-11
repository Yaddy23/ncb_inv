const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { roleBasedLimiter } = require('../middleware/rateLimit');
const {
  getMaintenanceStatus,
  toggleMaintenanceMode,
  getMaintenanceSettings
} = require('../controllers/maintenanceController');

// Public endpoint - no auth required
router.get('/status', getMaintenanceStatus);

// Admin only endpoints
router.get('/settings', protect, admin, roleBasedLimiter, getMaintenanceSettings);
router.post('/toggle', protect, admin, roleBasedLimiter, toggleMaintenanceMode);

module.exports = router;