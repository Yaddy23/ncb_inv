# Sprint 3 Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 3 security remediation: JWT_SECRET rotation procedure, Dependabot + npm audit CI, and enhanced file upload validation with magic bytes checking.

**Architecture:** Three independent security enhancements:
1. JWT rotation: Admin-only endpoint + CLI script to rotate secret and revoke all sessions
2. CI/CD: GitHub Actions workflow with Dependabot config and npm audit
3. File upload: Add magic bytes validation to existing multer file filter using `file-type` package

**Tech Stack:** Node.js/Express, MongoDB/Mongoose, GitHub Actions, multer + file-type

**Spec:** securityplan.md (updated with Sprint 2 complete, Sprint 3 items pending)

## Global Constraints

- No co-author in commits (never add Co-Authored-By: Claude Code lines)
- All tests must pass before committing
- Follow existing code patterns and conventions
- Use TDD: write failing test first, then implement, then verify
- Backend tests run with `npm test` (Jest)
- Frontend tests run with `npm test` (Playwright)
- JWT_SECRET must be rotated via coordinated deployment (new secret → deploy → revoke sessions)
- File upload validation must not break existing bulk import functionality
- Maintain backward compatibility where possible

## Review Focus

1. **JWT rotation without downtime**: New secret deployed, old tokens still valid until rotation completes, then all sessions revoked atomically
2. **Magic bytes bypass**: Attacker renames .exe to .xlsx - must be rejected by content inspection, not just MIME type
3. **CI pipeline failure modes**: npm audit should fail on high/critical, not warn; Dependabot PRs should auto-merge on green tests
4. **Session revocation race condition**: During JWT rotation, ensure no window where old tokens work with new secret
5. **File upload DoS**: Large file handling, memory limits, cleanup of temp files on validation failure

---

### Task 1: JWT_SECRET Rotation Procedure (R4)

**Files:**
- Create: `backend/scripts/rotate-jwt-secret.js`
- Create: `backend/test/scripts/rotate-jwt-secret.test.js`
- Modify: `backend/controllers/authController.js` (add admin endpoint for rotation)
- Modify: `backend/routes/auth.js` (add rotation route)
- Modify: `backend/package.json` (add rotation script)

**Interfaces:**
- Consumes: User model methods (revokeAllSessions, generateAccessToken)
- Produces: CLI script `npm run rotate-jwt-secret` and admin endpoint `POST /api/auth/admin/rotate-jwt-secret`

- [ ] **Step 1: Write failing test for rotation script**

```javascript
// backend/test/scripts/rotate-jwt-secret.test.js
const { generateNewSecret, revokeAllUserSessions, rotateSecret } = require('../../scripts/rotate-jwt-secret');
const User = require('../../models/User');

describe('JWT Secret Rotation', () => {
  test('generateNewSecret produces 64-char hex string', () => {
    const secret = generateNewSecret();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
  });

  test('revokeAllUserSessions clears all sessions for all users', async () => {
    // Setup: create users with sessions
    // Call: await revokeAllUserSessions()
    // Assert: all users have empty sessions array
  });

  test('rotateSecret updates JWT_SECRET env and revokes sessions', async () => {
    // Mock process.env.JWT_SECRET
    // Call rotateSecret()
    // Assert: process.env.JWT_SECRET changed, all sessions revoked
  });
});
```

Run: `npm test -- backend/test/scripts/rotate-jwt-secret.test.js`
Expected: FAIL - module not found

- [ ] **Step 2: Implement rotation script in `backend/scripts/rotate-jwt-secret.js`**

