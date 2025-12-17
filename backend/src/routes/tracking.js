/**
 * Tracking Routes
 * API endpoints for live location tracking and ride sharing
 * 
 * Requirements: 6.2, 6.3
 */

const express = require('express');
const Joi = require('joi');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const tripTrackingService = require('../services/tripTrackingService');

const router = express.Router();

// Validation schemas
const generateShareLinkSchema = Joi.object({
  bookingId: Joi.string().hex().length(24).required()
});

/**
 * POST /api/tracking/share
 * Generate a shareable tracking link
 * Requirements: 6.2
 */
router.post('/share', authenticateToken, validate(generateShareLinkSchema), async (req, res) => {
  try {
    const { bookingId } = req.body;
    const result = await tripTrackingService.generateShareLink(bookingId, req.user._id.toString());
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'TRIP_NOT_IN_PROGRESS') {
      return res.status(400).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Generate share link error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * GET /api/tracking/share/:token
 * Get shared trip data (public, no auth required)
 * Requirements: 3.5, 6.3 - Return passenger location, driver details, vehicle info
 */
router.get('/share/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Try passenger tracking data first (Requirements: 3.5)
    const locationSharingService = require('../services/locationSharingService');
    let result;
    
    try {
      result = await locationSharingService.getPassengerTrackingData(token);
    } catch (passengerError) {
      // Fall back to trip tracking service for backward compatibility
      if (passengerError.code === 'LINK_NOT_FOUND') {
        result = await tripTrackingService.getSharedTripData(token);
      } else {
        throw passengerError;
      }
    }
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'LINK_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'LINK_EXPIRED') {
      return res.status(410).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'TRIP_NOT_FOUND' || error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Get shared trip data error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * DELETE /api/tracking/share/:token
 * Revoke a share link
 * Requirements: 6.2
 */
router.delete('/share/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const result = await tripTrackingService.revokeShareLink(token, req.user._id.toString());
    
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.code === 'LINK_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Revoke share link error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * GET /api/tracking/trip/:id
 * Get live tracking data for a trip
 * Requirements: 6.6
 */
router.get('/trip/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await tripTrackingService.getTrackingInfo(id);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({ success: false, error: { code: 'TRIP_NOT_FOUND', message: error.message } });
    }
    console.error('Get tracking info error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// ============================================
// Passenger Location Sharing Endpoints
// Requirements: 3.1, 3.2, 3.5
// ============================================

const locationSharingService = require('../services/locationSharingService');

// Validation schemas for passenger sharing
const startPassengerSharingSchema = Joi.object({
  bookingId: Joi.string().hex().length(24).required(),
  contacts: Joi.array().items(
    Joi.object({
      name: Joi.string().min(1).max(100).required(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).required()
    })
  ).max(5).default([])
});

const updatePassengerLocationSchema = Joi.object({
  bookingId: Joi.string().hex().length(24).required(),
  coordinates: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
  }).required()
});

// Extended validation schema with sendNotifications option
const startPassengerSharingWithNotifySchema = Joi.object({
  bookingId: Joi.string().hex().length(24).required(),
  contacts: Joi.array().items(
    Joi.object({
      name: Joi.string().min(1).max(100).required(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{9,14}$/).required()
    })
  ).max(5).default([]),
  sendNotifications: Joi.boolean().default(true)
});

/**
 * POST /api/tracking/passenger/share
 * Start passenger location sharing with emergency contacts
 * Requirements: 3.1, 3.2 - Send tracking links via SMS and WhatsApp
 */
router.post('/passenger/share', authenticateToken, validate(startPassengerSharingWithNotifySchema), async (req, res) => {
  try {
    const { bookingId, contacts, sendNotifications } = req.body;
    const result = await locationSharingService.startPassengerSharingWithNotifications(
      bookingId,
      req.user._id.toString(),
      contacts,
      sendNotifications
    );
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'MAX_CONTACTS_EXCEEDED') {
      return res.status(400).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Start passenger sharing error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * POST /api/tracking/passenger/url
 * Generate a shareable tracking URL for a booking
 * Requirements: 3.2
 */
router.post('/passenger/url', authenticateToken, validate(generateShareLinkSchema), async (req, res) => {
  try {
    const { bookingId } = req.body;
    const result = await locationSharingService.generatePassengerTrackingUrl(
      bookingId,
      req.user._id.toString()
    );
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Generate passenger tracking URL error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

/**
 * PUT /api/tracking/passenger/location
 * Update passenger location during ride
 * Requirements: 3.3
 */
router.put('/passenger/location', authenticateToken, validate(updatePassengerLocationSchema), async (req, res) => {
  try {
    const { bookingId, coordinates } = req.body;
    const result = await locationSharingService.updatePassengerLocation(
      bookingId,
      req.user._id.toString(),
      coordinates
    );
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: { code: error.code, message: error.message } });
    }
    if (error.code === 'INVALID_COORDINATES') {
      return res.status(400).json({ success: false, error: { code: error.code, message: error.message } });
    }
    console.error('Update passenger location error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

module.exports = router;
