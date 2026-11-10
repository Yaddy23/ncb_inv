const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const UserLog = require('../models/UserLog');

// Cookie options for httpOnly cookies
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};

// Generate access token (short-lived: 15 minutes)
const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// Set auth cookies helper
const setAuthCookies = (res, accessToken, refreshToken, csrfToken) => {
  // Access token cookie (15 minutes)
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  // Refresh token cookie (7 days)
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // CSRF token cookie (24 hours)
  res.cookie('csrfToken', csrfToken, {
    ...cookieOptions,
    maxAge: 24 * 60 * 60 * 1000,
  });
};

// Clear auth cookies helper
const clearAuthCookies = (res) => {
  res.cookie('accessToken', '', { ...cookieOptions, maxAge: 0 });
  res.cookie('refreshToken', '', { ...cookieOptions, maxAge: 0 });
  res.cookie('csrfToken', '', { ...cookieOptions, maxAge: 0 });
};

// Generate refresh token (long-lived: 7 days)
const generateRefreshToken = (user, req) => {
  // Store request info temporarily for session tracking
  user._tempUserAgent = req ? req.get('User-Agent') : null;
  user._tempIpAddress = req ? req.ip : null;

  const refreshToken = user.generateRefreshToken();

  // Clean up temp properties
  delete user._tempUserAgent;
  delete user._tempIpAddress;

  return refreshToken;
};

// Hash refresh token for storage comparison
const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Helper function to log user activities
const logUserActivity = async (userId, action, details = '', req = null) => {
  try {
    const logEntry = new UserLog({
      userId,
      action,
      details,
      ipAddress: req ? req.ip : null,
      userAgent: req ? req.get('User-Agent') : null,
    });
    await logEntry.save();
  } catch (error) {
    console.error('Failed to log user activity:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

// Password strength validation
const validatePasswordStrength = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
};

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      // Generic message to avoid user enumeration
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        message: `Account temporarily locked due to failed attempts. Try again in ${minutesLeft} minute(s).`
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact an administrator.' });
    }

    const passwordOk = await user.comparePassword(password);

    if (!passwordOk) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
      }

      await user.save();

      // Log failed login attempt
      await logUserActivity(user._id, 'LOGIN', `Failed login attempt - invalid password`, req);

      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Successful login - reset failed attempts
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    // Clean up expired sessions
    user.cleanExpiredSessions();

    // Stamp last login time
    user.lastLoginAt = new Date();

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user, req);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    await user.save();

    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken, csrfToken);

    // Log successful login
    await logUserActivity(user._id, 'LOGIN', `User logged in successfully`, req);

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = async (req, res) => {
  res.json({
    _id: req.user._id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
    isActive: req.user.isActive,
  });
};

