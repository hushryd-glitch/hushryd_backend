/**
 * Trip Tracking Service
 * Handles real-time GPS location updates and ETA calculations
 * Requirements: 4.4, 5.1, 5.2, 5.3, 5.4
 * Requirements: 6.3 - Store driver location in Redis for real-time access
 * Requirements: 2.5 - Batch location updates for MongoDB history
 */

const Trip = require('../models/Trip');
const Booking = require('../models/Booking');
const { 
  broadcastTripLocation, 
  broadcastTripETA, 
  broadcastTripStatus,
  sendProximityNotification,
  getDriverLocation
} = require('./socketService');
const {
  storeDriverLocation,
  getDriverLocation: getDriverLocationFromCache,
  getTripLocation,
  bufferLocationForMongo,
  startBufferFlushTimer,
  stopBufferFlushTimer,
  getBufferStatus,
  LOCATION_TTL_SECONDS
} = require('./locationCacheService');

// Proximity threshold in km for notification (Requirements: 5.4)
const PROXIMITY_THRESHOLD_KM = 1.0;

// ETA change threshold in minutes for notification (Requirements: 5.3)
const ETA_CHANGE_THRESHOLD_MINUTES = 5;

// Store last notified ETA per trip to detect significant changes
const lastNotifiedETA = new Map();

// Store passengers already notified for proximity per trip
const proximityNotified = new Map();

/**
 * Update trip location and broadcast to subscribers
 * Requirements: 4.4 - Real-time GPS location updates
 * Requirements: 6.3 - Store in Redis for real-time access without database writes
 * Requirements: 2.5 - Buffer location updates for batch MongoDB writes
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} locationData - Location data
 * @param {Object} locationData.coordinates - GPS coordinates {lat, lng}
 * @param {number} locationData.speed - Current speed in km/h
 * @param {string} locationData.driverId - Driver ID
 * @returns {Promise<Object>} Update result
 */
const updateTripLocation = async (tripId, locationData) => {
  const { coordinates, speed, driverId, heading } = locationData;

  if (!tripId) {
    throw new Error('Trip ID is required');
  }

  if (!coordinates?.lat || !coordinates?.lng) {
    throw new Error('Valid coordinates are required');
  }

  // Validate trip exists and is in progress (lightweight check)
  const trip = await Trip.findById(tripId).select('status').lean();
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  if (trip.status !== 'in_progress') {
    throw new Error('Trip is not in progress');
  }

  // Create tracking entry
  const trackingEntry = {
    tripId,
    driverId,
    coordinates: {
      lat: coordinates.lat,
      lng: coordinates.lng
    },
    timestamp: new Date(),
    speed: speed || 0,
    heading: heading || 0
  };

  // Store in Redis for real-time access (Requirements: 6.3)
  // This replaces direct MongoDB writes for real-time locations
  const cacheResult = await storeDriverLocation(driverId, {
    coordinates,
    speed,
    heading,
    tripId,
    timestamp: trackingEntry.timestamp.getTime()
  });

  // Buffer for batch MongoDB write (Requirements: 2.5)
  // Location history will be written to MongoDB every 30 seconds
  bufferLocationForMongo({
    tripId,
    driverId,
    coordinates,
    speed,
    timestamp: trackingEntry.timestamp
  });

  // Broadcast location update via WebSocket and Redis pub/sub
  // Requirements: 2.2 - Broadcast within 500ms using Redis pub/sub
  await broadcastTripLocation(tripId, {
    tripId,
    coordinates,
    speed,
    heading,
    timestamp: trackingEntry.timestamp.toISOString(),
    driverId
  });

  return {
    success: true,
    tripId,
    location: trackingEntry,
    cached: cacheResult.success,
    buffered: true
  };
};

/**
 * Calculate and broadcast ETA update
 * Requirements: 4.4 - Send ETA updates to admin dashboard
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} etaData - ETA data
 * @param {number} etaData.eta - Estimated time of arrival in minutes
 * @param {number} etaData.distance - Remaining distance in km
 * @returns {Promise<Object>} Update result
 */
