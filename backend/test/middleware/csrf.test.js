const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const { csrfProtection, ensureCsrfCookie, generateCsrfToken } = require('../../middleware/csrf');

describe('CSRF middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(ensureCsrfCookie); // Sets CSRF cookie on all requests
    app.use(csrfProtection);   // Validates CSRF on unsafe methods

    app.get('/', (req, res) => res.json({ ok: true, csrfToken: req.cookies.csrfToken }));
    app.post('/test', (req, res) => res.json({ ok: true }));
  });

  test('generateCsrfToken generates a valid token', () => {
    const token = generateCsrfToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });

  test('GET request sets CSRF cookie', async () => {
    const res = await request(app).get('/').expect(200);

    // Check that CSRF cookie is set in response headers
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.startsWith('csrfToken=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some(c => c.includes('SameSite=Strict'))).toBe(true);

    // The cookie is set in response, not available in req.cookies for same request
    // Subsequent requests will have it in req.cookies
    expect(res.body.csrfToken).toBeUndefined();
  });

  test('rejects POST without CSRF token', async () => {
    const res = await request(app).post('/test').send({}).expect(403);
    expect(res.body.message).toContain('CSRF');
  });

  test('accepts POST with valid X-CSRF-Token header', async () => {
    const agent = request.agent(app);

    // First GET to get CSRF cookie
    const getRes = await agent.get('/').expect(200);
    const cookies = getRes.headers['set-cookie'];
    const csrfCookie = cookies.find(c => c.startsWith('csrfToken='));
    const csrfToken = csrfCookie.split(';')[0].split('=')[1];

    // POST with valid CSRF token
    await agent
      .post('/test')
      .set('X-CSRF-Token', csrfToken)
      .send({ data: 'test' })
      .expect(200);
  });

  test('rejects POST with invalid CSRF token', async () => {
    const agent = request.agent(app);

    // First GET to get CSRF cookie
    await agent.get('/').expect(200);

    // POST with invalid CSRF token
    await agent
      .post('/test')
      .set('X-CSRF-Token', 'invalid-token')
      .send({ data: 'test' })
      .expect(403);
  });

  test('does not validate CSRF on GET requests', async () => {
    await request(app).get('/').expect(200);
  });

  test('does not validate CSRF on HEAD requests', async () => {
    await request(app).head('/').expect(200);
  });

  test('does not validate CSRF on OPTIONS requests', async () => {
    await request(app).options('/').expect(200);
  });
});