/**
 * Profile Routes
 * Handles user profile management endpoints
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const profileService = require('../services/profileService');

// Validation schemas
// Requirements: 5.2, 5.4 - Validate and save personal information and notification preferences
const updateProfileSchema = Joi.object({
  name: Joi.string().trim().max(100),
  email: Joi.string().trim().email().lowercase(),
  gender: Joi.string().valid('male', 'female', 'other'),
  dateOfBirth: Joi.date().max('now'),
  healthInfo: Joi.string().trim().max(500),
  preferences: Joi.object({
    rideType: Joi.array().items(
      Joi.string().valid('regular', 'female-only', 'accessible', 'premium')
    ),
    notificationChannels: Joi.array().items(
      Joi.string().valid('sms', 'email', 'whatsapp')
    ),
    // Notification toggle preferences - Requirements: 5.4
    emailAlerts: Joi.boolean(),
    mobileAlerts: Joi.boolean(),
    bookingReminders: Joi.boolean(),
    promotionalOffers: Joi.boolean(),
    rideUpdates: Joi.boolean(),
    walletAlerts: Joi.boolean(),
    referralUpdates: Joi.boolean()
  })
}).min(1);

const emergencyContactSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).required()
    .messages({ 'string.pattern.base': 'Please provide a valid phone number' }),
  relationship: Joi.string().trim().max(50).required()
});

const updateEmergencyContactSchema = Joi.object({
  name: Joi.string().trim().max(100),
  phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/)
    .messages({ 'string.pattern.base': 'Please provide a valid phone number' }),
  relationship: Joi.string().trim().max(50)
}).min(1);

const kycUploadSchema = Joi.object({
  documentType: Joi.string().valid('id_proof', 'selfie').required(),
  url: Joi.string().uri().required()
});

// UPI validation schema - Requirements: 5.3
const upiSchema = Joi.object({
  upiId: Joi.string().trim().lowercase().pattern(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/).required()
    .messages({ 'string.pattern.base': 'Please provide a valid UPI ID (e.g., yourname@paytm)' })
});

// Apply authentication to all profile routes
router.use(authenticate);


/**
 * GET /api/profile
 * Get current user's profile with editable fields list
 * Requirements: 8.1
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await profileService.getProfile(req.user._id);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * PUT /api/profile
 * Update current user's profile
 * Requirements: 8.2
 */
router.put('/', validate(updateProfileSchema), async (req, res, next) => {
  try {
    const result = await profileService.updateProfile(req.user._id, req.body);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    if (error.code === 'NO_VALID_FIELDS') {
      return res.status(400).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * GET /api/profile/emergency-contacts
 * Get all emergency contacts for current user
 * Requirements: 8.3
 */
router.get('/emergency-contacts', async (req, res, next) => {
  try {
    const contacts = await profileService.getEmergencyContacts(req.user._id);
    res.json({ contacts });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * POST /api/profile/emergency-contacts
 * Add a new emergency contact
 * Requirements: 8.3
 */
router.post('/emergency-contacts', validate(emergencyContactSchema), async (req, res, next) => {
  try {
    const result = await profileService.addEmergencyContact(req.user._id, req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    if (error.code === 'MAX_CONTACTS_REACHED') {
      return res.status(400).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});


/**
 * PUT /api/profile/emergency-contacts/:contactId
 * Update an emergency contact
 * Requirements: 8.3
 */
router.put('/emergency-contacts/:contactId', validate(updateEmergencyContactSchema), async (req, res, next) => {
  try {
    const result = await profileService.updateEmergencyContact(
      req.user._id,
      req.params.contactId,
      req.body
    );
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND' || error.code === 'CONTACT_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * DELETE /api/profile/emergency-contacts/:contactId
 * Delete an emergency contact
 * Requirements: 8.3
 */
router.delete('/emergency-contacts/:contactId', async (req, res, next) => {
  try {
    const result = await profileService.deleteEmergencyContact(
      req.user._id,
      req.params.contactId
    );
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND' || error.code === 'CONTACT_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * POST /api/profile/generate-pin
 * Generate a unique 4-digit booking PIN for the user
 * Requirements: 4.1, 4.2, 4.3
 */
router.post('/generate-pin', async (req, res, next) => {
  try {
    const userService = require('../services/userService');
    const result = await userService.generateBookingPIN(req.user._id);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    if (error.code === 'PIN_ALREADY_EXISTS') {
      return res.status(400).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * GET /api/profile/kyc
 * Get KYC status and documents for current user
 * Requirements: 8.4
 */
router.get('/kyc', async (req, res, next) => {
  try {
    const result = await profileService.getKYCDocuments(req.user._id);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * POST /api/profile/kyc
 * Upload a KYC document
 * Requirements: 8.4
 */
router.post('/kyc', validate(kycUploadSchema), async (req, res, next) => {
  try {
    const result = await profileService.uploadKYCDocument(req.user._id, {
      type: req.body.documentType,
      url: req.body.url
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    if (error.code === 'DOCUMENT_ALREADY_VERIFIED') {
      return res.status(400).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * PUT /api/profile/upi
 * Add or update UPI details
 * Requirements: 5.3 - Securely store payment information for instant transfers
 */
router.put('/upi', validate(upiSchema), async (req, res, next) => {
  try {
    const result = await profileService.updateUPIDetails(req.user._id, req.body.upiId);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

/**
 * DELETE /api/profile/upi
 * Remove UPI details
 * Requirements: 5.3
 */
router.delete('/upi', async (req, res, next) => {
  try {
    const result = await profileService.removeUPIDetails(req.user._id);
    res.json(result);
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: error.message, errorCode: error.code });
    }
    next(error);
  }
});

module.exports = router;
