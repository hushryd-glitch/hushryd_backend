/**
 * Booking Routes
 * API endpoints for passenger booking management
 * 
 * Requirements: 3.4, 3.5, 3.6, 6.1, 6.4
 */

const express = require('express');
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const { verifyFemaleOnly } = require('../middleware/genderVerification');
const { validate } = require('../middleware/validate');
const bookingService = require('../services/bookingService');
const cancellationService = require('../services/cancellationService');
const ratingService = require('../services/ratingService');

const router = express.Router();

// Validation schemas
const locationSchema = Joi.object({
  address: Joi.string().min(5).max(500).required(),
  coordinates: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
  }).required(),
  landmark: Joi.string().max(200).optional()
});

const createBookingSchema = Joi.object({
  tripId: Joi.string().required(),
  seats: Joi.number().integer().min(1).max(6).required(),
  pickupPoint: locationSchema.required(),
  dropPoint: locationSchema.required()
});

const confirmBookingSchema = Joi.object({
  paymentId: Joi.string().required()
});

const cancelBookingSchema = Joi.object({
  reason: Joi.string().max(500).optional()
});

const ratingSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  feedback: Joi.string().max(1000).optional()
});

/**
 * POST /api/bookings
 * Create a new booking
 * Requirements: 1.1, 3.4
 * 
 * Women-Only Booking: Requires gender verification (Requirements 1.1, 1.2, 1.4)
 */
