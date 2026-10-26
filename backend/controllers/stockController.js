const fs = require('fs');
const Book = require('../models/Book');
const StockTransaction = require('../models/StockTransaction');
const User = require('../models/User');
const UserLog = require('../models/UserLog');
const exceljs = require('exceljs');
const XLSX = require('xlsx');

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

// @desc    Update book stock (inbound/outbound)
// @route   PATCH /api/books/:isbn/stock
// @access  Private
const updateStock = async (req, res) => {
  const { isbn } = req.params;
  const { action, qtyChanged } = req.body; // action: 'INBOUND' or 'OUTBOUND'

  let statusCode = 500;
  try {
    const book = await Book.findOne({ ISBN: isbn });
    if (!book) {
      statusCode = 404;
      throw new Error('Book not found');
    }

    if (book.isArchived) {
      statusCode = 400;
      throw new Error('This book is archived. Restore it before changing stock.');
    }

    let newQty;
    if (action === 'INBOUND') {
      newQty = book.QTY + qtyChanged;
    } else if (action === 'OUTBOUND') {
      newQty = book.QTY - qtyChanged;
      if (newQty < 0) {
        statusCode = 400;
        throw new Error('Insufficient stock');
      }
      // Never ship stock already reserved for customers - only unreserved
      // copies can be scanned/bulk-imported out
      if (newQty < book.reservedQty) {
        statusCode = 400;
        const availableStock = book.QTY - book.reservedQty;
        throw new Error(`Only ${availableStock} unreserved (available) - ${book.reservedQty} reserved for customers`);
      }
    } else {
      statusCode = 400;
      throw new Error('Invalid action. Use INBOUND or OUTBOUND');
    }

    const previousQty = book.QTY;
    book.QTY = newQty;
    await book.save();

    // Create stock transaction record
    await StockTransaction.create({
      ISBN: book.ISBN,
      action,
      qtyChanged: action === 'INBOUND' ? qtyChanged : -qtyChanged,
      previousQty,
      newQty: book.QTY,
      performedBy: req.user._id,
    });

    // Log stock update
    await logUserActivity(req.user._id, `${action}_STOCK`, `Stock ${action.toLowerCase()}: "${book.TITLE}" (ISBN: ${book.ISBN}) - Qty: ${previousQty} -> ${newQty}`, req);

    const minQty = book.MIN_QTY ?? 5;
    if (newQty > 0 && newQty <= minQty) {
      res.json({
        ...book.toObject(),
        lowStockWarning: true,
        warningMessage: `Low stock: ${newQty} left (min ${minQty})`
      });
    } else {
      res.json(book);
    }
  } catch (error) {
    res.status(statusCode).json({ message: error.message });
  }
};

