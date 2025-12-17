/**
 * Referral Service
 * Manages referral code generation, tracking, and reward processing
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { REFERRAL_REWARDS } = require('../config/constants');

/**
 * Generate referral code for user
 * Requirements: 2.1 - Display unique referral code and sharing options
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Generated referral code
 */
const generateReferralCode = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Check if user already has a referral code
  if (user.referralCode) {
    return {
      referralCode: user.referralCode,
      message: 'Referral code already exists'
    };
  }

  // Generate new referral code
  const referralCode = await User.generateReferralCode();
  
  // Update user with referral code
  user.referralCode = referralCode;
  await user.save();

  return {
    referralCode,
    message: 'Referral code generated successfully'
  };
};

/**
 * Get referral data for user dashboard
 * Requirements: 2.4 - Display total earned discounts and successful referral count
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Referral dashboard data
 */
const getReferralData = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const user = await User.findById(userId).populate('referredBy', 'name referralCode');
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Ensure user has a referral code
  if (!user.referralCode) {
    const referralCode = await User.generateReferralCode();
    user.referralCode = referralCode;
    await user.save();
  }

  // Get recent referrals (users who used this user's referral code)
  const recentReferrals = await User.find({
    referredBy: userId
  })
  .select('name createdAt referralStats.successfulReferrals')
  .sort({ createdAt: -1 })
  .limit(10)
  .lean();

  // Calculate referral statistics
  const referralStats = user.referralStats || {
    totalReferrals: 0,
    successfulReferrals: 0,
    totalEarned: 0,
    pendingReferrals: 0,
    referralTier: 'bronze'
  };

  // Get referral transactions for total earned calculation
  const referralTransactions = await Transaction.find({
    userId,
    category: 'referral',
    status: 'completed'
  }).lean();

  const totalEarned = referralTransactions.reduce((sum, txn) => sum + txn.amount, 0);

  return {
    referralCode: user.referralCode,
    stats: {
      ...referralStats,
      totalEarned
    },
    recentReferrals: recentReferrals.map(ref => ({
      name: ref.name,
      joinedAt: ref.createdAt,
      isSuccessful: ref.referralStats?.successfulReferrals > 0
    })),
    referredBy: user.referredBy ? {
      name: user.referredBy.name,
      referralCode: user.referredBy.referralCode
    } : null,
    socialSharing: user.socialSharing || {
      whatsappEnabled: true,
      emailEnabled: true,
      facebookEnabled: false,
      twitterEnabled: false
    }
  };
};

/**
 * Apply referral code during user registration
 * Requirements: 2.3 - Credit rewards to both referrer and referee accounts
 * 
 * @param {string} userId - New user ID
 * @param {string} referralCode - Referral code used
 * @returns {Promise<Object>} Referral application result
 */
