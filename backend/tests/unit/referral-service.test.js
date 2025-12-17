/**
 * Referral Service Tests
 * Tests for referral code generation, validation, and reward processing
 */

const referralService = require('../../src/services/referralService');

// Mock all dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/models/Wallet');
jest.mock('../../src/models/Transaction');
jest.mock('../../src/services/notificationService', () => ({
  sendReferralRewardNotification: jest.fn().mockResolvedValue({ success: true })
}));

const User = require('../../src/models/User');
const Wallet = require('../../src/models/Wallet');
const Transaction = require('../../src/models/Transaction');

describe('Referral Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('generateReferralCode', () => {
    it('should generate a referral code for a user', async () => {
      // Mock user without referral code
      const mockUser = {
        _id: 'user123',
        phone: '9876543210',
        name: 'Test User',
        gender: 'female',
        referralCode: null,
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);
      User.generateReferralCode.mockResolvedValue('ABC123');

      const result = await referralService.generateReferralCode('user123');

      expect(result.referralCode).toBe('ABC123');
      expect(result.message).toBe('Referral code generated successfully');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.referralCode).toBe('ABC123');
    });

    it('should return existing referral code if user already has one', async () => {
      // Mock user with existing referral code
      const mockUser = {
        _id: 'user123',
        phone: '9876543210',
        name: 'Test User',
        gender: 'female',
        referralCode: 'EXISTING123'
      };

      User.findById.mockResolvedValue(mockUser);

      const result = await referralService.generateReferralCode('user123');

      expect(result.referralCode).toBe('EXISTING123');
      expect(result.message).toBe('Referral code already exists');
    });

    it('should throw error for non-existent user', async () => {
      User.findById.mockResolvedValue(null);
      
      await expect(referralService.generateReferralCode('nonexistent'))
        .rejects.toThrow('User not found');
    });
  });

  describe('validateReferralCode', () => {
    it('should validate a valid referral code', async () => {
      // Mock user with referral code
      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        referralCode: 'VALID123'
      };

      const mockQuery = {
        select: jest.fn().mockResolvedValue(mockUser)
      };
      User.findOne.mockReturnValue(mockQuery);

      const result = await referralService.validateReferralCode('VALID123');

      expect(result.valid).toBe(true);
      expect(result.referrer.name).toBe('Test User');
      expect(result.referrer.referralCode).toBe('VALID123');
    });

    it('should reject invalid referral code', async () => {
      const mockQuery = {
        select: jest.fn().mockResolvedValue(null)
      };
      User.findOne.mockReturnValue(mockQuery);

      const result = await referralService.validateReferralCode('INVALID');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Invalid referral code');
    });

    it('should reject empty referral code', async () => {
      const result = await referralService.validateReferralCode('');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Referral code is required');
    });
  });

  describe('applyReferralCode', () => {
    it('should apply referral code to new user', async () => {
      // Mock new user
      const mockUser = {
        _id: 'newuser123',
        name: 'New User',
        referredBy: null,
        save: jest.fn().mockResolvedValue(true)
      };

      // Mock referrer
      const mockReferrer = {
        _id: 'referrer123',
        name: 'Referrer User',
        referralCode: 'REF123',
        referralStats: {
          totalReferrals: 0,
          successfulReferrals: 0,
          totalEarned: 0,
          pendingReferrals: 0,
          lastReferralDate: null
        },
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValue(mockReferrer);

      const result = await referralService.applyReferralCode('newuser123', 'REF123');

      expect(result.success).toBe(true);
      expect(result.referrer.name).toBe('Referrer User');
      expect(mockUser.referredBy).toBe('referrer123');
      expect(mockReferrer.referralStats.totalReferrals).toBe(1);
      expect(mockReferrer.referralStats.pendingReferrals).toBe(1);
    });

    it('should reject self-referral', async () => {
      // Mock user trying to refer themselves
      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        referredBy: null
      };

      const mockReferrer = {
        _id: 'user123', // Same ID as user
        name: 'Test User',
        referralCode: 'SELF123'
      };

      User.findById.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValue(mockReferrer);

      await expect(referralService.applyReferralCode('user123', 'SELF123'))
        .rejects.toThrow('Cannot use your own referral code');
    });

    it('should reject invalid referral code', async () => {
      const mockUser = {
        _id: 'user123',
        name: 'New User',
        referredBy: null
      };

      User.findById.mockResolvedValue(mockUser);
      User.findOne.mockResolvedValue(null); // No referrer found

      await expect(referralService.applyReferralCode('user123', 'INVALID'))
        .rejects.toThrow('Invalid referral code');
    });
  });

  describe('getReferralData', () => {
    it('should return referral data for user with existing referral code', async () => {
      // Mock user with referral code
      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        referralCode: 'TEST123',
        referralStats: {
          totalReferrals: 5,
          successfulReferrals: 3,
          totalEarned: 450,
          pendingReferrals: 2,
          referralTier: 'silver'
        },
        socialSharing: {
          whatsappEnabled: true,
          emailEnabled: true,
          facebookEnabled: false,
          twitterEnabled: false
        }
      };

      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockUser)
      };
      User.findById.mockReturnValue(mockQuery);
      
      const mockFindQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };
      User.find.mockReturnValue(mockFindQuery);
      
      const mockTransactionQuery = {
        lean: jest.fn().mockResolvedValue([])
      };
      Transaction.find.mockReturnValue(mockTransactionQuery);

      const result = await referralService.getReferralData('user123');

      expect(result.referralCode).toBe('TEST123');
      expect(result.stats.totalReferrals).toBe(5);
      expect(result.stats.successfulReferrals).toBe(3);
      expect(result.stats.referralTier).toBe('silver');
      expect(result.recentReferrals).toEqual([]);
    });

    it('should generate referral code if user does not have one', async () => {
      // Mock user without referral code
      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        referralCode: null,
        referralStats: {
          totalReferrals: 0,
          successfulReferrals: 0,
          totalEarned: 0,
          pendingReferrals: 0,
          referralTier: 'bronze'
        },
        socialSharing: {
          whatsappEnabled: true,
          emailEnabled: true,
          facebookEnabled: false,
          twitterEnabled: false
        },
        save: jest.fn().mockResolvedValue(true)
      };

      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockUser)
      };
      User.findById.mockReturnValue(mockQuery);
      User.generateReferralCode.mockResolvedValue('NEW123');
      
      const mockFindQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };
      User.find.mockReturnValue(mockFindQuery);
      
      const mockTransactionQuery = {
        lean: jest.fn().mockResolvedValue([])
      };
      Transaction.find.mockReturnValue(mockTransactionQuery);

      const result = await referralService.getReferralData('user123');

      expect(result.referralCode).toBe('NEW123');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.referralCode).toBe('NEW123');
    });
  });
});