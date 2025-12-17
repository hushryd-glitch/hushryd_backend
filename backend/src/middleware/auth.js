/**
 * Authentication Middleware
 * Handles JWT verification and role-based access control
 * Requirements: 2.3, 4.4, 9.4
 */
const { verifyToken, extractTokenFromHeader, isTokenBlacklisted } = require('../services/tokenService');
const User = require('../models/User');
const { createLogger } = require('../services/loggerService');
const { validateAccess } = require('../services/permissionService');

const logger = createLogger('auth');

/**
 * Middleware to authenticate requests using JWT
 * Attaches user object to req.user if valid
 * Requirements: 2.3 - Checks token blacklist before allowing access
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      logger.authError('MISSING_TOKEN', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorCode: 'AUTH_005',
        message: 'Authentication required'
      });
    }
    
    // Check if token is blacklisted (Requirements 2.3)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      logger.authError('BLACKLISTED_TOKEN', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Token has been revoked',
        errorCode: 'AUTH_005',
        message: 'Token has been revoked'
      });
    }
    
    // Verify token
    const { valid, payload, error, errorCode } = verifyToken(token);
    
    if (!valid) {
      logger.authError(errorCode === 'AUTH_002' ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN', {
        path: req.path,
        errorCode
      });
      return res.status(401).json({
        success: false,
        error: error || 'Invalid token',
        errorCode: errorCode || 'AUTH_005',
        message: error || 'Invalid token'
      });
    }
    
    // Fetch user from database to ensure they still exist and are active
    const user = await User.findById(payload.userId);
    
    if (!user) {
      logger.authError('USER_NOT_FOUND', { userId: payload.userId, path: req.path });
      return res.status(401).json({
        success: false,
        error: 'User not found',
        errorCode: 'AUTH_005',
        message: 'User not found'
      });
    }
    
    if (!user.isActive) {
      logger.authError('ACCOUNT_DEACTIVATED', { userId: user._id.toString(), path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated',
        errorCode: 'AUTH_005',
        message: 'Account is deactivated'
      });
    }
    
    // Attach user and token payload to request
    req.user = user;
    req.tokenPayload = payload;
    req.token = token; // Store token for potential logout/blacklisting
    
    next();
  } catch (error) {
    next(error);
  }
};


/**
 * Middleware factory for role-based access control
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // authenticate middleware must run first
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: 'AUTH_005'
      });
    }
    
    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      logger.authError('INSUFFICIENT_PERMISSIONS', {
        userId: req.user._id.toString(),
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        errorCode: 'AUTH_006'
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user is admin
 */
const isAdmin = authorize('admin');

/**
 * Middleware to check if user is super admin (CEO/CTO level)
 * Requirements: 1.1
 */
const isSuperAdmin = authorize('super_admin');

/**
 * Middleware to check if user is any admin level (super_admin or admin)
 */
const isAnyAdmin = authorize('super_admin', 'admin');

/**
 * Middleware to check if user is operations team
 */
const isOperations = authorize('admin', 'operations', 'super_admin');

/**
 * Middleware to check if user is driver
 */
const isDriver = authorize('driver', 'admin');

/**
 * Middleware to check if user is passenger
 */
const isPassenger = authorize('passenger', 'admin');

/**
 * Optional authentication - doesn't fail if no token, but attaches user if valid
 * Requirements: 2.3 - Also checks token blacklist
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      return next();
    }
    
    // Check if token is blacklisted (Requirements 2.3)
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      // For optional auth, just don't attach user if token is blacklisted
      return next();
    }
    
    const { valid, payload } = verifyToken(token);
    
    if (valid) {
      const user = await User.findById(payload.userId);
      if (user && user.isActive) {
        req.user = user;
        req.tokenPayload = payload;
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
};

/**
 * Middleware factory for permission-based access control
 * Extracts permissions from JWT token and checks against required permission
 * 
 * @param {string|string[]} requiredPermissions - Permission(s) required to access the route
 * @param {Object} options - Options for permission checking
 * @param {boolean} [options.requireAll=false] - If true, user must have ALL permissions; if false, ANY permission is sufficient
 * @returns {Function} Express middleware
 * 
 * Requirements: 4.4
 */
const requirePermission = (requiredPermissions, options = {}) => {
  return (req, res, next) => {
    // authenticate middleware must run first
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: 'UNAUTHORIZED'
      });
    }

    // Check if user account is active
    if (!req.user.isActive) {
      logger.authError('ACCOUNT_DEACTIVATED', {
        userId: req.user._id.toString(),
        path: req.path
      });
      return res.status(403).json({
        error: 'Account is deactivated',
        errorCode: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Use validateAccess from permissionService to check permissions
    const accessResult = validateAccess(req.user, requiredPermissions, options);

    if (!accessResult.allowed) {
      logger.authError('PERMISSION_DENIED', {
        userId: req.user._id.toString(),
        userRole: req.user.role,
        requiredPermissions: Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions],
        missingPermissions: accessResult.missingPermissions,
        path: req.path
      });
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        errorCode: 'PERMISSION_DENIED'
      });
    }

    next();
  };
};

/**
 * Middleware factory for role-based access control (staff roles)
 * Checks if user has one of the required roles
 * 
 * @param {string|string[]} allowedRoles - Role(s) that are allowed to access the route
 * @returns {Function} Express middleware
 * 
 * Requirements: 4.4
 */
const requireRole = (allowedRoles) => {
  // Normalize to array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    // authenticate middleware must run first
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: 'UNAUTHORIZED'
      });
    }

    // Check if user account is active
    if (!req.user.isActive) {
      logger.authError('ACCOUNT_DEACTIVATED', {
        userId: req.user._id.toString(),
        path: req.path
      });
      return res.status(403).json({
        error: 'Account is deactivated',
        errorCode: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Check if user's role is in allowed roles
    if (!roles.includes(req.user.role)) {
      logger.authError('ROLE_DENIED', {
        userId: req.user._id.toString(),
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path
      });
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        errorCode: 'PERMISSION_DENIED'
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authenticateToken: authenticate, // Alias for backward compatibility
  authorize,
  isAdmin,
  isSuperAdmin,
  isAnyAdmin,
  isOperations,
  isDriver,
  isPassenger,
  optionalAuth,
  requirePermission,
  requireRole
};
