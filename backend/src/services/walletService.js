/**
 * Wallet Service
 * Manages user wallet balance and cashback operations for the HushRyd platform
 * Implements comprehensive wallet management with promo/non-promo balance segregation
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 9.2, 9.4
 */

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

/**
 * Get wallet balance for a user
 * Requirements: 3.1 - Display total balance split between promo and non-promo amounts
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Wallet balance details
 */
const getWalletBalance = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Find or create wallet for user
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.createForUser(userId);
  }

  // Calculate expiring soon (within 3 days) - this would need to be implemented based on transaction expiry dates
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const expiringTransactions = await Transaction.find({
    userId,
    type: 'credit',
    category: 'promo',
    status: 'completed',
    expiryDate: { $lte: threeDaysFromNow, $gt: new Date() }
  });

  const expiringSoon = expiringTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  return {
    userId: wallet.userId,
    balance: wallet.totalBalance,
    promoBalance: wallet.promoBalance,
    nonPromoBalance: wallet.nonPromoBalance,
    pendingCashback: wallet.pendingCashback,
    expiringSoon,
    totalEarned: wallet.totalEarned,
    totalSpent: wallet.totalSpent,
    lastUpdated: wallet.updatedAt
  };
};


/**
 * Get cashback breakdown with expiry dates
 * Requirements: 3.2 - Show breakdown of cashback amounts with their expiry dates
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of cashback entries with details
 */
const getCashbackBreakdown = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Get active cashback transactions with expiry dates
  const now = new Date();
  const cashbackTransactions = await Transaction.find({
    userId,
    type: 'credit',
    category: { $in: ['cashback', 'referral', 'promo'] },
    status: 'completed',
    $or: [
      { expiryDate: { $exists: false } }, // Non-expiring cashback
      { expiryDate: { $gt: now } } // Not yet expired
    ]
  }).sort({ createdAt: 1 }); // FIFO order

  const breakdown = cashbackTransactions.map(tx => ({
    id: tx._id,
    amount: tx.amount,
    availableAmount: tx.amount, // Simplified - in real implementation would track redemptions
    bookingId: tx.bookingId,
    creditedAt: tx.createdAt,
    expiresAt: tx.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year if no expiry
    daysUntilExpiry: tx.expiryDate ? Math.ceil((tx.expiryDate - now) / (24 * 60 * 60 * 1000)) : 365,
    isExpiringSoon: tx.expiryDate ? tx.expiryDate <= new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) : false,
    category: tx.category
  }));

  return breakdown;
};

/**
 * Credit cashback to user's wallet
 * Requirements: 3.2 - Credit cashback to non-promo balance with 100% redeemability
 * Requirements: 9.2 - Automatically credit cashback after successful payments
 * 
 * @param {string} userId - User ID
 * @param {number} amount - Cashback amount to credit
 * @param {string} source - Source of cashback (booking, referral, etc.)
 * @param {string} bookingId - Associated booking ID
 * @param {number} expiryDays - Number of days until expiry (optional)
 * @returns {Promise<Object>} Created cashback entry
 */
const creditCashback = async (userId, amount, source = 'cashback', bookingId = null, expiryDays = null) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  // Find or create wallet
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.createForUser(userId);
  }

  // Add cashback using wallet method
  await wallet.addCashback(amount, source);

  // If expiry is specified, update the transaction with expiry date
  if (expiryDays && wallet.lastTransactionId) {
    const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    await Transaction.findByIdAndUpdate(wallet.lastTransactionId, {
      expiryDate,
      bookingId
    });
  }

  return {
    amount,
    source,
    bookingId,
    walletBalance: wallet.totalBalance,
    transactionId: wallet.lastTransactionId
  };
};


/**
 * Apply wallet balance to payment
 * Requirements: 3.3 - Apply full wallet balance if less than fare
 * Requirements: 3.4 - Apply only fare amount if wallet exceeds fare
 * Requirements: 9.4 - Display available wallet balance for payment
 * 
 * @param {string} userId - User ID
 * @param {number} fareAmount - Total fare amount to pay
 * @param {string} bookingId - Associated booking ID
 * @returns {Promise<Object>} Redemption result with amount applied and remaining fare
 */
