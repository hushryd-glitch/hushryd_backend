const mongoose = require('mongoose');

/**
 * Wallet Schema
 * Manages user wallet balance with promo and non-promo segregation
 * Design Decision: Separate promo and non-promo balances for different redemption rules
 * Rationale: Promo balance has partial redeemability, non-promo has 100% redeemability
 */
const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true
  },
  // Promo balance (partially redeemable - from promotional credits)
  promoBalance: {
    type: Number,
    default: 0,
    min: [0, 'Promo balance cannot be negative']
  },
  // Non-promo balance (100% redeemable - from cashback, referrals)
  nonPromoBalance: {
    type: Number,
    default: 0,
    min: [0, 'Non-promo balance cannot be negative']
  },
  // Total amount earned through cashback and referrals
  totalEarned: {
    type: Number,
    default: 0,
    min: [0, 'Total earned cannot be negative']
  },
  // Total amount spent from wallet
  totalSpent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative']
  },
  // Pending cashback amount (not yet credited)
  pendingCashback: {
    type: Number,
    default: 0,
    min: [0, 'Pending cashback cannot be negative']
  },
  // Last transaction reference for audit
  lastTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  // Wallet status
  status: {
    type: String,
    enum: ['active', 'frozen', 'suspended'],
    default: 'active'
  },
  // Freeze reason if wallet is frozen
  freezeReason: {
    type: String,
    trim: true
  },
  // Frozen by admin reference
  frozenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  frozenAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
WalletSchema.index({ userId: 1 }, { unique: true });
WalletSchema.index({ status: 1 });
WalletSchema.index({ totalEarned: -1 });

// Virtual for total balance
WalletSchema.virtual('totalBalance').get(function() {
  return this.promoBalance + this.nonPromoBalance;
});

// Ensure virtual fields are serialized
WalletSchema.set('toJSON', { virtuals: true });
WalletSchema.set('toObject', { virtuals: true });

/**
 * Add cashback to wallet
 * Cashback goes to non-promo balance (100% redeemable)
 * 
 * @param {number} amount - Amount to add
 * @param {string} source - Source of cashback (booking, referral, etc.)
 * @returns {Promise<Object>} Updated wallet
 */
WalletSchema.methods.addCashback = async function(amount, source = 'cashback') {
  if (amount <= 0) {
    throw new Error('Cashback amount must be positive');
  }

  if (this.status !== 'active') {
    throw new Error('Cannot add cashback to inactive wallet');
  }

  this.nonPromoBalance += amount;
  this.totalEarned += amount;
  
  await this.save();
  
  // Create transaction record
  const Transaction = mongoose.model('Transaction');
  const transaction = new Transaction({
    userId: this.userId,
    walletId: this._id,
    type: 'credit',
    category: source,
    amount: amount,
    description: `Cashback credited - ${source}`,
    balanceAfter: {
      promoBalance: this.promoBalance,
      nonPromoBalance: this.nonPromoBalance,
      totalBalance: this.totalBalance
    },
    status: 'completed'
  });
  
  await transaction.save();
  this.lastTransactionId = transaction._id;
  await this.save();
  
  return this;
};

/**
 * Add promotional credit to wallet
 * Promotional credits go to promo balance (partial redeemability)
 * 
 * @param {number} amount - Amount to add
 * @param {string} source - Source of promo credit
 * @param {Date} expiryDate - Expiry date for promo credit
 * @returns {Promise<Object>} Updated wallet
 */
WalletSchema.methods.addPromoCredit = async function(amount, source = 'promo', expiryDate = null) {
  if (amount <= 0) {
    throw new Error('Promo credit amount must be positive');
  }

  if (this.status !== 'active') {
    throw new Error('Cannot add promo credit to inactive wallet');
  }

  this.promoBalance += amount;
  
  await this.save();
  
  // Create transaction record
  const Transaction = mongoose.model('Transaction');
  const transaction = new Transaction({
    userId: this.userId,
    walletId: this._id,
    type: 'credit',
    category: 'promo',
    amount: amount,
    description: `Promotional credit - ${source}`,
    expiryDate: expiryDate,
    balanceAfter: {
      promoBalance: this.promoBalance,
      nonPromoBalance: this.nonPromoBalance,
      totalBalance: this.totalBalance
    },
    status: 'completed'
  });
  
  await transaction.save();
  this.lastTransactionId = transaction._id;
  await this.save();
  
  return this;
};

