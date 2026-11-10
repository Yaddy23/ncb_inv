const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/User');
const { protect } = require('../../middleware/auth');
const app = require('../../server'); // Use the actual server app

// Set test database URI before server connects
process.env.MONGODB_URI = process.env.TESTMONGODB_URI;

describe('Cookie-based auth', () => {

  beforeAll(async () => {
    // Wait for MongoDB connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create test user
    await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Test1234',
      role: 'Staff'
    });
  }, 30000);

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  }, 10000);

  beforeEach(async () => {
    // Clean up sessions for test user
    await User.updateMany({}, { sessions: [], refreshToken: undefined, refreshTokenExpires: undefined });
  });

  test('login sets httpOnly cookies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test1234' })
      .expect(200);

    // Check Set-Cookie headers
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.startsWith('accessToken=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some(c => c.startsWith('refreshToken=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some(c => c.startsWith('csrfToken=') && c.includes('HttpOnly'))).toBe(true);

    // Body should still have tokens for IndexedDB mirror
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  test('refresh rotates cookies', async () => {
    // Login first
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test1234' })
      .expect(200);

    const cookies = loginRes.headers['set-cookie'];

    // Refresh with cookies
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies.join('; '))
      .expect(200);

    const newCookies = res.headers['set-cookie'];
    expect(newCookies.some(c => c.startsWith('accessToken='))).toBe(true);
    expect(newCookies.some(c => c.startsWith('refreshToken='))).toBe(true);
    // Old refresh token should be revoked (rotation)
  });

  test('logout clears cookies', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test1234' })
      .expect(200);

    const cookies = loginRes.headers['set-cookie'];
    const csrfCookie = cookies.find(c => c.startsWith('csrfToken='));
    const csrfToken = csrfCookie.split(';')[0].split('=')[1];
    const accessToken = loginRes.body.accessToken;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies.join('; '))
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    const clearCookies = res.headers['set-cookie'];
    expect(clearCookies.some(c => c.startsWith('accessToken=;') && c.includes('Max-Age=0'))).toBe(true);
    expect(clearCookies.some(c => c.startsWith('refreshToken=;') && c.includes('Max-Age=0'))).toBe(true);
  });
});