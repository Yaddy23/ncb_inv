const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['Admin', 'Staff'],
    default: 'Staff'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  lastLoginAt: {
    type: Date
  },
  // TOTP MFA fields (for Admin role)
  mfaEnabled: {
    type: Boolean,
    default: false
  },
  mfaSecret: {
    type: String
  },
  // Refresh token fields for session management
  refreshToken: {
    type: String
  },
  refreshTokenExpires: {
    type: Date
  },
  // Session tracking for revocation
  sessions: [{
    refreshTokenHash: String,
    userAgent: String,
    ipAddress: String,
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Text index for regex-injection-safe search on username and email
userSchema.index({ username: 'text', email: 'text' });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate access token (short-lived: 15 minutes)
userSchema.methods.generateAccessToken = function() {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// Generate refresh token (long-lived: 7 days)
userSchema.methods.generateRefreshToken = function() {
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Store hashed token in user's sessions
  this.sessions.push({
    refreshTokenHash: hashedToken,
    userAgent: this._tempUserAgent || null,
    ipAddress: this._tempIpAddress || null,
    createdAt: new Date(),
    lastUsedAt: new Date()
  });

  // Also store current refresh token for backward compatibility
  this.refreshToken = hashedToken;
  this.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return refreshToken;
};

// Verify refresh token
userSchema.methods.verifyRefreshToken = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Check current refresh token (backward compatibility)
  if (this.refreshToken === hashedToken && this.refreshTokenExpires > new Date()) {
    return true;
  }

  // Check sessions array
  const session = this.sessions.find(s => s.refreshTokenHash === hashedToken);
  if (session) {
    session.lastUsedAt = new Date();
    return true;
  }

  return false;
};

// Revoke a specific session (by refresh token)
userSchema.methods.revokeSession = function(token) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Remove from sessions array
  this.sessions = this.sessions.filter(s => s.refreshTokenHash !== hashedToken);

  // Clear current refresh token if it matches
  if (this.refreshToken === hashedToken) {
    this.refreshToken = undefined;
    this.refreshTokenExpires = undefined;
  }
};

// Revoke all sessions
userSchema.methods.revokeAllSessions = function() {
  this.sessions = [];
  this.refreshToken = undefined;
  this.refreshTokenExpires = undefined;
};

// Clean up expired sessions
userSchema.methods.cleanExpiredSessions = function() {
  const now = new Date();
  this.sessions = this.sessions.filter(s => {
    // Sessions expire after 7 days of inactivity
    return s.lastUsedAt > new Date(now - 7 * 24 * 60 * 60 * 1000);
  });
};

module.exports = mongoose.model('User', userSchema);