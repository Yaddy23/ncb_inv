const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Role-based rate limiter for authenticated routes
 * Admins: 500 requests per 15 minutes
 * Regular users: 100 requests per 15 minutes
 * Uses user ID as the key (not IP) since user is authenticated
 */
const roleBasedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Dynamic limit based on user role
  limit: (req, res) => {
    if (req.user && req.user.role === 'Admin') {
      return 500; // Admin limit
    }
    return 100; // Regular user limit
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Use user ID as the key instead of IP, fallback to IP with proper IPv6 handling
  keyGenerator: (req) => {
    return req.user ? `user:${req.user._id}` : ipKeyGenerator(req);
  },
  // Custom message based on role
  message: (req, res) => {
    const isAdmin = req.user && req.user.role === 'Admin';
    const limit = isAdmin ? 500 : 100;
    return { message: `Too many requests. Limit: ${limit} per 15 minutes.` };
  },
  // Skip in test environment
  skip: () => process.env.NODE_ENV === 'test'
});

module.exports = { roleBasedLimiter };