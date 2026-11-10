const crypto = require('crypto');

// Double-submit cookie pattern: CSRF token in httpOnly cookie + X-CSRF-Token header
const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

const csrfProtection = (req, res, next) => {
  // Make CSRF token available to views if needed
  res.locals.csrfToken = req.cookies?.csrfToken;

  // Only validate CSRF on unsafe methods (mutating requests)
  const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!unsafeMethods.includes(req.method)) {
    return next();
  }

  // Get CSRF token from header (double-submit pattern)
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.csrfToken;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ message: 'Invalid or missing CSRF token' });
  }

  next();
};

// Middleware to expose CSRF token for initial page loads (GET requests)
// This ensures the cookie is set before any form submission
const ensureCsrfCookie = (req, res, next) => {
  if (!req.cookies?.csrfToken) {
    const token = generateCsrfToken();
    res.cookie('csrfToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });
  }
  res.locals.csrfToken = req.cookies?.csrfToken;
  next();
};

module.exports = { csrfProtection, ensureCsrfCookie, generateCsrfToken };