const updateTripETA = async (tripId, etaData) => {
  const { eta, distance } = etaData;

  if (!tripId) {
    throw new Error('Trip ID is required');
  }

  const trip = await Trip.findById(tripId);
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  // Store ETA in trip (optional field)
  trip.currentETA = {
    minutes: eta,
    distance,
    updatedAt: new Date()
  };

  await trip.save();

  // Broadcast ETA update via WebSocket
  broadcastTripETA(tripId, {
    eta,
    distance
  });

  return {
    success: true,
    tripId,
    eta: trip.currentETA
  };
};

/**
 * Get current trip location
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Current location data
 */
const getCurrentLocation = async (tripId) => {
  const trip = await Trip.findById(tripId).select('tracking status');
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!trip.tracking || trip.tracking.length === 0) {
    return {
      tripId,
      location: null,
      status: trip.status
    };
  }

  const latestLocation = trip.tracking[trip.tracking.length - 1];

  return {
    tripId,
    location: latestLocation,
    status: trip.status,
    trackingHistoryCount: trip.tracking.length
  };
};

/**
 * Get trip tracking history
 * @param {string} tripId - Trip ID
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Object>} Tracking history
 */
const getTrackingHistory = async (tripId, limit = 50) => {
  const trip = await Trip.findById(tripId).select('tracking status source destination');
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  const history = trip.tracking || [];
  const limitedHistory = history.slice(-limit);

  return {
    tripId,
    status: trip.status,
    source: trip.source,
    destination: trip.destination,
    tracking: limitedHistory,
    totalEntries: history.length
  };
};

/**
 * Update trip status and broadcast
 * @param {string} tripId - Trip ID
 * @param {string} newStatus - New status
 * @param {Object} additionalData - Additional data to include
 * @returns {Promise<Object>} Update result
 */
const updateTripStatus = async (tripId, newStatus, additionalData = {}) => {
  const validStatuses = ['scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const trip = await Trip.findById(tripId);
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  const previousStatus = trip.status;
  trip.status = newStatus;

  // Update timestamps based on status
  if (newStatus === 'in_progress' && !trip.startedAt) {
    trip.startedAt = new Date();
  } else if (newStatus === 'completed' && !trip.completedAt) {
    trip.completedAt = new Date();
  }

  await trip.save();

  // Broadcast status change via WebSocket
  broadcastTripStatus(tripId, {
    status: newStatus,
    previousStatus,
    ...additionalData
  });

  // Start stationary detection monitoring when trip begins
  // Requirements: 8.1 - Start monitoring when trip begins
  if (newStatus === 'in_progress' && previousStatus !== 'in_progress') {
    try {
      const stationaryDetectionService = require('./stationaryDetectionService');
      await stationaryDetectionService.startMonitoring(tripId);
    } catch (error) {
      console.error(`Error starting stationary monitoring for ${tripId}:`, error.message);
    }
  }

  // Handle trip end cleanup for completed or cancelled trips
  // Requirements: 2.5, 3.4 - Auto-stop sharing when trip ends
  // Requirements: 8.1 - Stop monitoring when trip ends
  let cleanupResult = null;
  if (newStatus === 'completed' || newStatus === 'cancelled') {
    try {
      cleanupResult = await handleTripEnd(tripId);
    } catch (error) {
      console.error(`Error during trip end cleanup for ${tripId}:`, error.message);
    }
  }

  return {
    success: true,
    tripId,
    previousStatus,
    newStatus,
    updatedAt: new Date(),
    cleanup: cleanupResult
  };
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} coord1 - First coordinate {lat, lng}
 * @param {Object} coord2 - Second coordinate {lat, lng}
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg) => deg * (Math.PI / 180);

