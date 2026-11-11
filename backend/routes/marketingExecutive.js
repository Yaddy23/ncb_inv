const express = require('express');
const router = express.Router();
const MarketingExecutive = require('../models/MarketingExecutive');
const { protect, admin } = require('../middleware/auth');

// Reads are open to all authenticated users (the EF/DR/SI form dropdown
// fetches /active); creating/updating/deleting executives is admin-only
router.use(protect);

// List all marketing executives
router.get('/', async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 50 } = req.query;
    const query = {};

    if (search) {
      query.$text = { $search: search };
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const [executives, total] = await Promise.all([
      MarketingExecutive.find(query)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      MarketingExecutive.countDocuments(query)
    ]);

    res.json({ executives, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all active marketing executives (for dropdowns)
router.get('/active', async (req, res) => {
  try {
    const executives = await MarketingExecutive.find({ isActive: true })
      .sort({ name: 1 })
      .select('name _id');
    res.json(executives);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get marketing executive by ID
router.get('/:id', async (req, res) => {
  try {
    const executive = await MarketingExecutive.findById(req.params.id);
    if (!executive) return res.status(404).json({ message: 'Marketing Executive not found' });
    res.json(executive);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create marketing executive
router.post('/', admin, async (req, res) => {
  try {
    const { name, isActive } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const existing = await MarketingExecutive.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Marketing Executive with this name already exists' });
    }

    const executive = new MarketingExecutive({
      name: name.trim(),
      isActive: isActive !== undefined ? isActive : true
    });

    await executive.save();
    res.status(201).json(executive);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update marketing executive
router.put('/:id', admin, async (req, res) => {
  try {
    const executive = await MarketingExecutive.findById(req.params.id);
    if (!executive) return res.status(404).json({ message: 'Marketing Executive not found' });

    const { name, isActive } = req.body;

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'Name is required' });
      }
      const existing = await MarketingExecutive.findOne({ name: trimmedName, _id: { $ne: executive._id } });
      if (existing) {
        return res.status(400).json({ message: 'Marketing Executive with this name already exists' });
      }
      executive.name = trimmedName;
    }

    if (isActive !== undefined) {
      executive.isActive = isActive;
    }

    await executive.save();
    res.json(executive);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete marketing executive (soft delete - deactivate)
router.delete('/:id', admin, async (req, res) => {
  try {
    const executive = await MarketingExecutive.findById(req.params.id);
    if (!executive) return res.status(404).json({ message: 'Marketing Executive not found' });

    executive.isActive = false;
    await executive.save();
    res.json({ message: 'Marketing Executive deactivated (preserved for document history)' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;