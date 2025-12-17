/**
 * Gender Verification Middleware
 * Restricts booking access to female users only (Women-Only Safe Travel)
 * 
 * Requirements: 1.1, 1.2, 1.4
 */

const { createLogger } = require('../services/loggerService');

const logger = createLogger('genderVerification');

/**
 * Middleware to verify user is female for women-only booking
 * 
 * Requirements:
 * - 1.1: Verify user's gender is "female" before allowing booking
 * - 1.2: Display message for non-female users and prevent booking
 * - 1.4: Redirect to profile completion if gender not set
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyFemaleOnly = async (req, res, next) => {
  try {
    // authenticate middleware must run first
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: 'AUTH_005'
      });
    }

    const user = req.user;

    // Check if gender is set (Requirement 1.4)
    if (!user.gender) {
      logger.warn('Gender not set for booking attempt', {
        userId: user._id.toString(),
        path: req.path
      });
      
      return res.status(400).json({
        error: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile with gender information',
        redirectTo: '/profile/setup'
      });
    }

    // Check if user is female (Requirements 1.1, 1.2)
    if (user.gender !== 'female') {
      logger.warn('Non-female user attempted booking', {
        userId: user._id.toString(),
        gender: user.gender,
        path: req.path
      });
      
      return res.status(403).json({
        error: 'WOMEN_ONLY',
        message: 'HushRyd is currently available for women travelers only'
      });
    }

    next();
  } catch (error) {
    logger.error('Gender verification error', {
      error: error.message,
      path: req.path
    });
    next(error);
  }
};

module.exports = {
  verifyFemaleOnly
};
