/**
 * Session Service
 * Manages user authentication sessions across devices
 * 
 * Design Decision: Server-side session tracking with refresh token binding
 * Rationale: Enables session revocation, device management, and security auditing
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
const crypto = require('crypto');
const Session = require('../models/Session');
const { hashToken, REFRESH_TOKEN_EXPIRY_SECONDS } = require('./tokenService');

/**
 * Extract device info from user-agent string
 * Parses common browser and device patterns
 * 
 * @param {string} userAgent - User-Agent header value
 * @returns {string} Human-readable device description
 */
const extractDeviceInfo = (userAgent) => {
  if (!userAgent) {
    return 'Unknown Device';
  }

  // Normalize user agent string
  const ua = userAgent.toLowerCase();
  
  // Detect mobile devices first
  if (ua.includes('iphone')) {
    return 'iPhone';
  }
  if (ua.includes('ipad')) {
    return 'iPad';
  }
  if (ua.includes('android')) {
    // Try to extract device model
    const androidMatch = userAgent.match(/Android[^;]*;\s*([^)]+)/i);
    if (androidMatch && androidMatch[1]) {
      const model = androidMatch[1].split('Build')[0].trim();
      if (model && model.length < 50) {
        return `Android - ${model}`;
      }
    }
    return 'Android Device';
  }
  
  // Detect desktop browsers
  let browser = 'Unknown Browser';
  let os = '';
  
  // Browser detection
  if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('chrome') && !ua.includes('chromium')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
  }
  
  // OS detection
  if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('mac os') || ua.includes('macos')) {
    os = 'macOS';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }
  
  if (os && browser !== 'Unknown Browser') {
    return `${browser} on ${os}`;
  }
  if (browser !== 'Unknown Browser') {
    return browser;
  }
  if (os) {
    return os;
  }
  
  return 'Unknown Device';
};

/**
 * Generate a unique session ID
 * @returns {string} UUID-like session identifier
 */
const generateSessionId = () => {
  return crypto.randomUUID();
};

/**
 * Create a new session for a user
 * Requirements: 4.1 - Track sessions with device info, IP, and timestamps
 * 
 * @param {string} userId - User's MongoDB ObjectId
 * @param {string} refreshToken - The refresh token to bind to this session
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - User-Agent header value
 * @returns {Promise<Object>} Created session object
 */
const createSession = async (userId, refreshToken, ipAddress, userAgent = '') => {
  if (!userId) {
    throw new Error('User ID is required to create a session');
  }
  if (!refreshToken) {
    throw new Error('Refresh token is required to create a session');
  }
  if (!ipAddress) {
    throw new Error('IP address is required to create a session');
  }

  const sessionId = generateSessionId();
  const deviceInfo = extractDeviceInfo(userAgent);
  const refreshTokenHash = hashToken(refreshToken);
  
  // Calculate expiry (7 days from now, matching refresh token expiry)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

  const session = new Session({
    sessionId,
    userId,
    deviceInfo,
    ipAddress,
    userAgent: userAgent ? userAgent.substring(0, 1000) : '', // Truncate to max length
    refreshTokenHash,
    expiresAt,
    isActive: true,
    lastActivityAt: new Date()
  });

  await session.save();

  return {
    sessionId: session.sessionId,
    deviceInfo: session.deviceInfo,
    ipAddress: session.getMaskedIP(),
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    expiresAt: session.expiresAt
  };
};

/**
 * Get all active sessions for a user
 * Requirements: 4.1, 4.4 - Return sessions with masked IP addresses
 * 
 * @param {string} userId - User's MongoDB ObjectId
 * @returns {Promise<Array>} Array of session objects with masked IPs
 */
const getActiveSessions = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required to get sessions');
  }

  const sessions = await Session.find({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).sort({ lastActivityAt: -1 });

  // Return sessions with masked IP addresses (Requirements 4.4)
  return sessions.map(session => session.toSafeObject());
};

/**
 * Revoke a specific session
 * Requirements: 4.2, 4.3 - Invalidate refresh token for the session
 * 
 * @param {string} sessionId - Session identifier to revoke
 * @param {string} userId - User ID (for authorization check)
 * @returns {Promise<boolean>} True if session was revoked
 */
