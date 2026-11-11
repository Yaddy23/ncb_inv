const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { roleBasedLimiter } = require('../middleware/rateLimit');
const { upload, validateFileContent } = require('../utils/fileUpload');
const {
  updateStock,
  bulkImportBooks,
  exportBooks,
  getTransactions,
  exportTransactions,
  getStockSummary,
  getRecentTransactions
} = require('../controllers/stockController');

// Stock update routes (accessible to both roles)
router.patch('/:isbn/stock', protect, roleBasedLimiter, updateStock);

// Dashboard chart + activity feed (accessible to both roles)
router.get('/summary', protect, roleBasedLimiter, getStockSummary);
router.get('/recent', protect, roleBasedLimiter, getRecentTransactions);

// Bulk import and export (admin only)
router.post('/bulk-import', protect, admin, roleBasedLimiter, upload.single('file'), validateFileContent, bulkImportBooks);
router.get('/export', protect, admin, roleBasedLimiter, exportBooks);

// Transaction log routes (admin only)
router.get('/transactions', protect, admin, roleBasedLimiter, getTransactions);
router.get('/transactions/export', protect, admin, roleBasedLimiter, exportTransactions);

module.exports = router;