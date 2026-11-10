# Security Plan: NCB Inventory Management System

**Document Version:** 1.0  
**Date:** 2026-11-10  
**Prepared For:** Internal Team & External Reviewers  
**Classification:** Internal - Security Review

---

## 1. Executive Summary

This document provides a comprehensive security review of the **NCB Inventory Management System** (New Century Books Inventory), a full-stack MERN application deployed on Render. The system manages book inventory with features for stock tracking, reservations, user management, bulk import/export, and document generation (delivery receipts, sales invoices, evaluation forms).

### Scope
- **Backend:** Node.js/Express API with MongoDB (Atlas)
- **Frontend:** React 18 + Vite SPA with PWA support
- **Authentication:** JWT (access + refresh tokens) with session tracking
- **Authorization:** Role-based (Admin / Staff)
- **Deployment:** Render (web services, PostgreSQL, cron jobs)

### Key Findings
| Area | Rating | Notes |
|------|--------|-------|
| Authentication | ✅ Strong | Short-lived access tokens (15m), refresh token rotation, account lockout, session management |
| Authorization | ✅ Strong | RBAC enforced at route and controller level; admin-only routes protected |
| Input Validation | ⚠️ Moderate | Some controllers validate, but not centralized; MongoDB injection risk in regex searches |
| Data Protection | ✅ Good | bcryptjs (10 rounds), SHA-256 for refresh tokens, no sensitive data in logs |
| API Security | ⚠️ Moderate | Rate limiting on login only; missing global rate limiting, security headers |
| Frontend Security | ⚠️ Moderate | Tokens in localStorage (XSS risk), CSP not configured, no X-Frame-Options |
| Logging/Audit | ✅ Good | Comprehensive UserLog model tracks all sensitive actions with IP/User-Agent |
| Infrastructure | ✅ Good | Render managed services, env vars for secrets, separate test DB |

---

## 2. Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│  React SPA + Vite + PWA (Service Worker)                       │
│  - localStorage: accessToken, refreshToken, user               │
│  - IndexedDB: token mirror for offline queue                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (CORS restricted)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     RENDER WEB SERVICE                          │
│  Node.js/Express API (backend/server.js)                       │
│  - CORS: allowlist + dev localhost                             │
│  - Body parsing: 10MB limit                                    │
│  - Health check: /health                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  MONGODB ATLAS│  │  RENDER KV    │  │  RENDER CRON  │
│  (Primary DB) │  │  (Redis/Valkey)│  │  (Scheduled)  │
│  - NCBINVENTORY│  │  - Sessions?  │  │  - Jobs       │
│  - TESTNCBINV │  │  - Cache?     │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
```

### Key Components
| Component | Technology | Purpose |
|-----------|------------|---------|
| Auth | JWT (HS256), bcryptjs, crypto | Authentication & session management |
| Database | MongoDB + Mongoose | Data persistence |
| Rate Limiting | express-rate-limit | Login brute-force protection |
| File Upload | multer | Excel/CSV import |
| Logging | Custom UserLog model | Audit trail |

---

## 3. Authentication & Authorization

### 3.1 Token Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      TOKEN LIFECYCLE                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  LOGIN                                                         │
│     │                                                          │
│     ▼                                                          │
│  ┌─────────────┐    ┌─────────────────┐                       │
│  │ Access Token│    │ Refresh Token   │                       │
│  │ (JWT, 15m)  │    │ (opaque, 7d)    │                       │
│  │ HS256       │    │ SHA-256 hashed  │                       │
│  │ {id}        │    │ Stored in User  │                       │
│  └─────────────┘    │ sessions[] array│                       │
│       │             └────────┬────────┘                       │
│       │                      │                                │
│       ▼                      ▼                                │
│  localStorage          localStorage + User.sessions[]         │
│  (client)              (server - for revocation)              │
│                                                                │
│  REFRESH FLOW (auto via axios interceptor)                    │
│  1. 401 on API call                                          │
│  2. POST /auth/refresh with refreshToken                     │
│  3. Server: verify hash, check expiry, rotate token          │
│  4. New access + refresh tokens issued                       │
│  5. Old refresh token revoked (rotation)                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Strengths
| Control | Implementation |
|---------|----------------|
| **Short-lived access tokens** | 15 minutes (reduces blast radius) |
| **Refresh token rotation** | New refresh token on each use; old revoked |
| **Token hashing** | SHA-256 before storage (not plaintext) |
| **Account lockout** | 5 failed attempts → 15 min lockout |
| **Password policy** | Min 8 chars, 1 letter + 1 number |
| **Session tracking** | Device/IP/User-Agent stored per session |
| **Self-service session mgmt** | Users can view/revoke own sessions |
| **Admin session oversight** | Admin can view/revoke any user's sessions |
| **Secure logout** | Revokes current session; all-sessions option |
| **Generic error messages** | No user enumeration on login |

### 3.3 Authorization Model
```
Role Hierarchy:
  Admin ──────────────────┐
                          ├── Full CRUD: Users, Books, Stock, Reservations
                          ├── Bulk import/export
                          ├── Document generation (DR, SI, EF)
                          ├── Transaction audit logs
                          └── Session management (all users)
                          
  Staff ──────────────────┘
                          ├── Read: Books, Catalog, Stock
                          ├── Stock updates (INBOUND/OUTBOUND)
                          ├── Scan (camera/barcode)
                          ├── Profile management
                          └── Own session management
