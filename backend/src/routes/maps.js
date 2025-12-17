/**
 * Google Maps API Routes
 * Server-side endpoints for Google Maps integration
 * 
 * Requirements: 4.1, 4.2, 12.2
 */

const express = require('express');
const router = express.Router();
const mapsService = require('../services/mapsService');
const { body, query, validationResult } = require('express-validator');

/**
 * @route   POST /api/maps/geocode
 * @desc    Geocode an address to get coordinates
 * @access  Public
 */
router.post('/geocode', [
  body('address')
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ min: 3, max: 500 })
    .withMessage('Address must be between 3 and 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!mapsService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Maps service unavailable'
      });
    }

    const { address } = req.body;
    const result = await mapsService.geocodeAddress(address);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to geocode address',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/maps/reverse-geocode
 * @desc    Reverse geocode coordinates to get address
 * @access  Public
 */
router.post('/reverse-geocode', [
  body('lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!mapsService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Maps service unavailable'
      });
    }

    const { lat, lng } = req.body;
    const result = await mapsService.reverseGeocode(lat, lng);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse geocode coordinates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/maps/calculate-route
 * @desc    Calculate route between two locations
 * @access  Public
 */
router.post('/calculate-route', [
  body('origin.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Origin latitude must be between -90 and 90'),
  body('origin.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Origin longitude must be between -180 and 180'),
  body('destination.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Destination latitude must be between -90 and 90'),
  body('destination.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Destination longitude must be between -180 and 180'),
  body('mode')
    .optional()
    .isIn(['driving', 'walking', 'bicycling', 'transit'])
    .withMessage('Invalid travel mode')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!mapsService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Maps service unavailable'
      });
    }

    const { origin, destination, mode = 'driving', avoid = [] } = req.body;
    
    const result = await mapsService.calculateRoute(origin, destination, {
      mode,
      avoid
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Route calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/maps/distance-matrix
 * @desc    Calculate distance matrix between multiple origins and destinations
 * @access  Public
 */
router.post('/distance-matrix', [
  body('origins')
    .isArray({ min: 1, max: 25 })
    .withMessage('Origins must be an array with 1-25 locations'),
  body('destinations')
    .isArray({ min: 1, max: 25 })
    .withMessage('Destinations must be an array with 1-25 locations'),
  body('mode')
    .optional()
    .isIn(['driving', 'walking', 'bicycling', 'transit'])
    .withMessage('Invalid travel mode')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!mapsService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Maps service unavailable'
      });
    }

    const { origins, destinations, mode = 'driving', avoid = [] } = req.body;
    
    const result = await mapsService.calculateDistanceMatrix(origins, destinations, {
      mode,
      avoid
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Distance matrix error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate distance matrix',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/maps/nearby-places
 * @desc    Find nearby places
 * @access  Public
 */
router.get('/nearby-places', [
  query('lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('type')
    .notEmpty()
    .withMessage('Place type is required'),
  query('radius')
    .optional()
    .isInt({ min: 1, max: 50000 })
    .withMessage('Radius must be between 1 and 50000 meters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!mapsService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Maps service unavailable'
      });
    }

    const { lat, lng, type, radius = 5000 } = req.query;
    const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
    
    const result = await mapsService.findNearbyPlaces(location, type, parseInt(radius));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Nearby places error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearby places',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/maps/place-details/:placeId
 * @desc    Get place details by place ID
 * @access  Public
 */
router.get('/place-details/:placeId', [
  query('fields')
    .optional()
    .isString()
    .withMessage('Fields must be a comma-separated string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!mapsService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Maps service unavailable'
      });
    }

    const { placeId } = req.params;
    const { fields } = req.query;
    
    const fieldsArray = fields ? fields.split(',') : undefined;
    const result = await mapsService.getPlaceDetails(placeId, fieldsArray);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Place details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get place details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/maps/status
 * @desc    Check maps service status
 * @access  Public
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      available: mapsService.isAvailable(),
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;