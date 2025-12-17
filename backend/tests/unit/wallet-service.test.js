/**
 * Wallet Service Tests
 * Tests for comprehensive wallet system functionality
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 9.2, 9.4
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import models and services
const Wallet = require('../../src/models/Wallet');
const Transaction = require('../../src/models/Transaction');
const User = require('../../src/models/User');
const {
  getWalletBalance,
  creditCashback,
  addPromoCredit,
  applyWalletToPayment,
  getTransactionHistory,
  getExpiringCashbackWarnings
} = require('../../src/services/walletService');

describe('Wallet Service', () => {
  let mongoServer;
  let testUser;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await User.deleteMany({});
    await Wallet.deleteMany({});
    await Transaction.deleteMany({});

    // Create test user
    testUser = await User.create({
      name: 'Test User',
      phone: '+919876543210',
      email: 'test@example.com',
      gender: 'male'
    });
  });

  describe('Wallet Balance Management', () => {
    test('should get wallet balance for new user', async () => {
      const balance = await getWalletBalance(testUser._id);
      
      expect(balance).toMatchObject({
        userId: testUser._id,
        balance: 0,
        promoBalance: 0,
        nonPromoBalance: 0,
        pendingCashback: 0,
        totalEarned: 0,
        totalSpent: 0
      });
    });

    test('should credit cashback to non-promo balance', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const result = await creditCashback(testUser._id, 100, 'booking', bookingId.toString());
      
      expect(result).toMatchObject({
        amount: 100,
        source: 'booking',
        bookingId: bookingId.toString()
      });

      const balance = await getWalletBalance(testUser._id);
      expect(balance.balance).toBe(100);
      expect(balance.nonPromoBalance).toBe(100);
      expect(balance.promoBalance).toBe(0);
      expect(balance.totalEarned).toBe(100);
    });

    test('should add promotional credit to promo balance', async () => {
      const result = await addPromoCredit(testUser._id, 50, 'signup_bonus', 30);
      
      expect(result).toMatchObject({
        amount: 50,
        source: 'signup_bonus'
      });

      const balance = await getWalletBalance(testUser._id);
      expect(balance.balance).toBe(50);
      expect(balance.promoBalance).toBe(50);
      expect(balance.nonPromoBalance).toBe(0);
    });
  });

  describe('Wallet Payment Application', () => {
    beforeEach(async () => {
      // Add some balance to wallet
      await creditCashback(testUser._id, 100, 'cashback');
      await addPromoCredit(testUser._id, 50, 'promo');
    });

    test('should apply full wallet balance when less than fare', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const result = await applyWalletToPayment(testUser._id, 200, bookingId.toString());
      
      expect(result.amountApplied).toBe(150); // 100 + 50
      expect(result.remainingFare).toBe(50); // 200 - 150
      expect(result.walletBalanceAfter).toBe(0);
    });

    test('should apply only fare amount when wallet exceeds fare', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const result = await applyWalletToPayment(testUser._id, 80, bookingId.toString());
      
      expect(result.amountApplied).toBe(80);
      expect(result.remainingFare).toBe(0);
      expect(result.walletBalanceAfter).toBe(70); // 150 - 80
    });

    test('should deduct from non-promo balance first', async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const result = await applyWalletToPayment(testUser._id, 120, bookingId.toString());
      
      expect(result.amountApplied).toBe(120);
      expect(result.deductionDetails.fromNonPromo).toBe(100);
      expect(result.deductionDetails.fromPromo).toBe(20);
    });
  });

  describe('Transaction History', () => {
    beforeEach(async () => {
      // Create some transactions
      const booking1Id = new mongoose.Types.ObjectId();
      const booking2Id = new mongoose.Types.ObjectId();
      await creditCashback(testUser._id, 100, 'cashback', booking1Id.toString());
      await addPromoCredit(testUser._id, 50, 'signup_bonus');
      await applyWalletToPayment(testUser._id, 30, booking2Id.toString());
    });

    test('should get transaction history with pagination', async () => {
      const result = await getTransactionHistory(testUser._id, {}, { page: 1, limit: 10 });
      
      expect(result.transactions).toHaveLength(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(3);
    });

    test('should filter transactions by type', async () => {
      const result = await getTransactionHistory(testUser._id, { type: 'credit' }, { page: 1, limit: 10 });
      
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions.every(tx => tx.type === 'credit')).toBe(true);
    });

    test('should filter transactions by category', async () => {
      const result = await getTransactionHistory(testUser._id, { category: 'cashback' }, { page: 1, limit: 10 });
      
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].category).toBe('cashback');
    });
  });

  describe('Expiry Warnings', () => {
    test('should detect expiring promotional credits', async () => {
      // Add promo credit expiring in 2 days
      const expiryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      
      // Create wallet and transaction manually for testing
      const wallet = await Wallet.createForUser(testUser._id);
      await Transaction.create({
        userId: testUser._id,
        walletId: wallet._id,
        type: 'credit',
        category: 'promo',
        amount: 75,
        description: 'Test promo credit',
        expiryDate: expiryDate,
        status: 'completed',
        balanceAfter: {
          promoBalance: 75,
          nonPromoBalance: 0,
          totalBalance: 75
        }
      });

      const warnings = await getExpiringCashbackWarnings(testUser._id);
      
      expect(warnings.hasExpiringCashback).toBe(true);
      expect(warnings.totalExpiring).toBe(75);
      expect(warnings.entries).toHaveLength(1);
      expect(warnings.entries[0].daysUntilExpiry).toBe(2);
    });

    test('should not detect non-expiring credits', async () => {
      // Add promo credit expiring in 10 days
      const expiryDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      
      const wallet = await Wallet.createForUser(testUser._id);
      await Transaction.create({
        userId: testUser._id,
        walletId: wallet._id,
        type: 'credit',
        category: 'promo',
        amount: 75,
        description: 'Test promo credit',
        expiryDate: expiryDate,
        status: 'completed',
        balanceAfter: {
          promoBalance: 75,
          nonPromoBalance: 0,
          totalBalance: 75
        }
      });

      const warnings = await getExpiringCashbackWarnings(testUser._id);
      
      expect(warnings.hasExpiringCashback).toBe(false);
      expect(warnings.totalExpiring).toBe(0);
      expect(warnings.entries).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for invalid user ID', async () => {
      await expect(getWalletBalance(null)).rejects.toThrow('User ID is required');
    });

    test('should throw error for negative cashback amount', async () => {
      await expect(creditCashback(testUser._id, -50)).rejects.toThrow('Amount must be a positive number');
    });

    test('should throw error for negative fare amount', async () => {
      await expect(applyWalletToPayment(testUser._id, -100)).rejects.toThrow('Fare amount must be a non-negative number');
    });
  });
});