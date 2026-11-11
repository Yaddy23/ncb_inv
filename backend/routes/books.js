const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { roleBasedLimiter } = require('../middleware/rateLimit');
const {
  getBooks,
  getBookCatalog,
  lookupBookByISBN,
  createBook,
  updateBook,
  deleteBook,
  restoreBook,
  getStats,
  getBookTransactions,
  getOutOfStockBooks,
} = require('../controllers/bookController');

// Public routes (protected but accessible to both roles)
router.get('/', protect, roleBasedLimiter, getBooks);
router.get('/stats', protect, roleBasedLimiter, getStats);
router.get('/out-of-stock', protect, roleBasedLimiter, getOutOfStockBooks);
router.get('/catalog', protect, roleBasedLimiter, getBookCatalog);
router.get('/lookup/:isbn', protect, roleBasedLimiter, lookupBookByISBN);
router.get('/:isbn/transactions', protect, roleBasedLimiter, getBookTransactions);

// Admin only routes
router.post('/', protect, admin, roleBasedLimiter, createBook);
router.put('/:isbn', protect, admin, roleBasedLimiter, updateBook);
router.delete('/:isbn', protect, admin, roleBasedLimiter, deleteBook);
router.put('/:isbn/restore', protect, admin, roleBasedLimiter, restoreBook);

module.exports = router;