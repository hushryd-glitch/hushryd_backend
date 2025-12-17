/**
 * Subscription Model
 * Stores user subscription information for tiered membership plans
 * 
 * Requirements: 10.1, 3.2
 */

const mongoose = require('mongoose');

/**
 * Subscription Schema
 * Tracks user subscription plan, status, expiry, and benefits usage
 */
const SubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  planId: {
    type: String,
    enum: ['normal', 'silver', 'gold'],
    required: [true, 'Plan ID is required']
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled'],
    default: 'active',
    index: true
  },
  activatedAt: {
    type: Date,
    required: [true, 'Activation date is required']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
    index: true
  },
  paymentId: {
    type: String,
    sparse: true
  },
  orderId: {
    type: String,
    sparse: true
  },
  // Monthly benefits tracking
  freeCancellationsUsed: {
    type: Number,
    default: 0,
    min: [0, 'Free cancellations used cannot be negative']
  },
  benefitsResetAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ expiresAt: 1, status: 1 });

/**
 * Get active subscription for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object|null>} Active subscription or null
 */
SubscriptionSchema.statics.getActiveSubscription = async function(userId) {
  return this.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

/**
 * Check if subscription is expired
 * @returns {boolean} True if subscription is expired
 */
SubscriptionSchema.methods.isExpired = function() {
  return this.expiresAt < new Date() || this.status === 'expired';
};

const Subscription = mongoose.model('Subscription', SubscriptionSchema);

module.exports = Subscription;