/**
 * Deduct amount from wallet
 * Deducts from non-promo balance first, then promo balance
 * 
 * @param {number} amount - Amount to deduct
 * @param {string} purpose - Purpose of deduction
 * @param {string} bookingId - Associated booking ID
 * @returns {Promise<Object>} Deduction details
 */
WalletSchema.methods.deductAmount = async function(amount, purpose = 'booking', bookingId = null) {
  if (amount <= 0) {
    throw new Error('Deduction amount must be positive');
  }

  if (this.status !== 'active') {
    throw new Error('Cannot deduct from inactive wallet');
  }

  const totalAvailable = this.totalBalance;
  if (amount > totalAvailable) {
    throw new Error('Insufficient wallet balance');
  }

  let deductedFromNonPromo = 0;
  let deductedFromPromo = 0;
  let remainingAmount = amount;

  // Deduct from non-promo balance first
  if (remainingAmount > 0 && this.nonPromoBalance > 0) {
    deductedFromNonPromo = Math.min(remainingAmount, this.nonPromoBalance);
    this.nonPromoBalance -= deductedFromNonPromo;
    remainingAmount -= deductedFromNonPromo;
  }

  // Deduct remaining from promo balance
  if (remainingAmount > 0 && this.promoBalance > 0) {
    deductedFromPromo = Math.min(remainingAmount, this.promoBalance);
    this.promoBalance -= deductedFromPromo;
    remainingAmount -= deductedFromPromo;
  }

  this.totalSpent += amount;
  
  await this.save();
  
  // Create transaction record
  const Transaction = mongoose.model('Transaction');
  const transactionData = {
    userId: this.userId,
    walletId: this._id,
    type: 'debit',
    category: 'booking',
    amount: amount,
    description: `Payment for ${purpose}`,
    balanceAfter: {
      promoBalance: this.promoBalance,
      nonPromoBalance: this.nonPromoBalance,
      totalBalance: this.totalBalance
    },
    metadata: {
      deductedFromNonPromo,
      deductedFromPromo
    },
    status: 'completed'
  };

  // Only add bookingId if it's a valid ObjectId or can be converted to one
  if (bookingId) {
    try {
      transactionData.bookingId = new mongoose.Types.ObjectId(bookingId);
    } catch (error) {
      // If bookingId is not a valid ObjectId, store it in metadata instead
      transactionData.metadata.bookingReference = bookingId;
    }
  }
  
  const transaction = new Transaction(transactionData);
  await transaction.save();
  this.lastTransactionId = transaction._id;
  await this.save();
  
  return {
    totalDeducted: amount,
    deductedFromNonPromo,
    deductedFromPromo,
    remainingBalance: this.totalBalance,
    transaction: transaction
  };
};

/**
 * Freeze wallet with reason
 * 
 * @param {string} reason - Reason for freezing
 * @param {string} adminId - Admin who froze the wallet
 * @returns {Promise<Object>} Updated wallet
 */
WalletSchema.methods.freeze = async function(reason, adminId) {
  this.status = 'frozen';
  this.freezeReason = reason;
  this.frozenBy = adminId;
  this.frozenAt = new Date();
  
  return await this.save();
};

/**
 * Unfreeze wallet
 * 
 * @returns {Promise<Object>} Updated wallet
 */
WalletSchema.methods.unfreeze = async function() {
  this.status = 'active';
  this.freezeReason = undefined;
  this.frozenBy = undefined;
  this.frozenAt = undefined;
  
  return await this.save();
};

/**
 * Get wallet summary with recent transactions
 * 
 * @param {number} limit - Number of recent transactions to include
 * @returns {Promise<Object>} Wallet summary
 */
WalletSchema.methods.getSummary = async function(limit = 5) {
  const Transaction = mongoose.model('Transaction');
  
  const recentTransactions = await Transaction.find({
    walletId: this._id
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .lean();

  return {
    wallet: this.toObject(),
    recentTransactions
  };
};

/**
 * Static method to create wallet for new user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} New wallet
 */
WalletSchema.statics.createForUser = async function(userId) {
  const existingWallet = await this.findOne({ userId });
  if (existingWallet) {
    throw new Error('Wallet already exists for this user');
  }

  const wallet = new this({
    userId,
    promoBalance: 0,
    nonPromoBalance: 0,
    totalEarned: 0,
    totalSpent: 0,
    status: 'active'
  });

  return await wallet.save();
};

const Wallet = mongoose.model('Wallet', WalletSchema);

module.exports = Wallet;