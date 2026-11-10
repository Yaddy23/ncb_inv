const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');

async function setupTestUsers() {
  console.log('Setting up test database...');

  const mongoUri = process.env.TESTMONGODB_URI;
  if (!mongoUri) {
    throw new Error('TESTMONGODB_URI not found in environment');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  });

  // Wait for connection to be fully ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
    if (mongoose.connection.readyState === 1) {
      clearTimeout(timeout);
      resolve();
    } else {
      mongoose.connection.once('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      mongoose.connection.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    }
  });

  console.log('Connected to test database');

  // Clean up existing test users
  await User.deleteMany({ email: { $in: ['admin@test.com', 'staff@test.com'] } });

  // Create admin user (password will be hashed by pre-save hook)
  await User.create({
    username: 'admin',
    email: 'admin@test.com',
    password: 'Admin1234',
    role: 'Admin',
    isActive: true,
  });
  console.log('Created admin@test.com');

  // Create staff user (password will be hashed by pre-save hook)
  await User.create({
    username: 'staff',
    email: 'staff@test.com',
    password: 'Staff1234',
    role: 'Staff',
    isActive: true,
  });
  console.log('Created staff@test.com');

  await mongoose.connection.close();
  console.log('Test database setup complete');
}

setupTestUsers().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});