const revokeSession = async (sessionId, userId) => {
  if (!sessionId) {
    throw new Error('Session ID is required to revoke a session');
  }

  const query = { sessionId, isActive: true };
  
  // If userId is provided, ensure the session belongs to the user
  if (userId) {
    query.userId = userId;
  }

  const result = await Session.findOneAndUpdate(
    query,
    { 
      isActive: false,
      lastActivityAt: new Date()
    },
    { new: true }
  );

  return result !== null;
};

/**
 * Revoke all sessions for a user
 * Requirements: 4.2 - Invalidate all refresh tokens for the user
 * 
 * @param {string} userId - User's MongoDB ObjectId
 * @param {string} excludeSessionId - Optional session ID to exclude (current session)
 * @returns {Promise<number>} Number of sessions revoked
 */
const revokeAllSessions = async (userId, excludeSessionId = null) => {
  if (!userId) {
    throw new Error('User ID is required to revoke all sessions');
  }

  const query = {
    userId,
    isActive: true
  };

  // Optionally exclude current session
  if (excludeSessionId) {
    query.sessionId = { $ne: excludeSessionId };
  }

  const result = await Session.updateMany(
    query,
    { 
      isActive: false,
      lastActivityAt: new Date()
    }
  );

  return result.modifiedCount;
};

/**
 * Update session last activity timestamp
 * Requirements: 4.1 - Track last activity for session management
 * 
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} True if session was updated
 */
const updateSessionActivity = async (sessionId) => {
  if (!sessionId) {
    return false;
  }

  const result = await Session.findOneAndUpdate(
    { sessionId, isActive: true },
    { lastActivityAt: new Date() },
    { new: true }
  );

  return result !== null;
};

/**
 * Validate a refresh token against its session
 * Requirements: 4.3 - Revoked sessions prevent token refresh
 * 
 * @param {string} refreshToken - The refresh token to validate
 * @param {string} sessionId - The session ID from the token payload
 * @returns {Promise<{valid: boolean, error?: string, errorCode?: string}>}
 */
const validateSessionForRefresh = async (refreshToken, sessionId) => {
  if (!refreshToken || !sessionId) {
    return { 
      valid: false, 
      error: 'Refresh token and session ID are required', 
      errorCode: 'AUTH_005' 
    };
  }

  const session = await Session.findOne({ sessionId });

  if (!session) {
    return { 
      valid: false, 
      error: 'Session not found', 
      errorCode: 'AUTH_008' 
    };
  }

  if (!session.isActive) {
    return { 
      valid: false, 
      error: 'Session has been revoked', 
      errorCode: 'AUTH_008' 
    };
  }

  if (session.expiresAt < new Date()) {
    return { 
      valid: false, 
      error: 'Session has expired', 
      errorCode: 'AUTH_007' 
    };
  }

  // Verify the refresh token matches the session
  const tokenHash = hashToken(refreshToken);
  if (session.refreshTokenHash !== tokenHash) {
    return { 
      valid: false, 
      error: 'Invalid refresh token for this session', 
      errorCode: 'AUTH_005' 
    };
  }

  return { valid: true, session };
};

/**
 * Get session by ID
 * 
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Session object or null
 */
const getSessionById = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  const session = await Session.findOne({ sessionId });
  return session;
};

/**
 * Get session count for a user
 * 
 * @param {string} userId - User's MongoDB ObjectId
 * @returns {Promise<number>} Number of active sessions
 */
const getActiveSessionCount = async (userId) => {
  if (!userId) {
    return 0;
  }

  return Session.countDocuments({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
};

module.exports = {
  // Core session management (Requirements 4.1, 4.2, 4.3, 4.4)
  createSession,
  getActiveSessions,
  revokeSession,
  revokeAllSessions,
  updateSessionActivity,
  
  // Session validation
  validateSessionForRefresh,
  getSessionById,
  getActiveSessionCount,
  
  // Utility functions
  extractDeviceInfo,
  generateSessionId
};
