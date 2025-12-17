/**
 * Priority Allocation Middleware
 * Implements subscription-based priority for seat allocation
 * 
 * Requirements: 8.1 - Prioritize Gold > Silver > Normal users
 * Requirements: 8.3 - Extended seat hold for subscribers
 */

const { getUserSubscription, getRemainingBenefits } = require('../services/subscriptionService');
const { getPriorityOrder, getSeatHoldMinutes } = require('../config/subscriptionPlans');

/**
 * Priority order constants
 * Higher number = higher priority
 */
const PRIORITY_ORDER = {
  gold: 2,
  silver: 1,
  normal: 0
};

/**
 * Seat hold duration in minutes by plan
 * Requirements: 8.3 - Normal: 5 minutes, Silver/Gold: 10 minutes
 */
const SEAT_HOLD_MINUTES = {
  gold: 10,
  silver: 10,
  normal: 5
};

/**
 * Get user's subscription tier for priority allocation
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User's subscription tier info
 */
const getUserPriorityInfo = async (userId) => {
  try {
    const subscription = await getUserSubscription(userId);
    const planId = subscription?.planId || 'normal';
    
    return {
      userId,
      planId,
      priorityOrder: getPriorityOrder(planId),
      seatHoldMinutes: getSeatHoldMinutes(planId),
      hasPriorityAllocation: planId !== 'normal'
    };
  } catch (error) {
    // Default to normal plan on error
    console.error(`[PriorityAllocation] Error getting user priority: ${error.message}`);
    return {
      userId,
      planId: 'normal',
      priorityOrder: 0,
      seatHoldMinutes: 5,
      hasPriorityAllocation: false
    };
  }
};

/**
 * Compare two users by priority for seat allocation
 * Returns negative if userA has higher priority, positive if userB has higher priority
 * 
 * Property 13: Priority ordering
 * Gold subscribers SHALL be prioritized over Silver, and Silver over Normal
 * 
 * @param {Object} userA - First user with priorityOrder
 * @param {Object} userB - Second user with priorityOrder
 * @returns {number} Comparison result (-1, 0, or 1)
 */
const comparePriority = (userA, userB) => {
  // Higher priority order = higher priority (should come first)
  // So we return negative when userA has higher priority
  return userB.priorityOrder - userA.priorityOrder;
};

/**
 * Sort booking requests by priority
 * Gold > Silver > Normal, then by request time (FIFO within same tier)
 * 
 * Requirements: 8.1 - Prioritize Gold > Silver > Normal
 * 
 * @param {Array} bookingRequests - Array of booking requests with userId and createdAt
 * @returns {Promise<Array>} Sorted booking requests
 */
const sortByPriority = async (bookingRequests) => {
  if (!bookingRequests || bookingRequests.length === 0) {
    return [];
  }

  // Get priority info for all users
  const requestsWithPriority = await Promise.all(
    bookingRequests.map(async (request) => {
      const priorityInfo = await getUserPriorityInfo(request.userId || request.passengerId);
      return {
        ...request,
        priorityInfo
      };
    })
  );

  // Sort by priority (descending) then by createdAt (ascending - FIFO)
  return requestsWithPriority.sort((a, b) => {
    // First compare by priority order (higher priority first)
    const priorityDiff = b.priorityInfo.priorityOrder - a.priorityInfo.priorityOrder;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    
    // Same priority tier - sort by creation time (FIFO)
    const timeA = new Date(a.createdAt || a.bookedAt).getTime();
    const timeB = new Date(b.createdAt || b.bookedAt).getTime();
    return timeA - timeB;
  });
};

/**
 * Calculate seat hold expiry time based on user's subscription
 * Requirements: 8.3 - Extended seat hold for subscribers
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Date>} Expiry timestamp
 */
const calculateSeatHoldExpiry = async (userId) => {
  const priorityInfo = await getUserPriorityInfo(userId);
  const holdMinutes = priorityInfo.seatHoldMinutes;
  
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + holdMinutes);
  
  return expiresAt;
};

/**
 * Get seat hold duration in minutes for a user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>} Hold duration in minutes
 */
const getSeatHoldDuration = async (userId) => {
  const priorityInfo = await getUserPriorityInfo(userId);
  return priorityInfo.seatHoldMinutes;
};

/**
 * Middleware to attach priority info to request
 * Use this in booking routes to have priority info available
 */
const attachPriorityInfo = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      req.priorityInfo = await getUserPriorityInfo(req.user.id);
    } else {
      req.priorityInfo = {
        planId: 'normal',
        priorityOrder: 0,
        seatHoldMinutes: 5,
        hasPriorityAllocation: false
      };
    }
    next();
  } catch (error) {
    console.error('[PriorityAllocation] Middleware error:', error.message);
    // Continue with default priority on error
    req.priorityInfo = {
      planId: 'normal',
      priorityOrder: 0,
      seatHoldMinutes: 5,
      hasPriorityAllocation: false
    };
    next();
  }
};

/**
 * Check if user has priority over another for seat allocation
 * 
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<boolean>} True if userId1 has higher priority
 */
const hasPriorityOver = async (userId1, userId2) => {
  const [priority1, priority2] = await Promise.all([
    getUserPriorityInfo(userId1),
    getUserPriorityInfo(userId2)
  ]);
  
  return priority1.priorityOrder > priority2.priorityOrder;
};

/**
 * Get priority tier name for display
 * 
 * @param {string} planId - Plan ID
 * @returns {string} Display name
 */
const getPriorityTierName = (planId) => {
  const names = {
    gold: 'Gold Priority',
    silver: 'Silver Priority',
    normal: 'Standard'
  };
  return names[planId] || 'Standard';
};

module.exports = {
  PRIORITY_ORDER,
  SEAT_HOLD_MINUTES,
  getUserPriorityInfo,
  comparePriority,
  sortByPriority,
  calculateSeatHoldExpiry,
  getSeatHoldDuration,
  attachPriorityInfo,
  hasPriorityOver,
  getPriorityTierName
};
