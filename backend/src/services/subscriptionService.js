/**
 * Subscription Service
 * Manages user subscriptions for the HushRyd platform
 * Implements tiered membership system (Normal, Silver, Gold)
 * 
 * Requirements: 2.1, 3.1, 3.2, 3.4, 3.5, 7.5, 11.1, 11.2
 */

const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { 
  getAllPlans, 
  getPlanById, 
  getPlanPrice,
  getFreeCancellationsLimit 
} = require('../config/subscriptionPlans');
const { createOrder, getPaymentStatus } = require('./cashfreeService');

/**
 * Get all available subscription plans
 * Requirements: 2.1 - Display three plans: Normal, Silver, Gold
 * 
 * @returns {Array} Array of all subscription plans
 */
const getPlans = () => {
  return getAllPlans();
};

/**
 * Get user's current active subscription
 * Requirements: 3.4 - Display subscription status, expiry date, and remaining benefits
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Active subscription or null
 */
const getUserSubscription = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const subscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).lean();

  if (!subscription) {
    // Return default Normal plan info for users without subscription
    return {
      planId: 'normal',
      plan: getPlanById('normal'),
      status: 'active',
      isDefault: true
    };
  }

  // Attach plan details
  const plan = getPlanById(subscription.planId);
  return {
    ...subscription,
    plan,
    isDefault: false
  };
};

/**
 * Get remaining benefits for a user's subscription
 * Requirements: 3.4 - Display remaining benefits in profile
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Remaining benefits
 */
const getRemainingBenefits = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const subscription = await getUserSubscription(userId);
  
  if (!subscription || subscription.isDefault) {
    // Normal plan has no special benefits
    return {
      planId: 'normal',
      freeCancellationsRemaining: 0,
      freeCancellationsUsed: 0,
      freeCancellationsLimit: 0,
      cashbackPerBooking: 0,
      cashbackValidityDays: 0,
      priorityAllocation: false,
      seatHoldMinutes: 5,
      subscriptionActive: false
    };
  }

  const plan = subscription.plan;
  const freeCancellationsUsed = subscription.freeCancellationsUsed || 0;
  const freeCancellationsLimit = plan.benefits.freeCancellationsPerMonth;

  return {
    planId: subscription.planId,
    freeCancellationsRemaining: Math.max(0, freeCancellationsLimit - freeCancellationsUsed),
    freeCancellationsUsed,
    freeCancellationsLimit,
    cashbackPerBooking: plan.benefits.cashbackPerBooking,
    cashbackValidityDays: plan.benefits.cashbackValidityDays,
    priorityAllocation: plan.features.priorityAllocation,
    seatHoldMinutes: plan.benefits.seatHoldMinutes,
    subscriptionActive: true,
    expiresAt: subscription.expiresAt,
    benefitsResetAt: subscription.benefitsResetAt
  };
};


/**
 * Generate unique order ID for subscription purchase
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @returns {string} Unique order ID
 */
