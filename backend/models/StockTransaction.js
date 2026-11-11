const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
  ISBN: {
    type: String,
    required: true,
    ref: 'Book'
  },
  action: {
    type: String,
    required: true,
    enum: ['INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'BULK_IMPORT', 'RESERVE', 'RELEASE']
  },
  qtyChanged: {
    type: Number,
    required: true
  },
  previousQty: {
    type: Number,
    required: true
  },
  newQty: {
    type: Number,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster querying
stockTransactionSchema.index({ ISBN: 1, timestamp: -1 });
stockTransactionSchema.index({ performedBy: 1 });

// Text index for regex-injection-safe search on ISBN
stockTransactionSchema.index({ ISBN: 'text' });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);