/**
 * Calculate ETA based on distance and average speed
 * Requirements: 5.3 - Calculate and broadcast ETA updates
 * 
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} speedKmh - Speed in km/h (default 30 for city traffic)
 * @returns {number} ETA in minutes
 */
const calculateETAMinutes = (distanceKm, speedKmh = 30) => {
  if (speedKmh <= 0) speedKmh = 30; // Default city speed
  return Math.ceil((distanceKm / speedKmh) * 60);
};

/**
 * Calculate ETA from current location to destination
 * Requirements: 5.3
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} currentCoords - Current coordinates {lat, lng}
 * @param {number} currentSpeed - Current speed in km/h
 * @returns {Promise<Object>} ETA calculation result
 */
const calculateTripETA = async (tripId, currentCoords, currentSpeed) => {
  const trip = await Trip.findById(tripId).select('destination source passengers');
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  const destCoords = trip.destination.coordinates;
  const distance = calculateDistance(currentCoords, destCoords);
  const eta = calculateETAMinutes(distance, currentSpeed);

  return {
    tripId,
    distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
    eta,
    calculatedAt: new Date().toISOString()
  };
};

/**
 * Check and broadcast ETA if significantly changed
 * Requirements: 5.3 - Notify passenger with updated arrival time when ETA changes significantly
 * 
 * @param {string} tripId - Trip ID
 * @param {number} newETA - New ETA in minutes
 * @param {number} distance - Distance in km
 */
const checkAndBroadcastETAChange = async (tripId, newETA, distance) => {
  const lastETA = lastNotifiedETA.get(tripId);
  
  // Broadcast if first ETA or significant change
  if (lastETA === undefined || Math.abs(newETA - lastETA) >= ETA_CHANGE_THRESHOLD_MINUTES) {
    lastNotifiedETA.set(tripId, newETA);
    
    broadcastTripETA(tripId, {
      eta: newETA,
      distance,
      significantChange: lastETA !== undefined
    });

    return true;
  }
  
  return false;
};

/**
 * Check proximity to pickup points and send notifications
 * Requirements: 5.4 - Notify when driver approaches pickup point
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} driverCoords - Driver's current coordinates
 * @returns {Promise<Array>} List of notified passengers
 */
const checkProximityNotifications = async (tripId, driverCoords) => {
  const bookings = await Booking.find({ 
    tripId, 
    status: { $in: ['confirmed', 'pending'] }
  }).select('passengerId pickupPoint');

  if (!proximityNotified.has(tripId)) {
    proximityNotified.set(tripId, new Set());
  }
  
  const notifiedSet = proximityNotified.get(tripId);
  const notifiedPassengers = [];

  for (const booking of bookings) {
    const passengerId = booking.passengerId.toString();
    
    // Skip if already notified
    if (notifiedSet.has(passengerId)) continue;

    const pickupCoords = booking.pickupPoint.coordinates;
    const distance = calculateDistance(driverCoords, pickupCoords);

    if (distance <= PROXIMITY_THRESHOLD_KM) {
      const eta = calculateETAMinutes(distance);
      
      sendProximityNotification(tripId, passengerId, {
        message: `Driver is ${distance < 0.5 ? 'very close' : 'approaching'} your pickup point`,
        distance: Math.round(distance * 1000), // Convert to meters
        eta
      });

      notifiedSet.add(passengerId);
      notifiedPassengers.push({
        passengerId,
        distance,
        eta
      });
    }
  }

  return notifiedPassengers;
};

/**
 * Process location update with ETA, proximity checks, and stationary detection
 * Requirements: 5.1, 5.2, 5.3, 5.4, 8.1
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} locationData - Location data
 * @returns {Promise<Object>} Processing result
 */
