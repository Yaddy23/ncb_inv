const mongoose = require('mongoose');

const userLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT',
      'CREATE_USER',
      'UPDATE_USER',
      'DELETE_USER',
      'RESET_USER_PASSWORD',
      'EXPORT_LOGS',
      'CREATE_BOOK',
      'UPDATE_BOOK',
      'DELETE_BOOK',
      'ARCHIVE_BOOK',
      'RESTORE_BOOK',
      'INBOUND_STOCK',
      'OUTBOUND_STOCK',
      'BULK_IMPORT',
      'EXPORT_BOOKS',
      'EXPORT_STOCK_TRANSACTIONS',
      'CREATE_DR',
      'UPDATE_DR',
      'DELETE_DR',
      'ISSUE_DR',
      'CREATE_SI',
      'UPDATE_SI',
      'DELETE_SI',
      'ISSUE_SI',
      'CREATE_EF',
      'UPDATE_EF',
      'DELETE_EF',
      'ISSUE_EF',
      'CANCEL_DR',
      'DELIVER_DR',
      'RETURN_DR',
      'CANCEL_SI',
      'CANCEL_EF',
      'EXPIRE_RESERVATIONS',
      'REVOKE_SESSION',
      'REVOKE_ALL_SESSIONS',
      'MFA_ENABLE',
      'MFA_DISABLE',
      'SECURITY_ALERT_FAILED_LOGIN_BURST',
      'SECURITY_ALERT_NEW_ADMIN_CREATED',
      'SECURITY_ALERT_BULK_DELETE',
      'SECURITY_ALERT_MFA_DISABLED',
      'SECURITY_ALERT_ADMIN_LOGIN_NEW_DEVICE',
      'SECURITY_ALERT_SUSPICIOUS_ACTIVITY'
    ]
  },
  details: {
    type: String
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster querying (createdAt is mongoose's timestamps field;
// the old timestamp indexes pointed at a field that never existed)
userLogSchema.index({ userId: 1, createdAt: -1 });
userLogSchema.index({ action: 1 });
userLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UserLog', userLogSchema);