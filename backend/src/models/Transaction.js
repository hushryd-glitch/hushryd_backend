const mongoose = require('mongoose');

/**
 * Transaction Schema
 * Records all wallet transactions for audit and history
 * Design Decision: Comprehensive transaction logging for financial transparency
 * Rationale: Users need detailed transaction history for wallet operations
 */
const TransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: [true, 'Wallet ID is required'],
    index: true
  },
  // Transaction type
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: [true, 'Transaction type is required']
  },
  // Transaction category for better classification
  category: {
    type: String,
    enum: ['cashback', 'referral', 'booking', 'refund', 'promo', 'adjustment'],
    required: [true, 'Transaction category is required']
  },
  // Transaction amount (always positive)
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    min: [0.01, 'Transaction amount must be positive']
  },
  // Description of the transaction
  description: {
    type: String,
    required: [true, 'Transaction description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  // Associated booking ID (if applicable)
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    sparse: true
  },
  // Associated ride ID (if applicable)
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    sparse: true
  },
  // Expiry date for promotional credits
  expiryDate: {
    type: Date,
    sparse: true
  },
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'expired', 'cancelled'],
    default: 'pending'
  },
  // Wallet balance after this transaction
  balanceAfter: {
    promoBalance: {
      type: Number,
      required: true,
      min: 0
    },
    nonPromoBalance: {
      type: Number,
      required: true,
      min: 0
    },
    totalBalance: {
      type: Number,
      required: true,
      min: 0
    }
  },
  // Additional metadata for the transaction
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Payment gateway transaction ID (if applicable)
  paymentGatewayTxnId: {
    type: String,
    sparse: true
  },
  // Reference transaction ID (for refunds, adjustments)
  referenceTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    sparse: true
  },
  // Admin who processed the transaction (for manual adjustments)
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  // Processing notes (for manual transactions)
  processingNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Processing notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ walletId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, category: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ bookingId: 1 }, { sparse: true });
TransactionSchema.index({ expiryDate: 1 }, { sparse: true });
TransactionSchema.index({ paymentGatewayTxnId: 1 }, { sparse: true });

// Compound index for user transaction history with filters
TransactionSchema.index({ 
  userId: 1, 
  type: 1, 
  category: 1, 
  createdAt: -1 
});

/**
 * Mark transaction as completed
 * 
 * @returns {Promise<Object>} Updated transaction
 */
TransactionSchema.methods.markCompleted = async function() {
  this.status = 'completed';
  return await this.save();
};

/**
 * Mark transaction as failed with reason
 * 
 * @param {string} reason - Failure reason
 * @returns {Promise<Object>} Updated transaction
 */
TransactionSchema.methods.markFailed = async function(reason) {
  this.status = 'failed';
  this.processingNotes = reason;
  return await this.save();
};

/**
 * Mark transaction as expired
 * Used for promotional credits that have expired
 * 
 * @returns {Promise<Object>} Updated transaction
 */
TransactionSchema.methods.markExpired = async function() {
  this.status = 'expired';
  return await this.save();
};

/**
 * Get formatted transaction for display
 * 
 * @returns {Object} Formatted transaction
 */
TransactionSchema.methods.getFormatted = function() {
  return {
    id: this._id,
    type: this.type,
    category: this.category,
    amount: this.amount,
    description: this.description,
    status: this.status,
    date: this.createdAt,
    expiryDate: this.expiryDate,
    balanceAfter: this.balanceAfter,
    metadata: this.metadata
  };
};

/**
 * Static method to get user transaction history with filters
 * 
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} Transaction history with pagination
 */
TransactionSchema.statics.getUserHistory = async function(userId, filters = {}, pagination = {}) {
  const {
    type,
    category,
    status,
    startDate,
    endDate,
    bookingId
  } = filters;

  const {
    page = 1,
    limit = 20
  } = pagination;

  // Build query
  const query = { userId };

  if (type) query.type = type;
  if (category) query.category = category;
  if (status) query.status = status;
  if (bookingId) query.bookingId = bookingId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Execute query with pagination
  const skip = (page - 1) * limit;
  
  const [transactions, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

/**
 * Static method to get transaction summary for a user
 * 
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date for summary
 * @param {Date} endDate - End date for summary
 * @returns {Promise<Object>} Transaction summary
 */
TransactionSchema.statics.getUserSummary = async function(userId, startDate, endDate) {
  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    status: 'completed'
  };

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = startDate;
    if (endDate) matchStage.createdAt.$lte = endDate;
  }

  const summary = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCredits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0]
          }
        },
        totalDebits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0]
          }
        },
        totalCashback: {
          $sum: {
            $cond: [{ $eq: ['$category', 'cashback'] }, '$amount', 0]
          }
        },
        totalReferralEarnings: {
          $sum: {
            $cond: [{ $eq: ['$category', 'referral'] }, '$amount', 0]
          }
        },
        totalBookingSpend: {
          $sum: {
            $cond: [{ $eq: ['$category', 'booking'] }, '$amount', 0]
          }
        },
        transactionCount: { $sum: 1 }
      }
    }
  ]);

  return summary[0] || {
    totalCredits: 0,
    totalDebits: 0,
    totalCashback: 0,
    totalReferralEarnings: 0,
    totalBookingSpend: 0,
    transactionCount: 0
  };
};

/**
 * Static method to expire promotional credits
 * Called by a scheduled job to expire old promotional credits
 * 
 * @returns {Promise<Object>} Expiry results
 */
TransactionSchema.statics.expirePromotionalCredits = async function() {
  const now = new Date();
  
  // Find expired promotional credits that are still active
  const expiredTransactions = await this.find({
    category: 'promo',
    type: 'credit',
    status: 'completed',
    expiryDate: { $lte: now }
  });

  let totalExpired = 0;
  let totalAmount = 0;

  for (const transaction of expiredTransactions) {
    // Mark transaction as expired
    await transaction.markExpired();
    
    // Deduct expired amount from wallet
    const Wallet = mongoose.model('Wallet');
    const wallet = await Wallet.findById(transaction.walletId);
    
    if (wallet && wallet.promoBalance >= transaction.amount) {
      wallet.promoBalance -= transaction.amount;
      await wallet.save();
      
      // Create adjustment transaction
      const adjustmentTransaction = new this({
        userId: transaction.userId,
        walletId: transaction.walletId,
        type: 'debit',
        category: 'adjustment',
        amount: transaction.amount,
        description: `Expired promotional credit - ${transaction.description}`,
        referenceTransactionId: transaction._id,
        balanceAfter: {
          promoBalance: wallet.promoBalance,
          nonPromoBalance: wallet.nonPromoBalance,
          totalBalance: wallet.totalBalance
        },
        status: 'completed'
      });
      
      await adjustmentTransaction.save();
      
      totalExpired++;
      totalAmount += transaction.amount;
    }
  }

  return {
    expiredCount: totalExpired,
    totalAmount: totalAmount
  };
};

const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = Transaction;