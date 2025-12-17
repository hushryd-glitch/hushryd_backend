/**
 * JWT Token Service
 * Handles token generation and verification for authentication
 * Design Decision: JWT with user payload and isNewUser flag for routing
 * 
 * Enhanced with dual-token architecture:
 * - Access tokens: Short-lived (15 min) for API authorization
 * - Refresh tokens: Long-lived (7 days) for obtaining new access tokens
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.3
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getRedisClient } = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + '_refresh';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// Token expiry constants (Requirements 1.1)
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Redis key prefixes
const BLACKLIST_PREFIX = 'blacklist:';

/**
 * Generate SHA256 hash of a token for storage efficiency
 * @param {string} token - Token to hash
 * @returns {string} SHA256 hash of the token
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate JWT token for authenticated user (legacy support)
 * @param {Object} user - User object from database
 * @param {boolean} isNewUser - Whether this is a new user (for routing)
 * @returns {{token: string, expiresIn: string}} Token and expiry info
 */
const generateToken = (user, isNewUser = false) => {
  if (!user || !user._id) {
    throw new Error('Valid user object with _id is required');
  }
  
  const payload = {
    userId: user._id.toString(),
    phone: user.phone || null,
    email: user.email || null,
    role: user.role || 'passenger',
    isNewUser
  };
  
  // Include permissions in JWT payload for staff accounts (Requirements 6.4)
  if (user.isStaff && Array.isArray(user.permissions)) {
    payload.permissions = user.permissions;
  }
  
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY
  });
  
  return {
    token,
    expiresIn: JWT_EXPIRY
  };
};

/**
 * Generate dual token pair (access + refresh) for authenticated user
 * Requirements: 1.1 - Access token 15 min, refresh token 7 days
 * 
 * @param {Object} user - User object from database
 * @param {string} sessionId - Session identifier for token binding
 * @param {boolean} isNewUser - Whether this is a new user (for routing)
 * @returns {{accessToken: string, refreshToken: string, accessExpiresIn: number, refreshExpiresIn: number}}
 */
const generateTokenPair = (user, sessionId, isNewUser = false) => {
  if (!user || !user._id) {
    throw new Error('Valid user object with _id is required');
  }
  
  if (!sessionId) {
    throw new Error('Session ID is required for token pair generation');
  }
  
  const basePayload = {
    userId: user._id.toString(),
    phone: user.phone || null,
    email: user.email || null,
    role: user.role || 'passenger',
    isNewUser,
    sessionId
  };
  
  // Include permissions in JWT payload for staff accounts
  if (user.isStaff && Array.isArray(user.permissions)) {
    basePayload.permissions = user.permissions;
  }
  
  // Generate access token (short-lived)
  const accessPayload = { ...basePayload, type: 'access' };
  const accessToken = jwt.sign(accessPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY
  });
  
  // Generate refresh token (long-lived)
  const refreshPayload = { ...basePayload, type: 'refresh' };
  const refreshToken = jwt.sign(refreshPayload, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY
  });
  
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_EXPIRY_SECONDS
  };
};

/**
 * Verify and decode JWT token (access token)
 * Requirements: 1.2 - Expired tokens return AUTH_002
 * 
 * @param {string} token - JWT token to verify
 * @returns {{valid: boolean, payload?: Object, error?: string, errorCode?: string}}
 */
const verifyToken = (token) => {
  if (!token) {
    return { valid: false, error: 'Token is required', errorCode: 'AUTH_005' };
  }
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { valid: true, payload };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // Requirements 1.2: Expired tokens return AUTH_002
      return { valid: false, error: 'Token has expired', errorCode: 'AUTH_002' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token', errorCode: 'AUTH_005' };
    }
    return { valid: false, error: 'Token verification failed', errorCode: 'AUTH_005' };
  }
};

/**
 * Verify and decode refresh token
 * Requirements: 1.3 - Valid refresh token allows new access token issuance
 * 
 * @param {string} token - Refresh token to verify
 * @returns {{valid: boolean, payload?: Object, error?: string, errorCode?: string}}
 */
