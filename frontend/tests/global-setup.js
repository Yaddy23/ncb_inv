const { chromium } = require('@playwright/test');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });

const User = require('../../backend/models/User');
const bcrypt = require('bcryptjs');

async function globalSetup() {
  console.log('Setting up test database...');

  // Connect to test database
  const mongoUri = process.env.TESTMONGODB_URI;
  if (!mongoUri) {
    throw new Error('TESTMONGODB_URI not found in environment');
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    bufferTimeoutMS: 30000,
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

  // Hash passwords
  const adminPassword = await bcrypt.hash('Admin1234', 10);
  const staffPassword = await bcrypt.hash('Staff1234', 10);

  // Create admin user
  await User.create({
    username: 'admin',
    email: 'admin@test.com',
    password: adminPassword,
    role: 'Admin',
    isActive: true,
  });
  console.log('Created admin@test.com');

  // Create staff user
  await User.create({
    username: 'staff',
    email: 'staff@test.com',
    password: staffPassword,
    role: 'Staff',
    isActive: true,
  });
  console.log('Created staff@test.com');

  await mongoose.connection.close();
  console.log('Test database setup complete');
}

module.exports = globalSetup;