```javascript
// backend/scripts/rotate-jwt-secret.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: '../.env' });

const generateNewSecret = () => crypto.randomBytes(32).toString('hex');

const revokeAllUserSessions = async () => {
  const result = await User.updateMany(
    {},
    { $set: { sessions: [], refreshToken: undefined, refreshTokenExpires: undefined } }
  );
  return result.modifiedCount;
};

const rotateSecret = async () => {
  const newSecret = generateNewSecret();
  const oldSecret = process.env.JWT_SECRET;
  
  // Update .env file (in production, this would be done via Render dashboard / CI)
  // For script: just update process.env for current process
  process.env.JWT_SECRET = newSecret;
  
  // Revoke all sessions - forces re-login with new secret
  const revokedCount = await revokeAllUserSessions();
  
  console.log(`JWT_SECRET rotated. Revoked ${revokedCount} user sessions.`);
  console.log(`New secret: ${newSecret}`);
  console.log('IMPORTANT: Update JWT_SECRET in Render dashboard and redeploy!');
  
  return { newSecret, revokedCount, oldSecret };
};

if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => rotateSecret())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { generateNewSecret, revokeAllUserSessions, rotateSecret };
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- backend/test/scripts/rotate-jwt-secret.test.js`
Expected: PASS

- [ ] **Step 4: Add admin endpoint for rotation in authController.js**

```javascript
// @desc    Rotate JWT secret and revoke all sessions (Admin only)
// @route   POST /api/auth/admin/rotate-jwt-secret
// @access  Private/Admin
const rotateJwtSecret = async (req, res) => {
  const crypto = require('crypto');
  const User = require('../models/User');
  
  const newSecret = crypto.randomBytes(32).toString('hex');
  
  // Revoke all sessions across all users
  const result = await User.updateMany(
    {},
    { $set: { sessions: [], refreshToken: undefined, refreshTokenExpires: undefined } }
  );
  
  // Update env for current process (new tokens will use new secret)
  process.env.JWT_SECRET = newSecret;
  
  // Log security event
  await logUserActivity(req.user._id, 'SECURITY_ALERT_SUSPICIOUS_ACTIVITY', 
    `JWT secret rotated by admin. ${result.modifiedCount} sessions revoked.`, req);
  
  res.json({
    message: `JWT secret rotated successfully. ${result.modifiedCount} sessions revoked.`,
    warning: 'Update JWT_SECRET in Render dashboard and redeploy all services!'
  });
};
```

- [ ] **Step 5: Add route in auth.js**

```javascript
router.post('/admin/rotate-jwt-secret', protect, admin, rotateJwtSecret);
```

- [ ] **Step 6: Add npm script in package.json**

```json
"scripts": {
  "rotate-jwt-secret": "node scripts/rotate-jwt-secret.js"
}
```

- [ ] **Step 7: Write integration test for admin endpoint**

```javascript
// backend/test/controllers/authController.jwt-rotation.test.js
const request = require('supertest');
const app = require('../../server');

describe('POST /api/auth/admin/rotate-jwt-secret', () => {
  test('admin can rotate JWT secret and all sessions revoked', async () => {
    // Login as admin, get cookies
    // POST /api/auth/admin/rotate-jwt-secret
    // Verify response
    // Verify old access token no longer works
    // Verify all users' sessions cleared
  });
});
```

- [ ] **Step 8: Run all backend tests**

Run: `npm test`
Expected: PASS (53+ tests)

- [ ] **Step 9: Commit**

```bash
git add backend/scripts/rotate-jwt-secret.js backend/test/scripts/rotate-jwt-secret.test.js backend/controllers/authController.js backend/routes/auth.js backend/package.json
git commit -m "feat: add JWT_SECRET rotation procedure (R4)"
```

---

### Task 2: Dependabot + npm audit in CI (R8)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Modify: `backend/package.json` (add audit script if needed)
- Modify: `frontend/package.json` (add audit script if needed)

**Interfaces:**
- Consumes: package.json dependencies
- Produces: Automated security scanning on every PR and scheduled runs

- [ ] **Step 1: Write CI workflow in `.github/workflows/ci.yml`**

```yaml
# .github/workflows/ci.yml
name: CI Security & Quality

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday 2am UTC

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - name: Run npm audit
        run: npm audit --audit-level=high --if-present
      - name: Check for vulnerabilities
        run: |
          if npm audit --audit-level=high --json 2>/dev/null | jq -e '.metadata.vulnerabilities.high > 0 or .metadata.vulnerabilities.critical > 0' >/dev/null; then
            echo "High/critical vulnerabilities found!"
            exit 1
          fi

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Run npm audit
        run: npm audit --audit-level=high --if-present
      - name: Check for vulnerabilities
        run: |
          if npm audit --audit-level=high --json 2>/dev/null | jq -e '.metadata.vulnerabilities.high > 0 or .metadata.vulnerabilities.critical > 0' >/dev/null; then
            echo "High/critical vulnerabilities found!"
            exit 1
          fi

  dependabot:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - uses: actions/checkout@v4
      - name: Auto-merge Dependabot PRs
        uses: fastify/github-action-merge-dependabot@v3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          merge-type: squash
```

