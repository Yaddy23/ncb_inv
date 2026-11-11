// Security Event Alerting Utility
// R7: Alert on >10 failed logins/min, new admin created, bulk delete, MFA disabled

const UserLog = require('../models/UserLog');

/**
 * Security event types that should trigger alerts
 */
const SECURITY_EVENTS = {
  FAILED_LOGIN_BURST: 'FAILED_LOGIN_BURST',           // >10 failed logins in 1 minute
  NEW_ADMIN_CREATED: 'NEW_ADMIN_CREATED',             // New admin user created
  BULK_DELETE: 'BULK_DELETE',                         // Bulk deletion of records
  MFA_DISABLED: 'MFA_DISABLED',                       // MFA disabled for admin
  ADMIN_LOGIN_NEW_DEVICE: 'ADMIN_LOGIN_NEW_DEVICE',   // Admin login from new device/location
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',         // Generic suspicious activity
};

/**
 * Alert channels - can be extended to email, Slack, webhook, etc.
 */
const ALERT_CHANNELS = {
  LOG: 'log',              // Log to database (UserLog)
  CONSOLE: 'console',      // Console output (development)
  // EMAIL: 'email',        // Future: email alerts
  // WEBHOOK: 'webhook',    // Future: Slack/Discord/webhook
};

/**
 * In-memory store for failed login tracking (per IP)
 * In production, use Redis for distributed tracking
 */
const failedLoginTracker = new Map();

/**
 * Clean up old entries from failed login tracker
 */
const cleanupFailedLoginTracker = () => {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  for (const [key, data] of failedLoginTracker.entries()) {
    if (now - data.windowStart > windowMs) {
      failedLoginTracker.delete(key);
    }
  }
};

// Run cleanup every minute (skip in test environment)
let cleanupInterval = null;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(cleanupFailedLoginTracker, 60 * 1000);
}

/**
 * Stop the cleanup interval (for testing)
 */
const stopCleanupInterval = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

/**
 * Track failed login attempt and check for burst
 * @param {string} ip - Client IP address
 * @param {string} email - Attempted email
 * @returns {Object} { isBurst: boolean, count: number }
 */
const trackFailedLogin = (ip, email) => {
  const key = `failed_login:${ip}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const burstThreshold = 10;  // Alert threshold

  let data = failedLoginTracker.get(key);

  if (!data || now - data.windowStart > windowMs) {
    // New window
    data = {
      count: 1,
      windowStart: now,
      emails: new Set([email]),
      alerted: false
    };
    failedLoginTracker.set(key, data);
  } else {
    // Existing window
    data.count++;
    data.emails.add(email);
  }

  const isBurst = data.count >= burstThreshold && !data.alerted;

  if (isBurst) {
    data.alerted = true; // Only alert once per burst window
    triggerAlert(SECURITY_EVENTS.FAILED_LOGIN_BURST, {
      ip,
      count: data.count,
      emails: Array.from(data.emails),
      windowMinutes: 1,
      threshold: burstThreshold
    });
  }

  return { isBurst, count: data.count };
};

/**
 * Trigger a security alert
 * @param {string} eventType - Type of security event
 * @param {Object} details - Event details
 * @param {Object} req - Express request object (optional, for IP/userAgent)
 */
const triggerAlert = async (eventType, details = {}, req = null) => {
  const alertData = {
    eventType,
    timestamp: new Date(),
    details,
    ipAddress: req ? req.ip : details.ip,
    userAgent: req ? req.get('User-Agent') : details.userAgent,
    severity: getSeverity(eventType)
  };

  // Log to console (always)
  console.warn(`[SECURITY ALERT] ${eventType}:`, JSON.stringify(alertData, null, 2));

  // Log to database (UserLog)
  try {
    await UserLog.create({
      userId: details.userId || null,
      action: `SECURITY_ALERT_${eventType}`,
      details: JSON.stringify(alertData),
      ipAddress: alertData.ipAddress,
      userAgent: alertData.userAgent
    });
  } catch (error) {
    console.error('Failed to log security alert to database:', error);
  }

  // Future: Send to external alerting systems (email, Slack, PagerDuty, etc.)
  // await sendToExternalAlerting(alertData);

  return alertData;
};

/**
 * Get severity level for event type
 */
const getSeverity = (eventType) => {
  const severityMap = {
    [SECURITY_EVENTS.FAILED_LOGIN_BURST]: 'HIGH',
    [SECURITY_EVENTS.NEW_ADMIN_CREATED]: 'HIGH',
    [SECURITY_EVENTS.BULK_DELETE]: 'CRITICAL',
    [SECURITY_EVENTS.MFA_DISABLED]: 'HIGH',
    [SECURITY_EVENTS.ADMIN_LOGIN_NEW_DEVICE]: 'MEDIUM',
    [SECURITY_EVENTS.SUSPICIOUS_ACTIVITY]: 'MEDIUM',
  };
  return severityMap[eventType] || 'LOW';
};

/**
 * Alert: New admin user created
 */
const alertNewAdminCreated = async (adminUser, createdBy, req) => {
  return triggerAlert(SECURITY_EVENTS.NEW_ADMIN_CREATED, {
    newAdminId: adminUser._id,
    newAdminEmail: adminUser.email,
    newAdminUsername: adminUser.username,
    createdBy: createdBy ? {
      id: createdBy._id,
      email: createdBy.email,
      username: createdBy.username
    } : 'system',
    userId: createdBy?._id
  }, req);
};

/**
 * Alert: Bulk delete operation
 */
const alertBulkDelete = async (resourceType, count, deletedBy, req) => {
  return triggerAlert(SECURITY_EVENTS.BULK_DELETE, {
    resourceType,
    count,
    deletedBy: deletedBy ? {
      id: deletedBy._id,
      email: deletedBy.email,
      username: deletedBy.username
    } : 'unknown',
    userId: deletedBy?._id
  }, req);
};

/**
 * Alert: MFA disabled for admin
 */
const alertMfaDisabled = async (adminUser, disabledBy, req) => {
  return triggerAlert(SECURITY_EVENTS.MFA_DISABLED, {
    adminId: adminUser._id,
    adminEmail: adminUser.email,
    adminUsername: adminUser.username,
    disabledBy: disabledBy ? {
      id: disabledBy._id,
      email: disabledBy.email,
      username: disabledBy.username
    } : 'self',
    userId: disabledBy?._id
  }, req);
};

/**
 * Alert: Admin login from new device/location
 */
const alertAdminLoginNewDevice = async (adminUser, deviceInfo, req) => {
  return triggerAlert(SECURITY_EVENTS.ADMIN_LOGIN_NEW_DEVICE, {
    adminId: adminUser._id,
    adminEmail: adminUser.email,
    adminUsername: adminUser.username,
    deviceInfo,
    userId: adminUser._id
  }, req);
};

/**
 * Alert: Generic suspicious activity
 */
const alertSuspiciousActivity = async (activityType, details, req) => {
  return triggerAlert(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
    activityType,
    ...details
  }, req);
};

module.exports = {
  SECURITY_EVENTS,
  ALERT_CHANNELS,
  trackFailedLogin,
  triggerAlert,
  alertNewAdminCreated,
  alertBulkDelete,
  alertMfaDisabled,
  alertAdminLoginNewDevice,
  alertSuspiciousActivity
};