const processLocationUpdate = async (tripId, locationData) => {
  const { coordinates, speed, driverId } = locationData;

  // Update trip location
  const locationResult = await updateTripLocation(tripId, locationData);

  // Calculate and check ETA
  const etaResult = await calculateTripETA(tripId, coordinates, speed);
  const etaBroadcasted = await checkAndBroadcastETAChange(tripId, etaResult.eta, etaResult.distance);

  // Check proximity notifications
  const proximityNotifications = await checkProximityNotifications(tripId, coordinates);

  // Process stationary detection for passenger safety
  // Requirements: 8.1 - Monitor vehicle movement using GPS coordinates
  let stationaryResult = null;
  try {
    const stationaryDetectionService = require('./stationaryDetectionService');
    stationaryResult = await stationaryDetectionService.processLocationUpdate(tripId, coordinates);
  } catch (error) {
    console.error(`Stationary detection error for trip ${tripId}:`, error.message);
  }

  return {
    success: true,
    tripId,
    location: locationResult.location,
    eta: etaResult,
    etaBroadcasted,
    proximityNotifications,
    stationaryDetection: stationaryResult
  };
};

/**
 * Get tracking info for a trip including current location and ETA
 * Requirements: 5.1, 5.5
 * Requirements: 6.3 - Get driver location from Redis for real-time access
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Complete tracking info
 */
const getTrackingInfo = async (tripId) => {
  const trip = await Trip.findById(tripId)
    .populate('driver', 'name phone rating')
    .select('tracking status source destination driver currentETA');
  
  if (!trip) {
    throw new Error('Trip not found');
  }

  const currentLocation = trip.tracking && trip.tracking.length > 0 
    ? trip.tracking[trip.tracking.length - 1] 
    : null;

  // Get real-time location from Redis cache first (Requirements: 6.3)
  let realtimeLocation = await getTripLocation(tripId);
  
  // Fall back to socket memory if Redis unavailable
  if (!realtimeLocation) {
    realtimeLocation = getDriverLocation(tripId);
  }

  return {
    tripId,
    status: trip.status,
    source: trip.source,
    destination: trip.destination,
    currentLocation: realtimeLocation || currentLocation,
    eta: trip.currentETA,
    driver: trip.driver ? {
      name: trip.driver.name,
      phone: trip.driver.phone,
      rating: trip.driver.rating
    } : null,
    isLive: !!realtimeLocation,
    locationAge: realtimeLocation?.age || null
  };
};

/**
 * Clear tracking state for a completed/cancelled trip
 * @param {string} tripId - Trip ID
 */
const clearTrackingState = (tripId) => {
  lastNotifiedETA.delete(tripId);
  proximityNotified.delete(tripId);
};

// Import location sharing service for trip end cleanup
const locationSharingService = require('./locationSharingService');
const { cleanupContactTrackingRooms, notifyContactsTripEnded } = require('./socketService');

/**
 * Handle trip end - cleanup all location sharing sessions and stationary monitoring
 * Requirements: 2.5, 3.4 - Auto-stop sharing when trip ends and notify contacts
 * Requirements: 8.1 - Stop monitoring when trip ends
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Cleanup result
 */
const handleTripEnd = async (tripId) => {
  // Clear tracking state
  clearTrackingState(tripId);
  
  // Stop all location sharing sessions and get contacts to notify
  const sharingResult = await locationSharingService.stopAllSharingForTrip(tripId);
  
  // Notify contacts via WebSocket that trip has ended
  if (sharingResult.contactsToNotify && sharingResult.contactsToNotify.length > 0) {
    const contacts = sharingResult.contactsToNotify.map(c => c.contact);
    notifyContactsTripEnded(tripId, contacts);
  }
  
  // Clean up contact tracking rooms
  cleanupContactTrackingRooms(tripId);
  
  // Stop stationary detection monitoring
  // Requirements: 8.1 - Stop monitoring when trip ends
  let stationaryCleanup = null;
  try {
    const stationaryDetectionService = require('./stationaryDetectionService');
    stationaryCleanup = stationaryDetectionService.stopMonitoring(tripId);
  } catch (error) {
    console.error(`Error stopping stationary monitoring for ${tripId}:`, error.message);
  }
  
  return {
    success: true,
    tripId,
    sharingSessionsDeactivated: sharingResult.deactivatedCount,
    contactsNotified: sharingResult.contactsToNotify?.length || 0,
    stationaryMonitoringStopped: stationaryCleanup?.success || false
  };
};

