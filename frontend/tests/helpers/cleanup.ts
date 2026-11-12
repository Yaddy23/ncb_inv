import { connectTestDatabase, disconnectTestDatabase, getTestModel, cleanupTestRecords } from './mongodb';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Get the User model with proper schema (password hashing middleware)
 * Registers the schema with the test mongoose connection if not already registered
 */
async function getUserModel() {
  // Check if User model is already registered with test mongoose connection
  if (mongoose.models.User) {
    return mongoose.models.User;
  }

  const userSchema = new mongoose.Schema({
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true,
      minlength: 8
    },
    role: {
      type: String,
      enum: ['Admin', 'Staff'],
      default: 'Staff'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date
    },
    lastLoginAt: {
      type: Date
    },
    // TOTP MFA fields (for Admin role)
    mfaEnabled: {
      type: Boolean,
      default: false
    },
    mfaSecret: {
      type: String
    },
    // Refresh token fields for session management
    refreshToken: {
      type: String
    },
    refreshTokenExpires: {
      type: Date
    },
    // Session tracking for revocation
    sessions: [{
      refreshTokenHash: String,
      userAgent: String,
      ipAddress: String,
      createdAt: { type: Date, default: Date.now },
      lastUsedAt: { type: Date, default: Date.now }
    }]
  }, {
    timestamps: true
  });

  // Text index for regex-injection-safe search on username and email
  userSchema.index({ username: 'text', email: 'text' });

  // Hash password before saving
  userSchema.pre('save', async function() {
    console.log('🔐 PRE-SAVE MIDDLEWARE RUNNING for:', this.email);
    if (!this.isModified('password')) {
      console.log('  Password not modified, skipping hash');
      return;
    }

    console.log('  Hashing password...');
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log('  Password hashed successfully');
  });

  // Compare password method
  userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  // Register the model with the test mongoose connection
  const User = mongoose.model('User', userSchema);
  return User;
}

/**
 * Cleanup tracker to record all test-created records for later cleanup
 */
interface CleanupRecord {
  modelName: string;
  testIdPrefix: string;
  count: number;
}

const cleanupTracker: CleanupRecord[] = [];

/**
 * Register a model and test ID prefix for cleanup
 */
export function registerForCleanup(modelName: string, testIdPrefix: string): void {
  cleanupTracker.push({
    modelName,
    testIdPrefix,
    count: 0,
  });
}

/**
 * Increment cleanup count for a model
 */
export function incrementCleanupCount(modelName: string, testIdPrefix: string, count: number = 1): void {
  const record = cleanupTracker.find(
    r => r.modelName === modelName && r.testIdPrefix === testIdPrefix
  );
  if (record) {
    record.count += count;
  }
}

/**
 * Perform cleanup of all registered test records
 */
export async function runCleanup(): Promise<void> {
  console.log('\n=== Starting Test Cleanup ===');

  for (const record of cleanupTracker) {
    try {
      const deleted = await cleanupTestRecords(record.modelName, record.testIdPrefix);
      console.log(`✓ Cleaned ${deleted} records from ${record.modelName} (prefix: ${record.testIdPrefix})`);
    } catch (error) {
      console.error(`✗ Failed to cleanup ${record.modelName}:`, error);
    }
  }

  console.log('=== Test Cleanup Complete ===\n');

  // Clear tracker
  cleanupTracker.length = 0;
}

/**
 * Setup test database with test users
 */
export async function setupTestDatabase(): Promise<void> {
  const { connectTestDatabase, validateTestDatabaseUri } = await import('./mongodb');

  const uri = validateTestDatabaseUri();
  await connectTestDatabase();

  // Use the REAL User model from backend (with pre-save middleware for password hashing)
  const User = await getUserModel();

  // Clean up existing test users (by email or username patterns)
  await User.deleteMany({
    $or: [
      { email: { $in: ['admin@test.com', 'staff@test.com'] } },
      { username: { $in: ['admin', 'staff'] } }
    ]
  });

  // Create admin user (password will be hashed by User model's pre-save middleware)
  await User.create({
    username: 'admin',
    email: 'admin@test.com',
    password: 'Admin1234',
    role: 'Admin',
    isActive: true,
  });
  console.log('Created admin@test.com');

  // Create staff user (password will be hashed by User model's pre-save middleware)
  await User.create({
    username: 'staff',
    email: 'staff@test.com',
    password: 'Staff1234',
    role: 'Staff',
    isActive: true,
  });
  console.log('Created staff@test.com');

  console.log('Test database setup complete');
}

/**
 * Teardown test database
 */
export async function teardownTestDatabase(): Promise<void> {
  await runCleanup();
  await disconnectTestDatabase();
}

/**
 * Get test database stats
 */
export async function getTestDatabaseStats(): Promise<Record<string, number>> {
  const { connectTestDatabase, getTestModel } = await import('./mongodb');

  await connectTestDatabase();

  const models = ['User', 'Book', 'Customer', 'MarketingExecutive', 'StockTransaction', 'Reservation', 'DeliveryReceipt', 'SalesInvoice', 'EvaluationForm', 'UserLog'];
  const stats: Record<string, number> = {};

  for (const modelName of models) {
    try {
      const model = getTestModel(modelName);
      stats[modelName] = await model.countDocuments();
    } catch {
      stats[modelName] = 0;
    }
  }

  return stats;
}

/**
 * Verify test database integrity
 */
export async function verifyTestDatabaseIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  const stats = await getTestDatabaseStats();

  // Check test users exist
  if ((stats.User || 0) < 2) {
    issues.push('Test users not found (expected at least 2: admin@test.com, staff@test.com)');
  }

  // Check no production data leaked
  const { connectTestDatabase, getTestModel } = await import('./mongodb');
  await connectTestDatabase();

  const User = getTestModel('User');
  const prodUsers = await User.countDocuments({
    email: { $not: { $regex: /@test\.com$/ } },
    username: { $not: { $regex: /^test_/ } }
  });

  if (prodUsers > 0) {
    issues.push(`WARNING: ${prodUsers} non-test users found in test database`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export { cleanupTracker };