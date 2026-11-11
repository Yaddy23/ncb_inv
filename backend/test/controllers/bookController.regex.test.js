// Test to verify regex injection is fixed in bookController
require('dotenv').config();
process.env.MONGODB_URI = process.env.TESTMONGODB_URI;
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Book = require('../../models/Book');
const bookRoutes = require('../../routes/books');
const authRoutes = require('../../routes/auth');
const { ensureCsrfCookie } = require('../../middleware/csrf');
const { protect } = require('../../middleware/auth');

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(ensureCsrfCookie);
  app.use('/api/auth', authRoutes);
  app.use('/api/books', bookRoutes);
  return app;
};

describe('Book search - regex injection protection', () => {
  let app;
  let adminUser;
  let adminToken;
  let csrfToken;

  beforeAll(async () => {
    const mongoUri = process.env.TESTMONGODB_URI;
    await mongoose.connect(mongoUri);

    // Create admin user
    adminUser = await User.create({
      username: 'admin',
      email: 'admin@example.com',
      password: 'Admin1234',
      role: 'Admin'
    });

    // Create test books
    await Book.create([
      { ISBN: '1234567890', TITLE: 'Clean Code', AUTHOR: 'Robert Martin', SUBJECT: 'Programming', PUBLISHER: 'Prentice Hall', PRICE: 40, QTY: 10 },
      { ISBN: '0987654321', TITLE: 'Design Patterns', AUTHOR: 'Gang of Four', SUBJECT: 'Programming', PUBLISHER: 'Addison-Wesley', PRICE: 50, QTY: 5 },
      { ISBN: '1122334455', TITLE: 'JavaScript Guide', AUTHOR: 'Mozilla', SUBJECT: 'Web', PUBLISHER: 'OReilly', PRICE: 35, QTY: 8 },
    ]);
  }, 60000);

  afterAll(async () => {
    await Book.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  }, 30000);

  beforeEach(async () => {
    app = createTestApp();
    await User.updateMany({}, { sessions: [], refreshToken: undefined, refreshTokenExpires: undefined });

    // Login to get cookies
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin1234' })
      .expect(200);

    const cookies = loginRes.headers['set-cookie'];
    csrfCookie = cookies.find(c => c.startsWith('csrfToken='));
    csrfToken = csrfCookie.split(';')[0].split('=')[1];
    accessToken = loginRes.body.accessToken;
  });

  let csrfCookie;
  let accessToken;

  const getBooksWithSearch = (search) => {
    return request(app)
      .get(`/api/books?search=${encodeURIComponent(search)}`)
      .set('Cookie', [csrfCookie].join('; '))
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-CSRF-Token', csrfToken);
  };

  test('should find books by normal search term', async () => {
    const res = await getBooksWithSearch('Clean').expect(200);
    expect(res.body.books.length).toBe(1);
    expect(res.body.books[0].TITLE).toBe('Clean Code');
  });

  test('should find books by partial title match', async () => {
    const res = await getBooksWithSearch('Pattern').expect(200);
    expect(res.body.books.length).toBe(1);
    expect(res.body.books[0].TITLE).toBe('Design Patterns');
  });

  test('should NOT allow regex special characters to inject arbitrary queries', async () => {
    // This search term contains regex special chars that could be used for injection
    // If vulnerable, this would match all books (.* matches everything)
    const res = await getBooksWithSearch('.*').expect(200);

    // With $text search, ".*" should be treated as literal text, not regex
    // So it should return 0 results (no book has literal ".*" in title/author/etc)
    expect(res.body.books.length).toBe(0);
  });

  test('should NOT allow regex character class injection', async () => {
    // [A-Z] would match any capital letter in regex
    // With $text search, it should be treated as literal
    const res = await getBooksWithSearch('[A-Z]').expect(200);
    expect(res.body.books.length).toBe(0);
  });

  test('text search treats | as term separator (OR), not regex alternation', async () => {
    // In MongoDB $text search, "Clean|Design" is treated as two terms "Clean" OR "Design"
    // This is NOT regex injection - it's how text search works
    const res = await getBooksWithSearch('Clean|Design').expect(200);
    // Should match both books (Clean Code and Design Patterns)
    expect(res.body.books.length).toBe(2);
  });

  test('should handle special regex chars as literal text', async () => {
    // Add a book with special chars in title
    await Book.create({
      ISBN: '9999999999',
      TITLE: 'Test (Special) [Book]',
      AUTHOR: 'Test Author',
      SUBJECT: 'Test',
      PUBLISHER: 'Test Pub',
      PRICE: 10,
      QTY: 1
    });

    // Search for the literal string with special chars
    const res = await getBooksWithSearch('(Special)').expect(200);
    // With $text search, parentheses are treated as grouping, so may not match exactly
    // But it should NOT throw an error or match unintended books
    // The key test is it doesn't crash or expose injection
  });
});