// ============================================
// Share Link Functions
// Requirements: 6.2, 6.3, 6.5
// ============================================

const ShareLink = require('../models/ShareLink');

/**
 * Generate a shareable tracking link
 * Requirements: 6.2
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} userId - User creating the share link
 * @returns {Promise<Object>} Share link details
 */
const generateShareLink = async (bookingId, userId) => {
  const booking = await Booking.findById(bookingId).populate('tripId');
  
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    throw error;
  }

  const trip = booking.tripId;
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  // Check if trip is in progress
  if (trip.status !== 'in_progress') {
    const error = new Error('Share links can only be created for trips in progress');
    error.code = 'TRIP_NOT_IN_PROGRESS';
    throw error;
  }

  // Create share link that expires when trip completes (or 24 hours max)
  const shareLink = await ShareLink.createShareLink({
    bookingId: booking._id,
    tripId: trip._id,
    createdBy: userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  const baseUrl = process.env.APP_BASE_URL || 'https://hushryd.com';
  
  return {
    token: shareLink.token,
    url: `${baseUrl}/track/share/${shareLink.token}`,
    expiresAt: shareLink.expiresAt,
    tripId: trip._id
  };
};

/**
 * Get shared trip data (public, no auth required)
 * Requirements: 6.3
 * 
 * @param {string} token - Share token
 * @returns {Promise<Object>} Public trip data
 */
const getSharedTripData = async (token) => {
  const shareLink = await ShareLink.findByToken(token);
  
  if (!shareLink) {
    const error = new Error('Share link not found');
    error.code = 'LINK_NOT_FOUND';
    throw error;
  }

  if (shareLink.isExpired()) {
    const error = new Error('Share link has expired');
    error.code = 'LINK_EXPIRED';
    throw error;
  }

  // Increment access count
  await shareLink.incrementAccess();

  // Get trip with driver details
  const trip = await Trip.findById(shareLink.tripId)
    .populate({
      path: 'driver',
      select: 'userId vehicles',
      populate: {
        path: 'userId',
        select: 'name'
      }
    })
    .select('tripId status source destination tracking currentETA driver vehicle');

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  // Check if trip is completed
  if (trip.status === 'completed' || trip.status === 'cancelled') {
    return {
      status: 'completed',
      message: 'This trip has ended',
      tripId: trip.tripId
    };
  }

  // Get current location
  const currentLocation = trip.tracking && trip.tracking.length > 0
    ? trip.tracking[trip.tracking.length - 1]
    : null;

  // Get vehicle details
  let vehicleDetails = null;
  if (trip.driver?.vehicles && trip.vehicle) {
    vehicleDetails = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
  }

  return {
    status: trip.status,
    tripId: trip.tripId,
    driver: {
      name: trip.driver?.userId?.name || 'Driver'
    },
    vehicle: vehicleDetails ? {
      type: vehicleDetails.type,
      make: vehicleDetails.make,
      model: vehicleDetails.model,
      color: vehicleDetails.color,
      plateNumber: vehicleDetails.plateNumber
    } : null,
    route: {
      source: trip.source,
      destination: trip.destination
    },
    currentLocation,
    eta: trip.currentETA,
    isLive: trip.status === 'in_progress'
  };
};

/**
 * Expire all share links for a trip
 * Requirements: 6.5
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Expiration result
 */
const expireShareLinks = async (tripId) => {
  const result = await ShareLink.expireByTrip(tripId);
  return {
    tripId,
    expiredCount: result.modifiedCount
  };
};

/**
 * Revoke a specific share link
 * 
 * @param {string} token - Share token
 * @param {string} userId - User revoking (must be creator)
 * @returns {Promise<Object>} Revocation result
 */
const revokeShareLink = async (token, userId) => {
  const shareLink = await ShareLink.findByToken(token);
  
  if (!shareLink) {
    const error = new Error('Share link not found');
    error.code = 'LINK_NOT_FOUND';
    throw error;
  }

  if (shareLink.createdBy.toString() !== userId) {
    const error = new Error('Unauthorized to revoke this link');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  shareLink.isActive = false;
  await shareLink.save();

  return { success: true, message: 'Share link revoked' };
};

// ============================================
// Location Batching for MongoDB
// Requirements: 2.5 - Batch write to MongoDB every 30 seconds for history
// ============================================

/**
 * Write buffered locations to MongoDB
 * Requirements: 2.5 - Batch write to MongoDB every 30 seconds for history
 * 
 * @param {Array} locations - Array of location entries to write
 * @returns {Promise<Object>} Write result
 */
const writeLocationsToMongoDB = async (locations) => {
  if (!locations || locations.length === 0) {
    return { written: 0 };
  }

  // Group locations by tripId for efficient updates
  const locationsByTrip = {};
  for (const loc of locations) {
    if (!locationsByTrip[loc.tripId]) {
      locationsByTrip[loc.tripId] = [];
    }
    locationsByTrip[loc.tripId].push({
      coordinates: loc.coordinates,
      timestamp: loc.timestamp,
      speed: loc.speed || 0
    });
  }

  let totalWritten = 0;
  const errors = [];

  // Batch update each trip's tracking history
  for (const [tripId, tripLocations] of Object.entries(locationsByTrip)) {
    try {
      const result = await Trip.findByIdAndUpdate(
        tripId,
        {
          $push: {
            tracking: {
              $each: tripLocations,
              $slice: -100 // Keep only last 100 entries
            }
          }
        },
        { new: false }
      );

      if (result) {
        totalWritten += tripLocations.length;
      }
    } catch (error) {
      console.error(`Error writing locations for trip ${tripId}:`, error.message);
      errors.push({ tripId, error: error.message });
    }
  }

  return {
    written: totalWritten,
    trips: Object.keys(locationsByTrip).length,
    errors: errors.length > 0 ? errors : undefined
  };
};

/**
 * Initialize location batching for MongoDB writes
 * Requirements: 2.5 - Buffer location updates, batch write every 30 seconds
 * 
 * Call this during server startup to enable automatic batch writes
 */
const initializeLocationBatching = () => {
  startBufferFlushTimer(writeLocationsToMongoDB);
  console.log('✓ Location batching initialized for MongoDB writes');
};

/**
 * Stop location batching (call during server shutdown)
 */
const stopLocationBatching = async () => {
  await stopBufferFlushTimer();
  console.log('Location batching stopped');
};

/**
 * Get location buffer status
 * @returns {Object} Buffer statistics
 */
const getLocationBufferStatus = () => {
  return getBufferStatus();
};

module.exports = {
  updateTripLocation,
  updateTripETA,
  getCurrentLocation,
  getTrackingHistory,
  updateTripStatus,
  calculateDistance,
  calculateETAMinutes,
  calculateTripETA,
  checkAndBroadcastETAChange,
  checkProximityNotifications,
  processLocationUpdate,
  getTrackingInfo,
  clearTrackingState,
  handleTripEnd,
  generateShareLink,
  getSharedTripData,
  expireShareLinks,
  revokeShareLink,
  // Location batching (Requirements: 2.5, 6.3)
  initializeLocationBatching,
  stopLocationBatching,
  getLocationBufferStatus,
  writeLocationsToMongoDB,
  PROXIMITY_THRESHOLD_KM,
  ETA_CHANGE_THRESHOLD_MINUTES,
  LOCATION_TTL_SECONDS
};
