/**
 * SOS Routes
 * Handles emergency alert endpoints
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validate } = require('../middleware/validate');
const { authenticate, isAdmin, isOperations } = require('../middleware/auth');
const sosService = require('../services/sosService');

/**
 * Validation schemas
 */
const triggerSOSSchema = Joi.object({
  tripId: Joi.string().hex().length(24).required()
    .messages({ 'any.required': 'Trip ID is required' }),
  userType: Joi.string().valid('passenger', 'driver').required()
    .messages({ 'any.required': 'User type is required' }),
  location: Joi.object({
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90).required()
        .messages({ 'any.required': 'Latitude is required' }),
      lng: Joi.number().min(-180).max(180).required()
        .messages({ 'any.required': 'Longitude is required' })
    }).required(),
    address: Joi.string().max(500).trim().allow('')
  }).required()
});

const getAlertsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('active', 'acknowledged', 'resolved')
});

const resolveAlertSchema = Joi.object({
  resolution: Joi.string().required().max(1000).trim()
    .messages({ 'any.required': 'Resolution description is required' }),
  actionsTaken: Joi.array().items(Joi.string().max(500).trim()).default([])
});

const acknowledgeAlertSchema = Joi.object({});

/**
 * POST /api/sos/trigger
 * Trigger an SOS alert
 * Requirements: 7.1, 7.2, 7.3
 */
router.post('/trigger', authenticate, validate(triggerSOSSchema), async (req, res, next) => {
  try {
    const { tripId, userType, location } = req.body;
    const userId = req.user._id;

    // 1. Trigger SOS alert (captures GPS and timestamp immediately)
    const alert = await sosService.triggerSOS({
      tripId,
      userId,
      userType,
      location
    });

    // 2. Notify admin dashboard (high-priority, within 5 seconds)
    const adminNotification = await sosService.notifyAdminDashboard(alert.alertId);

    // 3. Notify emergency contacts with live location link
    const contactNotifications = await sosService.notifyEmergencyContacts(alert.alertId);

    res.status(201).json({
      success: true,
      data: {
        alertId: alert.alertId,
        tripId: alert.tripId,
        status: alert.status,
        location: alert.location,
        createdAt: alert.createdAt,
        notifications: {
          adminNotified: adminNotification.adminNotified,
          emergencyContactsNotified: contactNotifications.contactsNotified,
          totalEmergencyContacts: contactNotifications.totalContacts
        }
      },
      message: 'SOS alert triggered successfully. Help is on the way.'
    });
  } catch (error) {
    if (['TRIP_ID_REQUIRED', 'USER_ID_REQUIRED', 'INVALID_USER_TYPE', 
         'COORDINATES_REQUIRED'].includes(error.code)) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (['TRIP_NOT_FOUND', 'USER_NOT_FOUND'].includes(error.code)) {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});


/**
 * GET /api/sos/alerts
 * Get user's SOS alerts (for the triggering user)
 */
router.get('/alerts', authenticate, async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Get alerts triggered by this user
    const SOSAlert = require('../models/SOSAlert');
    const alerts = await SOSAlert.find({ triggeredBy: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('tripId', 'tripId status')
      .lean();

    res.json({
      success: true,
      data: alerts.map(alert => ({
        _id: alert._id,
        tripId: alert.tripId?.tripId,
        status: alert.status,
        location: alert.location,
        createdAt: alert.createdAt,
        resolvedAt: alert.resolvedAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sos/:id
 * Get SOS alert details (for the triggering user)
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const alert = await sosService.getAlertDetails(id);

    // Verify the user is the one who triggered the alert or is admin
    if (alert.triggeredBy._id.toString() !== userId.toString() && 
        req.user.role !== 'admin' && req.user.role !== 'operations') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have permission to view this alert'
        }
      });
    }

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    if (error.code === 'ALERT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

module.exports = router;