router.post('/', authenticateToken, verifyFemaleOnly, validate(createBookingSchema), async (req, res) => {
  try {
    const result = await bookingService.createBooking(req.user._id, req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'PASSENGER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'INVALID_BOOKING_DATA' || error.code === 'TRIP_NOT_AVAILABLE' || 
        error.code === 'DUPLICATE_BOOKING' || error.code === 'INSUFFICIENT_SEATS') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/bookings/upcoming
 * Get passenger's upcoming bookings with "Upcoming Soon" flag
 * Requirements: 7.2, 7.3, 7.4
 */
router.get('/upcoming', authenticateToken, async (req, res) => {
  try {
    const result = await bookingService.getUpcomingBookings(req.user._id);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'PASSENGER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get upcoming bookings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/bookings/cancellation-policy
 * Get cancellation policy details
 * Requirements: 6.1
 */
router.get('/cancellation-policy', async (req, res) => {
  try {
    const policy = cancellationService.getCancellationPolicy();
    res.status(200).json({ success: true, ...policy });
  } catch (error) {
    console.error('Get cancellation policy error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/bookings
 * Get passenger's bookings
 * Requirements: 3.6
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page, limit, status, startDate, endDate } = req.query;
    
    const result = await bookingService.getPassengerBookings(req.user._id, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      status,
      startDate,
      endDate
    });
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'PASSENGER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/bookings/:id
 * Get booking details
 * Requirements: 3.5
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await bookingService.getBookingById(req.params.id);
    
    // Verify user has access to this booking
    if (result.booking.passengerId._id.toString() !== req.user._id.toString() &&
        result.booking.passengerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Unauthorized to view this booking', 
        code: 'UNAUTHORIZED' 
      });
    }
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * PUT /api/bookings/:id/confirm
 * Confirm booking after payment
 * Requirements: 3.5
 */
router.put('/:id/confirm', authenticateToken, validate(confirmBookingSchema), async (req, res) => {
  try {
    const result = await bookingService.confirmBooking(req.params.id, req.body.paymentId);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'INVALID_BOOKING_STATUS' || error.code === 'PAYMENT_ID_REQUIRED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Confirm booking error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * DELETE /api/bookings/:id
 * Cancel a booking with refund policy
 * Requirements: 6.1
 */
router.delete('/:id', authenticateToken, validate(cancelBookingSchema), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await cancellationService.cancelPassengerBooking(req.params.id, req.user._id, reason);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'BOOKING_COMPLETED' || error.code === 'BOOKING_ALREADY_CANCELLED' || error.code === 'TRIP_IN_PROGRESS') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/bookings/:id/accept
 * Driver accepts a booking request
 * Requirements: 4.3
 */
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    // Get driver ID from user's driver profile
    const Driver = require('../models/Driver');
    const driver = await Driver.findOne({ userId: req.user._id });
    
    if (!driver) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only drivers can accept bookings', 
        code: 'NOT_A_DRIVER' 
      });
    }

    const result = await bookingService.acceptBooking(req.params.id, driver._id.toString());
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'ALREADY_RESPONDED' || error.code === 'BOOKING_EXPIRED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Accept booking error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/bookings/:id/decline
 * Driver declines a booking request
 * Requirements: 4.4
 */
router.post('/:id/decline', authenticateToken, async (req, res) => {
  try {
    const Driver = require('../models/Driver');
    const driver = await Driver.findOne({ userId: req.user._id });
    
    if (!driver) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only drivers can decline bookings', 
        code: 'NOT_A_DRIVER' 
      });
    }

    const { reason } = req.body;
    const result = await bookingService.declineBooking(req.params.id, driver._id.toString(), reason);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND' || error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'ALREADY_RESPONDED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Decline booking error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/bookings/:id/verify-pin
 * Driver verifies passenger PIN for ride start
 * Requirements: 8.2, 8.3, 8.4
 */
router.post('/:id/verify-pin', authenticateToken, async (req, res) => {
  try {
    const { pin } = req.body;
    
    if (!pin || pin.length !== 4) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid 4-digit PIN is required', 
        code: 'INVALID_PIN_FORMAT' 
      });
    }

    const result = await bookingService.validatePassengerPIN(req.params.id, pin);
    
    if (!result.valid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid PIN', 
        code: 'INVALID_PIN' 
      });
    }

    res.status(200).json({ success: true, message: 'PIN verified successfully', booking: result.booking });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Verify PIN error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/bookings/:id/verify-code
 * Driver verifies passenger verification code for ride start
 * Tracks validation attempts (max 3) and starts ride on success
 * Requirements: 7.4, 7.5, 7.6
 */
router.post('/:id/verify-code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const verificationService = require('../services/verificationService');
    
    // Validate code format
    const formatValidation = verificationService.validateCodeFormat(code);
    if (!formatValidation.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: formatValidation.message, 
        code: 'INVALID_CODE_FORMAT' 
      });
    }

    // Validate the verification code
    const result = await verificationService.validateCode(req.params.id, code);
    
    if (result.locked) {
      return res.status(403).json({ 
        success: false, 
        error: result.message, 
        code: 'MAX_ATTEMPTS_EXCEEDED',
        attemptsRemaining: 0
      });
    }

    if (!result.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: result.message, 
        code: 'INVALID_CODE',
        attemptsRemaining: result.attemptsRemaining
      });
    }

    // Start the ride after successful verification (Requirements 7.5)
    const rideResult = await verificationService.startRideAfterVerification(req.params.id);

    res.status(200).json({ 
      success: true, 
      message: 'Verification successful. Ride started.',
      verifiedAt: result.verifiedAt,
      tripId: rideResult.tripId,
      startedAt: rideResult.startedAt
    });
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'BOOKING_NOT_CONFIRMED' || error.code === 'NO_VERIFICATION_CODE' || error.code === 'NOT_VERIFIED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Verify code error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/bookings/:id/verification-attempts
 * Get verification attempt count for a booking
 * Requirements: 7.6
 */
router.get('/:id/verification-attempts', authenticateToken, async (req, res) => {
  try {
    const verificationService = require('../services/verificationService');
    const result = await verificationService.getAttempts(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get verification attempts error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/bookings/trip/:tripId/can-start
 * Check if all passengers are verified for trip start
 * Requirements: 8.5
 */
router.get('/trip/:tripId/can-start', authenticateToken, async (req, res) => {
  try {
    const result = await bookingService.canStartTrip(req.params.tripId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Can start trip error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/bookings/:id/rating
 * Submit rating for a completed booking
 * Requirements: 6.4
 */
router.post('/:id/rating', authenticateToken, validate(ratingSchema), async (req, res) => {
  try {
    const result = await ratingService.submitRating(req.params.id, req.user._id, req.body);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'INVALID_RATING_DATA' || error.code === 'BOOKING_NOT_COMPLETED' || error.code === 'ALREADY_RATED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Submit rating error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
