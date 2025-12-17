/**
 * Referral Routes
 * Handles referral system endpoints
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const referralService = require('../services/referralService');

// Validation schemas
const applyReferralSchema = Joi.object({
  referralCode: Joi.string().trim().length(6).uppercase().required()
    .messages({ 'string.length': 'Referral code must be exactly 6 characters' })
});

const socialSharingSchema = Joi.object({
  whatsappEnabled: Joi.boolean(),
  emailEnabled: Joi.boolean(),
  facebookEnabled: Joi.boolean(),
  twitterEnabled: Joi.boolean()
}).min(1);

const validateReferralSchema = Joi.object({
  referralCode: Joi.string().trim().length(6).uppercase().required()
});

// Apply authentication to all referral routes
router.use(authenticate);

/**
 * GET /api/referral
 * Get referral data for current user
 * Requirements: 2.1, 2.4 - Display referral code, statistics, and sharing options
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await referralService.getReferralData(req.user._id);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * POST /api/referral/generate
 * Generate referral code for current user
 * Requirements: 2.1 - Generate unique referral code
 */
router.post('/generate', async (req, res, next) => {
  try {
    const result = await referralService.generateReferralCode(req.user._id);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * POST /api/referral/apply
 * Apply referral code for current user
 * Requirements: 2.3 - Process referral code application
 */
router.post('/apply', validate(applyReferralSchema), async (req, res, next) => {
  try {
    const result = await referralService.applyReferralCode(req.user._id, req.body.referralCode);
    res.json(result);
  } catch (error) {
    if (['USER_NOT_FOUND', 'REFERRAL_ALREADY_APPLIED', 'INVALID_REFERRAL_CODE', 'SELF_REFERRAL_NOT_ALLOWED'].includes(error.code)) {
      return res.status(400).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * POST /api/referral/validate
 * Validate referral code
 * Requirements: 2.1 - Validate referral code before application
 */
router.post('/validate', validate(validateReferralSchema), async (req, res, next) => {
  try {
    const result = await referralService.validateReferralCode(req.body.referralCode);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/referral/social-sharing
 * Update social sharing preferences
 * Requirements: 2.2 - Manage social media sharing preferences
 */
router.put('/social-sharing', validate(socialSharingSchema), async (req, res, next) => {
  try {
    const result = await referralService.updateSocialSharingPreferences(req.user._id, req.body);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * GET /api/referral/leaderboard
 * Get referral leaderboard
 * Requirements: 2.4 - Display top referrers
 */
router.get('/leaderboard', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await referralService.getReferralLeaderboard(limit);
    res.json({ leaderboard: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referral/process-rewards
 * Process referral rewards (internal endpoint for booking service)
 * Requirements: 2.3, 2.5 - Credit rewards and send notifications
 */
router.post('/process-rewards', async (req, res, next) => {
  try {
    const { userId, bookingId, bookingAmount } = req.body;
    
    if (!userId || !bookingId) {
      return res.status(400).json({ 
        error: 'User ID and booking ID are required',
        errorCode: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const result = await referralService.processReferralRewards(userId, bookingId, bookingAmount);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

module.exports = router;