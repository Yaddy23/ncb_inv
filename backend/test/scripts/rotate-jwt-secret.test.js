require('dotenv').config();
process.env.MONGODB_URI = process.env.TESTMONGODB_URI;
process.env.JWT_SECRET = 'test-secret';

const mongoose = require('mongoose');
const User = require('../../models/User');
const { generateNewSecret, revokeAllUserSessions, rotateSecret } = require('../../scripts/rotate-jwt-secret');

describe('JWT Secret Rotation', () => {
  beforeAll(async () => {
    const mongoUri = process.env.TESTMONGODB_URI;
    await mongoose.connect(mongoUri);
  }, 60000);

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  }, 30000);

  beforeEach(async () => {
    // Reset JWT_SECRET for each test
    process.env.JWT_SECRET = 'test-secret';

    // Clear users first
    await User.deleteMany({});

    // Create users with sessions
    await User.create([
      {
        username: 'admin1',
        email: 'admin1@example.com',
        password: 'Admin1234',
        role: 'Admin',
        sessions: [{ token: 'token1', expiresAt: new Date(Date.now() + 86400000) }],
        refreshToken: 'refresh1',
        refreshTokenExpires: new Date(Date.now() + 86400000)
      },
      {
        username: 'staff1',
        email: 'staff1@example.com',
        password: 'Staff1234',
        role: 'Staff',
        sessions: [{ token: 'token2', expiresAt: new Date(Date.now() + 86400000) }],
        refreshToken: 'refresh2',
        refreshTokenExpires: new Date(Date.now() + 86400000)
      }
    ]);
  }, 30000);

  test('generateNewSecret produces 64-char hex string', () => {
    const secret = generateNewSecret();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
  });

  test('revokeAllUserSessions clears all sessions for all users', async () => {
    const count = await revokeAllUserSessions();
    expect(count).toBe(2);

    const users = await User.find({});
    users.forEach(user => {
      expect(user.sessions).toEqual([]);
      expect(user.refreshToken).toBeUndefined();
      expect(user.refreshTokenExpires).toBeUndefined();
    });
  });

  test('rotateSecret updates JWT_SECRET env and revokes sessions', async () => {
    const oldSecret = process.env.JWT_SECRET;
    expect(oldSecret).toBe('test-secret');

    const result = await rotateSecret();

    // Check that new secret was generated
    expect(result.newSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(result.newSecret).not.toBe(oldSecret);

    // Check that process.env was updated
    expect(process.env.JWT_SECRET).toBe(result.newSecret);

    // Check that all sessions were revoked
    expect(result.revokedCount).toBe(2);

    // Verify in database
    const users = await User.find({});
    users.forEach(user => {
      expect(user.sessions).toEqual([]);
      expect(user.refreshToken).toBeUndefined();
      expect(user.refreshTokenExpires).toBeUndefined();
    });
  });
});