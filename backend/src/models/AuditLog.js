/**
 * AuditLog Model
 * Stores audit trail for admin actions for compliance and security
 * 
 * Requirements: 1.7
 */

const mongoose = require('mongoose');

/**
 * AuditLog Schema
 * Tracks all admin actions with full context for audit trail
 */
const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    index: true,
    enum: [
      // User management actions
      'user_view', 'user_update', 'user_delete', 'user_suspend', 'user_activate',
      // Transaction actions
      'transaction_view', 'transaction_refund', 'transaction_export',
      // Document actions
      'document_approve', 'document_reject', 'document_view',
      // Trip actions
      'trip_view', 'trip_cancel', 'trip_intervene',
      // SOS actions
      'sos_acknowledge', 'sos_resolve', 'sos_view',
      // Ticket actions
      'ticket_create', 'ticket_update', 'ticket_assign', 'ticket_resolve',
      // Analytics actions
      'analytics_view', 'report_export',
      // System actions
      'login', 'logout', 'settings_update',
      // Permission/Role management actions (Requirements 5.3)
      'permission_update', 'role_update'
    ]
  },
  targetType: {
    type: String,
    enum: ['user', 'driver', 'trip', 'booking', 'transaction', 'document', 'sos', 'ticket', 'system'],
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Previous value before the change (Requirements 5.3)
  previousValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // New value after the change (Requirements 5.3)
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true,
    maxlength: 500
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We use our own timestamp field
});

// Compound indexes for efficient querying
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });

/**
 * Create an audit log entry
 * @param {Object} params - Audit log parameters
 * @returns {Promise<Object>} Created audit log entry
 */
AuditLogSchema.statics.logAction = async function(params) {
  const { userId, action, targetType, targetId, details, previousValue, newValue, ipAddress, userAgent } = params;
  
  const auditLog = new this({
    userId,
    action,
    targetType,
    targetId,
    details,
    previousValue,
    newValue,
    ipAddress,
    userAgent,
    timestamp: new Date()
  });
  
  return auditLog.save();
};

/**
 * Get audit logs with filters
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated audit logs
 */
AuditLogSchema.statics.getAuditLogs = async function(filters = {}) {
  const {
    userId,
    action,
    targetType,
    startDate,
    endDate,
    page = 1,
    limit = 50
  } = filters;

  const query = {};

  if (userId) query.userId = userId;
  if (action) query.action = action;
  if (targetType) query.targetType = targetType;
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    this.find(query)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

module.exports = AuditLog;
