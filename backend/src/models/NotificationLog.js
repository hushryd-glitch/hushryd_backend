const mongoose = require('mongoose');

/**
 * Notification Log Schema
 * Design Decision: Comprehensive logging with retry tracking
 * Rationale: Essential for debugging delivery issues and ensuring notification reliability
 */
const NotificationLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  channel: {
    type: String,
    required: [true, 'Notification channel is required'],
    enum: ['sms', 'email', 'whatsapp'],
    index: true
  },
  template: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true
  },
  recipient: {
    type: String,
    required: [true, 'Recipient is required'],
    trim: true
    // Phone number or email address
  },
  content: {
    type: String,
    required: [true, 'Content is required']
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending',
    index: true
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  lastAttemptAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  errorMessage: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Flexible key-value store for additional data
  },
  // Reference to related entity (trip, booking, etc.)
  relatedEntity: {
    type: {
      type: String,
      enum: ['trip', 'booking', 'sos', 'document']
    },
    id: {
      type: mongoose.Schema.Types.ObjectId
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
NotificationLogSchema.index({ status: 1, createdAt: -1 });
NotificationLogSchema.index({ userId: 1, channel: 1 });
NotificationLogSchema.index({ 'relatedEntity.type': 1, 'relatedEntity.id': 1 });

/**
 * Record a delivery attempt
 * @param {boolean} success - Whether the attempt was successful
 * @param {string} errorMessage - Error message if failed
 * @returns {Promise<Object>} Updated notification log
 */
NotificationLogSchema.methods.recordAttempt = async function(success, errorMessage = null) {
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  
  if (success) {
    this.status = 'sent';
  } else {
    this.errorMessage = errorMessage;
    if (this.attempts >= 3) {
      this.status = 'failed';
    }
  }
  
  return this.save();
};

/**
 * Mark as delivered
 * @returns {Promise<Object>} Updated notification log
 */
NotificationLogSchema.methods.markDelivered = async function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

/**
 * Get pending notifications for retry
 * @returns {Promise<Array>} Pending notifications with attempts < 3
 */
NotificationLogSchema.statics.getPendingForRetry = function() {
  return this.find({
    status: 'pending',
    attempts: { $lt: 3 }
  }).sort({ createdAt: 1 });
};

/**
 * Get failed notifications for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Array>} Failed notifications
 */
NotificationLogSchema.statics.getFailedForUser = function(userId) {
  return this.find({
    userId,
    status: 'failed'
  }).sort({ createdAt: -1 });
};

const NotificationLog = mongoose.model('NotificationLog', NotificationLogSchema);

module.exports = NotificationLog;
