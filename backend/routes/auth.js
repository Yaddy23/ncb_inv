const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  loginUser,
  getUserProfile,
  registerUser,
  changePassword,
  adminResetUserPassword,
  updateProfile,
  getAllUsers,
  updateUser,
  deleteUser,
  logoutUser,
  refreshToken,
  getSessions,
  getAllSessions,
  revokeSession,
  revokeAllSessions,
  revokeUserSessions,
  mfaSetup,
  mfaVerify,
  mfaDisable,
  mfaChallenge,
} = require('../controllers/authController');

// Login rate limiter: 10 attempts per 15 minutes per IP (disabled in test environment)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts from this IP. Try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test'
});

// Register rate limiter: 5 attempts per 15 minutes per IP (disabled in test environment)
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many registration attempts from this IP. Try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test'
});

// Refresh rate limiter: 30 attempts per 15 minutes per IP (disabled in test environment)
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many token refresh attempts from this IP. Try again in 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test'
});

// Public routes
router.post('/login', loginLimiter, loginUser);
router.post('/refresh', refreshLimiter, refreshToken);
router.post('/register', protect, admin, registerLimiter, registerUser);

// Protected routes
router.get('/me', protect, getUserProfile);
router.post('/register', protect, admin, registerUser);
router.put('/change-password', protect, changePassword);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logoutUser);

// Session management
router.get('/sessions', protect, getSessions);
router.delete('/sessions', protect, revokeAllSessions);
router.delete('/sessions/:sessionId', protect, revokeSession);

// MFA routes (Admin only)
router.post('/mfa/setup', protect, admin, mfaSetup);
router.post('/mfa/verify', protect, admin, mfaVerify);
router.post('/mfa/disable', protect, admin, mfaDisable);

// Public MFA challenge endpoint (for login completion)
router.post('/mfa/challenge', mfaChallenge);

// Admin only routes - User Management
router.get('/users', protect, admin, getAllUsers);
router.put('/users/:id', protect, admin, updateUser);
router.put('/users/:id/password', protect, admin, adminResetUserPassword);
router.delete('/users/:id', protect, admin, deleteUser);
router.delete('/users/:id/sessions', protect, admin, revokeUserSessions);
router.get('/admin/sessions', protect, admin, getAllSessions);

module.exports = router;