const applyReferralCode = async (userId, referralCode) => {
  if (!userId || !referralCode) {
    throw new Error('User ID and referral code are required');
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Check if user already has a referrer
  if (user.referredBy) {
    const error = new Error('User already has a referrer');
    error.code = 'REFERRAL_ALREADY_APPLIED';
    throw error;
  }

  // Find referrer by referral code
  const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
  if (!referrer) {
    const error = new Error('Invalid referral code');
    error.code = 'INVALID_REFERRAL_CODE';
    throw error;
  }

  // Check if user is trying to refer themselves
  if (referrer._id.toString() === userId) {
    const error = new Error('Cannot use your own referral code');
    error.code = 'SELF_REFERRAL_NOT_ALLOWED';
    throw error;
  }

  // Update user with referrer
  user.referredBy = referrer._id;
  await user.save();

  // Update referrer stats
  referrer.referralStats.totalReferrals += 1;
  referrer.referralStats.pendingReferrals += 1;
  referrer.referralStats.lastReferralDate = new Date();
  await referrer.save();

  return {
    success: true,
    referrer: {
      name: referrer.name,
      referralCode: referrer.referralCode
    },
    message: 'Referral code applied successfully'
  };
};

/**
 * Process referral rewards after successful booking
 * Requirements: 2.3, 2.5 - Credit rewards and send notifications
 * 
 * @param {string} userId - User who made the booking
 * @param {string} bookingId - Booking ID
 * @param {number} bookingAmount - Booking amount
 * @returns {Promise<Object>} Reward processing result
 */
const processReferralRewards = async (userId, bookingId, bookingAmount) => {
  if (!userId || !bookingId) {
    throw new Error('User ID and booking ID are required');
  }

  const user = await User.findById(userId).populate('referredBy');
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Check if user has a referrer and this is their first successful booking
  if (!user.referredBy) {
    return {
      success: false,
      message: 'User has no referrer'
    };
  }

  // Check if this is the user's first booking (referral reward eligibility)
  const previousBookings = await require('../models/Booking').countDocuments({
    userId,
    bookingStatus: 'confirmed'
  });

  if (previousBookings > 1) {
    return {
      success: false,
      message: 'Referral rewards only apply to first booking'
    };
  }

  const referrer = user.referredBy;
  const refereeReward = REFERRAL_REWARDS.REFEREE || 250;
  const referrerReward = REFERRAL_REWARDS.REFERRER || 150;

  try {
    // Credit reward to referee (new user)
    const refereeWallet = await Wallet.findOne({ userId }) || await Wallet.createForUser(userId);
    await refereeWallet.addCashback(refereeReward, 'referral');

    // Create transaction for referee
    await Transaction.create({
      userId,
      walletId: refereeWallet._id,
      type: 'credit',
      category: 'referral',
      amount: refereeReward,
      description: `Referral reward - Welcome bonus`,
      bookingId,
      balanceAfter: {
        promoBalance: refereeWallet.promoBalance,
        nonPromoBalance: refereeWallet.nonPromoBalance,
        totalBalance: refereeWallet.totalBalance
      },
      status: 'completed'
    });

    // Credit reward to referrer
    const referrerWallet = await Wallet.findOne({ userId: referrer._id }) || await Wallet.createForUser(referrer._id);
    await referrerWallet.addCashback(referrerReward, 'referral');

    // Create transaction for referrer
    await Transaction.create({
      userId: referrer._id,
      walletId: referrerWallet._id,
      type: 'credit',
      category: 'referral',
      amount: referrerReward,
      description: `Referral reward - Friend joined`,
      bookingId,
      balanceAfter: {
        promoBalance: referrerWallet.promoBalance,
        nonPromoBalance: referrerWallet.nonPromoBalance,
        totalBalance: referrerWallet.totalBalance
      },
      status: 'completed'
    });

    // Update referrer stats
    referrer.referralStats.successfulReferrals += 1;
    referrer.referralStats.pendingReferrals = Math.max(0, referrer.referralStats.pendingReferrals - 1);
    referrer.referralStats.totalEarned += referrerReward;
    
    // Update referral tier based on successful referrals
    const successfulCount = referrer.referralStats.successfulReferrals;
    if (successfulCount >= 20) {
      referrer.referralStats.referralTier = 'platinum';
    } else if (successfulCount >= 10) {
      referrer.referralStats.referralTier = 'gold';
    } else if (successfulCount >= 5) {
      referrer.referralStats.referralTier = 'silver';
    }
    
    await referrer.save();

    // Send notifications (to be implemented with notification service)
    const notificationService = require('./notificationService');
    
    // Notify referee
    await notificationService.sendReferralRewardNotification(userId, {
      type: 'referee',
      amount: refereeReward,
      referrerName: referrer.name
    });

    // Notify referrer
    await notificationService.sendReferralRewardNotification(referrer._id, {
      type: 'referrer',
      amount: referrerReward,
      refereeName: user.name
    });

    return {
      success: true,
      rewards: {
        referee: {
          userId,
          amount: refereeReward,
          walletBalance: refereeWallet.totalBalance
        },
        referrer: {
          userId: referrer._id,
          amount: referrerReward,
          walletBalance: referrerWallet.totalBalance
        }
      },
      message: 'Referral rewards processed successfully'
    };

  } catch (error) {
    console.error('Error processing referral rewards:', error);
    throw new Error('Failed to process referral rewards');
  }
};

/**
 * Update social sharing preferences
 * Requirements: 2.2 - Social media sharing buttons for email, WhatsApp, Twitter, Facebook
 * 
 * @param {string} userId - User ID
 * @param {Object} preferences - Social sharing preferences
 * @returns {Promise<Object>} Updated preferences
 */
const updateSocialSharingPreferences = async (userId, preferences) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Update social sharing preferences
  user.socialSharing = {
    ...user.socialSharing,
    ...preferences
  };

  await user.save();

  return {
    socialSharing: user.socialSharing,
    message: 'Social sharing preferences updated successfully'
  };
};

/**
 * Get referral leaderboard
 * Requirements: 2.4 - Display referral statistics
 * 
 * @param {number} limit - Number of top referrers to return
 * @returns {Promise<Array>} Top referrers list
 */
const getReferralLeaderboard = async (limit = 10) => {
  const topReferrers = await User.find({
    'referralStats.successfulReferrals': { $gt: 0 }
  })
  .select('name referralCode referralStats')
  .sort({ 'referralStats.successfulReferrals': -1, 'referralStats.totalEarned': -1 })
  .limit(limit)
  .lean();

  return topReferrers.map((user, index) => ({
    rank: index + 1,
    name: user.name,
    referralCode: user.referralCode,
    successfulReferrals: user.referralStats.successfulReferrals,
    totalEarned: user.referralStats.totalEarned,
    tier: user.referralStats.referralTier
  }));
};

/**
 * Validate referral code
 * 
 * @param {string} referralCode - Referral code to validate
 * @returns {Promise<Object>} Validation result
 */
const validateReferralCode = async (referralCode) => {
  if (!referralCode) {
    return {
      valid: false,
      message: 'Referral code is required'
    };
  }

  const referrer = await User.findOne({ 
    referralCode: referralCode.toUpperCase() 
  }).select('name referralCode');

  if (!referrer) {
    return {
      valid: false,
      message: 'Invalid referral code'
    };
  }

  return {
    valid: true,
    referrer: {
      name: referrer.name,
      referralCode: referrer.referralCode
    },
    message: 'Valid referral code'
  };
};

module.exports = {
  generateReferralCode,
  getReferralData,
  applyReferralCode,
  processReferralRewards,
  updateSocialSharingPreferences,
  getReferralLeaderboard,
  validateReferralCode
};