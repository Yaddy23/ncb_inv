const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const DeliveryReceipt = require('../models/DeliveryReceipt');
const SalesInvoice = require('../models/SalesInvoice');
const EvaluationForm = require('../models/EvaluationForm');
const { protect, admin } = require('../middleware/auth');
const { roleBasedLimiter } = require('../middleware/rateLimit');

// Reads (autocomplete, lists) are open to all authenticated users;
// create/update/delete are admin-only, mirroring marketing executives
router.use(protect);
router.use(roleBasedLimiter);

const NAME_COLLATION = { locale: 'en', strength: 2 };

// List / search customers
router.get('/', async (req, res) => {
  try {
    const { search, isActive, sort = 'recent' } = req.query;
    // Clamp pagination so bad input can't error the query or dump the whole
    // collection in one response
    const page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), 10000);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const query = {};

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      query.$or = [{ name: searchRegex }, { address: searchRegex }];
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const sortByName = sort === 'name';
    const [customers, total] = await Promise.all([
      Customer.find(query)
        .sort(sortByName ? { name: 1 } : { lastUsedAt: -1, updatedAt: -1 })
        .collation(sortByName ? NAME_COLLATION : {})
        .skip((page - 1) * limit)
        .limit(limit),
      Customer.countDocuments(query)
    ]);

    res.json({ customers, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get customer by ID
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a customer's document history (DR/SI/EF store the customer as free text,
// so history is matched by name)
router.get('/:id/documents', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const escapedName = customer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = { customerName: new RegExp(`^${escapedName}$`, 'i') };
    // Each model has its own document-number field, so project per model
    const sharedFields = 'date customerName status totalAmount createdAt';
    const options = { sort: { createdAt: -1 }, limit: 20 };

    const [drs, sis, efs] = await Promise.all([
      DeliveryReceipt.find(query, `drNumber ${sharedFields}`, options),
      SalesInvoice.find(query, `siNumber ${sharedFields}`, options),
      EvaluationForm.find(query, `efNumber ${sharedFields}`, options)
    ]);

    res.json({ drs, sis, efs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create customer
router.post('/', admin, async (req, res) => {
  try {
    const { name, address, isActive } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const existing = await Customer.findByName(name);
    if (existing) {
      return res.status(400).json({ message: 'Customer with this name already exists' });
    }

    const customer = new Customer({
      name: name.trim(),
      address: (address || '').trim(),
      isActive: isActive !== undefined ? isActive : true
    });

    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update customer
router.put('/:id', admin, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const { name, address, isActive } = req.body;

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'Name is required' });
      }
      const existing = await Customer.findOne({ name: trimmedName, _id: { $ne: customer._id } }).collation(NAME_COLLATION);
      if (existing) {
        return res.status(400).json({ message: 'Customer with this name already exists' });
      }
      customer.name = trimmedName;
    }

    if (address !== undefined) customer.address = address.trim();
    if (isActive !== undefined) customer.isActive = isActive;

    await customer.save();
    res.json(customer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete customer - documents keep their own copy of the name, so nothing dangles
router.delete('/:id', admin, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    await customer.deleteOne();
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
