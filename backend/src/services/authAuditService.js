/**
 * Auth Audit Service
 * Provides comprehensive logging for all authentication-related events
 * 
 * Design Decision: Dedicated audit service for auth events with helper functions
 * Rationale: Enables security incident investigation and compliance monitoring
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4 - Comprehensive auth event logging
 */
const AuthAuditLog = require('../models/AuthAuditLog');
const { createLogger } = require('./loggerService');

const logger = createLogger('auth-audit');

/**
 * Event types for authentication audit logging
 */
const AUTH_EVENT_TYPES = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  SESSION_REVOKED: 'SESSION_REVOKED',
  RATE_LIMITED: 'RATE_LIMITED',
  TOKEN_BLACKLISTED: 'TOKEN_BLACKLISTED',
  OTP_REQUESTED: 'OTP_REQUESTED',
  OTP_VERIFIED: 'OTP_VERIFIED',
  OTP_FAILED: 'OTP_FAILED'
};

/**
 * Log an authentication event
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * 
 * @param {Object} eventData - Event data to log
 * @param {string} eventData.eventType - Type of auth event
 * @param {string} [eventData.userId] - User ID (if available)
 * @param {string} [eventData.identifier] - Phone/email for failed attempts
 * @param {string} eventData.ipAddress - Client IP address
 * @param {string} [eventData.userAgent] - User-Agent header
 * @param {string} [eventData.failureReason] - Reason for failure (if applicable)
 * @param {Object} [eventData.metadata] - Additional event metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logAuthEvent = async (eventData) => {
  const {
    eventType,
    userId,
    identifier,
    ipAddress,
    userAgent,
    failureReason,
    metadata = {}
  } = eventData;

  // Validate required fields
  if (!eventType) {
    throw new Error('Event type is required for auth audit logging');
  }
  if (!ipAddress) {
    throw new Error('IP address is required for auth audit logging');
  }


  try {
    const auditLog = await AuthAuditLog.logEvent({
      eventType,
      userId,
      identifier,
      ipAddress,
      userAgent,
      failureReason,
      metadata,
      timestamp: new Date()
    });

    // Also log to application logger for real-time monitoring
    const logLevel = isFailureEvent(eventType) ? 'warn' : 'info';
    logger[logLevel](`Auth event: ${eventType}`, {
      userId: userId?.toString(),
      identifier,
      ipAddress: maskIpAddress(ipAddress),
      eventType
    });

    return auditLog;
  } catch (error) {
    // Log the error but don't throw - audit logging should not break auth flow
    logger.error('Failed to log auth event', {
      eventType,
      error: error.message
    });
    
    // Return a minimal object to indicate the attempt was made
    return {
      eventType,
      timestamp: new Date(),
      logged: false,
      error: error.message
    };
  }
};

/**
 * Get authentication events for a user
 * 
 * @param {string} userId - User ID to query
 * @param {Object} options - Query options
 * @param {number} [options.limit=50] - Maximum number of events to return
 * @param {number} [options.skip=0] - Number of events to skip
 * @param {string[]} [options.eventTypes] - Filter by event types
 * @param {Date} [options.startDate] - Filter events after this date
 * @param {Date} [options.endDate] - Filter events before this date
 * @returns {Promise<Array>} Array of audit log entries
 */
const getAuthEvents = async (userId, options = {}) => {
  const {
    limit = 50,
    skip = 0,
    eventTypes,
    startDate,
    endDate
  } = options;

  if (!userId) {
    throw new Error('User ID is required to get auth events');
  }

  const query = { userId };

  // Filter by event types if provided
  if (eventTypes && eventTypes.length > 0) {
    query.eventType = { $in: eventTypes };
  }

  // Filter by date range if provided
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      query.timestamp.$gte = startDate;
    }
    if (endDate) {
      query.timestamp.$lte = endDate;
    }
  }

  const events = await AuthAuditLog.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Mask IP addresses in returned events for privacy
  return events.map(event => ({
    ...event,
    ipAddress: maskIpAddress(event.ipAddress)
  }));
};

/**
 * Check if an event type represents a failure
 * @param {string} eventType - Event type to check
 * @returns {boolean} True if the event is a failure type
 */
const isFailureEvent = (eventType) => {
  const failureTypes = [
    AUTH_EVENT_TYPES.LOGIN_FAILURE,
    AUTH_EVENT_TYPES.RATE_LIMITED,
    AUTH_EVENT_TYPES.OTP_FAILED
  ];
  return failureTypes.includes(eventType);
};

/**
 * Mask IP address for privacy
 * @param {string} ipAddress - IP address to mask
 * @returns {string} Masked IP address
 */
const maskIpAddress = (ipAddress) => {
  if (!ipAddress) {
    return 'unknown';
  }
  
  // Handle IPv4
  if (ipAddress.includes('.')) {
    const parts = ipAddress.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }
  
  // Handle IPv6
  if (ipAddress.includes(':')) {
    const parts = ipAddress.split(':');
    if (parts.length >= 4) {
      return `${parts[0]}:${parts[1]}:****:****`;
    }
  }
  
  return ipAddress.substring(0, 4) + '****';
};