// @desc    Bulk import books (optimized with bulk operations)
// @route   POST /api/books/bulk-import
// @access  Private/Admin
const bulkImportBooks = async (req, res) => {
  let file = null;
  let statusCode = 500;
  try {
    if (!req.file) {
      statusCode = 400;
      throw new Error('No file uploaded');
    }

    file = req.file;
    const { mode } = req.body; // 'skip', 'update', or 'merge'

    if (!mode || !['skip', 'update', 'merge'].includes(mode)) {
      statusCode = 400;
      throw new Error('Invalid import mode. Use skip, update, or merge');
    }

    // Parse file based on extension
    let rows = [];
    if (file.originalname.endsWith('.csv')) {
      const csv = fs.readFileSync(file.path, 'utf8');
      const lines = csv.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] !== undefined ? values[index] : '';
        });
        return row;
      });
    } else {
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
    }

    // Validate and prepare data
    const validRows = [];
    const errors = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const { ISBN, SUBJECT, TITLE, EDITION, YEAR, AUTHOR, BIND, QTY, PRICE, PUBLISHER } = row;

      if (!ISBN || !TITLE || PRICE === undefined) {
        errors.push({ row: rowNum, message: 'Missing required fields: ISBN, TITLE, or PRICE', data: row });
        return;
      }

      if (isNaN(Number(PRICE)) || Number(PRICE) < 0) {
        errors.push({ row: rowNum, message: 'PRICE must be a non-negative number', data: row });
        return;
      }

      let qtyValue = 0;
      if (QTY !== undefined && QTY !== '' && !isNaN(Number(QTY))) {
        qtyValue = Number(QTY);
        if (qtyValue < 0) qtyValue = 0;
      }

      validRows.push({
        ISBN: String(ISBN).trim(),
        SUBJECT: String(SUBJECT || '').trim(),
        TITLE: String(TITLE).trim(),
        EDITION: String(EDITION || '').trim(),
        YEAR: String(YEAR || '').trim(),
        AUTHOR: String(AUTHOR || '').trim(),
        BIND: String(BIND || '').trim(),
        QTY: qtyValue,
        PRICE: Number(PRICE),
        PUBLISHER: String(PUBLISHER || '').trim()
      });
    });

    if (validRows.length === 0) {
      statusCode = 400;
      throw new Error('No valid rows found in the file');
    }

    // Fetch all existing books in ONE query
    const isbns = validRows.map(r => r.ISBN);
    const existingBooks = await Book.find({ ISBN: { $in: isbns } }).lean();
    const existingMap = new Map(existingBooks.map(b => [b.ISBN, b]));

    // Prepare bulk operations
    const bookBulkOps = [];
    const transactionBulkOps = [];
    const results = { succeeded: 0, skipped: 0, updated: 0, merged: 0, errors: [] };

    for (const rowData of validRows) {
      const { ISBN } = rowData;
      const existing = existingMap.get(ISBN);

      try {
        if (existing && existing.isArchived) {
          results.errors.push({
            row: validRows.indexOf(rowData) + 2,
            message: 'Book is archived and cannot be updated via import. Restore it first.',
            data: rowData
          });
          continue;
        }

        if (mode === 'skip' && existing) {
          results.skipped++;
          continue;
        }

        if (existing) {
          // Existing book - prepare update/merge
          let bookUpdate;
          let qtyChanged;
          let previousQty = existing.QTY;
          let newQty;

          if (mode === 'update') {
            bookUpdate = { $set: { ...rowData } };
            qtyChanged = rowData.QTY - existing.QTY;
            newQty = rowData.QTY;
            results.updated++;
          } else { // merge
            bookUpdate = {
              $set: {
                SUBJECT: rowData.SUBJECT || existing.SUBJECT,
                TITLE: rowData.TITLE || existing.TITLE,
                EDITION: rowData.EDITION || existing.EDITION,
                YEAR: rowData.YEAR || existing.YEAR,
                AUTHOR: rowData.AUTHOR || existing.AUTHOR,
                BIND: rowData.BIND || existing.BIND,
                PRICE: rowData.PRICE || existing.PRICE,
                PUBLISHER: rowData.PUBLISHER || existing.PUBLISHER
              },
              $inc: { QTY: rowData.QTY }
            };
            qtyChanged = rowData.QTY;
            newQty = existing.QTY + rowData.QTY;
            results.merged++;
          }

          bookBulkOps.push({ updateOne: { filter: { ISBN }, update: bookUpdate } });
          transactionBulkOps.push({
            insertOne: { document: { ISBN, action: 'BULK_IMPORT', qtyChanged, previousQty, newQty, performedBy: req.user._id } }
          });
        } else {
          // New book
          bookBulkOps.push({ insertOne: { document: rowData } });
          transactionBulkOps.push({
            insertOne: { document: { ISBN, action: 'BULK_IMPORT', qtyChanged: rowData.QTY, previousQty: 0, newQty: rowData.QTY, performedBy: req.user._id } }
          });
          results.succeeded++;
        }
      } catch (error) {
        results.errors.push({ row: validRows.indexOf(rowData) + 2, message: error.message, data: rowData });
      }
    }

    // Execute bulk operations in parallel
    if (bookBulkOps.length > 0) {
      await Book.bulkWrite(bookBulkOps, { ordered: false });
    }
    if (transactionBulkOps.length > 0) {
      await StockTransaction.bulkWrite(transactionBulkOps, { ordered: false });
    }

    res.json({ message: 'Bulk import completed', results });

    // Log bulk import
    await logUserActivity(req.user._id, 'BULK_IMPORT', `Bulk imported books: ${results.succeeded} created, ${results.updated} updated, ${results.merged} merged, ${results.skipped} skipped, ${results.errors.length} errors`, req);

  } catch (error) {
    res.status(statusCode).json({ message: error.message });
  } finally {
    if (file && file.path) {
      fs.unlink(file.path, (err) => { if (err) console.error('Failed to delete uploaded file:', err); });
    }
  }
};

