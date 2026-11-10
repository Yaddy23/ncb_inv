const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

// Create test app with rate limiting
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Global rate limiter: 5 requests per 15 minutes for testing
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP. Try again in 15 minutes.' }
  });

  app.use(globalLimiter);

  app.get('/test', (req, res) => res.json({ ok: true }));
  app.post('/test', (req, res) => res.json({ ok: true }));

  return app;
};

describe('Global rate limiter', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('allows requests under the limit', async () => {
    // Make 5 requests - should all succeed
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').expect(200);
    }
  });

  test('blocks requests over the limit', async () => {
    // Make 5 requests - all should succeed
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').expect(200);
    }

    // 6th request should be blocked
    const res = await request(app).get('/test').expect(429);
    expect(res.body.message).toContain('Too many requests');
  });

  test('applies to POST requests as well', async () => {
    // Make 5 POST requests - should all succeed
    for (let i = 0; i < 5; i++) {
      await request(app).post('/test').send({}).expect(200);
    }

    // 6th request should be blocked
    const res = await request(app).post('/test').send({}).expect(429);
    expect(res.body.message).toContain('Too many requests');
  });
});

describe('Auth-specific rate limiters', () => {
  let app;
  const rateLimit = require('express-rate-limit');

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Login limiter: 3 requests per window for testing
    const loginLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 3,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { message: 'Too many login attempts from this IP. Try again in 15 minutes.' }
    });

    // Refresh limiter: 3 requests per window for testing
    const refreshLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 3,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { message: 'Too many token refresh attempts from this IP. Try again in 15 minutes.' }
    });

    app.post('/login', loginLimiter, (req, res) => res.json({ ok: true }));
    app.post('/refresh', refreshLimiter, (req, res) => res.json({ ok: true }));
  });

  test('login limiter blocks after 3 attempts', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/login').send({}).expect(200);
    }

    const res = await request(app).post('/login').send({}).expect(429);
    expect(res.body.message).toContain('Too many login attempts');
  });

  test('refresh limiter blocks after 3 attempts', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/refresh').send({}).expect(200);
    }

    const res = await request(app).post('/refresh').send({}).expect(429);
    expect(res.body.message).toContain('Too many token refresh attempts');
  });

  test('login and refresh limiters are independent', async () => {
    // Make 3 login attempts
    for (let i = 0; i < 3; i++) {
      await request(app).post('/login').send({}).expect(200);
    }

    // Login should be blocked
    await request(app).post('/login').send({}).expect(429);

    // But refresh should still work
    for (let i = 0; i < 3; i++) {
      await request(app).post('/refresh').send({}).expect(200);
    }

    // Refresh should be blocked after 3
    await request(app).post('/refresh').send({}).expect(429);
  });
});