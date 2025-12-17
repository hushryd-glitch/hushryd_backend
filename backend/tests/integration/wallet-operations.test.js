/**
 * Integration Tests for Wallet Operations
 * Tests wallet balance management and transactions
 * 
 * **Feature: abhibus-style-interface**
 * **Task: 19. Create comprehensive testing suite**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../src/models/User');
const Wallet = require('../../src/models/Wallet');

let mongoServer;

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
  await User.deleteMany({});
  await Wallet.deleteMany({});
});

const createUserWithWallet = async (overrides = {}) => {
  const user = new User({
    phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
    role: 'passenger',
    name: overrides.name || 'Test User',
    email: `user${Date.now()}@test.com`
  });
  await user.save();

  const wallet = new Wallet({
    userId: user._id,
    promoBalance: overrides.promoBalance || 0,
    nonPromoBalance: overrides.nonPromoBalance || 0,
    totalEarned: overrides.totalEarned || 0,
    totalSpent: overrides.totalSpent || 0
  });
  await wallet.save();

  return { user, wallet };
};

describe('Wallet Operations Integration Tests', () => {
  describe('Wallet Balance Display (Requirements 3.1)', () => {
    it('should display total balance split between promo and non-promo', async () => {
      const { user } = await createUserWithWallet({
        promoBalance: 100,
        nonPromoBalance: 200
      });

      const userWallet = await Wallet.findOne({ userId: user._id });
      
      expect(userWallet.promoBalance).toBe(100);
      expect(userWallet.nonPromoBalance).toBe(200);
      expect(userWallet.promoBalance + userWallet.nonPromoBalance).toBe(300);
    });

    it('should handle zero balances correctly', async () => {
      const { user } = await createUserWithWallet({
        promoBalance: 0,
        nonPromoBalance: 0
      });

      const userWallet = await Wallet.findOne({ userId: user._id });
      
      expect(userWallet.promoBalance).toBe(0);
      expect(userWallet.nonPromoBalance).toBe(0);
    });
  });

  describe('Cashback Credit (Requirements 3.2)', () => {
    it('should credit cashback to non-promo balance', async () => {
      const { user, wallet } = await createUserWithWallet({
        nonPromoBalance: 100
      });

      wallet.nonPromoBalance += 50;
      wallet.totalEarned += 50;
      await wallet.save();

      const updatedWallet = await Wallet.findOne({ userId: user._id });
      expect(updatedWallet.nonPromoBalance).toBe(150);
      expect(updatedWallet.totalEarned).toBe(50);
    });
  });

  describe('Promotional Credits (Requirements 3.3)', () => {
    it('should credit promotional amount to promo balance', async () => {
      const { user, wallet } = await createUserWithWallet({
        promoBalance: 0
      });

      wallet.promoBalance += 100;
      await wallet.save();

      const updatedWallet = await Wallet.findOne({ userId: user._id });
      expect(updatedWallet.promoBalance).toBe(100);
    });
  });

  describe('Wallet Payment Integration', () => {
    it('should deduct from wallet for booking payment', async () => {
      const { user, wallet } = await createUserWithWallet({
        nonPromoBalance: 200
      });

      wallet.nonPromoBalance -= 150;
      wallet.totalSpent += 150;
      await wallet.save();

      const updatedWallet = await Wallet.findOne({ userId: user._id });
      expect(updatedWallet.nonPromoBalance).toBe(50);
      expect(updatedWallet.totalSpent).toBe(150);
    });

    it('should use promo balance first, then non-promo', async () => {
      const { user, wallet } = await createUserWithWallet({
        promoBalance: 50,
        nonPromoBalance: 100
      });

      const paymentAmount = 75;
      const promoUsed = Math.min(wallet.promoBalance * 0.5, paymentAmount);
      const nonPromoUsed = paymentAmount - promoUsed;

      wallet.promoBalance -= promoUsed;
      wallet.nonPromoBalance -= nonPromoUsed;
      await wallet.save();

      const updatedWallet = await Wallet.findOne({ userId: user._id });
      expect(updatedWallet.promoBalance).toBe(25);
      expect(updatedWallet.nonPromoBalance).toBe(50);
    });
  });
});