```

### 3.4 Gaps & Recommendations

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| No MFA/2FA | **High** | Implement TOTP (Google Authenticator, Authy) for Admin accounts at minimum |
| No password history | Medium | Prevent last 5 passwords reuse |
| No forced password rotation | Low | Consider 90-day rotation for Admin |
| Refresh token in localStorage | **High** | Move to httpOnly cookie + CSRF token (see §6) |
| No device fingerprinting | Medium | Add device trust scores for anomalous login detection |

---

## 4. Data Protection

### 4.1 Data Classification

| Data Type | Classification | Storage | Encryption |
|-----------|----------------|---------|------------|
| Passwords | **Secret** | MongoDB | bcrypt (10 rounds) |
| Refresh Tokens | **Secret** | MongoDB | SHA-256 hash |
| JWT Secret | **Secret** | Env var | N/A (key) |
| MongoDB URI | **Secret** | Env var | TLS in transit |
| User PII (email, name) | **Confidential** | MongoDB | TLS in transit |
| Book Data | **Internal** | MongoDB | TLS in transit |
| Audit Logs | **Confidential** | MongoDB | TLS in transit |
| Uploaded Files | **Internal** | Ephemeral disk | Deleted post-processing |

### 4.2 Encryption Status
| Vector | Status | Notes |
|--------|--------|-------|
| **In Transit (Client→API)** | ✅ HTTPS | Render provides TLS termination |
| **In Transit (API→MongoDB)** | ✅ TLS | Atlas enforces TLS 1.2+ |
| **At Rest (MongoDB)** | ✅ AES-256 | Atlas default encryption |
| **At Rest (Render Disk)** | ✅ AES-256 | Render managed disks encrypted |
| **Secrets Management** | ✅ Env Vars | Not in code; Render dashboard |

### 4.3 Gaps & Recommendations

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| No field-level encryption | Medium | Consider for PII (email) if compliance requires |
| Backup encryption | ✅ Covered | Atlas automated backups encrypted |
| Key rotation (JWT_SECRET) | **High** | Implement rotation procedure; current secret is long-lived |
| No data retention policy | Medium | Define & implement (e.g., audit logs 7 years) |
| File upload validation | ⚠️ Partial | Only extension/MIME checked; add content validation |

---

## 5. API Security

### 5.1 Current Controls

| Control | Implementation | Coverage |
|---------|----------------|----------|
| **Authentication** | JWT Bearer token | All routes except `/auth/login`, `/auth/refresh`, `/health` |
| **Authorization** | `protect` + `admin` middleware | Route-level + controller-level checks |
| **Rate Limiting** | `express-rate-limit` (10 req/15min/IP) | **Only `/auth/login`** |
| **Input Validation** | Manual per-controller | Inconsistent; some regex injection risks |
| **Body Size Limit** | 10MB (Express default) | All routes |
| **CORS** | Allowlist + dev localhost | Configured in server.js |
| **Error Handling** | Generic messages in production | Stack traces hidden |

### 5.2 Endpoint Inventory & Protection Matrix

| Endpoint | Auth | Rate Limit | Input Validation | Admin Only |
|----------|------|------------|------------------|------------|
| `POST /api/auth/login` | ❌ | ✅ (10/15m) | ✅ | ❌ |
| `POST /api/auth/refresh` | ❌ | ❌ | ✅ | ❌ |
| `GET /api/auth/me` | ✅ | ❌ | N/A | ❌ |
| `POST /api/auth/register` | ✅ | ❌ | ✅ | ✅ |
| `PUT /api/auth/change-password` | ✅ | ❌ | ✅ | ❌ |
| `GET /api/books` | ✅ | ❌ | Partial (query params) | ❌ |
| `POST /api/books` | ✅ | ❌ | ✅ | ✅ |
| `PATCH /api/books/:isbn/stock` | ✅ | ❌ | ✅ | ❌ |
| `POST /api/books/bulk-import` | ✅ | ❌ | ✅ | ✅ |
| `GET /api/stock/transactions` | ✅ | ❌ | Partial | ✅ |
| `GET /api/auth/admin/sessions` | ✅ | ❌ | N/A | ✅ |

### 5.3 Vulnerabilities Identified

| # | Vulnerability | Location | Severity | Evidence |
|---|--------------|----------|----------|----------|
| **API-01** | **No global rate limiting** | All endpoints except login | **High** | DoS, credential stuffing on other endpoints |
| **API-02** | **Regex injection in search** | `bookController.js:65-73`, `stockController.js:475-488` | **High** | User input directly in `$regex` without escaping |
| **API-03** | **No request validation middleware** | All controllers | Medium | Inconsistent validation; some trust req.body |
| **API-04** | **Missing security headers** | Express app | Medium | No Helmet.js; no CSP, HSTS, X-Frame-Options |
| **API-05** | **No API versioning** | All routes | Low | Breaking changes risk |
| **API-06** | **Sensitive data in error responses** | Catch blocks return `error.message` | Medium | Potential info leakage |
| **API-07** | **No request/response logging** | server.js | Medium | Hard to detect attacks |

### 5.4 Regex Injection Examples (Critical)

**File:** `backend/controllers/bookController.js:65-73`
```javascript
if (search) {
  query.$or = [
    { TITLE: { $regex: search, $options: 'i' } },  // UNSAFE
    { AUTHOR: { $regex: search, $options: 'i' } }, // UNSAFE
    // ...
  ];
}
```

**File:** `backend/controllers/stockController.js:475-488`
```javascript
if (search) {
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // PARTIAL FIX
  const searchRegex = new RegExp(escapedSearch, 'i');
  // But still uses searchRegex directly in query
}
```

**Fix:** Use `$text` index or escape all special chars consistently.

---

## 6. Frontend Security

### 6.1 Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN STORAGE FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LOGIN SUCCESS                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │ localStorage │    │ localStorage │    │ IndexedDB       │   │
│  │ accessToken  │    │ refreshToken │    │ (offlineQueue)  │   │
│  │ (JWT, 15m)   │    │ (opaque, 7d) │    │ accessToken     │   │
│  └──────────────┘    └──────────────┘    └─────────────────┘   │
│       │                     │                    │               │
│       ▼                     ▼                    ▼               │
│  Axios interceptor    Axios interceptor    Service Worker     │
│  reads for auth       reads for refresh    reads for offline   │
│  header               calls              queue draining       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Security Controls

| Control | Status | Implementation |
|---------|--------|----------------|
| **HTTPS Only** | ✅ | Render enforces; `VITE_API_URL` uses HTTPS in prod |
| **Secure Cookies** | ❌ | Tokens in localStorage (not httpOnly cookies) |
| **CSP** | ❌ | Not configured |
| **X-Frame-Options** | ❌ | Not set |
| **X-Content-Type-Options** | ❌ | Not set |
| **Referrer-Policy** | ❌ | Not set |
| **Auto Token Refresh** | ✅ | Axios interceptor with queue |
| **Logout Cleanup** | ✅ | Purges localStorage + IndexedDB |
| **Route Guards** | ✅ | `PrivateRoute` + role checks |
| **PWA Service Worker** | ✅ | Offline queue for scans |

### 6.3 Vulnerabilities Identified

| # | Vulnerability | Severity | Impact |
|---|--------------|----------|--------|
| **FE-01** | **Tokens in localStorage** | **Critical** | XSS → full account takeover; tokens accessible via `document.cookie` not possible but `localStorage` readable by any JS |
| **FE-02** | **No Content Security Policy** | **High** | XSS risk amplified; inline scripts/styles allowed |
| **FE-03** | **No security headers** | Medium | Clickjacking, MIME sniffing, referrer leakage |
| **FE-04** | **Refresh token in localStorage** | **High** | Same as FE-01; long-lived token (7d) |
| **FE-05** | **AutoComplete on password** | Low | Browser password managers (actually good UX) |
| **FE-06** | **No Subresource Integrity** | Low | CDN compromise risk |

### 6.4 Recommended Architecture: httpOnly Cookies

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECOMMENDED TOKEN FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LOGIN → Set-Cookie: accessToken=...; HttpOnly; Secure;        │
│                    SameSite=Strict; Max-Age=900 (15m)          │
│         Set-Cookie: refreshToken=...; HttpOnly; Secure;        │
│                    SameSite=Strict; Max-Age=604800 (7d)        │
│                    Set-Cookie: csrfToken=...; HttpOnly; Secure │
│                                                                 │
│  API CALLS → Cookies sent automatically (SameSite=Strict       │
│              prevents CSRF on cross-origin)                    │
│                                                                 │
│  REFRESH → POST /auth/refresh (cookies sent)                   │
│            → New cookies set                                   │
│                                                                 │
│  LOGOUT → Set-Cookie: accessToken=; Max-Age=0                  │
│           Set-Cookie: refreshToken=; Max-Age=0                 │
│                                                                 │
│  BENEFITS:                                                      │
│  • XSS cannot steal tokens (HttpOnly)                          │
│  • CSRF protected by SameSite=Strict + double-submit pattern   │
│  • No client-side token management needed                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Infrastructure & Deployment Security

### 7.1 Render Deployment

| Component | Configuration | Security Notes |
|-----------|---------------|----------------|
| **Web Service** | Node.js, auto-deploy on push | Managed TLS, DDoS protection |
| **Database** | MongoDB Atlas (external) | Not Render Postgres; Atlas handles encryption, backups |
| **Environment** | `NODE_ENV=production` | Secrets in Render dashboard |
| **Health Checks** | `/health` endpoint | Liveness/readiness |
| **Auto-scaling** | Not configured | Consider for production |

### 7.2 Environment Variables (Production)

| Variable | Sensitivity | Rotation |
|----------|-------------|----------|
| `MONGODB_URI` | **Critical** | Atlas supports rotation |
| `TESTMONGODB_URI` | **Critical** | Separate test DB |
| `JWT_SECRET` | **Critical** | **No rotation process** |
| `PORT` | Low | N/A |
| `CLIENT_URL` | Medium | CORS allowlist |

### 7.3 Gaps & Recommendations

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| **JWT_SECRET never rotated** | **Critical** | Implement rotation: generate new secret, deploy, revoke all sessions |
| No secrets scanning in CI | Medium | Add GitLeaks/TruffleHog to pipeline |
| No dependency scanning | Medium | Add `npm audit` / Snyk / Dependabot |
| Single MongoDB URI (no read replica separation) | Low | Use read preference for reporting queries |
| No WAF | Medium | Render doesn't offer WAF; consider Cloudflare |
| No backup verification | Medium | Test restore procedures quarterly |

---

## 8. Logging, Monitoring & Incident Response

### 8.1 Current Logging

| Log Source | Content | Retention |
|------------|---------|-----------|
| **Application (stdout)** | Express requests, errors, MongoDB connection | Render logs (7 days default) |
| **UserLog Collection** | All auth events, CRUD actions, stock changes, admin actions | Indefinite (MongoDB) |
| **StockTransaction** | Every stock movement with user, qty, timestamp | Indefinite |
| **Browser Console** | Errors, network failures (dev only) | N/A |

### 8.2 Audit Trail Coverage

| Event | Logged | Fields Captured |
|-------|--------|-----------------|
| Login (success/fail) | ✅ | userId, action, details, IP, User-Agent |
| Password change | ✅ | userId, action, details, IP, User-Agent |
| User CRUD (admin) | ✅ | actor, target, changes, IP, User-Agent |
| Book CRUD (admin) | ✅ | actor, book, changes, IP, User-Agent |
| Stock IN/OUT | ✅ | actor, ISBN, qty, prev/new, IP, User-Agent |
| Bulk import | ✅ | actor, summary counts, IP, User-Agent |
| Export | ✅ | actor, type, count, IP, User-Agent |
| Session mgmt | ✅ | actor, target, session info, IP, User-Agent |
| Reservation hold/release | ✅ | actor, ISBN, qty, IP, User-Agent |

### 8.3 Gaps & Recommendations

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| No centralized log aggregation | Medium | Ship to Datadog/Logtail/Splunk |
| No alerting on anomalies | **High** | Alert on: >10 failed logins/min, new admin created, bulk delete |
| No log integrity protection | Medium | Consider append-only / signed logs |
| No security incident runbook | **High** | Document: detection → containment → eradication → recovery |
| Render metrics limited | Medium | Enable Render metrics; add custom business metrics |

---

## 9. Compliance & Standards Mapping

### 9.1 OWASP Top 10 (2021) Coverage

| Category | Status | Notes |
|----------|--------|-------|
| **A01: Broken Access Control** | ✅ Covered | RBAC enforced at route + controller |
| **A02: Cryptographic Failures** | ⚠️ Partial | TLS ok; JWT secret rotation missing; localStorage tokens |
| **A03: Injection** | ⚠️ Partial | NoSQL injection risk in regex searches |
| **A04: Insecure Design** | ✅ Good | Auth design sound; session rotation implemented |
| **A05: Security Misconfiguration** | ⚠️ Partial | Missing security headers, CSP, global rate limit |
| **A06: Vulnerable Components** | ⚠️ Unknown | No automated dependency scanning |
| **A07: Auth Failures** | ✅ Strong | Lockout, rotation, generic errors, session mgmt |
| **A08: Software/Data Integrity** | ⚠️ Partial | No CI/CD supply chain verification |
| **A09: Logging Failures** | ✅ Good | Comprehensive audit trail |
| **A10: SSRF** | ✅ N/A | No outbound requests to user-supplied URLs |

### 9.2 NIST CSF Mapping

| Function | Controls Present | Gaps |
|----------|------------------|------|
| **Identify** | Asset inventory (code), data classification | No formal risk assessment |
| **Protect** | AuthN/AuthZ, encryption, training (implied) | MFA, CSP, headers, rate limiting |
| **Detect** | Audit logs, error logging | No SIEM, no alerting |
| **Respond** | Session revocation, password reset | No incident response plan |
| **Recover** | Atlas backups, Render redeploys | No tested DR plan, no backup verification |

---

## 10. Risk Assessment & Prioritization

### 10.1 Risk Matrix

| Risk ID | Description | Likelihood | Impact | Risk Score | Priority |
|---------|-------------|------------|--------|------------|----------|
| **R1** | XSS steals localStorage tokens → full account takeover | High | Critical | **20** | **P0** |
| **R2** | No global rate limiting → credential stuffing/DoS | High | High | **16** | **P0** |
| **R3** | Regex injection → NoSQL injection / ReDoS | Medium | High | **12** | **P1** |
| **R4** | JWT_SECRET never rotated → long-term compromise | Low | Critical | **12** | **P1** |
| **R5** | No CSP → XSS amplified, data exfiltration | Medium | High | **12** | **P1** |
| **R6** | No security headers → clickjacking, MIME sniffing | Medium | Medium | **9** | **P2** |
| **R7** | No alerting on security events | Medium | High | **12** | **P1** |
| **R8** | No dependency scanning → supply chain attack | Low | High | **8** | **P2** |
| **R9** | No MFA for Admin → credential theft = full access | Medium | Critical | **16** | **P0** |
| **R10** | File upload validation bypass → RCE | Low | Critical | **10** | **P2** |

**Scoring:** Likelihood (Low=1, Medium=2, High=3) × Impact (Low=1, Medium=4, High=6, Critical=8)

### 10.2 Remediation Roadmap

#### Sprint 1 (Immediate - P0)
- [ ] **R1**: Migrate tokens to httpOnly cookies + CSRF protection
- [ ] **R2**: Add global rate limiting (e.g., 100 req/15min/IP)
- [ ] **R9**: Implement TOTP MFA for Admin role

#### Sprint 2 (P1 - Within 2 weeks)
- [ ] **R3**: Fix regex injection (use `$text` search or proper escaping)
- [ ] **R4**: Implement JWT_SECRET rotation procedure
- [ ] **R5**: Add Content Security Policy (start with report-only)
- [ ] **R7**: Add security event alerting (failed logins, admin actions)

#### Sprint 3 (P2 - Within 1 month)
- [ ] **R6**: Add Helmet.js for security headers
- [ ] **R8**: Add Dependabot + `npm audit` in CI
- [ ] **R10**: Enhance file upload validation (content-type, magic bytes)

#### Ongoing
- [ ] Quarterly JWT_SECRET rotation
- [ ] Semi-annual penetration testing
- [ ] Annual security training for team
- [ ] Incident response tabletop exercise

---

## 11. Security Testing Recommendations

### 11.1 Automated Testing (CI/CD)
```yaml
# .github/workflows/security.yml (recommended)
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci
      - name: Run npm audit
        run: npm audit --audit-level=high
      - name: Run Snyk test
        uses: snyk/actions/node@master
      - name: Run GitLeaks
        uses: gitleaks/gitleaks-action@v2
      - name: Run OWASP ZAP scan
        uses: zaproxy/action-baseline@v0.7.0
