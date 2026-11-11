const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
    // Basic CSV validation: should be parseable as text with commas or newlines
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

// File filter with MIME type check (first line of defense)
const fileFilter = (req, file, cb) => {
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