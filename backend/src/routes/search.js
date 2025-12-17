/**
 * Search Routes
 * API endpoints for ride search
 * 
 * Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3
 * Requirements: 8.1 - Search results within 2 seconds with caching
 */

const express = require('express');
const Joi = require('joi');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const searchService = require('../services/searchService');
const { searchTrips } = require('../services/cacheService');

const router = express.Router();

// Validation schemas
const coordinatesSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required()
});

const searchRidesSchema = Joi.object({
  // Coordinates are now optional - can search by text or coordinates
  sourceLat: Joi.number().min(-90).max(90).optional(),
  sourceLng: Joi.number().min(-180).max(180).optional(),
  destLat: Joi.number().min(-90).max(90).optional(),
  destLng: Joi.number().min(-180).max(180).optional(),
  // Text-based search fields
  from: Joi.string().optional(),
  to: Joi.string().optional(),
  date: Joi.date().optional(),
  seats: Joi.number().integer().min(1).max(6).optional(),
  vehicleType: Joi.string().valid('sedan', 'suv', 'hatchback', 'premium').optional(),
  maxFare: Joi.number().min(0).optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  sortBy: Joi.string().valid('departure', 'fare', 'rating', 'departureTime', 'farePerSeat', 'duration').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(50).optional(),
  radiusKm: Joi.number().min(1).max(50).optional(),
  departureTime: Joi.string().optional(),
  amenities: Joi.string().optional()
});

/**
 * GET /api/search/rides
 * Search for available rides
 * Requirements: 3.1, 3.2, 4.1, 4.2, 4.3
 */
router.get('/rides', async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = searchRidesSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
        code: 'INVALID_SEARCH_PARAMS'
      });
    }

    const {
      sourceLat,
      sourceLng,
      destLat,
      destLng,
      from,
      to,
      date,
      seats,
      vehicleType,
      maxFare,
      minRating,
      sortBy,
      sortOrder,
      page,
      limit,
      radiusKm,
      departureTime,
      amenities
    } = value;

    // Build search params - support both coordinate and text-based search
    const searchParams = {
      date,
      seats,
      vehicleType,
      maxFare,
      minRating,
      sortBy,
      sortOrder,
      page,
      limit,
      radiusKm,
      departureTime,
      amenities
    };

    // Add coordinates if provided
    if (sourceLat !== undefined && sourceLng !== undefined) {
      searchParams.sourceCoords = { lat: sourceLat, lng: sourceLng };
    }
    if (destLat !== undefined && destLng !== undefined) {
      searchParams.destCoords = { lat: destLat, lng: destLng };
    }

    // Add text search if provided
    if (from) searchParams.from = from;
    if (to) searchParams.to = to;

    // Use cached search for better performance
    // Requirements: 8.1 - Search results within 2 seconds
    const result = await searchTrips(searchParams, searchService.searchRides);

    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'INVALID_SEARCH_PARAMS') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    console.error('Search rides error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});


/**
 * GET /api/trips/:id (public)
 * Get public trip details for passengers
 * Requirements: 3.3, 4.3
 */
router.get('/trips/:id', async (req, res) => {
  try {
    const result = await searchService.getPublicTripDetails(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    // Handle invalid trip ID format - Requirements: 4.3
    if (error.code === 'INVALID_TRIP_ID') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    // Handle trip not found - Requirements: 4.3
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    console.error('Get public trip details error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/search/trips/:id/women-only-eligibility
 * Check if user can book a women-only ride
 * Requirements: 10.2, 10.3
 */
router.get('/trips/:id/women-only-eligibility', optionalAuth, async (req, res) => {
  try {
    const { canUserBookWomenOnlyRide, getWomenOnlyBadge } = require('../services/womenOnlyRideService');
    const Trip = require('../models/Trip');
    
    // Get trip details
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        code: 'TRIP_NOT_FOUND'
      });
    }
    
    // Check if trip is women-only
    const isWomenOnly = trip.isWomenOnly || trip.ladiesOnly;
    const badge = getWomenOnlyBadge(trip);
    
    // If user is not authenticated, return basic info
    if (!req.user) {
      return res.status(200).json({
        success: true,
        isWomenOnly,
        badge,
        canBook: !isWomenOnly, // Can book non-women-only rides without auth
        message: isWomenOnly ? 'Login required to book women-only rides' : null
      });
    }
    
    // Check user eligibility
    const eligibility = canUserBookWomenOnlyRide(req.user, trip);
    
    res.status(200).json({
      success: true,
      isWomenOnly,
      badge,
      canBook: eligibility.canBook,
      reason: eligibility.reason,
      message: eligibility.message,
      redirectTo: eligibility.redirectTo
    });
  } catch (error) {
    console.error('Women-only eligibility check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