const applyWalletToPayment = async (userId, fareAmount, bookingId = null) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (typeof fareAmount !== 'number' || fareAmount < 0) {
    throw new Error('Fare amount must be a non-negative number');
  }

  if (fareAmount === 0) {
    const balance = await getWalletBalance(userId);
    return {
      amountApplied: 0,
      remainingFare: 0,
      walletBalanceAfter: balance.balance
    };
  }

  // Find wallet
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.createForUser(userId);
  }

  // Calculate amount to apply (min of wallet balance and fare amount)
  const amountToApply = Math.min(wallet.totalBalance, fareAmount);
  
  if (amountToApply <= 0) {
    return {
      amountApplied: 0,
      remainingFare: fareAmount,
      walletBalanceAfter: wallet.totalBalance
    };
  }

  // Deduct amount from wallet using wallet method
  const deductionResult = await wallet.deductAmount(amountToApply, 'booking', bookingId);

  return {
    amountApplied: deductionResult.totalDeducted,
    remainingFare: fareAmount - deductionResult.totalDeducted,
    walletBalanceAfter: deductionResult.remainingBalance,
    deductionDetails: {
      fromNonPromo: deductionResult.deductedFromNonPromo,
      fromPromo: deductionResult.deductedFromPromo
    },
    transactionId: deductionResult.transaction._id
  };
};

/**
 * Expire old promotional credits (cron job function)
 * Requirements: 3.5 - Remove expired amount from wallet and notify user
 * 
 * @returns {Promise<Object>} Expiry results
 */
const expirePromotionalCredits = async () => {
  const now = new Date();

  // Use Transaction model's static method to expire promotional credits
  const expiryResults = await Transaction.expirePromotionalCredits();

  console.log(`[WalletService] Expiry check complete: ${expiryResults.expiredCount} transactions expired, ₹${expiryResults.totalAmount} total`);
  
  return {
    processed: expiryResults.expiredCount,
    totalExpiredAmount: expiryResults.totalAmount,
    errors: []
  };
};


/**
 * Add promotional credit to wallet
 * Requirements: 3.3 - Credit promotional credits to promo balance with partial redeemability
 * 
 * @param {string} userId - User ID
 * @param {number} amount - Promo credit amount
 * @param {string} source - Source of promo credit
 * @param {number} expiryDays - Days until expiry
 * @returns {Promise<Object>} Created promo credit
 */
const addPromoCredit = async (userId, amount, source = 'promo', expiryDays = 30) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  // Find or create wallet
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.createForUser(userId);
  }

  // Calculate expiry date
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  // Add promo credit using wallet method
  await wallet.addPromoCredit(amount, source, expiryDate);

  return {
    amount,
    source,
    expiryDate,
    walletBalance: wallet.totalBalance,
    promoBalance: wallet.promoBalance,
    transactionId: wallet.lastTransactionId
  };
};

/**
 * Get wallet transaction history with filtering and pagination
 * Requirements: 3.4 - Display transaction history with filtering and pagination
 * 
 * @param {string} userId - User ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} Transaction history with pagination
 */
const getTransactionHistory = async (userId, filters = {}, pagination = {}) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Find wallet to get walletId
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    return {
      transactions: [],
      pagination: {
        page: 1,
        limit: pagination.limit || 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }

  // Use Transaction model's static method for comprehensive filtering
  const result = await Transaction.getUserHistory(userId, filters, pagination);

  return {
    transactions: result.transactions.map(tx => ({
      id: tx._id,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description,
      bookingId: tx.bookingId,
      status: tx.status,
      expiryDate: tx.expiryDate,
      createdAt: tx.createdAt,
      balanceAfter: tx.balanceAfter
    })),
    pagination: result.pagination
  };
};

/**
 * Get expiring cashback warnings (within 3 days)
 * Requirements: 3.5 - Display warning notification for expiring cashback
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Expiring cashback details
 */
const getExpiringCashbackWarnings = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Find expiring promotional credits
  const expiringTransactions = await Transaction.find({
    userId,
    type: 'credit',
    category: { $in: ['promo', 'cashback'] },
    status: 'completed',
    expiryDate: { $lte: threeDaysFromNow, $gt: now }
  }).sort({ expiryDate: 1 });

  const expiringEntries = expiringTransactions.map(tx => ({
    id: tx._id,
    amount: tx.amount,
    expiresAt: tx.expiryDate,
    daysUntilExpiry: Math.ceil((tx.expiryDate - now) / (24 * 60 * 60 * 1000)),
    category: tx.category
  }));

  const totalExpiring = expiringEntries.reduce((sum, entry) => sum + entry.amount, 0);

  return {
    hasExpiringCashback: expiringEntries.length > 0,
    totalExpiring,
    entries: expiringEntries
  };
};

module.exports = {
  // Core wallet functions
  getWalletBalance,
  getCashbackBreakdown,
  getTransactionHistory,
  getExpiringCashbackWarnings,
  
  // Wallet operations
  creditCashback,
  addPromoCredit,
  applyWalletToPayment,
  
  // Maintenance functions
  expirePromotionalCredits
};
