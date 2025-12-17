/**
 * Authentication Routes
 * Handles OTP request and verification endpoints
 * 
 * Enhanced with dual-token architecture:
 * - Access tokens: Short-lived (15 min) for API authorization
 * - Refresh tokens: Long-lived (7 days) for obtaining new access tokens
 * 
 * Requirements: 1.1, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.4, 6.1, 6.3, 6.4
 */
const express = require('express');
const Joi = require('joi');
const router = express.Router();

const { validate, schemas } = require('../middleware/validate');
const { generateOTP, verifyOTP } = require('../services/otpService');
const { 
  generateToken, 
  generateTokenPair, 
  verifyRefreshToken,
  blacklistToken,
  extractTokenFromHeader
} = require('../services/tokenService');
const { findUserByIdentifier, createUser, findUserById } = require('../services/userService');
const { authenticateStaff } = require('../services/staffService');
const { getInstance: getTwilioService } = require('../services/twilioService');
const { 
  createSession, 
  getActiveSessions, 
  revokeSession, 
  revokeAllSessions,
  validateSessionForRefresh,
  updateSessionActivity
} = require('../services/sessionService');
const { 
  logLoginSuccess, 
  logLogout, 
  logTokenRefresh,
  logSessionRevoked
} = require('../services/authAuditService');
const { authenticate } = require('../middleware/auth');
const {
  otpRequestLimiter,
  otpVerifyLimiter,
  staffLoginLimiter
} = require('../middleware/authRateLimiter');

// Validation schemas
const requestOTPSchema = Joi.object({
  identifier: Joi.alternatives()
    .try(
      schemas.phone,
      schemas.email
    )
    .required()
    .messages({
      'alternatives.match': 'Please provide a valid phone number or email address'
    }),
  type: Joi.string()
    .valid('phone', 'email')
    .required()
    .messages({
      'any.only': 'Type must be either phone or email'
    })
});

const verifyOTPSchema = Joi.object({
  identifier: Joi.alternatives()
    .try(
      schemas.phone,
      schemas.email
    )
    .required()
    .messages({
      'alternatives.match': 'Please provide a valid phone number or email address'
    }),
  type: Joi.string()
    .valid('phone', 'email')
    .required()
    .messages({
      'any.only': 'Type must be either phone or email'
    }),
  otp: schemas.otp.required(),
  mode: Joi.string()
    .valid('passenger', 'driver')
    .optional()
    .default('passenger')
});

const staffLoginSchema = Joi.object({
  email: schemas.email.required(),
  password: Joi.string().required()
});


/**
 * POST /api/auth/request-otp
 * Request OTP for phone or email authentication
 * Requirements: 2.1, 2.2, 3.1, 6.4
 * Rate limited: 5 requests per 15 minutes per phone number
 */