const verifyRefreshToken = (token) => {
  if (!token) {
    return { valid: false, error: 'Refresh token is required', errorCode: 'AUTH_005' };
  }
  
  try {
    const payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
    
    // Ensure it's actually a refresh token
    if (payload.type !== 'refresh') {
      return { valid: false, error: 'Invalid token type', errorCode: 'AUTH_005' };
    }
    
    return { valid: true, payload };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // Requirements 1.4: Expired refresh token requires re-authentication
      return { valid: false, error: 'Refresh token has expired', errorCode: 'AUTH_007' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid refresh token', errorCode: 'AUTH_005' };
    }
    return { valid: false, error: 'Refresh token verification failed', errorCode: 'AUTH_005' };
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
};

/**
 * Add a token to the blacklist
 * Requirements: 2.1 - Logout adds token to blacklist
 * 
 * @param {string} token - Token to blacklist
 * @param {string} reason - Reason for blacklisting (logout, revoked, etc.)
 * @returns {Promise<boolean>} True if successfully blacklisted
 */
const blacklistToken = async (token, reason = 'logout') => {
  if (!token) {
    throw new Error('Token is required for blacklisting');
  }
  
  const redis = getRedisClient();
  if (!redis) {
    console.warn('Redis not available, token blacklist not persisted');
    return false;
  }
  
  try {
    // Decode token to get expiry time (without verification - token may be expired)
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      // If we can't decode, use a default TTL of 7 days
      const defaultTTL = REFRESH_TOKEN_EXPIRY_SECONDS;
      const tokenHash = hashToken(token);
      await redis.setex(`${BLACKLIST_PREFIX}${tokenHash}`, defaultTTL, reason);
      return true;
    }
    
    // Calculate remaining TTL until token expires
    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;
    
    // Only blacklist if token hasn't expired yet
    if (ttl > 0) {
      const tokenHash = hashToken(token);
      await redis.setex(`${BLACKLIST_PREFIX}${tokenHash}`, ttl, reason);
    }
    
    return true;
  } catch (error) {
    console.error('Error blacklisting token:', error.message);
    throw error;
  }
};

/**
 * Check if a token is blacklisted
 * Requirements: 2.3 - Blacklisted tokens are rejected
 * 
 * @param {string} token - Token to check
 * @returns {Promise<boolean>} True if token is blacklisted
 */
const isTokenBlacklisted = async (token) => {
  if (!token) {
    return false;
  }
  
  const redis = getRedisClient();
  if (!redis) {
    // If Redis is unavailable, assume token is not blacklisted
    // This is a fail-open approach - consider fail-closed for higher security
    console.warn('Redis not available, cannot check token blacklist');
    return false;
  }
  
  try {
    const tokenHash = hashToken(token);
    const result = await redis.get(`${BLACKLIST_PREFIX}${tokenHash}`);
    return result !== null;
  } catch (error) {
    console.error('Error checking token blacklist:', error.message);
    // Fail open - allow the request if we can't check
    return false;
  }
};

/**
 * Determine routing destination based on user state
 * @param {boolean} isNewUser - Whether user is new
 * @returns {string} Route destination
 */
const getRoutingDestination = (isNewUser) => {
  return isNewUser ? '/profile/setup' : '/dashboard';
};

module.exports = {
  // Legacy token functions
  generateToken,
  verifyToken,
  extractTokenFromHeader,
  getRoutingDestination,
  
  // Dual-token functions (Requirements 1.1, 1.3)
  generateTokenPair,
  verifyRefreshToken,
  
  // Token blacklisting functions (Requirements 2.1, 2.3)
  blacklistToken,
  isTokenBlacklisted,
  
  // Utility functions
  hashToken,
  
  // Constants (exported for testing)
  ACCESS_TOKEN_EXPIRY_SECONDS,
  REFRESH_TOKEN_EXPIRY_SECONDS,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};
