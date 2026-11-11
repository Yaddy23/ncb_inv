const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
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
router.patch('/:isbn/stock', protect, updateStock);

// Dashboard chart + activity feed (accessible to both roles)
router.get('/summary', protect, getStockSummary);
router.get('/recent', protect, getRecentTransactions);

// Bulk import and export (admin only)
router.post('/bulk-import', protect, admin, upload.single('file'), validateFileContent, bulkImportBooks);
router.get('/export', protect, admin, exportBooks);

// Transaction log routes (admin only)
router.get('/transactions', protect, admin, getTransactions);
router.get('/transactions/export', protect, admin, exportTransactions);

module.exports = router;