// ============================================================================
// Helper Functions for Common Event Types
// ============================================================================

/**
 * Log a successful login event
 * Requirements: 6.1 - Log successful authentication with userId, IP, and timestamp
 * 
 * @param {string} userId - User ID
 * @param {string} ipAddress - Client IP address
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logLoginSuccess = async (userId, ipAddress, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.LOGIN_SUCCESS,
    userId,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      loginMethod: metadata.loginMethod || 'otp'
    }
  });
};

/**
 * Log a failed login attempt
 * Requirements: 6.2 - Log failure reason, IP address, and identifier
 * 
 * @param {string} identifier - Phone/email used in the attempt
 * @param {string} ipAddress - Client IP address
 * @param {string} failureReason - Reason for failure
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logLoginFailure = async (identifier, ipAddress, failureReason, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.LOGIN_FAILURE,
    identifier,
    ipAddress,
    userAgent,
    failureReason,
    metadata
  });
};

/**
 * Log a logout event
 * Requirements: 6.3 - Log token revocation with userId and reason
 * 
 * @param {string} userId - User ID
 * @param {string} ipAddress - Client IP address
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata (e.g., allDevices flag)
 * @returns {Promise<Object>} Created audit log entry
 */
const logLogout = async (userId, ipAddress, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.LOGOUT,
    userId,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      logoutType: metadata.allDevices ? 'all_devices' : 'single_device'
    }
  });
};

/**
 * Log a token refresh event
 * 
 * @param {string} userId - User ID
 * @param {string} ipAddress - Client IP address
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logTokenRefresh = async (userId, ipAddress, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.TOKEN_REFRESH,
    userId,
    ipAddress,
    userAgent,
    metadata
  });
};

/**
 * Log a session revocation event
 * Requirements: 6.3 - Log revocation with userId and reason
 * 
 * @param {string} userId - User ID
 * @param {string} ipAddress - Client IP address
 * @param {string} reason - Reason for revocation
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata (e.g., sessionId)
 * @returns {Promise<Object>} Created audit log entry
 */
const logSessionRevoked = async (userId, ipAddress, reason, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.SESSION_REVOKED,
    userId,
    ipAddress,
    userAgent,
    failureReason: reason,
    metadata
  });
};

/**
 * Log a rate limiting event
 * Requirements: 6.4 - Log blocked request with IP and endpoint
 * 
 * @param {string} ipAddress - Client IP address
 * @param {string} endpoint - Endpoint that was rate limited
 * @param {string} [identifier] - Phone/email if available
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logRateLimited = async (ipAddress, endpoint, identifier, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.RATE_LIMITED,
    identifier,
    ipAddress,
    userAgent,
    failureReason: `Rate limit exceeded for ${endpoint}`,
    metadata: {
      ...metadata,
      endpoint
    }
  });
};

/**
 * Log a token blacklisting event
 * Requirements: 6.3 - Log token revocation
 * 
 * @param {string} userId - User ID
 * @param {string} ipAddress - Client IP address
 * @param {string} reason - Reason for blacklisting
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logTokenBlacklisted = async (userId, ipAddress, reason, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.TOKEN_BLACKLISTED,
    userId,
    ipAddress,
    userAgent,
    failureReason: reason,
    metadata
  });
};

/**
 * Log an OTP request event
 * 
 * @param {string} identifier - Phone number
 * @param {string} ipAddress - Client IP address
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logOTPRequested = async (identifier, ipAddress, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.OTP_REQUESTED,
    identifier,
    ipAddress,
    userAgent,
    metadata
  });
};

/**
 * Log a successful OTP verification event
 * 
 * @param {string} userId - User ID
 * @param {string} identifier - Phone number
 * @param {string} ipAddress - Client IP address
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logOTPVerified = async (userId, identifier, ipAddress, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.OTP_VERIFIED,
    userId,
    identifier,
    ipAddress,
    userAgent,
    metadata
  });
};

/**
 * Log a failed OTP verification event
 * 
 * @param {string} identifier - Phone number
 * @param {string} ipAddress - Client IP address
 * @param {string} failureReason - Reason for failure
 * @param {string} [userAgent] - User-Agent header
 * @param {Object} [metadata] - Additional metadata
 * @returns {Promise<Object>} Created audit log entry
 */
const logOTPFailed = async (identifier, ipAddress, failureReason, userAgent, metadata = {}) => {
  return logAuthEvent({
    eventType: AUTH_EVENT_TYPES.OTP_FAILED,
    identifier,
    ipAddress,
    userAgent,
    failureReason,
    metadata
  });
};

module.exports = {
  // Core functions
  logAuthEvent,
  getAuthEvents,
  
  // Helper functions for common event types
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logTokenRefresh,
  logSessionRevoked,
  logRateLimited,
  logTokenBlacklisted,
  logOTPRequested,
  logOTPVerified,
  logOTPFailed,
  
  // Utility functions
  maskIpAddress,
  isFailureEvent,
  
  // Constants
  AUTH_EVENT_TYPES
};
