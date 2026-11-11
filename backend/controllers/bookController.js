const Book = require('../models/Book');
const StockTransaction = require('../models/StockTransaction');
const User = require('../models/User');
const UserLog = require('../models/UserLog');

// Helper function to log user activities
const logUserActivity = async (userId, action, details = '', req = null) => {
  try {
    const logEntry = new UserLog({
      userId,
      action,
      details,
      ipAddress: req ? req.ip : null,
      userAgent: req ? req.get('User-Agent') : null,
    });
    await logEntry.save();
  } catch (error) {
    console.error('Failed to log user activity:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

// @desc    Get minimal catalog of all books for offline cache (PWA)
// @route   GET /api/books/catalog
// @access  Private
const getBookCatalog = async (req, res) => {
  try {
    const books = await Book.find(
      { isArchived: { $ne: true } },
      { ISBN: 1, TITLE: 1, QTY: 1, reservedQty: 1, _id: 0 }
    );
    res.json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Columns the list can be sorted by (anything else falls back to createdAt)
const SORTABLE_FIELDS = ['createdAt', 'ISBN', 'TITLE', 'AUTHOR', 'SUBJECT', 'YEAR', 'PUBLISHER', 'QTY', 'PRICE'];

// @desc    Get all books with pagination, search, filtering and sorting
// @route   GET /api/books
// @access  Private
const getBooks = async (req, res) => {
  try {
    const pageSize = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || '';
    const sortBy = SORTABLE_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const { subject, publisher, year, minPrice, maxPrice, stock, archived } = req.query;

    // Search + filters coexist in one query object ($or and field
    // conditions at the top level are an implicit AND)
    const query = {};

    // By default, exclude archived books. Only admins can see archived books
    // when explicitly requested via archived=true
    if (archived === 'true' && req.user?.role === 'Admin') {
      query.isArchived = true;
    } else {
      query.isArchived = { $ne: true };
    }

    if (search) {
      const trimmedSearch = search.trim();
      // Normalize ISBN: remove hyphens and spaces for matching
      const normalizedSearch = trimmedSearch.replace(/[-\s]/g, '');

      // Check if search looks like an ISBN (10 or 13 digits, optionally with hyphens)
      const isIsbnLike = /^[\d\-]{10,17}$/.test(trimmedSearch) && /^\d{10,13}$/.test(normalizedSearch);

      if (isIsbnLike) {
        // For ISBN searches, match both normalized and original formats
        // Use $expr to normalize stored ISBN (remove hyphens) for comparison
        // This handles cases where DB has "978-1-234-56789-0" and search is "9781234567890" (or vice versa)
        query.$or = [
          { ISBN: trimmedSearch },           // Exact match on original search
          { ISBN: normalizedSearch },        // Exact match on normalized search
          { $expr: { $eq: [{ $replaceAll: { input: '$ISBN', find: '-', replacement: '' } }, normalizedSearch] } } // Match normalized DB ISBN
        ];
      } else {
        // For general text searches, use MongoDB text search
        query.$text = { $search: trimmedSearch };
      }
    }

    if (subject) query.SUBJECT = { $eq: subject, $options: 'i' };
    if (publisher) query.PUBLISHER = { $eq: publisher, $options: 'i' };
    if (year) query.YEAR = { $eq: year, $options: 'i' };

    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (!Number.isNaN(min) || !Number.isNaN(max)) {
      query.PRICE = {};
      if (!Number.isNaN(min)) query.PRICE.$gte = min;
      if (!Number.isNaN(max)) query.PRICE.$lte = max;
    }

    if (stock === 'in') {
      query.QTY = { $gt: 0 };
    } else if (stock === 'out') {
      query.QTY = { $lte: 0 };
    } else if (stock === 'low') {
      // Low = in stock but below the book's own MIN_QTY threshold
      query.$expr = {
        $and: [
          { $gt: ['$QTY', 0] },
          { $lt: ['$QTY', { $ifNull: ['$MIN_QTY', 5] }] },
        ],
      };
    }

    const count = await Book.countDocuments(query);
    const books = await Book.find(query)
      .sort({ [sortBy]: sortOrder })
      .limit(pageSize)
      .skip(pageSize * (page - 1));

    res.json({
      books,
      page,
      pages: Math.ceil(count / pageSize),
      total: count,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Lookup book by ISBN
// @route   GET /api/books/lookup/:isbn
// @access  Private
const lookupBookByISBN = async (req, res) => {
  try {
    const { isbn } = req.params;
    // Normalize ISBN: remove hyphens and spaces for matching
    const normalizedIsbn = isbn.replace(/[-\s]/g, '');

    // Try exact match first, then match normalized ISBN in DB
    let book = await Book.findOne({
      $or: [
        { ISBN: isbn },
        { ISBN: normalizedIsbn },
        { $expr: { $eq: [{ $replaceAll: { input: '$ISBN', find: '-', replacement: '' } }, normalizedIsbn] } }
      ],
      isArchived: { $ne: true }
    });

    if (book) {
      res.json(book);
    } else {
      // Try to fetch from Open Library API as fallback
      try {
        const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
        if (response.ok) {
          const data = await response.json();
          // Format the data to match our book schema
          const formattedData = {
            ISBN: isbn,
            TITLE: data.title || '',
            AUTHOR: Array.isArray(data.authors)
              ? data.authors.map(a => a.name).join(', ') || ''
              : (data.authors && data.authors.name) || '',
            PUBLISHER: data.publishers && data.publishers[0]
              ? data.publishers[0].name || ''
              : '',
            YEAR: data.publish_date ? String(data.publish_date).match(/\d{4}/) ? String(data.publish_date).match(/\d{4}/)[0] : '' : '',
            SUBJECT: Array.isArray(data.subjects) ? data.subjects.slice(0, 3).join(', ') : '',
          };
          res.json(formattedData);
        } else {
          res.status(404).json({ message: 'Book not found' });
        }
      } catch (apiError) {
        res.status(404).json({ message: 'Book not found' });
      }
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new book
// @route   POST /api/books
// @access  Private/Admin
const createBook = async (req, res) => {
  try {
    const { ISBN, SUBJECT, TITLE, EDITION, YEAR, AUTHOR, BIND, QTY, PRICE, PUBLISHER } = req.body;

    // Check if book already exists
    const bookExists = await Book.findOne({ ISBN });
    if (bookExists) {
      res.status(400);
      throw new Error('Book with this ISBN already exists');
    }

    const book = await Book.create({
      ISBN,
      SUBJECT,
      TITLE,
      EDITION,
      YEAR,
      AUTHOR,
      BIND,
      QTY: QTY || 0,
      PRICE: PRICE || 0.00,
      PUBLISHER,
    });

    if (book) {
      // Create stock transaction record for initial stock
      await StockTransaction.create({
        ISBN: book.ISBN,
        action: 'ADJUSTMENT',
        qtyChanged: book.QTY,
        previousQty: 0,
        newQty: book.QTY,
        performedBy: req.user._id,
      });

      // Log book creation
      await logUserActivity(req.user._id, 'CREATE_BOOK', `Created book: ${book.TITLE} (ISBN: ${book.ISBN})`, req);

      res.status(201).json(book);
    } else {
      res.status(400);
      throw new Error('Invalid book data');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a book
// @route   PUT /api/books/:isbn
// @access  Private/Admin
const updateBook = async (req, res) => {
  try {
    const { isbn } = req.params;
    const { ISBN, SUBJECT, TITLE, EDITION, YEAR, AUTHOR, BIND, QTY, PRICE, PUBLISHER } = req.body;

    const book = await Book.findOne({ ISBN: isbn });
    if (!book) {
      res.status(404);
      throw new Error('Book not found');
    }

    // If ISBN is being changed, check if new ISBN already exists
    if (ISBN && ISBN !== isbn) {
      const isbnExists = await Book.findOne({ ISBN });
      if (isbnExists) {
        res.status(400);
        throw new Error('Book with this ISBN already exists');
      }
    }

    // Track what changed for logging
    const changes = [];
    if (ISBN && ISBN !== isbn) changes.push(`ISBN: ${isbn} -> ${ISBN}`);
    if (TITLE !== undefined && TITLE !== book.TITLE) changes.push(`Title: ${book.TITLE} -> ${TITLE}`);
    if (AUTHOR !== undefined && AUTHOR !== book.AUTHOR) changes.push(`Author: ${book.AUTHOR} -> ${AUTHOR}`);
    if (SUBJECT !== undefined && SUBJECT !== book.SUBJECT) changes.push(`Subject: ${book.SUBJECT} -> ${SUBJECT}`);
    if (EDITION !== undefined && EDITION !== book.EDITION) changes.push(`Edition: ${book.EDITION} -> ${EDITION}`);
    if (YEAR !== undefined && YEAR !== book.YEAR) changes.push(`Year: ${book.YEAR} -> ${YEAR}`);
    if (BIND !== undefined && BIND !== book.BIND) changes.push(`Binding: ${book.BIND} -> ${BIND}`);
    if (QTY !== undefined && QTY !== book.QTY) changes.push(`Quantity: ${book.QTY} -> ${QTY}`);
    if (PRICE !== undefined && PRICE !== book.PRICE) changes.push(`Price: ${book.PRICE} -> ${PRICE}`);
    if (PUBLISHER !== undefined && PUBLISHER !== book.PUBLISHER) changes.push(`Publisher: ${book.PUBLISHER} -> ${PUBLISHER}`);

    const updatedBook = await Book.findOneAndUpdate(
      { ISBN: isbn },
      {
        ISBN: ISBN || book.ISBN,
        SUBJECT: SUBJECT !== undefined ? SUBJECT : book.SUBJECT,
        TITLE: TITLE !== undefined ? TITLE : book.TITLE,
        EDITION: EDITION !== undefined ? EDITION : book.EDITION,
        YEAR: YEAR !== undefined ? YEAR : book.YEAR,
        AUTHOR: AUTHOR !== undefined ? AUTHOR : book.AUTHOR,
        BIND: BIND !== undefined ? BIND : book.BIND,
        QTY: QTY !== undefined ? QTY : book.QTY,
        PRICE: PRICE !== undefined ? PRICE : book.PRICE,
        PUBLISHER: PUBLISHER !== undefined ? PUBLISHER : book.PUBLISHER,
      },
      { new: true, runValidators: true }
    );

    if (updatedBook) {
      // Log book update
      if (changes.length > 0) {
        await logUserActivity(req.user._id, 'UPDATE_BOOK', `Updated book "${updatedBook.TITLE}" (ISBN: ${updatedBook.ISBN}): ${changes.join(', ')}`, req);
      }
      res.json(updatedBook);
    } else {
      res.status(400);
      throw new Error('Invalid book data');
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a book (soft archive)
// @route   DELETE /api/books/:isbn
// @access  Private/Admin
const deleteBook = async (req, res) => {
  try {
    const { isbn } = req.params;

    const book = await Book.findOne({ ISBN: isbn });
    if (!book) {
      res.status(404);
      throw new Error('Book not found');
    }

    if (book.isArchived) {
      res.status(400);
      throw new Error('Book is already archived');
    }

    const deletedBookTitle = book.TITLE;
    const deletedBookISBN = book.ISBN;

    // Soft archive - keep stock transactions for audit trail
    book.isArchived = true;
    await book.save();

    // Log book archival
    await logUserActivity(req.user._id, 'ARCHIVE_BOOK', `Archived book: ${deletedBookTitle} (ISBN: ${deletedBookISBN})`, req);

    res.json({ message: 'Book archived successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Restore an archived book
// @route   PUT /api/books/:isbn/restore
// @access  Private/Admin
const restoreBook = async (req, res) => {
  try {
    const { isbn } = req.params;

    const book = await Book.findOne({ ISBN: isbn });
    if (!book) {
      res.status(404);
      throw new Error('Book not found');
    }

    if (!book.isArchived) {
      res.status(400);
      throw new Error('Book is not archived');
    }

    book.isArchived = false;
    await book.save();

    // Log book restoration
    await logUserActivity(req.user._id, 'RESTORE_BOOK', `Restored book: ${book.TITLE} (ISBN: ${book.ISBN})`, req);

    res.json({ message: 'Book restored successfully', book });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/books/stats
// @access  Private
const getStats = async (req, res) => {
  try {
    const stats = await Book.aggregate([
      {
        $match: { isArchived: { $ne: true } }
      },
      {
        $group: {
          _id: null,
          totalBooks: { $sum: 1 },
          totalQuantity: { $sum: '$QTY' },
          lowStockCount: {
            $sum: {
              $cond: [{ $and: [{ $gt: ['$QTY', 0] }, { $lt: ['$QTY', { $ifNull: ['$MIN_QTY', 5] }] }] }, 1, 0]
            }
          },
          outOfStockCount: {
            $sum: { $cond: [{ $lte: ['$QTY', 0] }, 1, 0] }
          },
          inStockCount: {
            $sum: { $cond: [{ $gt: ['$QTY', 0] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalBooks: 0,
      totalQuantity: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      inStockCount: 0
    };

    // Also get today's transactions count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTransactions = await StockTransaction.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    res.json({
      totalBooks: result.totalBooks,
      totalQuantity: result.totalQuantity,
      lowStock: result.lowStockCount,
      outOfStock: result.outOfStockCount,
      inStock: result.inStockCount,
      todayTransactions
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get transaction history for a single book
// @route   GET /api/books/:isbn/transactions
// @access  Private
const getBookTransactions = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

    const transactions = await StockTransaction.find({ ISBN: req.params.isbn })
      .populate('performedBy', 'username email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await StockTransaction.countDocuments({ ISBN: req.params.isbn });

    res.json({
      transactions,
      page,
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get books that are out of stock (QTY <= 0)
// @route   GET /api/books/out-of-stock
// @access  Private
const getOutOfStockBooks = async (req, res) => {
  try {
    const query = { QTY: { $lte: 0 }, isArchived: { $ne: true } };

    // Accurate total (count is NOT capped by the list limit)
    const [count, books] = await Promise.all([
      Book.countDocuments(query),
      Book.find(query)
        .sort({ TITLE: 1 })
        .limit(200)
        .select('ISBN TITLE')
    ]);

    res.json({ books, count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBooks,
  getBookCatalog,
  lookupBookByISBN,
  createBook,
  updateBook,
  deleteBook,
  restoreBook,
  getStats,
  getBookTransactions,
  getOutOfStockBooks,
};