router.post('/request-otp', otpRequestLimiter, validate(requestOTPSchema), async (req, res, next) => {
  try {
    const { identifier, type } = req.body;
    
    // Generate and store OTP
    const { otp, expiresAt } = await generateOTP(identifier, type);
    
    // Send OTP via SMS for phone type
    let smsSent = false;
    let smsError = null;
    
    if (type === 'phone') {
      try {
        const twilioService = getTwilioService();
        const messageBody = `${otp} is your HushRyd verification code. Valid for 5 minutes. Do not share this code with anyone.`;
        
        await twilioService.send(identifier, { body: messageBody });
        smsSent = true;
        console.log(`[OTP] SMS sent successfully to ${identifier}`);
      } catch (error) {
        smsError = error.message;
        console.error(`[OTP] Failed to send SMS to ${identifier}:`, error.message);
      }
    }
    
    // Log OTP in development for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] ========================================`);
      console.log(`[DEV] OTP for ${identifier}: ${otp}`);
      console.log(`[DEV] Or use demo OTP: 123456 (bypasses verification)`);
      console.log(`[DEV] ========================================`);
    }
    
    // Build response
    const response = {
      success: true,
      message: smsSent ? `OTP sent to your ${type}` : `OTP generated for your ${type}`,
      expiresAt: expiresAt.toISOString()
    };
    
    // Include OTP in response for development/testing (NOT for production!)
    if (process.env.NODE_ENV !== 'production') {
      response.devOtp = otp;
      response.devMessage = 'OTP included for testing only - will not be sent in production';
      if (smsError) {
        response.smsError = smsError;
      }
    }
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Demo OTP for development/testing - allows bypass with "123456"
// Can be enabled in production by setting ENABLE_DEMO_OTP=true
const DEMO_OTP = '123456';
const DEMO_OTP_ENABLED = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_OTP === 'true';

/**
 * POST /api/auth/verify-otp
 * Verify OTP and authenticate user with dual-token response
 * Requirements: 1.1, 3.2, 4.1, 6.1, 6.4 - Issue access/refresh tokens, create session, log event
 * Rate limited: 10 verification attempts per 15 minutes per phone number
 */
router.post('/verify-otp', otpVerifyLimiter, validate(verifyOTPSchema), async (req, res, next) => {
  try {
    const { identifier, type, otp, mode } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    
    // Allow demo OTP "123456" to bypass verification (for testing)
    let verifyResult;
    if (DEMO_OTP_ENABLED && otp === DEMO_OTP) {
      console.log(`[DEMO] Demo OTP used for ${identifier} - bypassing verification`);
      verifyResult = { success: true };
    } else {
      // Verify OTP normally
      verifyResult = await verifyOTP(identifier, type, otp);
    }
    
    if (!verifyResult.success) {
      return res.status(401).json({
        success: false,
        error: verifyResult.error,
        errorCode: verifyResult.errorCode,
        message: verifyResult.error
      });
    }
    
    // Find or create user
    let user = await findUserByIdentifier(identifier);
    let isNewUser = false;
    
    if (!user) {
      // Create new user with role based on mode
      const userData = type === 'phone' 
        ? { phone: identifier }
        : { email: identifier };
      
      // Set role based on login mode
      if (mode === 'driver') {
        userData.role = 'driver';
      }
      
      user = await createUser(userData);
      isNewUser = true;
    } else if (mode === 'driver' && user.role === 'passenger') {
      // Existing passenger wants to become a driver - update role
      user.role = 'driver';
      await user.save();
    }
    
    // Generate session ID first for token binding
    const { generateSessionId } = require('../services/sessionService');
    const sessionId = generateSessionId();
    
    // Generate dual token pair (Requirements 1.1)
    const { accessToken, refreshToken, accessExpiresIn, refreshExpiresIn } = generateTokenPair(user, sessionId, isNewUser);
    
    // Create session with refresh token binding (Requirements 4.1)
    await createSession(user._id, refreshToken, ipAddress, userAgent);
    
    // Log successful authentication event (Requirements 6.1)
    await logLoginSuccess(user._id, ipAddress, userAgent, {
      loginMethod: 'otp',
      identifier,
      isNewUser,
      sessionId
    });
    
    // Determine routing destination based on role and new user status
    let redirectTo;
    if (isNewUser) {
      redirectTo = '/profile/setup';
    } else if (user.role === 'driver') {
      redirectTo = '/driver/dashboard';
    } else if (user.role === 'admin' || user.role === 'operations' || user.role === 'super_admin') {
      redirectTo = '/admin';
    } else {
      redirectTo = '/search';
    }
    
    // Return dual-token response (Requirements 5.3)
    res.json({
      success: true,
      accessToken,
      refreshToken,
      accessExpiresIn,
      refreshExpiresIn,
      // Legacy support - keep 'token' for backward compatibility
      token: accessToken,
      expiresIn: `${accessExpiresIn}s`,
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role
      },
      isNewUser,
      redirectTo
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/staff-login
 * Staff login with email/password authentication
 * 
 * Requirements: 3.3, 6.1, 6.2, 6.3, 6.4
 * - Validates credentials against bcrypt hash
 * - Includes role and permissions in JWT payload
 * - Checks isActive status before allowing login
 * - Returns same generic error for wrong email or password
 * Rate limited: 5 login attempts per 15 minutes per IP address
 */
router.post('/staff-login', staffLoginLimiter, validate(staffLoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Authenticate staff member
    const { staff } = await authenticateStaff(email, password);
    
    // Generate JWT token with role and permissions (Requirements 6.4)
    const { token, expiresIn } = generateToken(staff, false);
    
    // Determine redirect based on role
    let redirectTo = '/admin';
    if (staff.role === 'operations') {
      redirectTo = '/admin/documents';
    } else if (staff.role === 'customer_support') {
      redirectTo = '/admin/support';
    } else if (staff.role === 'finance') {
      redirectTo = '/admin/payments';
    } else if (staff.role === 'super_admin') {
      redirectTo = '/admin/super';
    }
    
    res.json({
      success: true,
      token,
      expiresIn,
      user: {
        id: staff._id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        permissions: staff.permissions
      },
      isNewUser: false,
      redirectTo
    });
  } catch (error) {
    // Handle specific error codes
    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    if (error.code === 'ACCOUNT_DEACTIVATED') {
      return res.status(403).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    next(error);
  }
});

/**
 * POST /api/auth/admin-login
 * Legacy admin login endpoint - redirects to staff-login
 * @deprecated Use /api/auth/staff-login instead
 * Rate limited: 5 login attempts per 15 minutes per IP address
 */
router.post('/admin-login', staffLoginLimiter, validate(staffLoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Authenticate staff member using the same logic
    const { staff } = await authenticateStaff(email, password);
    
    // Generate JWT token with role and permissions
    const { token, expiresIn } = generateToken(staff, false);
    
    // Determine redirect based on role
    let redirectTo = '/admin';
    if (staff.role === 'operations') {
      redirectTo = '/admin/documents';
    } else if (staff.role === 'customer_support') {
      redirectTo = '/admin/support';
    } else if (staff.role === 'finance') {
      redirectTo = '/admin/payments';
    } else if (staff.role === 'super_admin') {
      redirectTo = '/admin/super';
    }
    
    res.json({
      success: true,
      token,
      expiresIn,
      user: {
        id: staff._id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        permissions: staff.permissions
      },
      isNewUser: false,
      redirectTo
    });
  } catch (error) {
    // Handle specific error codes
    if (error.code === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    if (error.code === 'ACCOUNT_DEACTIVATED') {
      return res.status(403).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    next(error);
  }
});

// ============================================================================
// Refresh Token Endpoint (Requirements 1.3, 4.1, 6.1)
// ============================================================================

// Validation schema for refresh token
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'string.empty': 'Refresh token is required',
    'any.required': 'Refresh token is required'
  })
});

/**
 * POST /api/auth/refresh-token
 * Exchange a valid refresh token for a new access token
 * Requirements: 1.3 - Valid refresh token issues new access token
 * Requirements: 4.1 - Update session activity
 * Requirements: 6.1 - Log token refresh event
 */
router.post('/refresh-token', validate(refreshTokenSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    
    // Verify the refresh token (Requirements 1.3)
    const verifyResult = verifyRefreshToken(refreshToken);
    
    if (!verifyResult.valid) {
      return res.status(401).json({
        success: false,
        error: verifyResult.error,
        errorCode: verifyResult.errorCode,
        message: verifyResult.error
      });
    }
    
    const { payload } = verifyResult;
    
    // Validate session is still active (Requirements 4.3)
    const sessionValidation = await validateSessionForRefresh(refreshToken, payload.sessionId);
    
    if (!sessionValidation.valid) {
      return res.status(401).json({
        success: false,
        error: sessionValidation.error,
        errorCode: sessionValidation.errorCode,
        message: sessionValidation.error
      });
    }
    
    // Get user to generate new token
    const user = await findUserById(payload.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        errorCode: 'AUTH_005',
        message: 'User not found'
      });
    }
    
    // Generate new access token only (keep same refresh token)
    const { accessToken, accessExpiresIn } = generateTokenPair(user, payload.sessionId, false);
    
    // Update session last activity (Requirements 4.1)
    await updateSessionActivity(payload.sessionId);
    
    // Log token refresh event (Requirements 6.1)
    await logTokenRefresh(user._id, ipAddress, userAgent, {
      sessionId: payload.sessionId
    });
    
    res.json({
      success: true,
      accessToken,
      accessExpiresIn,
      // Legacy support
      token: accessToken,
      expiresIn: `${accessExpiresIn}s`
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Logout Endpoint (Requirements 2.1, 2.2, 6.3)
// ============================================================================

// Validation schema for logout
const logoutSchema = Joi.object({
  allDevices: Joi.boolean().optional().default(false)
});

/**
 * POST /api/auth/logout
 * Logout user and invalidate tokens
 * Requirements: 2.1 - Add current access token to blacklist
 * Requirements: 2.2 - Support allDevices flag to revoke all sessions
 * Requirements: 6.3 - Log logout event
 */
router.post('/logout', authenticate, validate(logoutSchema), async (req, res, next) => {
  try {
    const { allDevices } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    // Get userId from user object and sessionId from token payload
    const userId = req.user._id;
    const sessionId = req.tokenPayload?.sessionId;
    
    // Get the current access token from header
    const authHeader = req.get('Authorization');
    const currentToken = extractTokenFromHeader(authHeader);
    
    // Blacklist the current access token (Requirements 2.1)
    if (currentToken) {
      await blacklistToken(currentToken, 'logout');
    }
    
    // Handle allDevices logout (Requirements 2.2)
    let sessionsRevoked = 0;
    if (allDevices) {
      // Revoke all sessions for the user
      sessionsRevoked = await revokeAllSessions(userId);
    } else if (sessionId) {
      // Revoke only the current session
      await revokeSession(sessionId, userId);
      sessionsRevoked = 1;
    }
    
    // Log logout event (Requirements 6.3)
    await logLogout(userId, ipAddress, userAgent, {
      allDevices,
      sessionsRevoked,
      sessionId
    });
    
    res.json({
      success: true,
      message: allDevices 
        ? `Logged out from all devices (${sessionsRevoked} sessions revoked)` 
        : 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Sessions Management Endpoints (Requirements 4.1, 4.2, 4.4)
// ============================================================================

/**
 * GET /api/auth/sessions
 * List all active sessions for the authenticated user
 * Requirements: 4.1 - Return sessions with device info, IP, and last activity
 * Requirements: 4.4 - Mask sensitive information like full IP addresses
 */
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const currentSessionId = req.tokenPayload?.sessionId;
    
    // Get all active sessions (Requirements 4.1)
    const sessions = await getActiveSessions(userId);
    
    // Mark the current session and return with masked IPs (Requirements 4.4)
    const sessionsWithCurrent = sessions.map(session => ({
      ...session,
      isCurrent: session.sessionId === currentSessionId
    }));
    
    res.json({
      success: true,
      sessions: sessionsWithCurrent,
      count: sessionsWithCurrent.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke a specific session
 * Requirements: 4.2 - Invalidate refresh token for the session
 */
router.delete('/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;
    const currentSessionId = req.tokenPayload?.sessionId;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    
    // Prevent revoking current session via this endpoint
    if (sessionId === currentSessionId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot revoke current session. Use /logout instead.',
        errorCode: 'AUTH_001',
        message: 'Cannot revoke current session. Use /logout instead.'
      });
    }
    
    // Revoke the session (Requirements 4.2)
    const revoked = await revokeSession(sessionId, userId);
    
    if (!revoked) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or already revoked',
        errorCode: 'AUTH_008',
        message: 'Session not found or already revoked'
      });
    }
    
    // Log session revocation (Requirements 6.3)
    await logSessionRevoked(userId, ipAddress, 'user_initiated', userAgent, {
      revokedSessionId: sessionId
    });
    
    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
