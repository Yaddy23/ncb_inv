// Mock otplib (ESM module issue with @scure/base)
jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: () => 'TESTSECRET123456',
    keyuri: (email, service, secret) => `otpauth://totp/${service}:${email}?secret=${secret}&issuer=${service}`,
    check: (token, secret) => token === '123456',
    generate: (secret) => '123456',
  },
}));

// Load dotenv first so TESTMONGODB_URI is available
require('dotenv').config();

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../models/User');
const { protect } = require('../../middleware/auth');

// Set test database URI before any connection
process.env.MONGODB_URI = process.env.TESTMONGODB_URI;
process.env.JWT_SECRET = 'test-secret';

describe('Auth middleware - cookie-based', () => {
  let testUser;
  let accessToken;

  beforeAll(async () => {
    // Connect to test database directly
    const mongoUri = process.env.TESTMONGODB_URI;
    await mongoose.connect(mongoUri);

    // Create test user
    testUser = await User.create({
      username: 'testuser2',
      email: 'test2@example.com',
      password: 'Test1234',
      role: 'Staff'
    });

    // Generate a valid access token for the test user
    accessToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, {
      expiresIn: '15m',
    });
  }, 60000);

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  }, 30000);

  // Test app with protected route
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());

  testApp.get('/protected', protect, (req, res) => {
    res.json({
      userId: req.user._id.toString(),
      username: req.user.username,
      role: req.user.role
    });
  });

  test('accepts valid access token from cookie', async () => {
    const res = await request(testApp)
      .get('/protected')
      .set('Cookie', `accessToken=${accessToken}`)
      .expect(200);

    expect(res.body.userId).toBe(testUser._id.toString());
    expect(res.body.username).toBe('testuser2');
    expect(res.body.role).toBe('Staff');
  });

  test('accepts valid access token from Authorization header (backward compatibility)', async () => {
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.userId).toBe(testUser._id.toString());
    expect(res.body.username).toBe('testuser2');
    expect(res.body.role).toBe('Staff');
  });

  test('rejects request without token', async () => {
    const res = await request(testApp)
      .get('/protected')
      .expect(401);

    expect(res.body.message).toContain('no token');
  });

  test('rejects request with invalid token', async () => {
    const res = await request(testApp)
      .get('/protected')
      .set('Cookie', 'accessToken=invalid-token')
      .expect(401);

    expect(res.body.message).toContain('token failed');
  });

  test('rejects request with expired token', async () => {
    const expiredToken = jwt.sign({ id: testUser._id }, process.env.JWT_SECRET, {
      expiresIn: '-1h', // Already expired
    });

    const res = await request(testApp)
      .get('/protected')
      .set('Cookie', `accessToken=${expiredToken}`)
      .expect(401);

    expect(res.body.message).toContain('token failed');
  });
});