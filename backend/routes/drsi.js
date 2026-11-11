const express = require('express');
const router = express.Router();
const DeliveryReceipt = require('../models/DeliveryReceipt');
const SalesInvoice = require('../models/SalesInvoice');
const Book = require('../models/Book');
const StockTransaction = require('../models/StockTransaction');
const Customer = require('../models/Customer');
const { protect, admin } = require('../middleware/auth');
const UserLog = require('../models/UserLog');
const { generate, generateEF } = require('../services/documentGenerator');

// All document routes require auth; cancelling issued docs is admin-only
// (matching the frontend, which only shows the Cancel button to admins)
router.use(protect);

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

// ============================================
// DELIVERY RECEIPTS
// ============================================

// List DRs with search/filter
router.get('/dr', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$text = { $search: search };
    }
    if (status) query.status = status;
    if (req.query.deliveryStatus) query.deliveryStatus = req.query.deliveryStatus;
    if (req.query.efRef) query.efRef = req.query.efRef;

    const [drs, total] = await Promise.all([
      DeliveryReceipt.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('createdBy', 'username')
        .populate('efRef', 'efNumber')
        .populate('marketingExecutive', 'name'),
      DeliveryReceipt.countDocuments(query)
    ]);

    res.json({ drs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Helper function to check for duplicate ISBNs
const checkDuplicateISBNs = (items) => {
  const isbnCounts = {};
  const duplicates = [];

  items.forEach((item, index) => {
    const isbn = item.isbn?.trim();
    if (isbn) {
      if (isbnCounts[isbn] === undefined) {
        isbnCounts[isbn] = { count: 1, indices: [index] };
      } else {
        isbnCounts[isbn].count++;
        isbnCounts[isbn].indices.push(index);
      }
    }
  });

  for (const [isbn, data] of Object.entries(isbnCounts)) {
    if (data.count > 1) {
      duplicates.push({
        isbn,
        count: data.count,
        indices: data.indices
      });
    }
  }

  return duplicates;
};

// Create DR (draft)
router.post('/dr', async (req, res) => {
  try {
    const { drNumber, date, customerName, customerAddress, marketingExecutive, items, allowDuplicates, efRef } = req.body;

    if (!drNumber || !customerName || !items?.length) {
      return res.status(400).json({ message: 'drNumber, customerName, and items are required' });
    }

    const existing = await DeliveryReceipt.findOne({ drNumber });
    if (existing) {
      return res.status(400).json({ message: 'DR number already exists' });
    }

    // Check for duplicate ISBNs
    const duplicates = checkDuplicateISBNs(items);
    if (duplicates.length > 0 && !allowDuplicates) {
      return res.status(409).json({
        message: 'Duplicate ISBNs detected',
        code: 'DUPLICATE_ISBNS',
        duplicates: duplicates.map(d => ({
          isbn: d.isbn,
          count: d.count,
          lineNumbers: d.indices.map(i => i + 1)
        }))
      });
    }

    // Determine if this DR is linked to an EF (should not reserve stock)
    const isEfLinked = !!efRef;

    // Validate stock availability for reservation only if not EF-linked
    const bookUpdates = []; // to track books we need to update for rollback
    if (!isEfLinked) {
      for (const item of items) {
        const book = await Book.findOne({ ISBN: item.isbn });
        if (!book) {
          return res.status(400).json({ message: `Book not found: ${item.isbn}` });
        }
        const availableStock = book.QTY - book.reservedQty;
        if (availableStock < item.qty) {
          return res.status(400).json({ message: `Insufficient available stock for ${item.isbn} (${book.TITLE}). Available: ${availableStock}, Requested: ${item.qty}` });
        }
        bookUpdates.push({ book, qty: item.qty });
      }
    }

    // Create and save DR
    const dr = new DeliveryReceipt({
      drNumber,
      date: date ? new Date(date) : null,
      customerName,
      customerAddress,
      marketingExecutive: marketingExecutive || null,
      efRef: efRef || null, // ensure efRef is stored
      items: items.map(item => ({
        ...item,
        amount: item.qty * item.unitPrice
      })),
      createdBy: req.user._id
    });

    await dr.save();
    await dr.populate('marketingExecutive', 'name');
    await Customer.recordCustomer(dr.customerName, dr.customerAddress);

    // Apply reservations: increment reservedQty for each book (only for standalone DRs)
    if (!isEfLinked) {
      try {
        for (const { book, qty } of bookUpdates) {
          book.reservedQty += qty;
          await book.save();
          // Optional: create RESERVE StockTransaction for audit trail
          await StockTransaction.create({
            ISBN: book.ISBN,
            action: 'RESERVE',
            qtyChanged: 0,
            previousQty: book.QTY, // Note: QTY unchanged by reservation
            newQty: book.QTY,
            performedBy: req.user._id
          });
        }
      } catch (reservationError) {
        // Rollback: delete the DR and revert any book updates we already made
        await DeliveryReceipt.deleteOne({ _id: dr._id });
        // Revert book updates (decrement reservedQty back)
        for (const { book, qty } of bookUpdates) {
          try {
            book.reservedQty -= qty;
            await book.save();
            // Optional: delete the RESERVE transaction we just created? We'll skip for simplicity.
          } catch (revertError) {
            console.error(`Failed to revert reservation for ISBN ${book.ISBN}:`, revertError);
          }
        }
        throw reservationError; // re-throw to be caught by outer catch
      }
    }

    await logUserActivity(req.user._id, 'CREATE_DR', `Created DR ${dr.drNumber} for ${dr.customerName} (${dr.items.length} items)`, req);
    res.status(201).json(dr);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get DR by ID
router.get('/dr/:id', async (req, res) => {
  try {
    const dr = await DeliveryReceipt.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('efRef', 'efNumber')
      .populate('marketingExecutive', 'name');
    if (!dr) return res.status(404).json({ message: 'Delivery Receipt not found' });
    res.json(dr);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update DR (draft only)
router.put('/dr/:id', async (req, res) => {
  try {
    const dr = await DeliveryReceipt.findById(req.params.id);
    if (!dr) return res.status(404).json({ message: 'Delivery Receipt not found' });
    if (dr.status !== 'draft') return res.status(400).json({ message: 'Cannot update issued DR' });

    const { drNumber, date, customerName, customerAddress, marketingExecutive, items, allowDuplicates } = req.body;

    if (drNumber && drNumber !== dr.drNumber) {
      const existing = await DeliveryReceipt.findOne({ drNumber });
      if (existing) return res.status(400).json({ message: 'DR number already exists' });
      dr.drNumber = drNumber;
    }

    if (date !== undefined) dr.date = date ? new Date(date) : null;
    if (customerName) dr.customerName = customerName;
    if (customerAddress !== undefined) dr.customerAddress = customerAddress;
    if (marketingExecutive !== undefined) dr.marketingExecutive = marketingExecutive || null;

    // Preserve existing items if not provided in update
    const newItems = items !== undefined ? items : dr.items;
    // Snapshot the original items so reservation deltas are computed against
    // the pre-edit quantities (dr.items is overwritten with newItems below)
    const previousItems = dr.items.map(item => ({ isbn: item.isbn, qty: item.qty }));

    if (items !== undefined) {
      // Check for duplicate ISBNs
      const duplicates = checkDuplicateISBNs(items);
      if (duplicates.length > 0 && !allowDuplicates) {
        return res.status(409).json({
          message: 'Duplicate ISBNs detected',
          code: 'DUPLICATE_ISBNS',
          duplicates: duplicates.map(d => ({
            isbn: d.isbn,
            count: d.count,
            lineNumbers: d.indices.map(i => i + 1)
          }))
        });
      }
    }

    // Apply updates to DR first
    if (drNumber && drNumber !== dr.drNumber) {
      dr.drNumber = drNumber;
    }
    if (date !== undefined) dr.date = date ? new Date(date) : null;
    if (customerName) dr.customerName = customerName;
    if (customerAddress !== undefined) dr.customerAddress = customerAddress;
    if (marketingExecutive !== undefined) dr.marketingExecutive = marketingExecutive || null;
    if (items !== undefined) {
      dr.items = newItems.map(item => ({
        ...item,
        amount: item.qty * item.unitPrice
      }));
    }

    // Compute reservation changes BEFORE saving so a stock-availability
    // failure doesn't leave the DR updated without its reservation.
    // Deltas are computed from previousItems (the original quantities).
    const bookInfos = [];
    if (!dr.efRef) {
      // Compute reservation changes: delta = newQty - oldQty per ISBN
      const oldItemsMap = new Map();
      previousItems.forEach(item => {
        const isbn = item.isbn?.trim();
        if (isbn) {
          const current = oldItemsMap.get(isbn) || 0;
          oldItemsMap.set(isbn, current + item.qty);
        }
      });

      const newItemsMap = new Map();
      newItems.forEach(item => {
        const isbn = item.isbn?.trim();
        if (isbn) {
          const current = newItemsMap.get(isbn) || 0;
          newItemsMap.set(isbn, current + item.qty);
        }
      });

      // Collect all ISBNs that have changes
      const allIsbns = new Set([...oldItemsMap.keys(), ...newItemsMap.keys()]);
      const increases = []; // {isbn, delta} where delta > 0
      const decreases = []; // {isbn, delta} where delta < 0 (we'll store positive magnitude for release)

      for (const isbn of allIsbns) {
        const oldQty = oldItemsMap.get(isbn) || 0;
        const newQty = newItemsMap.get(isbn) || 0;
        const delta = newQty - oldQty;
        if (delta > 0) {
          increases.push({ isbn, delta });
        } else if (delta < 0) {
          decreases.push({ isbn, delta: -delta }); // store positive amount to release
        }
        // delta == 0: no change
      }

      // Check availability for all increases first
      for (const { isbn, delta } of increases) {
        const book = await Book.findOne({ ISBN: isbn });
        if (!book) {
          return res.status(400).json({ message: `Book not found: ${isbn}` });
        }
        const availableStock = book.QTY - book.reservedQty;
        if (availableStock < delta) {
          return res.status(400).json({ message: `Insufficient available stock for ${isbn} (${book.TITLE}). Available: ${availableStock}, Requested: ${delta}` });
        }
        bookInfos.push({ book, isbn, delta, type: 'increase' });
      }

      // Also fetch books for decreases (to update reservedQty)
      for (const { isbn, delta } of decreases) {
        const book = await Book.findOne({ ISBN: isbn });
        if (!book) {
          return res.status(400).json({ message: `Book not found: ${isbn}` });
        }
        bookInfos.push({ book, isbn, delta, type: 'decrease' });
      }
    }

    await dr.save();
    await dr.populate('marketingExecutive', 'name');
    await Customer.recordCustomer(dr.customerName, dr.customerAddress);

    // Apply reservation changes: update reservedQty for each book (only for standalone DRs)
    if (bookInfos.length > 0) {
      try {
        for (const { book, delta, type } of bookInfos) {
          if (type === 'increase') {
            book.reservedQty += delta;
          } else {
            book.reservedQty -= delta;
            // Ensure reservedQty doesn't go negative (shouldn't happen if logic correct)
            if (book.reservedQty < 0) {
              book.reservedQty = 0;
            }
          }
          await book.save();
          // Optional: create RESERVE/RELEASE StockTransaction for audit trail
          await StockTransaction.create({
            ISBN: book.ISBN,
            action: type === 'increase' ? 'RESERVE' : 'RELEASE',
            qtyChanged: 0,
            previousQty: book.QTY, // QTY unchanged by reservation adjustment
            newQty: book.QTY,
            performedBy: req.user._id
          });
        }
      } catch (reservationError) {
        // The DR is already saved at this point; a failure mid-application can
        // leave some reservedQty adjustments applied. Full consistency would
        // need a MongoDB transaction, so we log and surface the error.
        console.error('Failed to update reservations:', reservationError);
        throw reservationError;
      }
    }

    await logUserActivity(req.user._id, 'UPDATE_DR', `Updated DR ${dr.drNumber}`, req);
    res.json(dr);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete DR (draft only)
router.delete('/dr/:id', async (req, res) => {
  try {
    const dr = await DeliveryReceipt.findById(req.params.id);
    if (!dr) return res.status(404).json({ message: 'Delivery Receipt not found' });
    if (dr.status !== 'draft') return res.status(400).json({ message: 'Cannot delete issued DR' });

    // Release reservations for each item (only for standalone DRs)
    if (!dr.efRef) {
      for (const item of dr.items) {
        const book = await Book.findOne({ ISBN: item.isbn });
        if (!book) {
          return res.status(400).json({ message: `Book not found: ${item.isbn}` });
        }
        if (book.reservedQty < item.qty) {
          // This should not happen if reservations are tracked correctly, but guard anyway
          return res.status(400).json({ message: `Insufficient reservation to release for ${item.isbn}` });
        }
        book.reservedQty -= item.qty;
        await book.save();
        // Optional: create RELEASE StockTransaction for audit trail
        await StockTransaction.create({
          ISBN: book.ISBN,
          action: 'RELEASE',
          qtyChanged: 0,
          previousQty: book.QTY, // QTY unchanged by reservation release
          newQty: book.QTY,
          performedBy: req.user._id
        });
      }
    }

    const { drNumber } = dr;
    await dr.deleteOne();
    await logUserActivity(req.user._id, 'DELETE_DR', `Deleted DR ${drNumber}`, req);
    res.json({ message: 'Delivery Receipt deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Issue DR - decrement stock and reservedQty for standalone DRs, create linked SI draft
router.post('/dr/:id/issue', async (req, res) => {
  try {
    // Pre-validate all items before mutating anything
    const existing = await DeliveryReceipt.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Delivery Receipt not found' });

    for (const item of existing.items) {
      const book = await Book.findOne({ ISBN: item.isbn });
      if (!book) {
        return res.status(400).json({ message: `Book not found: ${item.isbn}` });
      }
      if (book.QTY < item.qty) {
        return res.status(400).json({ message: `Insufficient stock for ${item.isbn} (${book.TITLE}). Available: ${book.QTY}, Requested: ${item.qty}` });
      }
    }

    // Atomic claim (guards double-click): flip draft -> issued
    // Standalone DRs enter delivery tracking as out for delivery (EF-linked DRs move no stock and stay 'pending')
    const claimUpdate = { status: 'issued' };
    if (!existing.efRef) claimUpdate.deliveryStatus = 'out_for_delivery';
    const dr = await DeliveryReceipt.findOneAndUpdate(
      { _id: req.params.id, status: 'draft' },
      claimUpdate,
      { new: true }
    );
    if (!dr) return res.status(400).json({ message: 'DR already issued or cancelled' });

    // Track mutations for rollback
    const mutations = [];

    try {
      // Check if this DR is linked to an EF (should not decrement stock or reservedQty)
      const isEfLinked = !!dr.efRef;

      if (!isEfLinked) {
        // Decrement stock and reservedQty for each item (standalone DR)
        for (const item of dr.items) {
          const book = await Book.findOne({ ISBN: item.isbn });
          if (!book) {
            throw new Error(`Book not found: ${item.isbn}`);
          }

          // Re-check at mutation time: stock may have changed since pre-validation
          if (book.QTY < item.qty) {
            throw new Error(`Insufficient stock for ${item.isbn} (${book.TITLE}). Available: ${book.QTY}, Requested: ${item.qty}`);
          }
          // Also ensure reservedQty >= item.qty (should hold)
          if (book.reservedQty < item.qty) {
            throw new Error(`Insufficient reservation for ${item.isbn} (${book.TITLE}). Available reservation: ${book.reservedQty}, Requested: ${item.qty}`);
          }

          const previousQty = book.QTY;
          const previousReservedQty = book.reservedQty;
          book.QTY = previousQty - item.qty;
          book.reservedQty = previousReservedQty - item.qty;
          await book.save();

          const transactionRecord = await StockTransaction.create({
            ISBN: book.ISBN,
            action: 'OUTBOUND',
            qtyChanged: -item.qty,
            previousQty,
            newQty: book.QTY,
            performedBy: req.user._id,
          });

          mutations.push({ book, previousQty, previousReservedQty, qtyTaken: item.qty, transactionRecord });
        }
      }

      // Create linked SI draft (always)
      const si = new SalesInvoice({
        siNumber: `SI-${dr.drNumber.replace('DR-', '')}`, // Derive from DR number
        drRef: dr._id,
        date: dr.date || null, // inherit the DR's date (or its absence)
        customerName: dr.customerName,
        customerAddress: dr.customerAddress,
        poNumber: '',
        items: dr.items.map(item => ({ ...item.toObject() })),
        createdBy: req.user._id
      });
      await si.save();

      await logUserActivity(req.user._id, 'ISSUE_DR', `Issued DR ${dr.drNumber} for ${dr.customerName}`, req);

      res.json({ dr, si });
    } catch (err) {
      // Roll back: restore stock and reservedQty, remove transaction records, revert DR to draft
      for (const mutation of mutations) {
        try {
          mutation.book.QTY = mutation.previousQty;
          mutation.book.reservedQty = mutation.previousReservedQty;
          await mutation.book.save();
          if (mutation.transactionRecord) {
            await StockTransaction.deleteOne({ _id: mutation.transactionRecord._id });
          }
        } catch (rollbackErr) {
          console.error(`Rollback failed for ISBN ${mutation.book.ISBN}:`, rollbackErr);
        }
      }
      // Also revert the deliveryStatus the claim set (standalone DRs only)
      const rollbackUpdate = { status: 'draft' };
      if (!dr.efRef) rollbackUpdate.deliveryStatus = 'pending';
      await DeliveryReceipt.findOneAndUpdate({ _id: dr._id, status: 'issued' }, rollbackUpdate);
      console.error('Issue DR failed, rolled back:', err);
      return res.status(500).json({ message: err.message });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark DR delivered (issued standalone DRs only - EF-linked DRs are not delivery-tracked)
router.post('/dr/:id/deliver', async (req, res) => {
  try {
    const existing = await DeliveryReceipt.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'DR not found' });
    if (existing.efRef) return res.status(400).json({ message: 'DR is linked to an Evaluation Form - delivery tracking does not apply' });

    // Atomic claim (guards double-click): out_for_delivery -> delivered
    const dr = await DeliveryReceipt.findOneAndUpdate(
      { _id: req.params.id, status: 'issued', deliveryStatus: 'out_for_delivery' },
      { deliveryStatus: 'delivered', deliveredAt: new Date(), deliveredBy: req.user._id },
      { new: true }
    );
    if (!dr) return res.status(400).json({ message: 'DR is not out for delivery' });

    await logUserActivity(req.user._id, 'DELIVER_DR', `Marked DR ${dr.drNumber} as delivered`, req);

    res.json({ dr });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Return DR (issued standalone DRs) - restores stock; linked SI is left untouched
router.post('/dr/:id/return', async (req, res) => {
  try {
    const { returnReason } = req.body;
    if (!returnReason || !returnReason.trim()) {
      return res.status(400).json({ message: 'returnReason is required' });
    }

    const existing = await DeliveryReceipt.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'DR not found' });
    if (existing.efRef) return res.status(400).json({ message: 'DR is linked to an Evaluation Form - delivery tracking does not apply' });

    // Atomic claim (guards double-click): stock must restore exactly once
    const dr = await DeliveryReceipt.findOneAndUpdate(
      { _id: req.params.id, status: 'issued', deliveryStatus: { $in: ['out_for_delivery', 'delivered'] } },
      { deliveryStatus: 'returned', returnedAt: new Date(), returnReason: returnReason.trim() },
      { new: true }
    );
    if (!dr) return res.status(400).json({ message: 'DR is not out for delivery or delivered' });

    // Restore stock for each item (reverse of issue) - only for standalone DRs
    const missingBooks = [];
    if (!dr.efRef) {
      for (const item of dr.items) {
        try {
          const book = await Book.findOne({ ISBN: item.isbn });
          if (!book) {
            missingBooks.push(item.isbn);
            continue;
          }

          const previousQty = book.QTY;
          book.QTY += item.qty;
          await book.save();

          // Create stock transaction record
          await StockTransaction.create({
            ISBN: book.ISBN,
            action: 'INBOUND',
            qtyChanged: item.qty,
            previousQty,
            newQty: book.QTY,
            performedBy: req.user._id,
          });
        } catch (err) {
          console.error(`Failed to restore stock for ISBN ${item.isbn}:`, err);
          missingBooks.push(item.isbn);
        }
      }
    }

    const missingNote = missingBooks.length > 0 ? ` (WARNING: no book record found for ISBNs: ${missingBooks.join(', ')} - stock not restored for those items)` : '';
    await logUserActivity(req.user._id, 'RETURN_DR', `Returned DR ${dr.drNumber} - Reason: ${returnReason.trim()}${missingNote}`, req);

    res.json({ dr });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel DR (issued only) - cascades to linked draft SI and restores stock (only for standalone DRs)
router.post('/dr/:id/cancel', admin, async (req, res) => {
  try {
    const { cancelReason } = req.body;
    if (!cancelReason || !cancelReason.trim()) {
      return res.status(400).json({ message: 'cancelReason is required' });
    }

    // Load DR first so we can check the linked SI BEFORE mutating anything
    const existing = await DeliveryReceipt.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'DR not found or not in issued status' });
    if (existing.status !== 'issued') return res.status(400).json({ message: 'DR not found or not in issued status' });

    // Delivery tracking closes the lifecycle: a delivered/returned DR can no longer be cancelled
    if (['delivered', 'returned'].includes(existing.deliveryStatus)) {
      return res.status(400).json({ message: 'DR has been delivered or returned and can no longer be cancelled' });
    }

    // Cascade check: linked SI must not be issued
    const linkedSI = await SalesInvoice.findOne({ drRef: existing._id });
    if (linkedSI && linkedSI.status === 'issued') {
      return res.status(400).json({ message: 'Linked SI is already issued - cancel the SI first' });
    }

    // Atomic claim (guards double-click): flip issued -> cancelled.
    // deliveryStatus guard is repeated here so a concurrent deliver/return that lands
    // after the pre-read above cannot be cancelled (TOCTOU-safe).
    const dr = await DeliveryReceipt.findOneAndUpdate(
      { _id: req.params.id, status: 'issued', deliveryStatus: { $nin: ['delivered', 'returned'] } },
      { status: 'cancelled', cancelledAt: new Date(), cancelledBy: req.user._id, cancelReason: cancelReason.trim() },
      { new: true }
    );
    if (!dr) return res.status(404).json({ message: 'DR not found or not in issued status' });

    // Cancel linked draft SI with the same reason
    if (linkedSI && linkedSI.status === 'draft') {
      linkedSI.status = 'cancelled';
      linkedSI.cancelledAt = new Date();
      linkedSI.cancelledBy = req.user._id;
      linkedSI.cancelReason = cancelReason.trim();
      await linkedSI.save();
    }

    // Restore stock for each item (reverse of issue) - only for standalone DRs
    const missingBooks = [];
    if (!dr.efRef) {
      for (const item of dr.items) {
        try {
          const book = await Book.findOne({ ISBN: item.isbn });
          if (!book) {
            missingBooks.push(item.isbn);
            continue;
          }

          const previousQty = book.QTY;
          book.QTY += item.qty;
          await book.save();

          // Create stock transaction record
          await StockTransaction.create({
            ISBN: book.ISBN,
            action: 'INBOUND',
            qtyChanged: item.qty,
            previousQty,
            newQty: book.QTY,
            performedBy: req.user._id,
          });
        } catch (err) {
          console.error(`Failed to restore stock for ISBN ${item.isbn}:`, err);
          missingBooks.push(item.isbn);
        }
      }
    }

    const missingNote = missingBooks.length > 0 ? ` (WARNING: no book record found for ISBNs: ${missingBooks.join(', ')} - stock not restored for those items)` : '';
    await logUserActivity(req.user._id, 'CANCEL_DR', `Cancelled DR ${dr.drNumber} - Reason: ${cancelReason.trim()}${missingNote}`, req);

    res.json({ dr, si: linkedSI });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Export DR as Excel
router.get('/dr/:id/export', async (req, res) => {
  try {
    const dr = await DeliveryReceipt.findById(req.params.id)
      .populate('marketingExecutive', 'name')
      .populate('efRef', 'efNumber');
    if (!dr) return res.status(404).json({ message: 'Delivery Receipt not found' });

    const items = dr.items.map(item => ({
      isbn: item.isbn,
      rawTitle: item.rawTitle || item.title,
      edition: item.edition,
      bind: item.bind,
      year: item.year,
      author: item.author,
      qty: item.qty,
      unitPrice: item.unitPrice,
      amount: item.amount
    }));

    const buffer = await generate('DR1', {
      drNumber: dr.drNumber,
      date: dr.date,
      customerName: dr.customerName,
      customerAddress: dr.customerAddress,
      marketingExecutive: dr.marketingExecutive,
      items,
      totalAmount: dr.totalAmount,
      status: dr.status
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${dr.drNumber}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export DR failed:', err);
    res.status(500).json({ message: err.message });
  }
});

// ============================================
// SALES INVOICES
// ============================================

// List SIs
router.get('/si', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$text = { $search: search };
    }
    if (status) query.status = status;
    if (req.query.drRef) query.drRef = req.query.drRef;

    const [sis, total] = await Promise.all([
      SalesInvoice.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('createdBy', 'username')
        .populate('drRef', 'drNumber')
        .populate('marketingExecutive', 'name'),
      SalesInvoice.countDocuments(query)
    ]);

    res.json({ sis, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create SI (draft)
router.post('/si', async (req, res) => {
  try {
    const { siNumber, drRef, date, customerName, customerAddress, marketingExecutive, poNumber, items, discountPercentage, allowDuplicates } = req.body;

    if (!siNumber || !customerName || !items?.length) {
      return res.status(400).json({ message: 'siNumber, customerName, and items are required' });
    }

    const existing = await SalesInvoice.findOne({ siNumber });
    if (existing) return res.status(400).json({ message: 'SI number already exists' });

    // Check for duplicate ISBNs
    const duplicates = checkDuplicateISBNs(items);
    if (duplicates.length > 0 && !allowDuplicates) {
      return res.status(409).json({
        message: 'Duplicate ISBNs detected',
        code: 'DUPLICATE_ISBNS',
        duplicates: duplicates.map(d => ({
          isbn: d.isbn,
          count: d.count,
          lineNumbers: d.indices.map(i => i + 1)
        }))
      });
    }

    const si = new SalesInvoice({
      siNumber,
      drRef: drRef || null,
      date: date ? new Date(date) : null,
      customerName,
      customerAddress,
      marketingExecutive: marketingExecutive || null,
      poNumber,
      discountPercentage: discountPercentage || 0,
      items: items.map(item => ({
        ...item,
        amount: item.qty * item.unitPrice
      })),
      createdBy: req.user._id
    });

    await si.save();
    await si.populate('marketingExecutive', 'name');
    await Customer.recordCustomer(si.customerName, si.customerAddress);
    await logUserActivity(req.user._id, 'CREATE_SI', `Created SI ${si.siNumber} for ${si.customerName} (${si.items.length} items)`, req);
    res.status(201).json(si);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get SI by ID
router.get('/si/:id', async (req, res) => {
  try {
    const si = await SalesInvoice.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('drRef', 'drNumber')
      .populate('marketingExecutive', 'name');
    if (!si) return res.status(404).json({ message: 'Sales Invoice not found' });
    res.json(si);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update SI (draft only)
router.put('/si/:id', async (req, res) => {
  try {
    const si = await SalesInvoice.findById(req.params.id);
    if (!si) return res.status(404).json({ message: 'Sales Invoice not found' });
    if (si.status !== 'draft') return res.status(400).json({ message: 'Cannot update issued SI' });

    const { siNumber, date, customerName, customerAddress, marketingExecutive, poNumber, items, discountPercentage, allowDuplicates } = req.body;

    if (siNumber && siNumber !== si.siNumber) {
      const existing = await SalesInvoice.findOne({ siNumber });
      if (existing) return res.status(400).json({ message: 'SI number already exists' });
      si.siNumber = siNumber;
    }

    if (date !== undefined) si.date = date ? new Date(date) : null;
    if (customerName) si.customerName = customerName;
    if (customerAddress !== undefined) si.customerAddress = customerAddress;
    if (marketingExecutive !== undefined) si.marketingExecutive = marketingExecutive || null;
    if (poNumber !== undefined) si.poNumber = poNumber;
    if (discountPercentage !== undefined) si.discountPercentage = discountPercentage;
    if (items) {
      // Check for duplicate ISBNs
      const duplicates = checkDuplicateISBNs(items);
      if (duplicates.length > 0 && !allowDuplicates) {
        return res.status(409).json({
          message: 'Duplicate ISBNs detected',
          code: 'DUPLICATE_ISBNS',
          duplicates: duplicates.map(d => ({
            isbn: d.isbn,
            count: d.count,
            lineNumbers: d.indices.map(i => i + 1)
          }))
        });
      }

      si.items = items.map(item => ({
        ...item,
        amount: item.qty * item.unitPrice
      }));
    }

    await si.save();
    await si.populate('marketingExecutive', 'name');
    await Customer.recordCustomer(si.customerName, si.customerAddress);
    await logUserActivity(req.user._id, 'UPDATE_SI', `Updated SI ${si.siNumber}`, req);
    res.json(si);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete SI (draft only)
router.delete('/si/:id', async (req, res) => {
  try {
    const si = await SalesInvoice.findById(req.params.id);
    if (!si) return res.status(404).json({ message: 'Sales Invoice not found' });
    if (si.status !== 'draft') return res.status(400).json({ message: 'Cannot delete issued SI' });

    const { siNumber } = si;
    await si.deleteOne();
    await logUserActivity(req.user._id, 'DELETE_SI', `Deleted SI ${siNumber}`, req);
    res.json({ message: 'Sales Invoice deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Issue SI
router.post('/si/:id/issue', async (req, res) => {
  try {
    // Atomic claim (guards double-click): flip draft -> issued
    const si = await SalesInvoice.findOneAndUpdate(
      { _id: req.params.id, status: 'draft' },
      { status: 'issued' },
      { new: true }
    );
    if (!si) return res.status(400).json({ message: 'SI already issued or cancelled' });

    await logUserActivity(req.user._id, 'ISSUE_SI', `Issued SI ${si.siNumber} for ${si.customerName}`, req);

    res.json(si);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel SI (issued only) - no stock changes (SIs never moved stock)
router.post('/si/:id/cancel', admin, async (req, res) => {
  try {
    const { cancelReason } = req.body;
    if (!cancelReason || !cancelReason.trim()) {
      return res.status(400).json({ message: 'cancelReason is required' });
    }

    // Atomic claim (guards double-click): flip issued -> cancelled
    const si = await SalesInvoice.findOneAndUpdate(
      { _id: req.params.id, status: 'issued' },
      { status: 'cancelled', cancelledAt: new Date(), cancelledBy: req.user._id, cancelReason: cancelReason.trim() },
      { new: true }
    );
    if (!si) return res.status(404).json({ message: 'SI not found or not in issued status' });

    await logUserActivity(req.user._id, 'CANCEL_SI', `Cancelled SI ${si.siNumber} - Reason: ${cancelReason.trim()}`, req);

    res.json(si);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Export SI as Excel
router.get('/si/:id/export', async (req, res) => {
  try {
    const si = await SalesInvoice.findById(req.params.id)
      .populate('marketingExecutive', 'name')
      .populate('drRef', 'drNumber');
    if (!si) return res.status(404).json({ message: 'Sales Invoice not found' });

    const items = si.items.map(item => ({
      isbn: item.isbn,
      rawTitle: item.rawTitle || item.title,
      edition: item.edition,
      bind: item.bind,
      year: item.year,
      author: item.author,
      qty: item.qty,
      unitPrice: item.unitPrice,
      amount: item.amount
    }));

    const buffer = await generate('INV1', {
      siNumber: si.siNumber,
      date: si.date,
      customerName: si.customerName,
      customerAddress: si.customerAddress,
      marketingExecutive: si.marketingExecutive,
      poNumber: si.poNumber,
      discountPercentage: si.discountPercentage,
      items,
      totalAmount: si.totalAmount,
      subtotal: si.subtotal,
      status: si.status
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${si.siNumber}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export SI failed:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;