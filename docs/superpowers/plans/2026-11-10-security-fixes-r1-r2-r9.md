# Security Fixes R1, R2, R9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three critical security fixes from the security review: R1 (migrate tokens from localStorage to httpOnly cookies with CSRF protection), R2 (add global rate limiting to all API endpoints), and R9 (implement TOTP MFA for Admin role).

**Architecture:** Three independent but related security improvements. R1 requires coordinated backend/frontend changes to the auth token flow. R2 is a pure backend middleware addition. R9 adds a new MFA enrollment/verification flow with TOTP (using `otplib` for TOTP and `qrcode` for QR generation), new User model fields, and frontend UI for Admin MFA setup.

**Tech Stack:** Node.js/Express, React 18 + Vite, MongoDB/Mongoose, JWT (HS256), bcryptjs, express-rate-limit, otplib, qrcode, cookie-parser, csurf (or custom CSRF double-submit)

**Spec:** `securityplan.md` (sections 3.4, 5.3, 6.3, 6.4, 10.2)

## Global Constraints

- **Cookie security:** All auth cookies must be `HttpOnly`, `Secure`, `SameSite=Strict`, with appropriate `Max-Age` (access: 900s/15m, refresh: 604800s/7d)
- **CSRF protection:** Double-submit cookie pattern — CSRF token in httpOnly cookie + custom header (`X-CSRF-Token`) on state-changing requests
- **Service worker compatibility:** PWA offline queue must still access access token via IndexedDB mirror (backend must provide token in login/refresh response body for frontend to mirror)
- **Backward compatibility:** No breaking changes to existing session data; migrate on next login
- **Rate limiting:** Global limit of 100 requests per 15 minutes per IP; stricter limits on auth endpoints (login: 10/15m, register: 5/15m, refresh: 30/15m)
- **MFA scope:** TOTP required for Admin role only; Staff users unaffected
- **TOTP:** Use `otplib` authenticator (RFC 6238), `qrcode` for QR generation, SHA-1, 30s period, 6 digits
- **Dependencies:** Add `cookie-parser`, `csurf` (or custom double-submit), `otplib`, `qrcode` to backend; no new frontend deps needed

## Review Focus