const generateSubscriptionOrderId = (userId, planId) => {
  const timestamp = Date.now().toString(36);
  const userPart = userId.toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SUB-${planId.toUpperCase()}-${userPart}-${timestamp}-${random}`;
};

/**
 * Create subscription order with Cashfree
 * Requirements: 3.1 - Initiate payment flow for selected plan
 * Requirements: 11.1 - Create Cashfree order with subscription amount
 * 
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID (silver or gold)
 * @returns {Promise<Object>} Cashfree order details
 */
const createSubscriptionOrder = async (userId, planId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!planId) {
    throw new Error('Plan ID is required');
  }

  // Validate plan exists and is purchasable
  const plan = getPlanById(planId);
  if (!plan) {
    const error = new Error(`Invalid plan ID: ${planId}`);
    error.code = 'INVALID_PLAN';
    throw error;
  }

  if (plan.price === 0) {
    const error = new Error('Normal plan does not require payment');
    error.code = 'FREE_PLAN';
    throw error;
  }

  // Get user details for order
  const user = await User.findById(userId).lean();
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Check if user already has an active subscription
  const existingSubscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (existingSubscription && existingSubscription.planId !== 'normal') {
    const error = new Error('User already has an active subscription');
    error.code = 'SUBSCRIPTION_EXISTS';
    error.currentPlan = existingSubscription.planId;
    error.expiresAt = existingSubscription.expiresAt;
    throw error;
  }

  // Generate unique order ID
  const orderId = generateSubscriptionOrderId(userId, planId);

  // Create Cashfree order
  // Requirements: 11.1 - Order amount SHALL match plan price exactly
  const orderData = {
    orderId,
    amount: plan.price, // Exact plan price as per Property 15
    currency: plan.currency || 'INR',
    customerDetails: {
      customerId: userId.toString(),
      name: user.name || 'HushRyd User',
      email: user.email || `${user.phone}@hushryd.com`,
      phone: user.phone
    },
    orderMeta: {
      returnUrl: `${process.env.FRONTEND_URL || 'https://hushryd.com'}/subscription/success?order_id=${orderId}`,
      notifyUrl: `${process.env.BACKEND_URL || 'https://api.hushryd.com'}/api/webhooks/subscription`
    },
    note: `HushRyd ${plan.name} Subscription - ${plan.price} INR/month`
  };

  const cashfreeOrder = await createOrder(orderData);

  // Store pending subscription record
  await Subscription.create({
    userId,
    planId,
    status: 'pending',
    orderId: cashfreeOrder.orderId,
    activatedAt: new Date(),
    expiresAt: new Date(), // Will be updated on activation
    freeCancellationsUsed: 0
  });

  return {
    orderId: cashfreeOrder.orderId,
    paymentSessionId: cashfreeOrder.paymentSessionId,
    orderAmount: cashfreeOrder.orderAmount,
    orderCurrency: cashfreeOrder.orderCurrency,
    planId,
    planName: plan.name,
    planPrice: plan.price
  };
};


/**
 * Activate subscription after successful payment
 * Requirements: 3.2 - Activate subscription immediately, set expiry to 30 days
 * Requirements: 11.2 - Activate subscription via webhook confirmation
 * 
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {string} paymentId - Cashfree payment reference
 * @param {string} orderId - Cashfree order ID (optional)
 * @returns {Promise<Object>} Activated subscription
 */
const activateSubscription = async (userId, planId, paymentId, orderId = null) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!planId) {
    throw new Error('Plan ID is required');
  }

  if (!paymentId) {
    throw new Error('Payment ID is required');
  }

  // Validate plan
  const plan = getPlanById(planId);
  if (!plan) {
    const error = new Error(`Invalid plan ID: ${planId}`);
    error.code = 'INVALID_PLAN';
    throw error;
  }

  const now = new Date();
  
  // Property 3: Subscription expiry calculation
  // Expiry date SHALL be exactly 30 days from activation timestamp
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Check for existing pending subscription with this order
  let subscription = null;
  if (orderId) {
    subscription = await Subscription.findOne({ orderId, userId });
  }

  if (subscription) {
    // Update existing pending subscription
    subscription.status = 'active';
    subscription.paymentId = paymentId;
    subscription.activatedAt = now;
    subscription.expiresAt = expiresAt;
    subscription.freeCancellationsUsed = 0;
    subscription.benefitsResetAt = expiresAt; // Reset benefits at expiry
    await subscription.save();
  } else {
    // Expire any existing active subscriptions for this user
    await Subscription.updateMany(
      { userId, status: 'active' },
      { status: 'expired' }
    );

    // Create new subscription
    subscription = await Subscription.create({
      userId,
      planId,
      status: 'active',
      activatedAt: now,
      expiresAt,
      paymentId,
      orderId,
      freeCancellationsUsed: 0,
      benefitsResetAt: expiresAt
    });
  }

  return {
    subscriptionId: subscription._id,
    userId: subscription.userId,
    planId: subscription.planId,
    plan,
    status: subscription.status,
    activatedAt: subscription.activatedAt,
    expiresAt: subscription.expiresAt,
    paymentId: subscription.paymentId,
    benefits: {
      freeCancellationsPerMonth: plan.benefits.freeCancellationsPerMonth,
      cashbackPerBooking: plan.benefits.cashbackPerBooking,
      cashbackValidityDays: plan.benefits.cashbackValidityDays,
      priorityAllocation: plan.features.priorityAllocation
    }
  };
};


/**
 * Check and expire old subscriptions (cron job function)
 * Requirements: 3.5 - Downgrade expired users to Normal plan
 * 
 * @returns {Promise<Object>} Expiry results
 */
const checkAndExpireSubscriptions = async () => {
  const now = new Date();

  // Find all active subscriptions that have expired
  const expiredSubscriptions = await Subscription.find({
    status: 'active',
    expiresAt: { $lte: now }
  });

  const results = {
    processed: 0,
    expired: [],
    errors: []
  };

  for (const subscription of expiredSubscriptions) {
    try {
      // Update subscription status to expired
      subscription.status = 'expired';
      await subscription.save();

      results.expired.push({
        subscriptionId: subscription._id,
        userId: subscription.userId,
        planId: subscription.planId,
        expiredAt: subscription.expiresAt
      });

      results.processed++;

      // Note: Notification should be sent via notificationService
      // This is handled separately to keep concerns separated
      console.log(`[SubscriptionService] Expired subscription ${subscription._id} for user ${subscription.userId}`);
    } catch (error) {
      results.errors.push({
        subscriptionId: subscription._id,
        error: error.message
      });
      console.error(`[SubscriptionService] Error expiring subscription ${subscription._id}:`, error.message);
    }
  }

  console.log(`[SubscriptionService] Expiry check complete: ${results.processed} subscriptions expired`);
  return results;
};


/**
 * Reset monthly benefits for subscriptions (cron job function)
 * Requirements: 7.5 - Restore free cancellation count to plan limit
 * Property 12: Monthly benefits reset
 * 
 * @returns {Promise<Object>} Reset results
 */
const resetMonthlyBenefits = async () => {
  const now = new Date();

  // Find active subscriptions where benefits need to be reset
  // Benefits reset when benefitsResetAt is in the past or not set
  const subscriptionsToReset = await Subscription.find({
    status: 'active',
    expiresAt: { $gt: now },
    $or: [
      { benefitsResetAt: { $lte: now } },
      { benefitsResetAt: { $exists: false } }
    ]
  });

  const results = {
    processed: 0,
    reset: [],
    errors: []
  };

  for (const subscription of subscriptionsToReset) {
    try {
      const previousUsed = subscription.freeCancellationsUsed;
      
      // Reset free cancellations counter
      subscription.freeCancellationsUsed = 0;
      
      // Set next reset date to 30 days from now
      subscription.benefitsResetAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      await subscription.save();

      results.reset.push({
        subscriptionId: subscription._id,
        userId: subscription.userId,
        planId: subscription.planId,
        previousFreeCancellationsUsed: previousUsed,
        nextResetAt: subscription.benefitsResetAt
      });

      results.processed++;

      console.log(`[SubscriptionService] Reset benefits for subscription ${subscription._id}, user ${subscription.userId}`);
    } catch (error) {
      results.errors.push({
        subscriptionId: subscription._id,
        error: error.message
      });
      console.error(`[SubscriptionService] Error resetting benefits for subscription ${subscription._id}:`, error.message);
    }
  }

  console.log(`[SubscriptionService] Benefits reset complete: ${results.processed} subscriptions reset`);
  return results;
};

/**
 * Use a free cancellation for a subscription
 * Requirements: 7.3 - Decrement remaining count and process full refund
 * Property 11: Free cancellation counter decrement
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result with success status and remaining count
 */
const useFreeCancellation = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const subscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (!subscription || subscription.planId === 'normal') {
    return {
      success: false,
      reason: 'NO_SUBSCRIPTION',
      message: 'No active subscription with free cancellation benefit'
    };
  }

  const plan = getPlanById(subscription.planId);
  const limit = plan.benefits.freeCancellationsPerMonth;
  const used = subscription.freeCancellationsUsed || 0;

  if (used >= limit) {
    return {
      success: false,
      reason: 'LIMIT_REACHED',
      message: 'Free cancellation limit reached for this month',
      used,
      limit,
      remaining: 0
    };
  }

  // Increment used count
  subscription.freeCancellationsUsed = used + 1;
  await subscription.save();

  return {
    success: true,
    used: subscription.freeCancellationsUsed,
    limit,
    remaining: limit - subscription.freeCancellationsUsed
  };
};

/**
 * Get subscription by order ID (for webhook processing)
 * 
 * @param {string} orderId - Cashfree order ID
 * @returns {Promise<Object|null>} Subscription or null
 */
const getSubscriptionByOrderId = async (orderId) => {
  if (!orderId) {
    return null;
  }
  return Subscription.findOne({ orderId }).lean();
};

/**
 * Get user subscription history and wallet transactions for admin
 * Requirements: 9.2 - View user subscription history and wallet transactions
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User subscription and wallet details
 */
const getUserSubscriptionDetails = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Get user basic info
  const user = await User.findById(userId).select('name phone email role isActive createdAt').lean();
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Get all subscriptions for this user (current and historical)
  const subscriptions = await Subscription.find({ userId })
    .sort({ createdAt: -1 })
    .lean();

  // Get current active subscription
  const currentSubscription = await getUserSubscription(userId);
  const benefits = await getRemainingBenefits(userId);

  // Get wallet details
  const Wallet = require('../models/Wallet');
  const wallet = await Wallet.findOne({ userId }).lean();

  // Get wallet transactions
  const Transaction = require('../models/Transaction');
  const walletTransactions = await Transaction.find({
    userId,
    type: { $in: ['cashback_credit', 'wallet_redemption'] }
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    user,
    currentSubscription,
    benefits,
    subscriptionHistory: subscriptions,
    wallet: wallet || { balance: 0, cashbackEntries: [], totalEarned: 0, totalRedeemed: 0 },
    walletTransactions
  };
};

/**
 * Extend user subscription (admin function)
 * Requirements: 9.3 - Options to extend/cancel/upgrade subscriptions
 * 
 * @param {string} userId - User ID
 * @param {number} days - Number of days to extend
 * @param {string} adminId - Admin performing the action
 * @returns {Promise<Object>} Updated subscription
 */
const extendUserSubscription = async (userId, days, adminId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!days || days <= 0) {
    throw new Error('Extension days must be positive');
  }

  const subscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (!subscription) {
    const error = new Error('No active subscription found for user');
    error.code = 'NO_ACTIVE_SUBSCRIPTION';
    throw error;
  }

  // Extend expiry date
  const newExpiryDate = new Date(subscription.expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
  subscription.expiresAt = newExpiryDate;
  
  // Update benefits reset date if needed
  if (!subscription.benefitsResetAt || subscription.benefitsResetAt < newExpiryDate) {
    subscription.benefitsResetAt = newExpiryDate;
  }

  await subscription.save();

  // Log admin action
  console.log(`[SubscriptionService] Admin ${adminId} extended subscription ${subscription._id} by ${days} days`);

  return {
    subscriptionId: subscription._id,
    userId: subscription.userId,
    planId: subscription.planId,
    newExpiryDate: subscription.expiresAt,
    extendedBy: days
  };
};

/**
 * Cancel user subscription (admin function)
 * Requirements: 9.3 - Options to extend/cancel/upgrade subscriptions
 * 
 * @param {string} userId - User ID
 * @param {string} adminId - Admin performing the action
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Cancelled subscription
 */
const cancelUserSubscription = async (userId, adminId, reason = 'Admin cancellation') => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const subscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (!subscription) {
    const error = new Error('No active subscription found for user');
    error.code = 'NO_ACTIVE_SUBSCRIPTION';
    throw error;
  }

  // Cancel subscription
  subscription.status = 'cancelled';
  await subscription.save();

  // Log admin action
  console.log(`[SubscriptionService] Admin ${adminId} cancelled subscription ${subscription._id} for user ${userId}. Reason: ${reason}`);

  return {
    subscriptionId: subscription._id,
    userId: subscription.userId,
    planId: subscription.planId,
    cancelledAt: new Date(),
    reason
  };
};

/**
 * Upgrade user subscription (admin function)
 * Requirements: 9.3 - Options to extend/cancel/upgrade subscriptions
 * 
 * @param {string} userId - User ID
 * @param {string} newPlanId - New plan ID (silver or gold)
 * @param {string} adminId - Admin performing the action
 * @returns {Promise<Object>} New subscription
 */
const upgradeUserSubscription = async (userId, newPlanId, adminId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!newPlanId || !['silver', 'gold'].includes(newPlanId)) {
    throw new Error('Invalid plan ID for upgrade');
  }

  // Validate new plan
  const newPlan = getPlanById(newPlanId);
  if (!newPlan) {
    const error = new Error(`Invalid plan ID: ${newPlanId}`);
    error.code = 'INVALID_PLAN';
    throw error;
  }

  // Get current subscription
  const currentSubscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  let expiryDate;
  if (currentSubscription) {
    // Use existing expiry date
    expiryDate = currentSubscription.expiresAt;
    
    // Cancel current subscription
    currentSubscription.status = 'cancelled';
    await currentSubscription.save();
  } else {
    // Create new 30-day subscription
    expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  // Create new subscription
  const newSubscription = await Subscription.create({
    userId,
    planId: newPlanId,
    status: 'active',
    activatedAt: new Date(),
    expiresAt: expiryDate,
    freeCancellationsUsed: 0,
    benefitsResetAt: expiryDate
  });

  // Log admin action
  console.log(`[SubscriptionService] Admin ${adminId} upgraded user ${userId} to ${newPlanId} plan`);

  return {
    subscriptionId: newSubscription._id,
    userId: newSubscription.userId,
    planId: newSubscription.planId,
    plan: newPlan,
    activatedAt: newSubscription.activatedAt,
    expiresAt: newSubscription.expiresAt,
    previousPlan: currentSubscription?.planId || 'normal'
  };
};

/**
 * Get subscription analytics for admin dashboard
 * Requirements: 9.1 - Display total subscribers by plan, revenue metrics, churn rate
 * 
 * @param {Object} options - Date range and filter options
 * @returns {Promise<Object>} Subscription analytics data
 */
const getSubscriptionAnalytics = async (options = {}) => {
  const { startDate, endDate } = options;
  
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Total subscribers by plan (active subscriptions)
  const subscribersByPlan = await Subscription.aggregate([
    {
      $match: {
        status: 'active',
        expiresAt: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: '$planId',
        count: { $sum: 1 }
      }
    }
  ]);

  // Revenue metrics
  const Transaction = require('../models/Transaction');
  const revenueMetrics = await Transaction.aggregate([
    {
      $match: {
        type: 'subscription',
        status: 'success',
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
        averageRevenue: { $avg: '$amount' }
      }
    }
  ]);

  // Monthly revenue trend
  const monthlyRevenue = await Transaction.aggregate([
    {
      $match: {
        type: 'subscription',
        status: 'success',
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$amount' },
        subscriptions: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  // Churn rate calculation (subscriptions that expired in the period)
  const churnData = await Subscription.aggregate([
    {
      $facet: {
        expired: [
          {
            $match: {
              status: 'expired',
              expiresAt: { $gte: start, $lte: end }
            }
          },
          { $count: 'count' }
        ],
        totalActive: [
          {
            $match: {
              status: 'active',
              activatedAt: { $lte: end }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ]);

  const expiredCount = churnData[0]?.expired[0]?.count || 0;
  const totalActiveCount = churnData[0]?.totalActive[0]?.count || 0;
  const churnRate = totalActiveCount > 0 ? (expiredCount / totalActiveCount) * 100 : 0;

  // New subscriptions in period
  const newSubscriptions = await Subscription.countDocuments({
    status: { $in: ['active', 'expired'] },
    activatedAt: { $gte: start, $lte: end }
  });

  // Format subscribers by plan
  const planBreakdown = { normal: 0, silver: 0, gold: 0 };
  subscribersByPlan.forEach(item => {
    planBreakdown[item._id] = item.count;
  });

  // Add normal plan users (users without active subscriptions)
  const totalUsers = await User.countDocuments({ isActive: true });
  const totalSubscribers = Object.values(planBreakdown).reduce((sum, count) => sum + count, 0);
  planBreakdown.normal = Math.max(0, totalUsers - totalSubscribers);

  return {
    subscribersByPlan: planBreakdown,
    totalSubscribers: totalSubscribers,
    totalUsers,
    revenueMetrics: revenueMetrics[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      averageRevenue: 0
    },
    monthlyRevenue,
    churnRate: Math.round(churnRate * 100) / 100,
    newSubscriptions,
    period: { start, end }
  };
};

/**
 * Export subscription data for admin
 * Requirements: 9.4 - Export subscriber list with details and revenue breakdown
 * 
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export data
 */
const exportSubscriptionData = async (options = {}) => {
  const { format = 'csv', startDate, endDate, includeWallet = false } = options;
  
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Get all subscriptions with user details
  const subscriptions = await Subscription.find({
    createdAt: { $gte: start, $lte: end }
  })
    .populate('userId', 'name phone email createdAt')
    .sort({ createdAt: -1 })
    .lean();

  // Get revenue data
  const Transaction = require('../models/Transaction');
  const revenueData = await Transaction.find({
    type: 'subscription',
    status: 'success',
    createdAt: { $gte: start, $lte: end }
  })
    .populate('userId', 'name phone')
    .sort({ createdAt: -1 })
    .lean();

  // Get wallet data if requested
  let walletData = [];
  if (includeWallet) {
    const Wallet = require('../models/Wallet');
    walletData = await Wallet.find({
      updatedAt: { $gte: start, $lte: end }
    })
      .populate('userId', 'name phone email')
      .lean();
  }

  if (format === 'csv') {
    return {
      subscriptions: generateSubscriptionCSV(subscriptions),
      revenue: generateRevenueCSV(revenueData),
      wallet: includeWallet ? generateWalletCSV(walletData) : null
    };
  } else {
    return {
      subscriptions: generateSubscriptionPDF(subscriptions),
      revenue: generateRevenuePDF(revenueData),
      wallet: includeWallet ? generateWalletPDF(walletData) : null
    };
  }
};

/**
 * Generate CSV content from subscription data
 * @param {Array} subscriptions - Subscription records
 * @returns {string} CSV content
 */
const generateSubscriptionCSV = (subscriptions) => {
  const headers = [
    'Subscription ID',
    'User Name',
    'Phone',
    'Email',
    'Plan',
    'Status',
    'Activated At',
    'Expires At',
    'Free Cancellations Used',
    'Payment ID',
    'Order ID'
  ];

  const rows = subscriptions.map(sub => [
    sub._id.toString(),
    sub.userId?.name || 'N/A',
    sub.userId?.phone || 'N/A',
    sub.userId?.email || 'N/A',
    sub.planId,
    sub.status,
    sub.activatedAt ? new Date(sub.activatedAt).toISOString() : '',
    sub.expiresAt ? new Date(sub.expiresAt).toISOString() : '',
    sub.freeCancellationsUsed || 0,
    sub.paymentId || 'N/A',
    sub.orderId || 'N/A'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Generate CSV content from revenue data
 * @param {Array} transactions - Transaction records
 * @returns {string} CSV content
 */
const generateRevenueCSV = (transactions) => {
  const headers = [
    'Transaction ID',
    'Order ID',
    'User Name',
    'Phone',
    'Amount (INR)',
    'Status',
    'Payment Method',
    'Cashfree Reference',
    'Created At'
  ];

  const rows = transactions.map(txn => [
    txn.transactionId || txn._id.toString(),
    txn.orderId || 'N/A',
    txn.userId?.name || 'N/A',
    txn.userId?.phone || 'N/A',
    txn.amount || 0,
    txn.status,
    txn.paymentMethod?.type || 'N/A',
    txn.cashfreeData?.referenceId || txn.cashfreeData?.paymentId || 'N/A',
    txn.createdAt ? new Date(txn.createdAt).toISOString() : ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Generate CSV content from wallet data
 * @param {Array} wallets - Wallet records
 * @returns {string} CSV content
 */
const generateWalletCSV = (wallets) => {
  const headers = [
    'User Name',
    'Phone',
    'Email',
    'Current Balance (INR)',
    'Total Earned (INR)',
    'Total Redeemed (INR)',
    'Total Expired (INR)',
    'Active Entries',
    'Last Updated'
  ];

  const rows = wallets.map(wallet => [
    wallet.userId?.name || 'N/A',
    wallet.userId?.phone || 'N/A',
    wallet.userId?.email || 'N/A',
    wallet.balance || 0,
    wallet.totalEarned || 0,
    wallet.totalRedeemed || 0,
    wallet.totalExpired || 0,
    wallet.cashbackEntries?.filter(entry => entry.status === 'active').length || 0,
    wallet.updatedAt ? new Date(wallet.updatedAt).toISOString() : ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Generate PDF content from subscription data
 * @param {Array} subscriptions - Subscription records
 * @returns {Buffer} PDF buffer
 */
const generateSubscriptionPDF = (subscriptions) => {
  const summary = {
    totalSubscriptions: subscriptions.length,
    byPlan: {},
    byStatus: {}
  };

  subscriptions.forEach(sub => {
    summary.byPlan[sub.planId] = (summary.byPlan[sub.planId] || 0) + 1;
    summary.byStatus[sub.status] = (summary.byStatus[sub.status] || 0) + 1;
  });

  const reportContent = `
HUSHRYD SUBSCRIPTION REPORT
Generated: ${new Date().toISOString()}
=====================================

SUMMARY
-------
Total Subscriptions: ${summary.totalSubscriptions}

By Plan:
${Object.entries(summary.byPlan).map(([plan, count]) => `  ${plan}: ${count}`).join('\n')}

By Status:
${Object.entries(summary.byStatus).map(([status, count]) => `  ${status}: ${count}`).join('\n')}

SUBSCRIPTION DETAILS
-------------------
${subscriptions.map((sub, i) => `
${i + 1}. ${sub._id}
   User: ${sub.userId?.name || 'N/A'} (${sub.userId?.phone || 'N/A'})
   Plan: ${sub.planId} | Status: ${sub.status}
   Period: ${sub.activatedAt ? new Date(sub.activatedAt).toLocaleDateString() : 'N/A'} - ${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : 'N/A'}
   Free Cancellations Used: ${sub.freeCancellationsUsed || 0}
`).join('\n')}
`;

  return Buffer.from(reportContent, 'utf-8');
};

/**
 * Generate PDF content from revenue data
 * @param {Array} transactions - Transaction records
 * @returns {Buffer} PDF buffer
 */
const generateRevenuePDF = (transactions) => {
  const totalRevenue = transactions.reduce((sum, txn) => sum + (txn.amount || 0), 0);
  const successfulTransactions = transactions.filter(txn => txn.status === 'success');

  const reportContent = `
HUSHRYD SUBSCRIPTION REVENUE REPORT
Generated: ${new Date().toISOString()}
=====================================

SUMMARY
-------
Total Transactions: ${transactions.length}
Successful Transactions: ${successfulTransactions.length}
Total Revenue: ₹${totalRevenue.toFixed(2)}
Average Transaction: ₹${(totalRevenue / (successfulTransactions.length || 1)).toFixed(2)}

TRANSACTION DETAILS
-------------------
${transactions.map((txn, i) => `
${i + 1}. ${txn.transactionId || txn._id}
   User: ${txn.userId?.name || 'N/A'} (${txn.userId?.phone || 'N/A'})
   Amount: ₹${txn.amount || 0} | Status: ${txn.status}
   Payment Method: ${txn.paymentMethod?.type || 'N/A'}
   Date: ${txn.createdAt ? new Date(txn.createdAt).toLocaleString() : 'N/A'}
`).join('\n')}
`;

  return Buffer.from(reportContent, 'utf-8');
};

/**
 * Generate PDF content from wallet data
 * @param {Array} wallets - Wallet records
 * @returns {Buffer} PDF buffer
 */
const generateWalletPDF = (wallets) => {
  const totalBalance = wallets.reduce((sum, wallet) => sum + (wallet.balance || 0), 0);
  const totalEarned = wallets.reduce((sum, wallet) => sum + (wallet.totalEarned || 0), 0);
  const totalRedeemed = wallets.reduce((sum, wallet) => sum + (wallet.totalRedeemed || 0), 0);

  const reportContent = `
HUSHRYD WALLET REPORT
Generated: ${new Date().toISOString()}
=====================================

SUMMARY
-------
Total Wallets: ${wallets.length}
Total Balance: ₹${totalBalance.toFixed(2)}
Total Earned: ₹${totalEarned.toFixed(2)}
Total Redeemed: ₹${totalRedeemed.toFixed(2)}

WALLET DETAILS
--------------
${wallets.map((wallet, i) => `
${i + 1}. ${wallet.userId?.name || 'N/A'} (${wallet.userId?.phone || 'N/A'})
   Balance: ₹${wallet.balance || 0}
   Earned: ₹${wallet.totalEarned || 0} | Redeemed: ₹${wallet.totalRedeemed || 0}
   Active Entries: ${wallet.cashbackEntries?.filter(entry => entry.status === 'active').length || 0}
   Last Updated: ${wallet.updatedAt ? new Date(wallet.updatedAt).toLocaleString() : 'N/A'}
`).join('\n')}
`;

  return Buffer.from(reportContent, 'utf-8');
};

module.exports = {
  // Core functions (Task 4.1)
  getPlans,
  getUserSubscription,
  getRemainingBenefits,
  
  // Purchase flow (Task 4.2)
  createSubscriptionOrder,
  generateSubscriptionOrderId,
  
  // Activation (Task 4.3)
  activateSubscription,
  
  // Expiry check (Task 4.4)
  checkAndExpireSubscriptions,
  
  // Benefits reset (Task 4.5)
  resetMonthlyBenefits,
  
  // Additional utilities
  useFreeCancellation,
  getSubscriptionByOrderId,
  
  // Analytics (Task 13.1)
  getSubscriptionAnalytics,
  
  // Admin management (Task 13.2)
  getUserSubscriptionDetails,
  extendUserSubscription,
  cancelUserSubscription,
  upgradeUserSubscription,
  
  // Export (Task 13.3)
  exportSubscriptionData
};
