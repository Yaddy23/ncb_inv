// Mock otplib (ESM module issue with @scure/base)
// New API: standalone functions generateSecret, generateURI, generate, verify
jest.mock('otplib', () => ({
  generateSecret: () => 'TESTSECRET123456',
  generateURI: (options) => `otpauth://totp/${options.issuer}:${options.label}?secret=${options.secret}&issuer=${options.issuer}`,
  generate: async ({ secret }) => '123456',
  verify: async ({ token, secret }) => ({ valid: token === '123456', delta: 0 }),
}));

// Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockedqrcode'),
}));

// Load dotenv first so TESTMONGODB_URI is available
require('dotenv').config();

// Set test database URI before any connection
process.env.MONGODB_URI = process.env.TESTMONGODB_URI;
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { generate } = require('otplib');
const User = require('../../models/User');
const {
  mfaSetup,
  mfaVerify,
  mfaDisable,
  mfaChallenge,
  loginUser,
} = require('../../controllers/authController');

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mock protect middleware - attaches user from token
  app.use('/api/auth/*', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
        req.user = { _id: decoded.id, role: decoded.role || 'Admin' };
      } catch (e) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    }
    next();
  });

  // Mock admin middleware
  const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
      next();
    } else {
      return res.status(403).json({ message: 'Admin access required' });
    }
  };

  app.post('/api/auth/login', loginUser);
  app.post('/api/auth/mfa/setup', adminMiddleware, mfaSetup);
  app.post('/api/auth/mfa/verify', adminMiddleware, mfaVerify);
  app.post('/api/auth/mfa/disable', adminMiddleware, mfaDisable);
  app.post('/api/auth/mfa/challenge', mfaChallenge);

  return app;
};

describe('MFA Endpoints', () => {
  let app;
  let adminUser;
  let staffUser;
  let adminToken;
  let staffToken;

  beforeAll(async () => {
    // Connect to test database directly
    const mongoUri = process.env.TESTMONGODB_URI;
    await mongoose.connect(mongoUri);
  }, 60000);

  afterAll(async () => {
    await mongoose.connection.close();
  }, 30000);

  beforeEach(async () => {
    app = createTestApp();

    // Clean up users
    await User.deleteMany({});

    // Create admin user
    adminUser = await User.create({
      username: 'admin',
      email: 'admin@test.com',
      password: 'Admin1234',
      role: 'Admin',
      isActive: true,
    });

    // Create staff user
    staffUser = await User.create({
      username: 'staff',
      email: 'staff@test.com',
      password: 'Staff1234',
      role: 'Staff',
      isActive: true,
    });

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
    staffToken = jwt.sign({ id: staffUser._id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  }, 30000);

  afterEach(async () => {
    await User.deleteMany({});
  }, 30000);

  describe('POST /api/auth/mfa/setup', () => {
    test('returns 403 for non-admin users', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      expect(res.body.message).toContain('MFA is only available for Admin users');
    });

    test('generates secret and QR code for admin user', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.secret).toBeDefined();
      expect(res.body.qrCode).toBeDefined();
      expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(res.body.message).toContain('Scan the QR code');
    });

    test('stores secret in user document', async () => {
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      expect(user.mfaSecret).toBeDefined();
      expect(user.mfaEnabled).toBe(false);
    });
  });

  describe('POST /api/auth/mfa/verify', () => {
    test('returns 400 without token', async () => {
      // First setup MFA
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('MFA token is required');
    });

    test('returns 400 if MFA not set up', async () => {
      // Don't setup MFA first
      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: '123456' })
        .expect(400);

      expect(res.body.message).toContain('MFA not set up');
    });

    test('returns 401 for invalid token', async () => {
      // Setup MFA first
      const setupRes = await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const invalidToken = (await generate({ secret: user.mfaSecret })) + '1'; // Make it invalid

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: invalidToken })
        .expect(401);

      expect(res.body.message).toContain('Invalid MFA token');
    });

    test('enables MFA with valid token', async () => {
      // Setup MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      expect(res.body.message).toContain('MFA enabled successfully');

      // Verify MFA is enabled in database
      const updatedUser = await User.findById(adminUser._id);
      expect(updatedUser.mfaEnabled).toBe(true);
    });
  });

  describe('POST /api/auth/mfa/disable', () => {
    test('returns 400 without password', async () => {
      // Setup and enable MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('Password is required');
    });

    test('returns 401 with invalid password', async () => {
      // Setup and enable MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'WrongPassword123' })
        .expect(401);

      expect(res.body.message).toContain('Invalid password');
    });

    test('disables MFA with correct password', async () => {
      // Setup and enable MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'Admin1234' })
        .expect(200);

      expect(res.body.message).toContain('MFA disabled successfully');

      // Verify MFA is disabled in database
      const updatedUser = await User.findById(adminUser._id);
      expect(updatedUser.mfaEnabled).toBe(false);
      expect(updatedUser.mfaSecret).toBeUndefined();
    });
  });

  describe('POST /api/auth/mfa/challenge', () => {
    test('returns 400 without userId or token', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({})
        .expect(400);

      expect(res.body.message).toContain('User ID and MFA token are required');
    });

    test('returns 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ userId: fakeId, token: '123456' })
        .expect(404);

      expect(res.body.message).toContain('User not found');
    });

    test('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ userId: staffUser._id, token: '123456' })
        .expect(403);

      expect(res.body.message).toContain('MFA is only available for Admin users');
    });

    test('returns 400 if MFA not enabled', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ userId: adminUser._id, token: '123456' })
        .expect(400);

      expect(res.body.message).toContain('MFA is not enabled');
    });

    test('returns 401 for invalid MFA token', async () => {
      // Setup and enable MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ userId: adminUser._id, token: '000000' })
        .expect(401);

      expect(res.body.message).toContain('Invalid MFA token');
    });

    test('completes login with valid MFA token', async () => {
      // Setup and enable MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      const newValidToken = await generate({ secret: user.mfaSecret });

      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ userId: adminUser._id, token: newValidToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.mfaEnabled).toBe(true);
    });
  });

  describe('Login with MFA', () => {
    test('returns mfaRequired for admin with MFA enabled', async () => {
      // Setup and enable MFA first
      await request(app)
        .post('/api/auth/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = await User.findById(adminUser._id);
      const validToken = await generate({ secret: user.mfaSecret });

      await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ token: validToken })
        .expect(200);

      // Now try to login
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'Admin1234' })
        .expect(200);

      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.userId).toBeDefined();
      expect(res.body.accessToken).toBeUndefined();
    });

    test('returns tokens directly for admin without MFA', async () => {
      // Admin user without MFA
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'Admin1234' })
        .expect(200);

      expect(res.body.mfaRequired).toBeUndefined();
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    test('returns tokens directly for staff user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'staff@test.com', password: 'Staff1234' })
        .expect(200);

      expect(res.body.mfaRequired).toBeUndefined();
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });
  });
});