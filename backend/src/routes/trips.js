/**
 * Trip Routes
 * API endpoints for trip management
 * 
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 4.3, 6.2
 */

const express = require('express');
const Joi = require('joi');
const { authenticateToken, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/**
 * Middleware to verify driver role for trip management endpoints
 * Returns 403 for passengers attempting to access driver endpoints
 * Requirements: 4.3
 */
const requireDriverRole = authorize('driver', 'admin', 'super_admin');
const tripService = require('../services/tripService');
const driverRegistrationService = require('../services/driverRegistrationService');
const cancellationService = require('../services/cancellationService');
const ratingService = require('../services/ratingService');
const tripTrackingService = require('../services/tripTrackingService');

const router = express.Router();

// Validation schemas
const locationSchema = Joi.object({
  address: Joi.string().min(3).max(500).required(),
  coordinates: Joi.object({
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180)
  }).optional(),
  landmark: Joi.string().max(200).optional()
});

const createTripSchema = Joi.object({
  source: locationSchema.required(),
  destination: locationSchema.required(),
  stopovers: Joi.array().items(Joi.object({
    address: Joi.string().min(3).max(500),
    coordinates: Joi.object({
      lat: Joi.number().min(-90).max(90),
      lng: Joi.number().min(-180).max(180)
    }).optional()
  })).optional(),
  scheduledAt: Joi.date().greater('now').required(),
  availableSeats: Joi.number().integer().min(1).max(6).required(),
  farePerSeat: Joi.number().min(0).required(),
  vehicleId: Joi.string().allow('', null).optional(),
  instantBooking: Joi.boolean().optional(),
  ladiesOnly: Joi.boolean().optional(),
  description: Joi.string().allow('', null).max(1000).optional(),
  route: Joi.object({
    distance: Joi.number().min(0).optional(),
    duration: Joi.number().min(0).optional(),
    polyline: Joi.string().optional()
  }).optional()
});

const startTripSchema = Joi.object({
  otp: Joi.string().length(6).pattern(/^\d+$/).required()
    .messages({ 'string.pattern.base': 'OTP must be 6 digits' })
});

const cancelTripSchema = Joi.object({
  reason: Joi.string().max(500).optional()
});


/**
 * Helper to get driver ID from authenticated user
 */
const getDriverId = async (userId) => {
  const driverStatus = await driverRegistrationService.getDriverStatus(userId);
  if (!driverStatus.isDriver) {
    const error = new Error('Driver registration not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  return driverStatus.driverId;
};

/**
 * POST /api/trips
 * Create a new trip
 * Requirements: 2.2, 4.3
 */
router.post('/', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    // Manual validation with better error messages
    const { error, value } = createTripSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      console.log('Trip validation errors:', errors);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      });
    }
    
    const driverId = await getDriverId(req.user._id);
    const result = await tripService.createTrip(driverId, value);
    res.status(201).json(result);
  } catch (error) {
    console.error('Create trip error:', error.message, error.code);
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DRIVER_NOT_VERIFIED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DOCUMENTS_NEED_ATTENTION') {
      return res.status(403).json({ 
        success: false, 
        error: error.message, 
        code: error.code,
        rejectedDocuments: error.rejectedDocuments 
      });
    }
    if (error.code === 'INVALID_TRIP_DATA') {
      return res.status(400).json({ 
        success: false, 
        error: error.message, 
        code: error.code,
        errors: error.errors,
        fieldErrors: error.fieldErrors
      });
    }
    if (error.code === 'VEHICLE_NOT_FOUND' || error.code === 'VEHICLE_NOT_ACTIVE') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/trips
 * Get driver's trips with filters
 * Requirements: 2.3, 4.3
 */
router.get('/driver', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const { page, limit, status, startDate, endDate } = req.query;
    
    const result = await tripService.getDriverTrips(driverId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      status,
      startDate,
      endDate
    });
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get driver trips error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/trips/:id
 * Get trip details
 * Requirements: 4.1, 4.2, 4.3
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await tripService.getTripById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    // Handle invalid trip ID format - Requirements: 4.3
    if (error.code === 'INVALID_TRIP_ID') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    // Handle trip not found - Requirements: 4.3
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get trip error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});


