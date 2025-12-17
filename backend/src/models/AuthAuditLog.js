const mongoose = require('mongoose');

/**
 * Auth Audit Log Schema
 * Records all authentication-related events for security monitoring and incident investigation
 * 
 * Design Decision: Dedicated audit log for auth events with automatic 90-day retention
 * Rationale: Enables security incident investigation while managing storage costs
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4 - Comprehensive auth event logging
 */
const AuthAuditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: [true, 'Event type is required'],
    enum: [
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'LOGOUT',
      'TOKEN_REFRESH',
      'SESSION_REVOKED',
      'RATE_LIMITED',
      'TOKEN_BLACKLISTED',
      'OTP_REQUESTED',
      'OTP_VERIFIED',
      'OTP_FAILED'
    ],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  identifier: {
    type: String,
    trim: true,
    maxlength: [100, 'Identifier cannot exceed 100 characters']
  },
  ipAddress: {
    type: String,
    required: [true, 'IP address is required'],
    trim: true
  },
  userAgent: {
    type: String,
    trim: true,
    maxlength: [1000, 'User agent cannot exceed 1000 characters']
  },
  failureReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Failure reason cannot exceed 500 characters']
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We use our own timestamp field
});

// TTL index - automatically delete logs after 90 days
AuthAuditLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days in seconds
);

// Compound index for efficient user event queries
AuthAuditLogSchema.index({ userId: 1, timestamp: -1 });

// Compound index for event type queries with time range
AuthAuditLogSchema.index({ eventType: 1, timestamp: -1 });

/**
 * Static method to log an authentication event
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * 
 * @param {Object} eventData - Event data to log
 * @returns {Promise<AuthAuditLog>} Created audit log entry
 */
AuthAuditLogSchema.statics.logEvent = async function(eventData) {
  const log = new this({
    eventType: eventData.eventType,
    userId: eventData.userId,
    identifier: eventData.identifier,
    ipAddress: eventData.ipAddress,
    userAgent: eventData.userAgent,
    failureReason: eventData.failureReason,
    metadata: eventData.metadata,
    timestamp: eventData.timestamp || new Date()
  });
  
  return log.save();
};

/**
 * Static method to get auth events for a user
 * 
 * @param {string} userId - User ID to query
 * @param {Object} options - Query options (limit, skip, eventTypes)
 * @returns {Promise<AuthAuditLog[]>} Array of audit log entries
 */
AuthAuditLogSchema.statics.getEventsForUser = async function(userId, options = {}) {
  const { limit = 50, skip = 0, eventTypes } = options;
  
  const query = { userId };
  
  if (eventTypes && eventTypes.length > 0) {
    query.eventType = { $in: eventTypes };
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

const AuthAuditLog = mongoose.model('AuthAuditLog', AuthAuditLogSchema);

module.exports = AuthAuditLog;
