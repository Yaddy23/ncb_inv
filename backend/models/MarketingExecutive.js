const mongoose = require('mongoose');

const marketingExecutiveSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
marketingExecutiveSchema.index({ name: 1 });
marketingExecutiveSchema.index({ isActive: 1 });

// Text index for regex-injection-safe search on name
marketingExecutiveSchema.index({ name: 'text' });

module.exports = mongoose.model('MarketingExecutive', marketingExecutiveSchema);