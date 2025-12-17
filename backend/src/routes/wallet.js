/**
 * Wallet Routes
 * API endpoints for wallet balance and cashback management
 * 
 * Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 6.4
 */

const express = require('express');
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  getWalletBalance,
  getCashbackBreakdown,
  applyWalletToPayment,
  getTransactionHistory,
  getExpiringCashbackWarnings,
  addPromoCredit,
  creditCashback
} = require('../services/walletService');

const router = express.Router();

// Validation schemas
const applyWalletSchema = Joi.object({
  fareAmount: Joi.number().min(0).required().messages({
    'number.min': 'Fare amount must be non-negative',
    'any.required': 'Fare amount is required'
  }),
  bookingId: Joi.string().optional()
});

const transactionsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  page: Joi.number().integer().min(1).default(1),
  type: Joi.string().valid('credit', 'debit').optional(),
  category: Joi.string().valid('cashback', 'referral', 'booking', 'promo', 'refund', 'adjustment').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional()
});

const creditCashbackSchema = Joi.object({
  amount: Joi.number().min(0.01).required(),
  source: Joi.string().default('cashback'),
  bookingId: Joi.string().optional(),
  expiryDays: Joi.number().integer().min(1).optional()
});

const addPromoCreditSchema = Joi.object({
  amount: Joi.number().min(0.01).required(),
  source: Joi.string().default('promo'),
  expiryDays: Joi.number().integer().min(1).default(30)
});

/**
 * GET /api/wallet/balance
 * Get wallet balance and breakdown
 * 
 * Requirements: 5.1 - Display total available balance, pending cashback, and transaction history
 * Requirements: 5.2 - Show breakdown of cashback amounts with their expiry dates
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const balance = await getWalletBalance(userId);
    const breakdown = await getCashbackBreakdown(userId);
    const expiringWarnings = await getExpiringCashbackWarnings(userId);
    
    res.status(200).json({
      success: true,
      data: {
        balance: balance.balance,
        promoBalance: balance.promoBalance,
        nonPromoBalance: balance.nonPromoBalance,
        pendingCashback: balance.pendingCashback,
        expiringSoon: balance.expiringSoon,
        totalEarned: balance.totalEarned,
        totalSpent: balance.totalSpent,
        lastUpdated: balance.lastUpdated,
        breakdown,
        warnings: expiringWarnings
      }
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet balance',
      code: 'BALANCE_FETCH_FAILED'
    });
  }
});

/**
 * POST /api/wallet/apply
 * Apply wallet balance to payment
 * 
 * Requirements: 6.1 - Display available wallet balance with option to apply
 * Requirements: 6.2 - Deduct applicable amount from total fare (oldest cashback first - FIFO)
 * Requirements: 6.3 - Apply full wallet balance if less than fare
 * Requirements: 6.4 - Apply only fare amount if wallet exceeds fare
 */
router.post('/apply', authenticateToken, validate(applyWalletSchema), async (req, res) => {
  try {
    const { fareAmount, bookingId } = req.body;
    const userId = req.user._id;
    
    const result = await applyWalletToPayment(userId, fareAmount, bookingId);
    
    res.status(200).json({
      success: true,
      message: result.amountApplied > 0 
        ? `₹${result.amountApplied} applied from wallet` 
        : 'No wallet balance applied',
      data: {
        amountApplied: result.amountApplied,
        remainingFare: result.remainingFare,
        walletBalanceAfter: result.walletBalanceAfter,
        deductionDetails: result.deductionDetails,
        transactionId: result.transactionId
      }
    });
  } catch (error) {
    console.error('Apply wallet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply wallet balance',
      code: 'WALLET_APPLY_FAILED'
    });
  }
});

/**
 * GET /api/wallet/transactions
 * Get wallet transaction history with filtering and pagination
 * 
 * Requirements: 3.4 - Display transaction history with filtering and pagination
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { error, value } = transactionsQuerySchema.validate(req.query);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
        code: 'VALIDATION_ERROR'
      });
    }

    const { limit, page, type, category, startDate, endDate } = value;
    
    const filters = {};
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const pagination = { page, limit };
    
    const result = await getTransactionHistory(userId, filters, pagination);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction history',
      code: 'TRANSACTIONS_FETCH_FAILED'
    });
  }
});

/**
 * GET /api/wallet/expiring
 * Get expiring cashback warnings
 * 
 * Requirements: 3.5 - Display warning notification for expiring cashback within 3 days
 */
router.get('/expiring', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const warnings = await getExpiringCashbackWarnings(userId);
    
    res.status(200).json({
      success: true,
      data: warnings
    });
  } catch (error) {
    console.error('Get expiring cashback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiring cashback',
      code: 'EXPIRING_FETCH_FAILED'
    });
  }
});

/**
 * POST /api/wallet/credit-cashback
 * Credit cashback to user wallet
 * 
 * Requirements: 3.2 - Credit cashback to non-promo balance with 100% redeemability
 * Requirements: 9.2 - Automatically credit cashback after successful payments
 */
router.post('/credit-cashback', authenticateToken, validate(creditCashbackSchema), async (req, res) => {
  try {
    const { amount, source, bookingId, expiryDays } = req.body;
    const userId = req.user._id;
    
    const result = await creditCashback(userId, amount, source, bookingId, expiryDays);
    
    res.status(200).json({
      success: true,
      message: `₹${amount} cashback credited successfully`,
      data: result
    });
  } catch (error) {
    console.error('Credit cashback error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to credit cashback',
      code: 'CASHBACK_CREDIT_FAILED'
    });
  }
});

/**
 * POST /api/wallet/add-promo-credit
 * Add promotional credit to user wallet
 * 
 * Requirements: 3.3 - Credit promotional credits to promo balance with partial redeemability
 */
router.post('/add-promo-credit', authenticateToken, validate(addPromoCreditSchema), async (req, res) => {
  try {
    const { amount, source, expiryDays } = req.body;
    const userId = req.user._id;
    
    const result = await addPromoCredit(userId, amount, source, expiryDays);
    
    res.status(200).json({
      success: true,
      message: `₹${amount} promotional credit added successfully`,
      data: result
    });
  } catch (error) {
    console.error('Add promo credit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add promotional credit',
      code: 'PROMO_CREDIT_FAILED'
    });
  }
});

module.exports = router;
