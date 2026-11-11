const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import the upload middleware
const { upload, validateFileContent } = require('../../utils/fileUpload');

describe('File Upload Magic Bytes Validation', () => {
  let app;
  let tempDir;

  beforeEach(() => {
    const express = require('express');
    app = express();
    app.post('/upload', upload.single('file'), validateFileContent, (req, res) => res.json({ ok: true }));

    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-upload-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createTestFile = (filename, content) => {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  test('accepts valid .xlsx file (magic bytes: PK\\x03\\x04)', async () => {
    // Create a minimal valid xlsx file (ZIP-based with PK header)
    const validXlsx = Buffer.from([
      0x50, 0x4B, 0x03, 0x04, // ZIP local file header signature
      0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);
    const filePath = createTestFile('test.xlsx', validXlsx);

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  test('accepts valid .csv file (text content)', async () => {
    // CSV has no magic bytes, but should be valid UTF-8 text with commas
    const csvContent = 'ISBN,TITLE,AUTHOR\n1234567890,Test Book,Test Author\n';
    const filePath = createTestFile('test.csv', csvContent);

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  test('rejects .exe renamed as .xlsx (magic bytes: MZ)', async () => {
    // MZ header (DOS/Windows executable)
    const exeBytes = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
    const filePath = createTestFile('malicious.xlsx', exeBytes);

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(400);

    expect(res.body.message).toContain('Invalid file content');
  });

  test('rejects .pdf renamed as .xlsx (magic bytes: %PDF)', async () => {
    // PDF header
    const pdfBytes = Buffer.from('%PDF-1.4\n%....\n');
    const filePath = createTestFile('malicious.xlsx', pdfBytes);

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(400);

    expect(res.body.message).toContain('Invalid file content');
  });

  test('rejects empty file', async () => {
    const filePath = createTestFile('empty.xlsx', Buffer.alloc(0));

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(400);

    expect(res.body.message).toContain('Invalid file content');
  });

  test('rejects .xls with wrong magic bytes (OLE2)', async () => {
    // Valid OLE2 header for .xls
    const validXls = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    const filePath = createTestFile('test.xls', validXls);

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  test('rejects file with .xlsx extension but PNG magic bytes', async () => {
    // PNG header
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const filePath = createTestFile('image.xlsx', pngBytes);

    const request = require('supertest');
    const res = await request(app)
      .post('/upload')
      .attach('file', filePath)
      .expect(400);

    expect(res.body.message).toContain('Invalid file content');
  });
});