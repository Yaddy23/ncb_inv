const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Trust proxy for rate limiting behind Render proxy
app.set('trust proxy', 1);

// Security headers with Helmet - CSP in report-only mode initially
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.CLIENT_URL || "http://localhost:5173"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    reportOnly: process.env.NODE_ENV !== 'production' // Report-only in dev, enforce in production
  },
  crossOriginEmbedderPolicy: false, // Disable COEP as it can break some legitimate use cases
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' }
}));

// Global rate limiter: 100 requests per 15 minutes per IP (skip in test environment)
// Skip book scanning endpoints to allow burst scanning (10+ books in seconds for box counting)
if (process.env.NODE_ENV !== 'test') {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP. Try again in 15 minutes.' },
    skip: (req) => {
      // Skip rate limiting for book scanning/import endpoints
      const scanningPaths = [
        '/api/books/lookup',
        '/api/books/catalog',
        '/api/stock/bulk-import',
      ];
      // Also skip POST /api/books (create) and PUT /api/books/:isbn (update qty)
      const isBookWrite = req.method === 'POST' && req.path === '/api/books';
      const isBookUpdate = req.method === 'PUT' && req.path.match(/^\/api\/books\/[^/]+$/);

      return scanningPaths.some(p => req.path.startsWith(p)) || isBookWrite || isBookUpdate;
    }
  });
  app.use(globalLimiter);
}

// Ensure uploads directory exists (required for Multer on Render's ephemeral filesystem)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory');
}

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow any localhost
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser for httpOnly cookies
app.use(cookieParser());

// CSRF protection - ensure cookie is set on all requests
const { ensureCsrfCookie } = require('./middleware/csrf');
app.use(ensureCsrfCookie);

// Routes
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const stockRoutes = require('./routes/stock');
const userLogRoutes = require('./routes/userLog');
const drsiRoutes = require('./routes/drsi');
const efRoutes = require('./routes/ef');
const marketingExecutiveRoutes = require('./routes/marketingExecutive');
const customerRoutes = require('./routes/customers');
const reservationRoutes = require('./routes/reservations');

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
// Reservations must be matched before the /api/stock prefix
app.use('/api/stock/reservations', reservationRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/user-logs', userLogRoutes);
app.use('/api/drsi', drsiRoutes);
app.use('/api/ef', efRoutes);
app.use('/api/marketing-executives', marketingExecutiveRoutes);
app.use('/api/customers', customerRoutes);

// Health check endpoint - verifies DB connection
app.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : dbState === 3 ? 'disconnecting' : 'disconnected';

  if (dbState !== 1) {
    return res.status(503).json({
      status: 'ERROR',
      timestamp: new Date(),
      database: dbStatus,
      message: 'Database not connected'
    });
  }

  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
    database: dbStatus
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Book Inventory API', health: '/health', api: '/api' });
});

// Connect to MongoDB
const connectDB = async () => {
  try {
    // Use TESTMONGODB_URI in test environment, otherwise MONGODB_URI
    const mongoUri = process.env.NODE_ENV === 'test' && process.env.TESTMONGODB_URI
      ? process.env.TESTMONGODB_URI
      : process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error('MongoDB URI not configured');
    }

    console.log(`Connecting to MongoDB (NODE_ENV=${process.env.NODE_ENV})...`);
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Only start the server if not running in serverless environment (Vercel) and this is the main module
if (process.env.VERCEL !== '1' && require.main === module) {
  connectDB().then(() => {
    const PORT = process.env.PORT || 8080;
    const HOST = process.env.HOST || '0.0.0.0';
    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  });
} else {
  connectDB();
}

module.exports = app;

module.exports = app;