- [ ] **Step 2: Write Dependabot config in `.github/dependabot.yml`**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "02:00"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "backend"
    commit-message:
      prefix: "chore(backend):"
    groups:
      development-dependencies:
        patterns:
          - "@babel/*"
          - "jest"
          - "nodemon"
          - "supertest"
        update-types:
          - "minor"
          - "patch"
      production-dependencies:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
        exclude-patterns:
          - "@babel/*"
          - "jest"
          - "nodemon"
          - "supertest"

  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "02:30"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "frontend"
    commit-message:
      prefix: "chore(frontend):"
    groups:
      development-dependencies:
        patterns:
          - "@playwright/*"
          - "@types/*"
          - "@vitejs/*"
          - "autoprefixer"
          - "postcss"
          - "tailwindcss"
          - "vite"
        update-types:
          - "minor"
          - "patch"
      production-dependencies:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
        exclude-patterns:
          - "@playwright/*"
          - "@types/*"
          - "@vitejs/*"
          - "autoprefixer"
          - "postcss"
          - "tailwindcss"
          - "vite"
```

- [ ] **Step 3: Add audit scripts to package.json files**

Backend package.json:
```json
"scripts": {
  "audit": "npm audit --audit-level=high"
}
```

Frontend package.json:
```json
"scripts": {
  "audit": "npm audit --audit-level=high"
}
```

- [ ] **Step 4: Test CI locally (run audit commands)**

Run: `cd backend && npm run audit`
Expected: PASS (no high/critical vulns)

Run: `cd frontend && npm run audit`
Expected: PASS (no high/critical vulns)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/dependabot.yml backend/package.json frontend/package.json
git commit -m "feat: add Dependabot + npm audit CI pipeline (R8)"
```

---

### Task 3: Enhanced File Upload Validation - Magic Bytes (R10)

**Files:**
- Modify: `backend/utils/fileUpload.js` (add magic bytes validation)
- Create: `backend/test/utils/fileUpload.test.js` (test magic bytes validation)
- Modify: `backend/package.json` (add file-type dependency)
- Modify: `backend/controllers/stockController.js` (add cleanup on validation failure)

**Interfaces:**
- Consumes: multer file object, file-type package
- Produces: Rejection of files with mismatched magic bytes

- [ ] **Step 1: Install file-type package**

Run: `cd backend && npm install file-type@^19.0.0`
Expected: Package added to dependencies

- [ ] **Step 2: Write failing test for magic bytes validation**

```javascript
// backend/test/utils/fileUpload.test.js
const multer = require('multer');
const upload = require('../utils/fileUpload');
const path = require('path');
const fs = require('fs');

describe('File Upload Magic Bytes Validation', () => {
  let app;
  
  beforeEach(() => {
    const express = require('express');
    app = express();
    app.post('/upload', upload.single('file'), (req, res) => res.json({ ok: true }));
  });

  test('accepts valid .xlsx file (magic bytes: PK\\x03\\x04)', async () => {
    const validXlsx = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // ZIP header
    // Create temp file with valid magic bytes
    // POST with file - should succeed
  });

  test('accepts valid .csv file (text content)', async () => {
    // CSV has no magic bytes, but should be valid UTF-8 text
    // POST with .csv - should succeed
  });

  test('rejects .exe renamed as .xlsx (magic bytes: MZ)', async () => {
    const exeBytes = Buffer.from([0x4D, 0x5A]); // MZ header
    // Create temp file with MZ header but .xlsx extension
    // POST with file - should fail with "Invalid file type"
  });

  test('rejects .pdf renamed as .xlsx (magic bytes: %PDF)', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4');
    // Create temp file with PDF header but .xlsx extension
    // POST with file - should fail
  });

  test('rejects empty file', async () => {
    // POST empty file - should fail
  });
});
```