```

### 11.2 Manual Testing Checklist
- [ ] Authentication bypass attempts (token manipulation, role escalation)
- [ ] Authorization testing (horizontal/vertical privilege escalation)
- [ ] Input validation (XSS, SQL/NoSQL injection, command injection)
- [ ] Session management (fixation, hijacking, replay)
- [ ] Business logic flaws (stock manipulation, reservation bypass)
- [ ] File upload (path traversal, executable upload, XXE)
- [ ] API testing (rate limiting, mass assignment, broken object-level auth)
- [ ] Client-side (CSP bypass, storage exposure, DOM XSS)

### 11.3 Recommended Tools
| Category | Tools |
|----------|-------|
| **SAST** | Semgrep, CodeQL, SonarQube |
| **DAST** | OWASP ZAP, Burp Suite |
| **SCA** | Dependabot, Snyk, npm audit |
| **Secrets** | GitLeaks, TruffleHog |
| **Runtime** | Snyk Runtime, Datadog ASM |

---

## 12. Appendix: File Inventory for Review

### Critical Security Files
| File | Purpose | Review Priority |
|------|---------|-----------------|
| `backend/server.js` | Express setup, CORS, routes | High |
| `backend/middleware/auth.js` | JWT verification, RBAC | High |
| `backend/controllers/authController.js` | Auth logic, tokens, sessions | **Critical** |
| `backend/models/User.js` | Password hashing, token methods | **Critical** |
| `backend/routes/auth.js` | Auth endpoints, rate limiting | High |
| `backend/controllers/bookController.js` | Book CRUD, search (regex risk) | High |
| `backend/controllers/stockController.js` | Stock ops, bulk import, regex risk | High |
| `frontend/src/api/axios.js` | Token storage, refresh logic | **Critical** |
| `frontend/src/App.jsx` | Route guards, auth state | High |
| `frontend/src/components/PrivateRoute.jsx` | Route protection | Medium |
| `backend/.env` | Secrets (not in repo) | N/A - verify in Render |

---

## 13. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **Author** | Security Reviewer | 2026-11-10 | |
| **Technical Lead** | | | |
| **Security Officer** | | | |
| **Compliance** | | | |

---

**Document Control:** This document contains sensitive security information. Distribution limited to authorized personnel. Store in secure location. Review and update quarterly or after significant architectural changes.

**Next Review Date:** 2027-02-10