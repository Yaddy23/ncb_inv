const SystemSettings = require('../models/SystemSettings');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to check maintenance mode for non-auth routes
// Allows: all /api/auth/* endpoints (handled in controllers), /api/maintenance/* (admin endpoints have their own auth), /health, /
// During maintenance: allows admin users (verified via JWT) to access all endpoints
// Blocks: non-admin users on other routes during maintenance
const maintenanceCheck = async (req, res, next) => {
  try {
    // Skip check for auth endpoints (handled in controllers)
    if (req.path.startsWith('/api/auth/')) {
      return next();
    }

    // Skip check for maintenance endpoints (admin endpoints have their own protect+admin middleware)
    if (req.path.startsWith('/api/maintenance/')) {
      return next();
    }

    // Skip check for maintenance status, health check, and root
    if (req.path.startsWith('/api/maintenance/status') || req.path === '/health' || req.path === '/') {
      return next();
    }

    // Check maintenance mode
    const maintenanceMode = await SystemSettings.getValue('maintenance_mode', false);

    if (!maintenanceMode) {
      return next();
    }

    // During maintenance, check if user is admin by verifying JWT token
    // Token can be in cookie (accessToken) or Authorization header
    let token;
    if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('role');
        if (user && user.role === 'Admin') {
          // Attach user to req for downstream middleware/controllers
          req.user = user;
          return next();
        }
      } catch (jwtError) {
        // Invalid token, treat as non-admin
      }
    }

    // For non-admin users, return maintenance response
    const message = await SystemSettings.getValue('maintenance_message', 'System is under maintenance. Please check back later.');
    const estimatedEnd = await SystemSettings.getValue('maintenance_estimated_end', null);

    return res.status(503).json({
      maintenanceMode: true,
      message,
      estimatedEnd
    });
  } catch (error) {
    // On error, allow request to proceed (fail-open for availability)
    console.error('Maintenance check error:', error);
    next();
  }
};

// Helper function to check if maintenance mode is active
// Can be used in controllers for more granular control
const isMaintenanceMode = async () => {
  return await SystemSettings.getValue('maintenance_mode', false);
};

const getMaintenanceInfo = async () => {
  const maintenanceMode = await SystemSettings.getValue('maintenance_mode', false);
  const message = await SystemSettings.getValue('maintenance_message', 'System is under maintenance. Please check back later.');
  const estimatedEnd = await SystemSettings.getValue('maintenance_estimated_end', null);
  return { maintenanceMode, message, estimatedEnd };
};

module.exports = { maintenanceCheck, isMaintenanceMode, getMaintenanceInfo };