// @desc    Export books to Excel
// @route   GET /api/stock/export
// @access  Private/Admin
const exportBooks = async (req, res) => {
  try {
    const { byCategory } = req.query;
    const books = await Book.find({}).sort({ SUBJECT: 1, TITLE: 1 });

    // Create workbook
    const workbook = new exceljs.Workbook();

    if (byCategory === 'true') {
      // Group books by SUBJECT (category)
      const booksByCategory = {};
      books.forEach(book => {
        const category = book.SUBJECT || 'Uncategorized';
        if (!booksByCategory[category]) {
          booksByCategory[category] = [];
        }
        booksByCategory[category].push(book);
      });

      // Create a worksheet for each category
      // Track used sheet names to handle duplicates (case-insensitive for Excel)
      const usedNames = new Set();
      const lowerUsedNames = new Set();
      Object.keys(booksByCategory).forEach(category => {
        // Sanitize sheet name for Excel (max 31 chars, no special chars)
        const sheetName = sanitizeSheetName(category, usedNames, lowerUsedNames);
        const worksheet = workbook.addWorksheet(sheetName);

        // Add headers
        worksheet.columns = [
          { header: 'ISBN', key: 'ISBN', width: 20 },
          { header: 'SUBJECT', key: 'SUBJECT', width: 20 },
          { header: 'TITLE', key: 'TITLE', width: 30 },
          { header: 'EDITION', key: 'EDITION', width: 15 },
          { header: 'YEAR', key: 'YEAR', width: 10 },
          { header: 'AUTHOR', key: 'AUTHOR', width: 25 },
          { header: 'BIND', key: 'BIND', width: 15 },
          { header: 'QTY', key: 'QTY', width: 10 },
          { header: 'PRICE', key: 'PRICE', width: 10 },
          { header: 'PUBLISHER', key: 'PUBLISHER', width: 25 }
        ];

        // Add data rows for this category
        booksByCategory[category].forEach(book => {
          worksheet.addRow({
            ISBN: book.ISBN,
            SUBJECT: book.SUBJECT,
            TITLE: book.TITLE,
            EDITION: book.EDITION,
            YEAR: book.YEAR,
            AUTHOR: book.AUTHOR,
            BIND: book.BIND,
            QTY: book.QTY,
            PRICE: book.PRICE,
            PUBLISHER: book.PUBLISHER
          });
        });

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      });
    } else {
      // Original single sheet export
      const worksheet = workbook.addWorksheet('Books Inventory');

      // Add headers
      worksheet.columns = [
        { header: 'ISBN', key: 'ISBN', width: 20 },
        { header: 'SUBJECT', key: 'SUBJECT', width: 20 },
        { header: 'TITLE', key: 'TITLE', width: 30 },
        { header: 'EDITION', key: 'EDITION', width: 15 },
        { header: 'YEAR', key: 'YEAR', width: 10 },
        { header: 'AUTHOR', key: 'AUTHOR', width: 25 },
        { header: 'BIND', key: 'BIND', width: 15 },
        { header: 'QTY', key: 'QTY', width: 10 },
        { header: 'PRICE', key: 'PRICE', width: 10 },
        { header: 'PUBLISHER', key: 'PUBLISHER', width: 25 }
      ];

      // Add data rows
      books.forEach(book => {
        worksheet.addRow({
          ISBN: book.ISBN,
          SUBJECT: book.SUBJECT,
          TITLE: book.TITLE,
          EDITION: book.EDITION,
          YEAR: book.YEAR,
          AUTHOR: book.AUTHOR,
          BIND: book.BIND,
          QTY: book.QTY,
          PRICE: book.PRICE,
          PUBLISHER: book.PUBLISHER
        });
      });

      // Style the header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const filename = byCategory === 'true'
      ? 'books-inventory-by-category.xlsx'
      : 'books-inventory.xlsx';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${filename}`
    );

    // Send the file
    await workbook.xlsx.write(res);

    // Log export
    await logUserActivity(req.user._id, 'EXPORT_BOOKS', `Exported books inventory${byCategory === 'true' ? ' by category' : ''} (${books.length} books)`, req);

    res.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Excel reserves the sheet name "History" (revision history) - exceljs throws
// on it and Excel itself refuses to open such a workbook. Treat any casing as
// reserved so the file always opens.
const RESERVED_SHEET_NAME = /^history$/i;

// Helper function to sanitize Excel sheet names
const sanitizeSheetName = (name, usedNames = new Set(), lowerUsedNames = new Set()) => {
  // Excel sheet names: max 31 chars, no [ ] * ? / \ : and no leading/trailing apostrophes
  let sanitized = name
    .replace(/[\[\]*?\/\\:]/g, '_')
    .replace(/^'+|'+$/g, '')
    .substring(0, 31)
    || 'Sheet';

  // Handle duplicates by appending a counter
  // Use case-insensitive comparison since Excel sheet names are case-insensitive
  let finalName = sanitized;
  let counter = 1;
  while (lowerUsedNames.has(finalName.toLowerCase()) || RESERVED_SHEET_NAME.test(finalName)) {
    counter++;
    const suffix = `_${counter}`;
    // Ensure we don't exceed 31 chars
    finalName = sanitized.substring(0, 31 - suffix.length) + suffix;
  }
  usedNames.add(finalName);
  lowerUsedNames.add(finalName.toLowerCase());
  return finalName;
};

// @desc    Get all stock transactions with user info
// @route   GET /api/stock/transactions
// @access  Private/Admin
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', action = '', userId = '', startDate = '', endDate = '' } = req.query;

    // Build query
    const query = {};

    if (action) {
      query.action = action;
    }

    if (userId) {
      query.performedBy = userId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Search in ISBN or user name/email - fold into the Mongo query before pagination
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');

      // Find users matching the search by username or email
      const matchingUsers = await User.find({
        $or: [{ username: searchRegex }, { email: searchRegex }]
      }).select('_id');

      const orConditions = [{ ISBN: searchRegex }];
      if (matchingUsers.length > 0) {
        orConditions.push({ performedBy: { $in: matchingUsers.map(u => u._id) } });
      }
      query.$or = orConditions;
    }

    const transactions = await StockTransaction.find(query)
      .populate('performedBy', 'username email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await StockTransaction.countDocuments(query);

    res.json({
      transactions,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export stock transactions to Excel
// @route   GET /api/stock/transactions/export
// @access  Private/Admin
const exportTransactions = async (req, res) => {
  try {
    const { action = '', userId = '', startDate = '', endDate = '' } = req.query;

    // Build query
    const query = {};

    if (action) {
      query.action = action;
    }

    if (userId) {
      query.performedBy = userId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await StockTransaction.find(query)
      .populate('performedBy', 'username email role')
      .sort({ createdAt: -1 });

    // Create workbook
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('User Transaction Log');

    // Add headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 20 },
      { header: 'ISBN', key: 'ISBN', width: 20 },
      { header: 'Action', key: 'action', width: 15 },
      { header: 'Qty Changed', key: 'qtyChanged', width: 15 },
      { header: 'Previous Qty', key: 'previousQty', width: 15 },
      { header: 'New Qty', key: 'newQty', width: 15 },
      { header: 'Performed By (Username)', key: 'username', width: 25 },
      { header: 'Performed By (Email)', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 15 }
    ];

    // Add data rows
    transactions.forEach(transaction => {
      const date = new Date(transaction.createdAt).toLocaleString();
      worksheet.addRow({
        date,
        ISBN: transaction.ISBN,
        action: transaction.action,
        qtyChanged: transaction.qtyChanged,
        previousQty: transaction.previousQty,
        newQty: transaction.newQty,
        username: transaction.performedBy?.username || 'Unknown',
        email: transaction.performedBy?.email || 'Unknown',
        role: transaction.performedBy?.role || 'Unknown'
      });
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=user-transaction-log-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    // Send the file
    await workbook.xlsx.write(res);

    // Log export
    await logUserActivity(req.user._id, 'EXPORT_STOCK_TRANSACTIONS', `Exported stock transactions (${transactions.length} transactions)`, req);

    res.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Daily inbound/outbound totals for the dashboard chart
// @route   GET /api/stock/summary
// @access  Private
const getStockSummary = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 14, 7), 90);

    // Start of the window in server-local time (same "today" getStats uses)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    // Group by calendar day in the server's own timezone so the chart's days
    // line up with how users experience "today". An IANA zone name (unlike a
    // fixed offset) tracks DST changes across the window; fall back to the
    // request-time offset if the runtime can't resolve one.
    const offsetMinutes = -start.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      || `${sign}${String(Math.floor(absOffset / 60)).padStart(2, '0')}:${String(absOffset % 60).padStart(2, '0')}`;

    const buckets = await StockTransaction.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } },
            // Direction by sign, not action name: adjustments and bulk imports
            // land on the side their quantity moves
            direction: { $cond: [{ $gte: ['$qtyChanged', 0] }, 'inbound', 'outbound'] }
          },
          qty: { $sum: { $abs: '$qtyChanged' } }
        }
      }
    ]);

    const byDay = {};
    buckets.forEach(bucket => {
      const entry = (byDay[bucket._id.day] = byDay[bucket._id.day] || { inbound: 0, outbound: 0 });
      entry[bucket._id.direction] = bucket.qty;
    });

    // Fill missing days with zeros so the chart gets a continuous axis
    const perDay = [];
    const cursor = new Date(start);
    for (let i = 0; i < days; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      perDay.push({ date: key, ...(byDay[key] || { inbound: 0, outbound: 0 }) });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.json({ days, perDay });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Recent stock transactions for the dashboard activity feed
// @route   GET /api/stock/recent
// @access  Private
const getRecentTransactions = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 50);

    const transactions = await StockTransaction.find({})
      .populate('performedBy', 'username')
      .sort({ createdAt: -1 })
      .limit(limit);

    // Batch-fetch book titles for the feed in one query
    const isbns = [...new Set(transactions.map(t => t.ISBN))];
    const books = isbns.length
      ? await Book.find({ ISBN: { $in: isbns } }).select('ISBN TITLE')
      : [];
    const titles = Object.fromEntries(books.map(b => [b.ISBN, b.TITLE]));

    res.json({
      transactions: transactions.map(t => ({
        _id: t._id,
        ISBN: t.ISBN,
        title: titles[t.ISBN] || '',
        action: t.action,
        qtyChanged: t.qtyChanged,
        newQty: t.newQty,
        performedBy: t.performedBy ? { username: t.performedBy.username } : null,
        createdAt: t.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  updateStock,
  bulkImportBooks,
  exportBooks,
  getTransactions,
  exportTransactions,
  getStockSummary,
  getRecentTransactions
};