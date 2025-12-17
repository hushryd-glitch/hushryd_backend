/**
 * Subscription Plans Configuration
 * Defines the three-tier membership system for HushRyd platform
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

const SUBSCRIPTION_PLANS = {
  normal: {
    id: 'normal',
    name: 'Normal',
    price: 0,
    currency: 'INR',
    durationDays: 0, // No expiry for free plan
    features: {
      standardAllocation: true,
      support24x7: true,
      coreFeatures: true,
      priorityAllocation: false,
      freeCancellation: false,
      cashbackRewards: false
    },
    benefits: {
      freeCancellationsPerMonth: 0,
      cashbackPerBooking: 0,
      cashbackValidityDays: 0,
      seatHoldMinutes: 5
    }
  },
  silver: {
    id: 'silver',
    name: 'Silver',
    price: 299,
    currency: 'INR',
    durationDays: 30,
    features: {
      standardAllocation: true,
      support24x7: true,
      coreFeatures: true,
      priorityAllocation: true,
      freeCancellation: true,
      cashbackRewards: true,
      extendedBenefits: true
    },
    benefits: {
      freeCancellationsPerMonth: 2,
      cashbackPerBooking: 50,
      cashbackValidityDays: 10,
      seatHoldMinutes: 10
    }
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    price: 499,
    currency: 'INR',
    durationDays: 30,
    features: {
      standardAllocation: true,
      support24x7: true,
      coreFeatures: true,
      priorityAllocation: true,
      freeCancellation: true,
      cashbackRewards: true,
      extendedBenefits: true,
      exclusiveMemberPerks: true
    },
    benefits: {
      freeCancellationsPerMonth: 5,
      cashbackPerBooking: 75,
      cashbackValidityDays: 15,
      seatHoldMinutes: 10
    }
  }
};

/**
 * Get all subscription plans
 * @returns {Array} Array of plan objects
 */
const getAllPlans = () => Object.values(SUBSCRIPTION_PLANS);

/**
 * Get a specific plan by ID
 * @param {string} planId - Plan identifier (normal, silver, gold)
 * @returns {Object|null} Plan object or null if not found
 */
const getPlanById = (planId) => SUBSCRIPTION_PLANS[planId] || null;

/**
 * Get plan price
 * @param {string} planId - Plan identifier
 * @returns {number} Plan price in INR
 */
const getPlanPrice = (planId) => {
  const plan = getPlanById(planId);
  return plan ? plan.price : 0;
};

/**
 * Get cashback amount for a plan
 * @param {string} planId - Plan identifier
 * @returns {number} Cashback amount per booking
 */
const getCashbackAmount = (planId) => {
  const plan = getPlanById(planId);
  return plan ? plan.benefits.cashbackPerBooking : 0;
};

/**
 * Get cashback validity days for a plan
 * @param {string} planId - Plan identifier
 * @returns {number} Cashback validity in days
 */
const getCashbackValidityDays = (planId) => {
  const plan = getPlanById(planId);
  return plan ? plan.benefits.cashbackValidityDays : 0;
};

/**
 * Get free cancellations limit for a plan
 * @param {string} planId - Plan identifier
 * @returns {number} Free cancellations per month
 */
const getFreeCancellationsLimit = (planId) => {
  const plan = getPlanById(planId);
  return plan ? plan.benefits.freeCancellationsPerMonth : 0;
};

/**
 * Get seat hold duration for a plan
 * @param {string} planId - Plan identifier
 * @returns {number} Seat hold duration in minutes
 */
const getSeatHoldMinutes = (planId) => {
  const plan = getPlanById(planId);
  return plan ? plan.benefits.seatHoldMinutes : 5;
};

/**
 * Check if plan has priority allocation
 * @param {string} planId - Plan identifier
 * @returns {boolean} True if plan has priority allocation
 */
const hasPriorityAllocation = (planId) => {
  const plan = getPlanById(planId);
  return plan ? plan.features.priorityAllocation : false;
};

/**
 * Get priority order for seat allocation (higher = more priority)
 * @param {string} planId - Plan identifier
 * @returns {number} Priority order (0 = normal, 1 = silver, 2 = gold)
 */
const getPriorityOrder = (planId) => {
  const priorities = { normal: 0, silver: 1, gold: 2 };
  return priorities[planId] || 0;
};

module.exports = {
  SUBSCRIPTION_PLANS,
  getAllPlans,
  getPlanById,
  getPlanPrice,
  getCashbackAmount,
  getCashbackValidityDays,
  getFreeCancellationsLimit,
  getSeatHoldMinutes,
  hasPriorityAllocation,
  getPriorityOrder
};