/**
 * PUT /api/trips/:id/start
 * Start a trip with OTP verification
 * Requirements: 2.4, 4.3
 */
router.put('/:id/start', authenticateToken, requireDriverRole, validate(startTripSchema), async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const { otp } = req.body;
    
    const result = await tripService.startTrip(req.params.id, driverId, otp);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'INVALID_TRIP_STATUS') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'OTP_REQUIRED' || error.code === 'INVALID_OTP') {
      return res.status(401).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Start trip error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * PUT /api/trips/:id/complete
 * Complete a trip
 * Requirements: 2.5, 4.3
 */
router.put('/:id/complete', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const result = await tripService.completeTrip(req.params.id, driverId);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'INVALID_TRIP_STATUS') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Complete trip error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * DELETE /api/trips/:id
 * Cancel a trip with full refunds for all passengers
 * Requirements: 4.3, 6.2
 */
router.delete('/:id', authenticateToken, requireDriverRole, validate(cancelTripSchema), async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const { reason } = req.body;
    
    const result = await cancellationService.cancelDriverTrip(req.params.id, driverId, reason);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'TRIP_COMPLETED' || error.code === 'TRIP_ALREADY_CANCELLED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Cancel trip error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/earnings
 * Get driver earnings summary and transaction history
 * Requirements: 2.6, 4.3
 */
router.get('/driver/earnings', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const { page, limit, startDate, endDate } = req.query;
    
    const result = await tripService.getDriverEarnings(driverId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      startDate,
      endDate
    });
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get earnings error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/rating
 * Get driver's rating details
 * Requirements: 4.3, 6.4
 */
router.get('/driver/rating', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const result = await ratingService.getDriverRating(driverId);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get driver rating error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/reviews
 * Get driver's reviews
 * Requirements: 4.3, 6.4
 */
router.get('/driver/reviews', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const { page, limit } = req.query;
    
    const result = await ratingService.getDriverReviews(driverId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get driver reviews error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/trips/:id/tracking
 * Get real-time tracking info for a trip
 * Requirements: 5.1, 5.2, 5.5
 */
router.get('/:id/tracking', authenticateToken, async (req, res) => {
  try {
    const result = await tripTrackingService.getTrackingInfo(req.params.id);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({ 
        success: false, 
        error: 'Trip not found', 
        code: 'TRIP_NOT_FOUND' 
      });
    }
    console.error('Get tracking info error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /api/trips/:id/tracking/history
 * Get tracking history for a trip
 * Requirements: 5.1
 */
router.get('/:id/tracking/history', authenticateToken, async (req, res) => {
  try {
    const { limit } = req.query;
    const result = await tripTrackingService.getTrackingHistory(
      req.params.id, 
      parseInt(limit, 10) || 50
    );
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({ 
        success: false, 
        error: 'Trip not found', 
        code: 'TRIP_NOT_FOUND' 
      });
    }
    console.error('Get tracking history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * POST /api/trips/:id/tracking/location
 * Update driver location (for drivers)
 * Requirements: 4.3, 5.1, 5.2
 */
router.post('/:id/tracking/location', authenticateToken, requireDriverRole, async (req, res) => {
  try {
    const driverId = await getDriverId(req.user._id);
    const { coordinates, speed } = req.body;
    
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Valid coordinates (lat, lng) are required',
        code: 'INVALID_COORDINATES'
      });
    }
    
    const result = await tripTrackingService.processLocationUpdate(req.params.id, {
      coordinates,
      speed: speed || 0,
      driverId
    });
    
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message === 'Trip not found') {
      return res.status(404).json({ 
        success: false, 
        error: 'Trip not found', 
        code: 'TRIP_NOT_FOUND' 
      });
    }
    if (error.message === 'Trip is not in progress') {
      return res.status(400).json({ 
        success: false, 
        error: error.message, 
        code: 'TRIP_NOT_IN_PROGRESS' 
      });
    }
    console.error('Update location error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR' 
    });
  }
});

module.exports = router;