1. **Token migration edge case:** User has valid localStorage tokens but no cookies — ensure graceful migration on first API call after deploy
2. **CSRF token renewal:** CSRF token must rotate on login/refresh and be validated on all mutating endpoints (POST/PUT/PATCH/DELETE)
3. **Service worker token access:** Offline queue draining must work without localStorage — verify IndexedDB mirror still receives token from login/refresh response
4. **Rate limit bypass:** Ensure rate limiter respects `X-Forwarded-For` behind Render proxy; test burst handling
5. **MFA enrollment flow:** Admin must be able to enroll MFA, see QR code, verify first code, and recover if device lost (admin can reset another admin's MFA)

---

### Task 1: Backend - Add cookie-parser and CSRF middleware

**Files:**
- Create: `backend/middleware/csrf.js`
- Modify: `backend/server.js:1-50` (add cookie-parser, csrf middleware)
- Modify: `backend/package.json` (add cookie-parser, csurf)

**Interfaces:**
- Consumes: None (foundational)
- Produces: `csrfProtection` middleware for routes; `res.locals.csrfToken` available in views (if needed)

- [ ] **Step 1: Write failing test for CSRF middleware**

```javascript
// test/middleware/csrf.test.js
const request = require('supertest');
const express = require('express');
const csrf = require('../middleware/csrf');

describe('CSRF middleware', () => {
  let app;
  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(require('cookie-parser')());
    app.use(csrf.csrfProtection);
    app.post('/test', csrf.csrfProtection, (req, res) => res.json({ ok: true }));
  });

  test('rejects POST without CSRF token', async () => {
    await request(app).post('/test').send({}).expect(403);
  });

  test('accepts POST with valid X-CSRF-Token header', async () => {
    const agent = request.agent(app);
    // First get CSRF token from cookie
    const getRes = await agent.get('/').expect(200); // Need a route that sets CSRF cookie
    // This test will need a GET endpoint that sets the CSRF cookie
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=csrf.test.js`
Expected: FAIL - middleware not implemented

- [ ] **Step 3: Implement `csrfProtection` middleware in `backend/middleware/csrf.js`**

```javascript
const csrf = require('csurf');

// Double-submit cookie pattern: CSRF token in httpOnly cookie + X-CSRF-Token header
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  // Expect token in custom header for API calls
  value: (req) => req.headers['x-csrf-token'] || req.body._csrf
});

module.exports = { csrfProtection };
```

- [ ] **Step 4: Update `backend/server.js` to use cookie-parser and CSRF**

```javascript
// Add near top with other middleware
const cookieParser = require('cookie-parser');
const { csrfProtection } = require('./middleware/csrf');

// In server setup, after CORS and body parsers:
app.use(cookieParser());
app.use(csrfProtection); // Apply globally, but will only check on unsafe methods
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=csrf.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/middleware/csrf.js backend/server.js backend/package.json
git commit -m "feat(security): add CSRF protection middleware with double-submit cookie pattern"
```

---

### Task 2: Backend - Modify authController to set httpOnly cookies on login/refresh/logout

**Files:**
- Modify: `backend/controllers/authController.js` (login, refresh, logout, register)
- Modify: `backend/routes/auth.js` (apply CSRF protection to mutating auth routes)

**Interfaces:**
- Consumes: `res.cookie()` from Express, `generateAccessToken`, `generateRefreshToken`, `hashRefreshToken` from User model
- Produces: Login/refresh responses with Set-Cookie headers for `accessToken`, `refreshToken`, `csrfToken`; body still includes tokens for IndexedDB mirror

- [ ] **Step 1: Write failing test for cookie-based login**

```javascript
// test/controllers/authController.cookie.test.js
const request = require('supertest');
const app = require('../server'); // Or create test app
const User = require('../models/User');

describe('Cookie-based auth', () => {
  beforeAll(async () => {
    // Create test user
    await User.create({ username: 'testuser', email: 'test@example.com', password: 'Test123', role: 'Staff' });
  });

  test('login sets httpOnly cookies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test123' })
      .expect(200);

    // Check Set-Cookie headers
    const cookies = res.headers['set-cookie'];
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
      .send({ email: 'test@example.com', password: 'Test123' });
    
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
      .send({ email: 'test@example.com', password: 'Test123' });
    
    const cookies = loginRes.headers['set-cookie'];
    
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies.join('; '))
      .set('X-CSRF-Token', extractCsrfToken(cookies))
      .expect(200);
    
    const clearCookies = res.headers['set-cookie'];
    expect(clearCookies.some(c => c.startsWith('accessToken=;') && c.includes('Max-Age=0'))).toBe(true);
    expect(clearCookies.some(c => c.startsWith('refreshToken=;') && c.includes('Max-Age=0'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=authController.cookie.test.js`
Expected: FAIL - cookies not implemented

- [ ] **Step 3: Update `backend/controllers/authController.js` login function**

```javascript
// In login function, after generating tokens:
const accessToken = user.generateAccessToken();
const refreshToken = user.generateRefreshToken();
const hashedRefreshToken = user.hashRefreshToken(refreshToken);

// Store hashed refresh token in user's sessions array
user.sessions.push({
  refreshToken: hashedRefreshToken,
  refreshTokenExpires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  userAgent: req.get('User-Agent'),
  ipAddress: req.ip,
  createdAt: new Date()
});
await user.save();

// Set httpOnly cookies
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
};

res.cookie('accessToken', accessToken, {
  ...cookieOptions,
  maxAge: 15 * 60 * 1000 // 15 minutes
});

res.cookie('refreshToken', refreshToken, {
  ...cookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// CSRF token cookie (double-submit pattern)
res.cookie('csrfToken', req.csrfToken(), {
  ...cookieOptions,
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
});

// Response body still includes tokens for frontend IndexedDB mirror
res.json({
  accessToken,
  refreshToken,
  user: {
    _id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    mfaEnabled: user.mfaEnabled // For R9
  }
});
```

- [ ] **Step 4: Update `backend/controllers/authController.js` refresh function**

```javascript
// In refresh function, after verifying and rotating refresh token:
const newAccessToken = user.generateAccessToken();
const newRefreshToken = user.generateRefreshToken();
const newHashedRefreshToken = user.hashRefreshToken(newRefreshToken);

// Replace old session with new one (rotation)
const sessionIndex = user.sessions.findIndex(s => 
  s.refreshToken === hashedRefreshToken && s.refreshTokenExpires > Date.now()
);
if (sessionIndex !== -1) {
  user.sessions[sessionIndex] = {
    refreshToken: newHashedRefreshToken,
    refreshTokenExpires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip,
    createdAt: new Date()
  };
}
await user.save();

// Set new cookies (same as login)
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
res.cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
res.cookie('refreshToken', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
res.cookie('csrfToken', req.csrfToken(), { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });

res.json({
  accessToken: newAccessToken,
  refreshToken: newRefreshToken,
  user: { _id: user._id, username: user.username, email: user.email, role: user.role, mfaEnabled: user.mfaEnabled }
});
```

- [ ] **Step 5: Update `backend/controllers/authController.js` logout function**

```javascript
// In logout function:
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
res.clearCookie('accessToken', cookieOptions);
res.clearCookie('refreshToken', cookieOptions);
res.clearCookie('csrfToken', cookieOptions);

res.json({ message: 'Logged out successfully' });
```

- [ ] **Step 6: Update `backend/controllers/authController.js` register function (admin only)**

Apply same cookie setting as login.

- [ ] **Step 7: Update `backend/routes/auth.js` to apply CSRF protection to mutating routes**

```javascript
const { csrfProtection } = require('../middleware/csrf');

// Apply CSRF to all mutating auth routes
router.post('/login', loginLimiter, csrfProtection, login);
router.post('/refresh', csrfProtection, refresh);
router.post('/logout', protect, csrfProtection, logout);
router.post('/register', protect, admin, csrfProtection, register);
router.put('/change-password', protect, csrfProtection, changePassword);
router.put('/profile', protect, csrfProtection, updateProfile);
// ... other mutating routes
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=authController.cookie.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/controllers/authController.js backend/routes/auth.js
git commit -m "feat(security): migrate auth tokens to httpOnly cookies with CSRF protection"
```

---

### Task 3: Backend - Update auth middleware to read access token from cookie

**Files:**
- Modify: `backend/middleware/auth.js` (protect middleware)

**Interfaces:**
- Consumes: `req.cookies.accessToken` (from cookie-parser)
- Produces: `req.user` populated from JWT verification; falls back to Authorization header for backward compatibility during migration

- [ ] **Step 1: Write failing test for cookie-based token reading**

```javascript
// test/middleware/auth.cookie.test.js
const request = require('supertest');
const app = require('../server');
const jwt = require('jsonwebtoken');

describe('Auth middleware reads from cookie', () => {
  test('protect middleware reads accessToken from cookie', async () => {
    const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`accessToken=${token}`])
      .expect(200);
    
    expect(res.data._id).toBe('user123');
  });

  test('protect middleware falls back to Authorization header', async () => {
    const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(res.data._id).toBe('user123');
  });

  test('protect middleware rejects when no token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=auth.cookie.test.js`
Expected: FAIL - middleware reads from header only

- [ ] **Step 3: Update `backend/middleware/auth.js` protect middleware**

```javascript
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    // 1. Try to get token from httpOnly cookie (new)
    let token = req.cookies?.accessToken;
    
    // 2. Fallback to Authorization header (backward compatibility during migration)
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshToken -sessions');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token invalid or expired' });
    }
    return res.status(500).json({ message: 'Authentication error' });
  }
};

module.exports = { protect, admin: require('./auth').admin }; // Keep existing admin middleware
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=auth.cookie.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/auth.js
git commit -m "feat(security): update auth middleware to read access token from httpOnly cookie"
```

---

### Task 4: Frontend - Remove localStorage token handling from Login page

**Files:**
- Modify: `frontend/src/pages/Login.jsx`
- Modify: `frontend/src/api/axios.js` (remove localStorage reads, rely on cookies)

**Interfaces:**
- Consumes: None (removes localStorage usage)
- Produces: Login form that relies on backend cookies; axios interceptor no longer adds Authorization header

- [ ] **Step 1: Write failing test for Login without localStorage**

```javascript
// test/pages/Login.cookie.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../src/pages/Login';
import { MemoryRouter } from 'react-router-dom';
import api from '../src/api/axios';

jest.mock('../src/api/axios');

describe('Login with cookies', () => {
  const mockOnLogin = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
  });

  test('does not write to localStorage on successful login', async () => {
    api.post.mockResolvedValue({
      data: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        _id: 'user123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'Staff'
      }
    });

    render(
      <MemoryRouter>
        <Login onLogin={mockOnLogin} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Test123' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(mockOnLogin).toHaveBeenCalled());

    // Verify localStorage was NOT used
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --testPathPattern=Login.cookie.test.jsx`
Expected: FAIL - Login still uses localStorage

- [ ] **Step 3: Update `frontend/src/pages/Login.jsx` handleSubmit**

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    const response = await api.post('/auth/login', formData);
    const { accessToken, refreshToken, ...userData } = response.data;

    // REMOVED: localStorage.setItem('accessToken', accessToken);
    // REMOVED: localStorage.setItem('refreshToken', refreshToken);
    // REMOVED: localStorage.setItem('user', JSON.stringify(userData));
    
    // KEEP: Mirror access token to IndexedDB for service worker
    saveCurrentToken(accessToken);

    onLogin(userData);
    toast.success('Welcome back!');
  } catch (error) {
    const message = error.response?.data?.message || 'Login failed';
    toast.error(message);
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 4: Update `frontend/src/api/axios.js` - remove localStorage token reading**

```javascript
// In request interceptor - REMOVE the localStorage accessToken reading
// BEFORE:
requestInterceptor = (config) => {
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
};

// AFTER: No Authorization header - cookies sent automatically
requestInterceptor = (config) => {
  // With httpOnly cookies, browser sends them automatically
  // No need to manually add Authorization header
  return config;
};

// In response interceptor - update refresh logic to not use localStorage
// BEFORE: const refreshToken = localStorage.getItem('refreshToken');
// AFTER: Cookies sent automatically with refresh request
```

- [ ] **Step 5: Update `frontend/src/api/axios.js` - update purgeAuth**

```javascript
export const purgeAuth = () => {
  // localStorage.removeItem('accessToken');  // REMOVE
  // localStorage.removeItem('refreshToken'); // REMOVE
  // localStorage.removeItem('user');         // REMOVE
  clearCurrentToken(); // Keep IndexedDB cleanup for service worker
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- --testPathPattern=Login.cookie.test.jsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Login.jsx frontend/src/api/axios.js
git commit -m "feat(security): remove localStorage token handling from frontend login and axios"
```

---

### Task 5: Frontend - Update App.jsx to not read localStorage on mount

**Files:**
- Modify: `frontend/src/App.jsx` (loadUser effect)

**Interfaces:**
- Consumes: `/api/auth/me` endpoint (now reads cookie)
- Produces: User state populated from cookie-based auth

- [ ] **Step 1: Write failing test for App.jsx cookie-based loadUser**

```javascript
// test/App.cookie.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';
import { MemoryRouter } from 'react-router-dom';
import api from '../src/api/axios';

jest.mock('../src/api/axios');

describe('App with cookie auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('loadUser calls /auth/me without localStorage', async () => {
    api.get.mockResolvedValue({
      data: { _id: 'user123', username: 'testuser', email: 'test@example.com', role: 'Staff' }
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/me'));
    
    // Verify localStorage.getItem was not called for accessToken
    expect(localStorage.getItem).not.toHaveBeenCalledWith('accessToken');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --testPathPattern=App.cookie.test.jsx`
Expected: FAIL - App.jsx reads localStorage

- [ ] **Step 3: Update `frontend/src/App.jsx` loadUser effect**

```javascript
useEffect(() => {
  const loadUser = async () => {
    try {
      // REMOVED: const accessToken = localStorage.getItem('accessToken');
      // REMOVED: if (accessToken) {
      
      // Just call /auth/me - cookies sent automatically
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      // Token invalid or expired - cookies will be cleared by backend on logout
      // No need to manually clear localStorage
    } finally {
      setLoading(false);
    }
  };

  loadUser();
}, []);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --testPathPattern=App.cookie.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(security): remove localStorage accessToken check from App.jsx loadUser"
```

---

### Task 6: Frontend - Add CSRF token to mutating axios requests

**Files:**
- Modify: `frontend/src/api/axios.js` (add request interceptor to read CSRF from cookie and add header)

**Interfaces:**
- Consumes: `document.cookie` (to read csrfToken cookie)
- Produces: `X-CSRF-Token` header on all POST/PUT/PATCH/DELETE requests

- [ ] **Step 1: Write failing test for CSRF header**

```javascript
// test/api/axios.csrf.test.js
import api from '../src/api/axios';

// Mock document.cookie
Object.defineProperty(document, 'cookie', {
  writable: true,
  value: 'csrfToken=abc123; other=value'
});

describe('Axios CSRF header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('adds X-CSRF-Token header to POST requests', async () => {
    api.post.mockResolvedValue({ data: {} });
    
    await api.post('/test', { foo: 'bar' });
    
    expect(api.post).toHaveBeenCalledWith('/test', { foo: 'bar' }, expect.objectContaining({
      headers: expect.objectContaining({ 'X-CSRF-Token': 'abc123' })
    }));
  });

  test('adds X-CSRF-Token header to PUT requests', async () => {
    api.put.mockResolvedValue({ data: {} });
    
    await api.put('/test', { foo: 'bar' });
    
    expect(api.put).toHaveBeenCalledWith('/test', { foo: 'bar' }, expect.objectContaining({
      headers: expect.objectContaining({ 'X-CSRF-Token': 'abc123' })
    }));
  });

  test('does not add CSRF header to GET requests', async () => {
    api.get.mockResolvedValue({ data: {} });
    
    await api.get('/test');
    
    expect(api.get).toHaveBeenCalledWith('/test', expect.objectContaining({
      headers: expect.not.objectContaining({ 'X-CSRF-Token': expect.any(String) })
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --testPathPattern=axios.csrf.test.js`
Expected: FAIL - no CSRF header added

- [ ] **Step 3: Update `frontend/src/api/axios.js` to add CSRF interceptor**

```javascript
// Helper to read cookie by name
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

// Add request interceptor for CSRF
api.interceptors.request.use((config) => {
  // Only add CSRF token for mutating methods
  const mutatingMethods = ['post', 'put', 'patch', 'delete'];
  if (mutatingMethods.includes(config.method?.toLowerCase())) {
    const csrfToken = getCookie('csrfToken');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --testPathPattern=axios.csrf.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/axios.js
git commit -m "feat(security): add CSRF token header to mutating axios requests"
```

---

### Task 7: Frontend - Update logout to call API (cookies cleared by backend)

**Files:**
- Modify: `frontend/src/App.jsx` (logout function)
- Modify: `frontend/src/pages/Profile.jsx` (handleLogout calls onLogout)

**Interfaces:**
- Consumes: `api.post('/auth/logout')` with CSRF header
- Produces: User state cleared, redirect to login

- [ ] **Step 1: Write failing test for logout with cookies**

```javascript
// test/App.logout.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App';
import { MemoryRouter } from 'react-router-dom';
import api from '../src/api/axios';

jest.mock('../src/api/axios');

describe('Logout with cookies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logout calls API and clears user state', async () => {
    api.post.mockResolvedValue({ data: { message: 'Logged out successfully' } });
    
    // Render app with user
    const { rerender } = render(
      <MemoryRouter>
        <App initialUser={{ _id: '1', username: 'test', role: 'Staff' }} />
      </MemoryRouter>
    );
    
    // Trigger logout (via NavBar or Profile)
    // This would need more setup to actually click logout button
    // Simplified: test that logout function calls API
  });
});
```

- [ ] **Step 2: Update `frontend/src/App.jsx` logout function**

```javascript
const logout = async () => {
  try {
    await api.post('/auth/logout');
    // Backend clears cookies via Set-Cookie with Max-Age=0
  } catch (error) {
    console.error('Logout API call failed:', error);
  } finally {
    setUser(null);
    // No localStorage clearing needed
    clearCurrentToken(); // Still clear IndexedDB for service worker
  }
};
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd frontend && npm test -- --testPathPattern=App.logout.test.jsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/Profile.jsx
git commit -m "feat(security): update logout to use cookie-based session clearing"
```

---

### Task 8: Backend - Add global rate limiting middleware

**Files:**
- Create: `backend/middleware/rateLimiter.js`
- Modify: `backend/server.js` (apply global rate limiter)
- Modify: `backend/package.json` (ensure express-rate-limit is present)

**Interfaces:**
- Consumes: `req.ip` (respects `X-Forwarded-For` via `trust proxy`)
- Produces: Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`); 429 response when exceeded

- [ ] **Step 1: Write failing test for global rate limiter**

```javascript
// test/middleware/rateLimiter.test.js
const request = require('supertest');
const express = require('express');
const rateLimiter = require('../middleware/rateLimiter');

describe('Global rate limiter', () => {
  let app;
  beforeEach(() => {
    app = express();
    app.set('trust proxy', 1); // Required for X-Forwarded-For behind Render
    app.use(rateLimiter.globalLimiter);
    app.get('/test', (req, res) => res.json({ ok: true }));
  });

  test('allows requests under limit', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').expect(200);
    }
  });

  test('returns 429 when limit exceeded', async () => {
    // Default: 100 requests per 15 minutes
    for (let i = 0; i < 100; i++) {
      await request(app).get('/test').expect(200);
    }
    await request(app).get('/test').expect(429);
  });

  test('includes rate limit headers', async () => {
    const res = await request(app).get('/test').expect(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  test('respects X-Forwarded-For header', async () => {
    // Simulate requests from different IPs via proxy
    for (let i = 0; i < 100; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '1.2.3.4').expect(200);
    }
    await request(app).get('/test').set('X-Forwarded-For', '1.2.3.4').expect(429);
    
    // Different IP should have separate bucket
    await request(app).get('/test').set('X-Forwarded-For', '5.6.7.8').expect(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=rateLimiter.test.js`
Expected: FAIL - middleware not implemented

- [ ] **Step 3: Implement `backend/middleware/rateLimiter.js`**

```javascript
const rateLimit = require('express-rate-limit');

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { message: 'Too many requests from this IP, please try again later' },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  // Trust proxy for X-Forwarded-For (Render uses proxy)
  trustProxy: true,
  // Key generator uses IP (respects X-Forwarded-For when trustProxy=true)
  keyGenerator: (req) => req.ip,
  // Skip successful health checks
  skip: (req) => req.path === '/health',
  handler: (req, res) => {
    res.status(429).json({ 
      message: 'Too many requests from this IP, please try again later',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000) // Unix timestamp
    });
  }
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 requests per 15 minutes
  message: { message: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => req.ip
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 registrations per 15 minutes
  message: { message: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => req.ip
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 refreshes per 15 minutes
  message: { message: 'Too many token refresh attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => req.ip
});

module.exports = { globalLimiter, authLimiter, registerLimiter, refreshLimiter };
```

- [ ] **Step 4: Update `backend/server.js` to apply global rate limiter**

```javascript
const { globalLimiter } = require('./middleware/rateLimiter');

// Apply early, after CORS and body parsers but before routes
app.use(globalLimiter);

// Health check should be before rate limiter or skipped
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Then mount routes
app.use('/api/auth', require('./routes/auth'));
// ...
```

- [ ] **Step 5: Update `backend/routes/auth.js` to use specific limiters**

```javascript
const { authLimiter, registerLimiter, refreshLimiter } = require('../middleware/rateLimiter');

router.post('/login', authLimiter, csrfProtection, login);
router.post('/register', protect, admin, registerLimiter, csrfProtection, register);
router.post('/refresh', refreshLimiter, csrfProtection, refresh);
// ... other routes
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=rateLimiter.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/middleware/rateLimiter.js backend/server.js backend/routes/auth.js
git commit -m "feat(security): add global rate limiting and stricter auth endpoint limits"
```

---

### Task 9: Backend - Add TOTP fields to User model

**Files:**
- Modify: `backend/models/User.js` (add mfaEnabled, mfaSecret, mfaBackupCodes fields)

**Interfaces:**
- Consumes: None (schema change)
- Produces: User model with MFA fields; methods for TOTP verification

- [ ] **Step 1: Write failing test for User MFA fields**

```javascript
// test/models/User.mfa.test.js
const User = require('../models/User');
const speakeasy = require('speakeasy');

describe('User MFA fields', () => {
  test('User schema has mfaEnabled, mfaSecret, mfaBackupCodes', () => {
    const user = new User({
      username: 'test',
      email: 'test@example.com',
      password: 'Test123',
      role: 'Admin'
    });
    
    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toBeUndefined();
    expect(user.mfaBackupCodes).toEqual([]);
  });

  test('verifyTOTP method validates token', async () => {
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const token = speakeasy.totp({ secret, encoding: 'base32' });
    
    const user = new User({
      username: 'test',
      email: 'test@example.com',
      password: 'Test123',
      role: 'Admin',
      mfaEnabled: true,
      mfaSecret: secret
    });
    
    expect(user.verifyTOTP(token)).toBe(true);
    expect(user.verifyTOTP('000000')).toBe(false);
  });

  test('generateBackupCodes creates 10 codes', () => {
    const user = new User({
      username: 'test',
      email: 'test@example.com',
      password: 'Test123',
      role: 'Admin'
    });
    
    user.generateBackupCodes();
    expect(user.mfaBackupCodes).toHaveLength(10);
    user.mfaBackupCodes.forEach(code => {
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });
  });

  test('verifyBackupCode consumes code', () => {
    const user = new User({
      username: 'test',
      email: 'test@example.com',
      password: 'Test123',
      role: 'Admin',
      mfaBackupCodes: ['ABC12345']
    });
    
    expect(user.verifyBackupCode('ABC12345')).toBe(true);
    expect(user.mfaBackupCodes).toHaveLength(0);
    expect(user.verifyBackupCode('ABC12345')).toBe(false); // Already used
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=User.mfa.test.js`
Expected: FAIL - fields and methods not implemented

- [ ] **Step 3: Update `backend/models/User.js` schema**

```javascript
const userSchema = new mongoose.Schema({
  // ... existing fields
  mfaEnabled: {
    type: Boolean,
    default: false
  },
  mfaSecret: {
    type: String,
    select: false // Never return in queries
  },
  mfaBackupCodes: [{
    type: String,
    select: false
  }]
}, { timestamps: true });

// Add methods after schema definition
userSchema.methods.verifyTOTP = function(token) {
  if (!this.mfaEnabled || !this.mfaSecret) return false;
  const speakeasy = require('speakeasy');
  return speakeasy.totp.verify({
    secret: this.mfaSecret,
    encoding: 'base32',
    token,
    window: 1 // Allow 1 period before/after (30s each)
  });
};

userSchema.methods.generateBackupCodes = function() {
  const crypto = require('crypto');
  this.mfaBackupCodes = Array.from({ length: 10 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
  return this.mfaBackupCodes;
};

userSchema.methods.verifyBackupCode = function(code) {
  const index = this.mfaBackupCodes.indexOf(code.toUpperCase());
  if (index === -1) return false;
  this.mfaBackupCodes.splice(index, 1); // Consume the code
  return true;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=User.mfa.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/models/User.js
git commit -m "feat(security): add TOTP MFA fields and methods to User model"
```

---

### Task 10: Backend - Add MFA enrollment and verification endpoints

**Files:**
- Modify: `backend/controllers/authController.js` (add setupMFA, verifyMFA, disableMFA, regenerateBackupCodes)
- Modify: `backend/routes/auth.js` (add MFA routes with protect + admin middleware)

**Interfaces:**
- Consumes: `User.verifyTOTP`, `User.generateBackupCodes`, `speakeasy`, `qrcode`
- Produces: 
  - `GET /api/auth/mfa/setup` - Returns { secret, otpauthUrl, qrCodeDataUrl, backupCodes }
  - `POST /api/auth/mfa/verify` - Verifies TOTP token, enables MFA
  - `POST /api/auth/mfa/disable` - Disables MFA (requires password + TOTP or backup code)
  - `POST /api/auth/mfa/backup-codes` - Regenerates backup codes

- [ ] **Step 1: Write failing test for MFA endpoints**

```javascript
// test/controllers/authController.mfa.test.js
const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const speakeasy = require('speakeasy');

describe('MFA endpoints', () => {
  let adminToken, adminCookie;
  
  beforeAll(async () => {
    // Create admin user
    const admin = await User.create({ 
      username: 'admin', 
      email: 'admin@example.com', 
      password: 'Admin123', 
      role: 'Admin' 
    });
    
    // Login
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin123' });
    
    adminCookie = res.headers['set-cookie'];
    adminToken = res.body.accessToken;
  });

  test('GET /auth/mfa/setup returns secret and QR code', async () => {
    const res = await request(app)
      .get('/api/auth/mfa/setup')
      .set('Cookie', adminCookie.join('; '))
      .expect(200);
    
    expect(res.body.secret).toBeDefined();
    expect(res.body.otpauthUrl).toContain('otpauth://totp/');
    expect(res.body.qrCodeDataUrl).toContain('data:image/png;base64,');
    expect(res.body.backupCodes).toHaveLength(10);
  });

  test('POST /auth/mfa/verify enables MFA with valid token', async () => {
    // First get setup
    const setupRes = await request(app)
      .get('/api/auth/mfa/setup')
      .set('Cookie', adminCookie.join('; '));
    
    const secret = setupRes.body.secret;
    const token = speakeasy.totp({ secret, encoding: 'base32' });
    
    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', adminCookie.join('; '))
      .set('X-CSRF-Token', extractCsrfToken(adminCookie))
      .send({ token })
      .expect(200);
    
    expect(res.body.mfaEnabled).toBe(true);
  });

  test('POST /auth/mfa/verify rejects invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', adminCookie.join('; '))
      .set('X-CSRF-Token', extractCsrfToken(adminCookie))
      .send({ token: '000000' })
      .expect(400);
    
    expect(res.body.message).toContain('Invalid');
  });

  test('Login with MFA enabled requires TOTP', async () => {
    // Login with MFA enabled admin
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin123' })
      .expect(200);
    
    // Should return mfaRequired: true, not full tokens
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.accessToken).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- --testPathPattern=authController.mfa.test.js`
Expected: FAIL - endpoints not implemented

- [ ] **Step 3: Add MFA methods to `backend/controllers/authController.js`**

```javascript
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// GET /api/auth/mfa/setup - Generate MFA secret and QR code
const setupMFA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (user.mfaEnabled) {
      return res.status(400).json({ message: 'MFA already enabled' });
    }
    
    // Generate secret
    const secret = speakeasy.generateSecret({ 
      name: `NCB Inventory (${user.email})`,
      issuer: 'NCB Inventory',
      length: 20
    });
    
    // Generate backup codes
    user.mfaSecret = secret.base32;
    user.generateBackupCodes();
    await user.save();
    
    // Generate QR code data URL
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    
    res.json({
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeDataUrl,
      backupCodes: user.mfaBackupCodes
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to setup MFA' });
  }
};

// POST /api/auth/mfa/verify - Verify TOTP and enable MFA
const verifyMFA = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ message: 'Invalid token format' });
    }
    
    const user = await User.findById(req.user._id);
    if (!user.mfaSecret) {
      return res.status(400).json({ message: 'MFA setup not initiated' });
    }
    
    const verified = user.verifyTOTP(token);
    if (!verified) {
      return res.status(400).json({ message: 'Invalid TOTP token' });
    }
    
    user.mfaEnabled = true;
    await user.save();
    
    // Log MFA enable
    await logUserActivity(user._id, 'MFA_ENABLED', { method: 'TOTP' }, req);
    
    res.json({ message: 'MFA enabled successfully', mfaEnabled: true });
  } catch (error) {
    res.status(500).json({ message: 'MFA verification failed' });
  }
};

// POST /api/auth/mfa/disable - Disable MFA (requires password + TOTP or backup code)
const disableMFA = async (req, res) => {
  try {
    const { password, token, backupCode } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    if (!user.mfaEnabled) {
      return res.status(400).json({ message: 'MFA not enabled' });
    }
    
    // Verify password
    const passwordValid = await user.comparePassword(password);
    if (!passwordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }
    
    // Verify TOTP or backup code
    let verified = false;
    if (token) {
      verified = user.verifyTOTP(token);
    } else if (backupCode) {
      verified = user.verifyBackupCode(backupCode);
    }
    
    if (!verified) {
      return res.status(400).json({ message: 'Invalid TOTP or backup code' });
    }
    
    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    user.mfaBackupCodes = [];
    await user.save();
    
    await logUserActivity(user._id, 'MFA_DISABLED', {}, req);
    
    res.json({ message: 'MFA disabled successfully', mfaEnabled: false });
  } catch (error) {
    res.status(500).json({ message: 'Failed to disable MFA' });
  }
};

// POST /api/auth/mfa/backup-codes - Regenerate backup codes
const regenerateBackupCodes = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.mfaEnabled) {
      return res.status(400).json({ message: 'MFA not enabled' });
    }
    
    // Require TOTP verification for regeneration
    const { token } = req.body;
    if (!token || !user.verifyTOTP(token)) {
      return res.status(400).json({ message: 'Invalid TOTP token' });
    }
    
    user.generateBackupCodes();
    await user.save();
    
    await logUserActivity(user._id, 'MFA_BACKUP_CODES_REGENERATED', {}, req);
    
    res.json({ backupCodes: user.mfaBackupCodes });
  } catch (error) {
    res.status(500).json({ message: 'Failed to regenerate backup codes' });
  }
};

module.exports = { 
  // ... existing exports
  setupMFA,
  verifyMFA,
  disableMFA,
  regenerateBackupCodes
};
```

- [ ] **Step 4: Update login function to check MFA**

```javascript
// In login function, after password verification:
if (user.mfaEnabled) {
  // Don't issue tokens yet - require MFA
  return res.json({ 
    mfaRequired: true,
    userId: user._id,
    username: user.username,
    email: user.email,
    role: user.role
  });
}

// ... rest of login (issue tokens, set cookies)
```

- [ ] **Step 5: Add MFA verification endpoint for login**

```javascript
// POST /api/auth/mfa/login - Verify TOTP during login
const verifyMFALogin = async (req, res) => {
  try {
    const { userId, token, backupCode } = req.body;
    
    const user = await User.findById(userId);
    if (!user || !user.mfaEnabled) {
      return res.status(400).json({ message: 'MFA not enabled for this user' });
    }
    
    let verified = false;
    if (token) {
      verified = user.verifyTOTP(token);
    } else if (backupCode) {
      verified = user.verifyBackupCode(backupCode);
    }
    
    if (!verified) {
      // Log failed MFA
      await logUserActivity(userId, 'MFA_LOGIN_FAILED', { method: token ? 'TOTP' : 'BACKUP_CODE' }, req);
      return res.status(400).json({ message: 'Invalid TOTP or backup code' });
    }
    
    // MFA verified - issue tokens and set cookies (same as login)
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    const hashedRefreshToken = user.hashRefreshToken(refreshToken);
    
    user.sessions.push({
      refreshToken: hashedRefreshToken,
      refreshTokenExpires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      createdAt: new Date()
    });
    user.lastLoginAt = new Date();
    await user.save();
    
    // Set cookies
    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' };
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('csrfToken', req.csrfToken(), { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });
    
    await logUserActivity(user._id, 'LOGIN', { mfa: true }, req);
    
    res.json({
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        mfaEnabled: true
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'MFA login verification failed' });
  }
};
```

- [ ] **Step 6: Update `backend/routes/auth.js` to add MFA routes**

```javascript
const { 
  setupMFA, 
  verifyMFA, 
  disableMFA, 
  regenerateBackupCodes,
  verifyMFALogin 
} = require('../controllers/authController');

// MFA routes (require authentication)
router.get('/mfa/setup', protect, admin, csrfProtection, setupMFA);
router.post('/mfa/verify', protect, admin, csrfProtection, verifyMFA);
router.post('/mfa/disable', protect, admin, csrfProtection, disableMFA);
router.post('/mfa/backup-codes', protect, admin, csrfProtection, regenerateBackupCodes);

// MFA login verification (no auth required, but needs userId from first login step)
router.post('/mfa/login', authLimiter, csrfProtection, verifyMFALogin);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npm test -- --testPathPattern=authController.mfa.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/controllers/authController.js backend/routes/auth.js
git commit -m "feat(security): add TOTP MFA enrollment, verification, and login endpoints for Admin"
```

---

### Task 11: Frontend - Create MFA Setup page/component for Admin

**Files:**
- Create: `frontend/src/pages/MFASetup.jsx`
- Modify: `frontend/src/App.jsx` (add route for /mfa-setup)
- Modify: `frontend/src/components/NavBar.jsx` (add MFA setup link for Admin in profile dropdown)

**Interfaces:**
- Consumes: `api.get('/auth/mfa/setup')`, `api.post('/auth/mfa/verify')`, `api.post('/auth/mfa/disable')`, `api.post('/auth/mfa/backup-codes')`
- Produces: UI for Admin to scan QR code, enter TOTP, verify, view backup codes, disable MFA

- [ ] **Step 1: Write failing test for MFASetup page**

```javascript
// test/pages/MFASetup.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MFASetup from '../src/pages/MFASetup';
import { MemoryRouter } from 'react-router-dom';
import api from '../src/api/axios';

jest.mock('../src/api/axios');

describe('MFASetup page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('displays QR code and secret on load', async () => {
    api.get.mockResolvedValue({
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        backupCodes: ['ABC12345', 'DEF67890']
      }
    });

    render(
      <MemoryRouter>
        <MFASetup />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByAltText('MFA QR Code')).toBeInTheDocument();
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
      expect(screen.getByText('ABC12345')).toBeInTheDocument();
    });
  });

  test('verifies TOTP and enables MFA', async () => {
    api.get.mockResolvedValue({
      data: { secret: 'JBSWY3DPEHPK3PXP', qrCodeDataUrl: 'data:image/png;base64,...', backupCodes: ['ABC12345'] }
    });
    api.post.mockResolvedValue({ data: { message: 'MFA enabled successfully', mfaEnabled: true } });

    render(
      <MemoryRouter>
        <MFASetup />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('TOTP Token')).toBeInTheDocument()));
    
    fireEvent.change(screen.getByLabelText('TOTP Token'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Enable'));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/mfa/verify', { token: '123456' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --testPathPattern=MFASetup.test.jsx`
Expected: FAIL - page not created

- [ ] **Step 3: Create `frontend/src/pages/MFASetup.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useToast } from '../components/Toast';
import { Shield, RefreshCw, Copy, AlertTriangle, CheckCircle } from 'lucide-react';
import { AlertBanner, Button, Modal } from '../components/ui';

const MFASetup = ({ user }) => {
  const { toast } = useToast();
  const [setupData, setSetupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = false;
  const [disabling, setDisabling] = false;
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(user?.mfaEnabled || false);

  useEffect(() => {
    if (!mfaEnabled) {
      loadSetup();
    }
  }, [mfaEnabled]);

  const loadSetup = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/mfa/setup');
      setSetupData(response.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load MFA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!token || token.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      await api.post('/auth/mfa/verify', { token });
      toast.success('MFA enabled successfully!');
      setMfaEnabled(true);
      setSetupData(null);
      setToken('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async () => {
    setDisabling(true);
    try {
      await api.post('/auth/mfa/disable', { password, token: token || backupCode });
      toast.success('MFA disabled');
      setMfaEnabled(false);
      setShowDisableModal(false);
      setPassword('');
      setToken('');
      setBackupCode('');
      loadSetup(); // Reload setup for re-enrollment
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disable MFA');
    } finally {
      setDisabling(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!token || token.length !== 6) {
      toast.error('Enter current TOTP to regenerate backup codes');
      return;
    }
    try {
      const response = await api.post('/auth/mfa/backup-codes', { token });
      setSetupData(prev => ({ ...prev, backupCodes: response.data.backupCodes }));
      setToken('');
      toast.success('Backup codes regenerated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (!user || user.role !== 'Admin') {
    return <div className="p-4">Access denied. Admin privileges required.</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center space-x-3">
          <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-primary dark:text-blue-400" />
          Two-Factor Authentication (MFA)
        </h1>
        <p className="mt-2 text-gray-600 dark:text-slate-400">
          Secure your admin account with Time-based One-Time Passwords (TOTP)
        </p>
      </div>

      {/* MFA Enabled State */}
      {mfaEnabled && (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-4 sm:p-6 mb-6">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-green-800 dark:text-green-300">MFA is Enabled</h2>
              <p className="text-green-700 dark:text-green-400">Your account is protected with TOTP authentication.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="touch"
              onClick={() => setShowDisableModal(true)}
            >
              Disable MFA
            </Button>
            <Button
              variant="secondary"
              size="touch"
              onClick={() => setShowBackupCodes(true)}
            >
              View Backup Codes
            </Button>
          </div>
        </div>
      )}

      {/* MFA Setup State */}
      {!mfaEnabled && setupData && (
        <div className="space-y-6">
          <AlertBanner tone="info">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Scan the QR code with your authenticator app</p>
                <p className="text-sm mt-1">Supported apps: Google Authenticator, Authy, 1Password, Bitwarden, Microsoft Authenticator</p>
              </div>
            </div>
          </AlertBanner>

          {/* QR Code */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-6 text-center">
            <img 
              src={setupData.qrCodeDataUrl} 
              alt="MFA QR Code" 
              className="mx-auto mb-4 border border-gray-200 dark:border-slate-700 rounded-lg p-2"
              width={200}
              height={200}
            />
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-500 dark:text-slate-400 mb-1">Secret Key (manual entry)</label>
                <div className="flex items-center space-x-2 justify-center">
                  <code className="bg-gray-100 dark:bg-slate-800 px-3 py-1.5 rounded font-mono text-base tracking-wider break-all">
                    {setupData.secret.match(/.{1,4}/g).join(' ')}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(setupData.secret)} aria-label="Copy secret">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Verify & Enable</h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              Enter the 6-digit code from your authenticator app to enable MFA
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                label="TOTP Token"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="123456"
                maxLength={6}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[44px] text-base text-center tracking-widest font-mono"
                autoComplete="one-time-code"
              />
              <Button
                variant="primary"
                size="touch"
                onClick={handleVerify}
                loading={verifying}
                className="flex-1 sm:flex-none"
              >
                {verifying ? 'Verifying...' : 'Verify & Enable MFA'}
              </Button>
            </div>
          </div>

          {/* Backup Codes */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-3">Backup Codes</h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              Save these codes in a secure place. Each code can be used once if you lose access to your authenticator app.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {setupData.backupCodes.map((code, i) => (
                <div key={i} className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-lg font-mono text-sm text-center break-all">
                  {code}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" size="touch" onClick={() => copyToClipboard(setupData.backupCodes.join('\n'))}>
                Copy All
              </Button>
              <Button variant="secondary" size="touch" onClick={handleRegenerateBackupCodes}>
                <RefreshCw className="mr-2 w-4 h-4" />
                Regenerate (requires TOTP)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {!mfaEnabled && !setupData && loading && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">Loading MFA setup...</p>
        </div>
      )}

      {/* Disable MFA Modal */}
      {showDisableModal && (
        <Modal
          open
          onClose={() => setShowDisableModal(false)}
          title="Disable MFA"
          footer={
            <>
              <Button variant="secondary" size="touch" onClick={() => setShowDisableModal(false)}>Cancel</Button>
              <Button variant="danger" size="touch" onClick={handleDisable} loading={disabling}>
                {disabling ? 'Disabling...' : 'Disable MFA'}
              </Button>
            </>
          }
        >
          <p className="text-gray-600 dark:text-slate-400 mb-4">
            Disabling MFA removes the additional security layer from your admin account.
            You will need to verify your identity.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 touch-manipulation min-h-[44px]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                TOTP Code or Backup Code
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                placeholder="123456 or ABC12345"
                maxLength={8}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 touch-manipulation min-h-[44px] text-center tracking-widest font-mono"
                autoComplete="one-time-code"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Backup Codes Modal */}
      {showBackupCodes && (
        <Modal
          open
          onClose={() => setShowBackupCodes(false)}
          title="Backup Codes"
          footer={
            <Button variant="primary" size="touch" onClick={() => setShowBackupCodes(false)}>
              Done
            </Button>
          }
        >
          <p className="text-gray-600 dark:text-slate-400 mb-4">
            Each code can be used <strong>once</strong>. Store them securely.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            {setupData?.backupCodes.map((code, i) => (
              <div key={i} className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-lg font-mono text-sm text-center break-all">
                {code}
              </div>
            ))}
          </div>
          <Button variant="secondary" size="touch" onClick={() => copyToClipboard(setupData?.backupCodes.join('\n'))}>
            Copy All Codes
          </Button>
        </Modal>
      )}
    </div>
  );
};

export default MFASetup;
```

- [ ] **Step 4: Update `frontend/src/App.jsx` to add MFA route**

```jsx
import MFASetup from './pages/MFASetup';

// In Routes:
<Route
  path="/mfa-setup"
  element={
    <PrivateRoute isAuthenticated={!!user && user.role === 'Admin'}>
      <MFASetup user={user} />
    </PrivateRoute>
  }
/>
```

- [ ] **Step 5: Update `frontend/src/components/NavBar.jsx` to add MFA link in profile dropdown for Admin**

```jsx
// In profile dropdown menu:
{user.role === 'Admin' && (
  <button
    onClick={() => { navigate('/mfa-setup'); setMobileMenuOpen(false); }}
    className="w-full px-4 py-2.5 text-left text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
  >
    <Shield className="w-5 h-5 inline mr-2" />
    Two-Factor Auth
  </button>
)}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- --testPathPattern=MFASetup.test.jsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MFASetup.jsx frontend/src/App.jsx frontend/src/components/NavBar.jsx
git commit -m "feat(security): add MFA setup page for Admin with QR code, TOTP verification, and backup codes"
```

---

### Task 12: Frontend - Update Login page to handle MFA challenge

**Files:**
- Modify: `frontend/src/pages/Login.jsx` (handle mfaRequired response)

**Interfaces:**
- Consumes: `mfaRequired` response from login, `api.post('/auth/mfa/login')`
- Produces: Two-step login flow - first email/password, then TOTP/backup code entry

- [ ] **Step 1: Write failing test for MFA login flow**

```javascript
// test/pages/Login.mfa.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../src/pages/Login';
import { MemoryRouter } from 'react-router-dom';
import api from '../src/api/axios';

jest.mock('../src/api/axios');

describe('Login with MFA', () => {
  const mockOnLogin = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows MFA step when backend returns mfaRequired', async () => {
    // First login response - MFA required
    api.post
      .mockResolvedValueOnce({
        data: { mfaRequired: true, userId: 'user123', username: 'admin', role: 'Admin' }
      })
      // Second response - MFA verification success
      .mockResolvedValueOnce({
        data: { 
          accessToken: 'token', 
          refreshToken: 'refresh', 
          _id: 'user123', 
          username: 'admin', 
          email: 'admin@example.com', 
          role: 'Admin',
          mfaEnabled: true
        }
      });

    render(
      <MemoryRouter>
        <Login onLogin={mockOnLogin} />
      </MemoryRouter>
    );

    // Enter credentials
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Admin123' } });
    fireEvent.click(screen.getByText('Sign In'));

    // Should show MFA step
    await waitFor(() => expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument());
    expect(screen.getByLabelText('TOTP Code')).toBeInTheDocument();
    expect(screen.getByText('Use Backup Code')).toBeInTheDocument();

    // Enter TOTP
    fireEvent.change(screen.getByLabelText('TOTP Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));

    await waitFor(() => expect(mockOnLogin).toHaveBeenCalled());
  });

  test('allows backup code instead of TOTP', async () => {
    api.post
      .mockResolvedValueOnce({ data: { mfaRequired: true, userId: 'user123' } })
      .mockResolvedValueOnce({ data: { accessToken: 'token', refreshToken: 'refresh', _id: 'user123', username: 'admin', role: 'Admin', mfaEnabled: true } });

    render(
      <MemoryRouter>
        <Login onLogin={mockOnLogin} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Admin123' } });
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => expect(screen.getByText('Use Backup Code')).toBeInTheDocument());
    
    fireEvent.click(screen.getByText('Use Backup Code'));
    expect(screen.getByLabelText('Backup Code')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --testPathPattern=Login.mfa.test.jsx`
Expected: FAIL - Login doesn't handle MFA

- [ ] **Step 3: Update `frontend/src/pages/Login.jsx` for MFA flow**

```jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { saveCurrentToken } from '../lib/offlineQueue';
import { useToast } from '../components/Toast';
import { LogIn, User, Lock, Shield, RotateCcw } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [mfaData, setMfaData] = useState({ token: '', backupCode: '', useBackupCode: false });
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (step === 'credentials') {
      setFormData(prev => ({ ...prev, [name]: value }));
    } else {
      setMfaData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (step === 'credentials') {
        const response = await api.post('/auth/login', formData);
        
        if (response.data.mfaRequired) {
          // MFA required - show MFA step
          setUserId(response.data.userId);
          setStep('mfa');
          return;
        }
        
        // Normal login (no MFA)
        const { accessToken, refreshToken, ...userData } = response.data;
        saveCurrentToken(accessToken);
        onLogin(userData);
        toast.success('Welcome back!');
      } else {
        // MFA verification step
        const payload = { userId };
        if (mfaData.useBackupCode) {
          payload.backupCode = mfaData.backupCode;
        } else {
          payload.token = mfaData.token;
        }
        
        const response = await api.post('/auth/mfa/login', payload);
        const { accessToken, refreshToken, ...userData } = response.data;
        
        saveCurrentToken(accessToken);
        onLogin(userData);
        toast.success('Welcome back!');
      }
    } catch (error) {
      const message = error.response?.data?.message || (step === 'credentials' ? 'Login failed' : 'Invalid code');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep('credentials');
    setMfaData({ token: '', backupCode: '', useBackupCode: false });
    setUserId(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6 p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary/10 dark:bg-blue-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
            {step === 'mfa' ? (
              <Shield className="w-8 h-8 text-primary dark:text-blue-400" />
            ) : (
              <LogIn className="w-8 h-8 text-primary dark:text-blue-400" />
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100">
            {step === 'mfa' ? 'Two-Factor Authentication' : 'Welcome Back'}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-slate-400">
            {step === 'mfa' 
              ? 'Enter the 6-digit code from your authenticator app' 
              : 'Sign in to continue to NCB Inventory System'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {step === 'credentials' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[48px] text-base"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[48px] text-base"
                    autoComplete="current-password"
                  />
                </div>
              </div>
            </>
          )}

          {step === 'mfa' && (
            <>
              <input type="hidden" name="userId" value={userId} />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  {mfaData.useBackupCode ? 'Backup Code' : 'TOTP Code'}
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <input
                    type="text"
                    name={mfaData.useBackupCode ? 'backupCode' : 'token'}
                    value={mfaData.useBackupCode ? mfaData.backupCode : mfaData.token}
                    onChange={handleChange}
                    required
                    placeholder={mfaData.useBackupCode ? 'ABC12345' : '123456'}
                    maxLength={mfaData.useBackupCode ? 8 : 6}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-600 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-blue-500 focus:border-transparent touch-manipulation min-h-[48px] text-base text-center tracking-widest font-mono"
                    autoComplete="one-time-code"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMfaData(prev => ({ ...prev, useBackupCode: !prev.useBackupCode }))}
                  className="text-sm text-primary hover:text-primary/80 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {mfaData.useBackupCode ? 'Use TOTP instead' : 'Use Backup Code'}
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg disabled:opacity-50 transition-colors touch-manipulation min-h-[48px] text-base font-medium"
          >
            {loading ? (
              <>
                <span className="mr-2">{step === 'mfa' ? 'Verifying...' : 'Signing in...'}</span>
                <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
              </>
            ) : (
              <>
                {step === 'mfa' ? <Shield className="mr-2 w-4 h-4" /> : <LogIn className="mr-2 w-4 h-4" />}
                <span>{step === 'mfa' ? 'Verify' : 'Sign In'}</span>
              </>
            )}
          </button>
        </form>

        {step === 'mfa' && (
          <button
            type="button"
            onClick={goBack}
            className="w-full flex items-center justify-center px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 touch-manipulation min-h-[48px] text-base font-medium dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 dark:text-slate-300"
          >
            <RotateCcw className="mr-2 w-4 h-4" />
            <span>Back to Login</span>
          </button>
        )}

        <div className="text-center text-sm text-gray-500 dark:text-slate-400">
          Don't have an account? Contact administrator
        </div>
      </div>
    </div>
  );
};

export default Login;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- --testPathPattern=Login.mfa.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Login.jsx
git commit -m "feat(security): update Login page to handle MFA challenge flow for Admin"
```

---

### Task 13: Integration testing and verification

**Files:**
- No new files - run full test suite and manual verification

**Interfaces:**
- Consumes: All previous tasks
- Produces: Verified working security fixes

- [ ] **Step 1: Run backend test suite**

Run: `cd backend && npm test`
Expected: All tests pass

- [ ] **Step 2: Run frontend test suite**

Run: `cd frontend && npm test`
Expected: All tests pass

- [ ] **Step 3: Manual verification checklist**

```
□ Login as Admin → cookies set (HttpOnly, Secure, SameSite=Strict)
□ Login as Staff → cookies set, no MFA prompt
□ Access /api/auth/me → works with cookie auth
□ Refresh token → rotates cookies, old refresh revoked
□ Logout → cookies cleared (Max-Age=0)
□ CSRF token sent on POST/PUT/PATCH/DELETE → X-CSRF-Token header present
□ CSRF missing → 403 response
□ Global rate limit → 101st request in 15min returns 429
□ Auth rate limits → login 11th request in 15min returns 429
□ MFA setup → QR code displays, secret shown, backup codes generated
□ MFA verify → valid TOTP enables MFA, invalid rejected
□ MFA login → first step returns mfaRequired, second step with TOTP logs in
□ MFA login with backup code → works
□ MFA disable → requires password + TOTP/backup code
□ Backup codes regenerate → requires TOTP, old codes invalidated
□ Service worker offline queue → still receives access token via IndexedDB mirror
□ IndexedDB token mirror → updated on login and refresh
□ No localStorage tokens stored → verify in DevTools Application tab
```

- [ ] **Step 4: Commit verification**

```bash
git add -A
git commit -m "test(security): verify R1, R2, R9 fixes - all integration tests pass"
```

---

## Summary

This plan implements three critical security fixes from the security review:

| Fix | Risk | Tasks | Key Changes |
|-----|------|-------|-------------|
| **R1** | Critical (XSS → token theft) | 1-7 | httpOnly cookies for access/refresh/CSRF tokens; double-submit CSRF pattern; frontend removes localStorage token handling; axios uses cookies automatically |
| **R2** | High (DoS, credential stuffing) | 8 | Global rate limiter (100/15min/IP) + stricter auth limits (login: 10, register: 5, refresh: 30); respects X-Forwarded-For behind Render proxy |
| **R9** | Critical (Admin credential theft = full access) | 9-12 | TOTP MFA for Admin only (speakeasy + qrcode); User model adds mfaEnabled/mfaSecret/mfaBackupCodes; enrollment QR code, verification, backup codes, disable flow; Login page handles MFA challenge |

**Dependencies between tasks:**
- Tasks 1-3 (backend CSRF + cookie auth) must complete before Tasks 4-7 (frontend cookie auth)
- Task 8 (rate limiting) is independent
- Tasks 9-10 (backend MFA) must complete before Tasks 11-12 (frontend MFA)
- Task 13 runs after all others

**Estimated effort:** ~13 tasks × ~30-45 min each = ~7-10 hours total