Run: `npm test -- backend/test/utils/fileUpload.test.js`
Expected: FAIL - file-type not integrated yet

- [ ] **Step 3: Update fileUpload.js with magic bytes validation**

```javascript
// backend/utils/fileUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fileTypeFromBuffer } = require('file-type');

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Magic bytes signatures for allowed file types
const MAGIC_BYTES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    [0x50, 0x4B, 0x03, 0x04], // ZIP (xlsx is ZIP-based)
    [0x50, 0x4B, 0x05, 0x06], // ZIP empty archive
    [0x50, 0x4B, 0x07, 0x08]  // ZIP spanned archive
  ],
  'application/vnd.ms-excel': [
    [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] // OLE2 (xls)
  ],
  'text/csv': null // CSV has no magic bytes, validate as text
};

// Validate magic bytes against expected MIME type
const validateMagicBytes = async (filePath, mimetype) => {
  const expectedSignatures = MAGIC_BYTES[mimetype];
  
  // CSV has no magic bytes - validate as text
  if (!expectedSignatures) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    // Basic CSV validation: should be parseable as text with commas
    return content.includes(',') || content.includes('\n');
  }
  
  // Read first 8 bytes for magic bytes check
  const buffer = await fs.promises.readFile(filePath, { encoding: null });
  const header = buffer.subarray(0, 8);
  
  // Check if header matches any expected signature
  return expectedSignatures.some(sig => 
    sig.every((byte, i) => header[i] === byte)
  );
};

// File filter with magic bytes validation
const fileFilter = async (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv' // .csv
  ];

  // First check MIME type (can be spoofed)
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only Excel and CSV files are allowed!'), false);
  }

  // Accept the file initially - magic bytes validated after upload
  cb(null, true);
};

// Initialize upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Middleware to validate magic bytes after multer processes file
const validateFileContent = async (req, res, next) => {
  if (!req.file) return next();
  
  try {
    const isValid = await validateMagicBytes(req.file.path, req.file.mimetype);
    
    if (!isValid) {
      // Clean up uploaded file
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ 
        message: 'Invalid file content. File does not match its declared type.' 
      });
    }
    
    next();
  } catch (error) {
    // Clean up on error
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
};

module.exports = { upload, validateFileContent };
```

- [ ] **Step 4: Update stockController.js to use validation middleware**

```javascript
// In stockController.js bulkImportBooks function
// Add cleanup for temp file on validation error
const { upload, validateFileContent } = require('../utils/fileUpload');
```

```javascript
// In routes/stock.js
const { upload, validateFileContent } = require('../utils/fileUpload');
router.post('/bulk-import', protect, admin, upload.single('file'), validateFileContent, bulkImportBooks);
```

- [ ] **Step 5: Add cleanup in bulkImportBooks for error cases**

In the catch block of bulkImportBooks, ensure file is deleted:
```javascript
catch (error) {
  // Clean up uploaded file on error
  if (file) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
  res.status(statusCode).json({ message: error.message });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- backend/test/utils/fileUpload.test.js`
Expected: PASS

- [ ] **Step 7: Run all backend tests**

Run: `npm test`
Expected: PASS (53+ tests)

- [ ] **Step 8: Test frontend integration (manual or Playwright)**

Run: `cd frontend && npm test`
Expected: PASS (Playwright tests)

- [ ] **Step 9: Commit**

```bash
git add backend/utils/fileUpload.js backend/test/utils/fileUpload.test.js backend/controllers/stockController.js backend/routes/stock.js backend/package.json
git commit -m "feat: add magic bytes validation for file uploads (R10)"
```

---

## Execution Order

Tasks are independent and can be done in any order. Recommended:
1. Task 3 (R10) - File upload validation (highest immediate security value)
2. Task 1 (R4) - JWT rotation (operational security)
3. Task 2 (R8) - CI/CD pipeline (ongoing security)

## Final Verification

After all tasks complete:
- Run full backend test suite: `cd backend && npm test`
- Run full frontend test suite: `cd frontend && npm test`
- Run npm audit on both: `cd backend && npm audit --audit-level=high` and `cd frontend && npm audit --audit-level=high`
- Verify securityplan.md Sprint 3 items marked complete
- Push to main branch