// @desc    Register new user (Admin only)
// @route   POST /api/auth/register
// @access  Private/Admin
const registerUser = async (req, res) => {
  const { username, email, password, role } = req.body;

  // Validate password strength
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const userExists = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    const user = await User.create({
      username,
      email,
      password,
      role: role || 'Staff',
    });

    if (user) {
      // Generate tokens for the new user
      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user, req);
      const csrfToken = crypto.randomBytes(32).toString('hex');
      await user.save();

      // Set httpOnly cookies
      setAuthCookies(res, accessToken, refreshToken, csrfToken);

      // Log user creation
      await logUserActivity(req.user._id, 'CREATE_USER', `Created new user: ${username} (${role || 'Staff'})`, req);

      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        accessToken,
        refreshToken,
      });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Validate new password strength
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    // Check if current password matches
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(400);
      throw new Error('Current password is incorrect');
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Admin: Reset a user's password (revokes all their sessions)
// @route   PUT /api/auth/users/:id/password
// @access  Private/Admin
const adminResetUserPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  // Validate new password strength (same rules as register/change-password)
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    // Admins use the change-password endpoint for their own account
    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Use the change-password endpoint for your own account' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update password (will be hashed by pre-save middleware) and revoke all
    // sessions - a reset without revocation is moot for anyone holding a
    // valid refresh token
    user.password = newPassword;
    user.revokeAllSessions();
    await user.save();

    // Log admin action
    await logUserActivity(req.user._id, 'RESET_USER_PASSWORD', `Reset password for user ${user.username} (all sessions revoked)`, req);

    res.json({ message: `Password reset for ${user.username}. All their sessions were revoked.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  const { username, email } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    // Check if username or email already exists for another user
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
      _id: { $ne: req.user._id }
    });

    if (existingUser) {
      res.status(400);
      throw new Error('Username or email already in use');
    }

    user.username = username || user.username;
    user.email = email || user.email;
    await user.save();

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Logout user (revoke current session)
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user) {
          // Revoke the current session based on the access token
          // We can't directly revoke by access token, but we can revoke all sessions for security
          // Or we could store the refresh token hash in the access token payload
          user.cleanExpiredSessions();
          await user.save();
        }
      } catch (e) {
        // Token might be expired, ignore
      }
    }

    // Clear httpOnly cookies
    clearAuthCookies(res);

    // Log logout
    await logUserActivity(req.user._id, 'LOGOUT', `User logged out`, req);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Refresh access token using refresh token
// @route   POST /api/auth/refresh
// @access  Public (requires valid refresh token)
const refreshToken = async (req, res) => {
  // Support both cookie-based and body-based refresh tokens
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    const hashedToken = hashRefreshToken(refreshToken);

    // Find user with this refresh token
    const user = await User.findOne({
      $or: [
        { refreshToken: hashedToken, refreshTokenExpires: { $gt: new Date() } },
        { 'sessions.refreshTokenHash': hashedToken }
      ]
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Verify the refresh token using the user model method
    if (!user.verifyRefreshToken(refreshToken)) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Check if account is still active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact an administrator.' });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id);

    // Rotate refresh token (generate new one, revoke old)
    const newRefreshToken = generateRefreshToken(user, req);
    const newCsrfToken = crypto.randomBytes(32).toString('hex');
    await user.save();

    // Set new httpOnly cookies (rotation)
    setAuthCookies(res, newAccessToken, newRefreshToken, newCsrfToken);

    // Log token refresh
    await logUserActivity(user._id, 'LOGIN', `Access token refreshed`, req);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get current user's active sessions
// @route   GET /api/auth/sessions
// @access  Private
const getSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('sessions');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clean expired sessions
    user.cleanExpiredSessions();
    await user.save();

    // Return sessions without the token hashes
    const sessions = user.sessions.map(session => ({
      _id: session._id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      isCurrent: false // Could be determined by comparing token hashes
    }));

    res.json({ sessions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all active sessions across all users (Admin only)
// @route   GET /api/auth/admin/sessions
// @access  Private/Admin
const getAllSessions = async (req, res) => {
  try {
    // Find all users with active sessions
    const users = await User.find({
      'sessions.0': { $exists: true }
    }).select('username email sessions');

    const allSessions = [];
    for (const user of users) {
      // Clean expired sessions
      user.cleanExpiredSessions();

      for (const session of user.sessions) {
        allSessions.push({
          _id: session._id,
          userId: user._id,
          username: user.username,
          email: user.email,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt
        });
      }
    }

    // Sort by lastUsedAt descending (most recent first)
    allSessions.sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt));

    // Save users with cleaned sessions
    await Promise.all(users.map(u => u.save()));

    res.json({ sessions: allSessions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Revoke a specific session
// @route   DELETE /api/auth/sessions/:sessionId
// @access  Private
const revokeSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the session by ID
    const session = user.sessions.id(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Revoke the session by removing it
    user.sessions.pull(sessionId);
    await user.save();

    // Log session revocation
    await logUserActivity(req.user._id, 'LOGOUT', `Revoked session from ${session.userAgent || 'unknown device'}`, req);

    res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Revoke all sessions (logout from all devices)
// @route   DELETE /api/auth/sessions
// @access  Private
const revokeAllSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const sessionCount = user.sessions.length;

    // Revoke all sessions
    user.revokeAllSessions();
    await user.save();

    // Log session revocation
    await logUserActivity(req.user._id, 'LOGOUT', `Revoked all sessions (${sessionCount} sessions)`, req);

    res.json({ message: 'All sessions revoked successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin: Revoke user's sessions
// @route   DELETE /api/auth/users/:id/sessions
// @access  Private/Admin
const revokeUserSessions = async (req, res) => {
  const { id } = req.params;

  try {
    // Prevent admin from revoking their own sessions via this endpoint
    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Use the regular logout endpoint for your own sessions' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const sessionCount = user.sessions.length;
    user.revokeAllSessions();
    await user.save();

    // Log admin action
    await logUserActivity(req.user._id, 'UPDATE_USER', `Revoked all sessions for user ${user.username} (${sessionCount} sessions)`, req);

    res.json({ message: `Revoked ${sessionCount} sessions for user ${user.username}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Don't allow users to delete themselves
    const currentUserId = req.user._id;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      users,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user (Admin only)
// @route   PUT /api/auth/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive } = req.body;

    // Prevent admin from deactivating themselves
    if (id === req.user._id.toString() && isActive === false) {
      res.status(400);
      throw new Error('Cannot deactivate your own account');
    }

    // Prevent admin from changing their own role
    if (id === req.user._id.toString() && role) {
      res.status(400);
      throw new Error('Cannot change your own role');
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const changes = [];
    if (role) {
      changes.push(`role: ${user.role} -> ${role}`);
      user.role = role;
    }
    if (isActive !== undefined) {
      changes.push(`status: ${user.isActive ? 'active' : 'inactive'} -> ${isActive ? 'active' : 'inactive'}`);
      user.isActive = isActive;
    }

    await user.save();

    // Log user update
    await logUserActivity(req.user._id, 'UPDATE_USER', `Updated user ${user.username}: ${changes.join(', ')}`, req);

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/auth/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user._id.toString()) {
      res.status(400);
      throw new Error('Cannot delete your own account');
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const deletedUsername = user.username;

    await user.deleteOne();

    // Log user deletion
    await logUserActivity(req.user._id, 'DELETE_USER', `Deleted user: ${deletedUsername}`, req);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
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
};