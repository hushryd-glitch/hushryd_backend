/**
 * Admin Tracking Service
 * Handles live tracking dashboard functionality for super admins
 * Requirements: 4.1, 4.3, 4.4, 4.5
 */

const Trip = require('../models/Trip');
const SOSAlert = require('../models/SOSAlert');
const Driver = require('../models/Driver');
const { getDriverLocation } = require('./socketService');

/**
 * Get all active trips with their current locations
 * Requirements: 4.1 - Display a map with all active trip locations
 * 
 * @param {Object} options - Query options
 * @param {Object} options.region - Bounding box {minLat, maxLat, minLng, maxLng}
 * @param {string} options.status - Filter by status
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @returns {Promise<Object>} Active trips with locations
 */
const getActiveTrips = async (options = {}) => {
  const { region, status, page = 1, limit = 100 } = options;
  
  // Build query for active trips
  const query = {};
  
  // Default to in_progress trips, but allow filtering
  if (status) {
    const validStatuses = ['scheduled', 'driver_assigned', 'in_progress'];
    if (validStatuses.includes(status)) {
      query.status = status;
    }
  } else {
    // Default: show all non-completed, non-cancelled trips
    query.status = { $in: ['scheduled', 'driver_assigned', 'in_progress'] };
  }
  
  const skip = (page - 1) * limit;
  
  // Get trips with driver info
  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate({
        path: 'driver',
        select: 'userId vehicles',
        populate: {
          path: 'userId',
          select: 'name phone'
        }
      })
      .populate('passengers.userId', 'name phone')
      .select('tripId status source destination scheduledAt startedAt tracking availableSeats farePerSeat driver vehicle passengers')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(query)
  ]);
  
  // Get active SOS alerts for these trips
  const tripIds = trips.map(t => t._id);
  const activeSOSAlerts = await SOSAlert.find({
    tripId: { $in: tripIds },
    status: { $in: ['active', 'acknowledged'] }
  }).select('tripId status priority createdAt').lean();
  
  // Create a map of tripId to SOS alert
  const sosAlertMap = new Map();
  for (const alert of activeSOSAlerts) {
    sosAlertMap.set(alert.tripId.toString(), alert);
  }
  
  // Enrich trips with current location and SOS status
  const enrichedTrips = trips.map(trip => {
    // Get real-time location from socket if available
    const realtimeLocation = getDriverLocation(trip._id.toString());
    
    // Get last tracked location from database
    const lastTrackedLocation = trip.tracking && trip.tracking.length > 0
      ? trip.tracking[trip.tracking.length - 1]
      : null;
    
    // Use realtime location if available, otherwise use last tracked
    const currentLocation = realtimeLocation || lastTrackedLocation;
    
    // Get SOS alert if any
    const sosAlert = sosAlertMap.get(trip._id.toString());
    
    // Get vehicle details
    let vehicleDetails = null;
    if (trip.driver?.vehicles && trip.vehicle) {
      vehicleDetails = trip.driver.vehicles.find(v => 
        v._id.toString() === trip.vehicle.toString()
      );
    }
    
    // Calculate passenger count
    const passengerCount = trip.passengers?.length || 0;
    const bookedSeats = trip.passengers?.reduce((sum, p) => sum + (p.seats || 0), 0) || 0;
    
    return {
      _id: trip._id,
      tripId: trip.tripId,
      status: trip.status,
      source: trip.source,
      destination: trip.destination,
      scheduledAt: trip.scheduledAt,
      startedAt: trip.startedAt,
      currentLocation: currentLocation ? {
        coordinates: currentLocation.coordinates,
        timestamp: currentLocation.timestamp,
        speed: currentLocation.speed || 0,
        isLive: !!realtimeLocation
      } : null,
      driver: trip.driver ? {
        _id: trip.driver._id,
        name: trip.driver.userId?.name || 'Unknown',
        phone: trip.driver.userId?.phone || null
      } : null,
      vehicle: vehicleDetails ? {
        type: vehicleDetails.type,
        make: vehicleDetails.make,
        model: vehicleDetails.model,
        color: vehicleDetails.color,
        plateNumber: vehicleDetails.plateNumber
      } : null,
      passengerCount,
      bookedSeats,
      availableSeats: trip.availableSeats,
      hasActiveSOSAlert: !!sosAlert,
      sosAlert: sosAlert ? {
        _id: sosAlert._id,
        status: sosAlert.status,
        priority: sosAlert.priority,
        createdAt: sosAlert.createdAt
      } : null
    };
  });
  
  // Apply region filter if provided (post-query filtering for simplicity)
  let filteredTrips = enrichedTrips;
  if (region && region.minLat !== undefined) {
    filteredTrips = enrichedTrips.filter(trip => {
      if (!trip.currentLocation?.coordinates) return false;
      const { lat, lng } = trip.currentLocation.coordinates;
      return lat >= region.minLat && lat <= region.maxLat &&
             lng >= region.minLng && lng <= region.maxLng;
    });
  }
  
  return {
    trips: filteredTrips,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    },
    stats: {
      totalActive: total,
      withSOSAlerts: activeSOSAlerts.length,
      inProgress: trips.filter(t => t.status === 'in_progress').length,
      scheduled: trips.filter(t => t.status === 'scheduled').length
    }
  };
};


/**
 * Get detailed trip information for admin dashboard
 * Requirements: 4.3 - Display trip details including driver, passengers, route, and ETA
 * 
 * @param {string} tripId - Trip ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Complete trip details
 */
const getTripDetails = async (tripId) => {
  if (!tripId) {
    const error = new Error('Trip ID is required');
    error.code = 'TRIP_ID_REQUIRED';
    throw error;
  }
  
  // Try to find by MongoDB ObjectId first
  let trip = null;
  const mongoose = require('mongoose');
  
  if (mongoose.Types.ObjectId.isValid(tripId)) {
    trip = await Trip.findById(tripId)
      .populate({
        path: 'driver',
        select: 'userId vehicles rating totalTrips',
        populate: {
          path: 'userId',
          select: 'name phone email'
        }
      })
      .populate('passengers.userId', 'name phone email')
      .lean();
  }
  
  // Fallback to human-readable tripId
  if (!trip) {
    trip = await Trip.findOne({ tripId })
      .populate({
        path: 'driver',
        select: 'userId vehicles rating totalTrips',
        populate: {
          path: 'userId',
          select: 'name phone email'
        }
      })
      .populate('passengers.userId', 'name phone email')
      .lean();
  }
  
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }
  
  // Get real-time location
  const realtimeLocation = getDriverLocation(trip._id.toString());
  const lastTrackedLocation = trip.tracking && trip.tracking.length > 0
    ? trip.tracking[trip.tracking.length - 1]
    : null;
  
  // Get active SOS alert if any
  const sosAlert = await SOSAlert.findOne({
    tripId: trip._id,
    status: { $in: ['active', 'acknowledged'] }
  }).populate('triggeredBy', 'name phone').lean();
  
  // Get vehicle details
  let vehicleDetails = null;
  if (trip.driver?.vehicles && trip.vehicle) {
    vehicleDetails = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
  }
  
  // Calculate ETA if trip is in progress
  let eta = null;
  if (trip.status === 'in_progress' && (realtimeLocation || lastTrackedLocation)) {
    const currentCoords = realtimeLocation?.coordinates || lastTrackedLocation?.coordinates;
    const destCoords = trip.destination.coordinates;
    
    if (currentCoords && destCoords) {
      const distance = calculateDistance(currentCoords, destCoords);
      const speed = realtimeLocation?.speed || 30; // Default 30 km/h
      const etaMinutes = Math.ceil((distance / speed) * 60);
      
      eta = {
        minutes: etaMinutes,
        distance: Math.round(distance * 100) / 100,
        calculatedAt: new Date().toISOString()
      };
    }
  }
  
  return {
    _id: trip._id,
    tripId: trip.tripId,
    status: trip.status,
    source: trip.source,
    destination: trip.destination,
    route: trip.route,
    scheduledAt: trip.scheduledAt,
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
    currentLocation: realtimeLocation || lastTrackedLocation ? {
      coordinates: (realtimeLocation || lastTrackedLocation).coordinates,
      timestamp: (realtimeLocation || lastTrackedLocation).timestamp,
      speed: (realtimeLocation || lastTrackedLocation).speed || 0,
      isLive: !!realtimeLocation
    } : null,
    eta,
    driver: trip.driver ? {
      _id: trip.driver._id,
      name: trip.driver.userId?.name || 'Unknown',
      phone: trip.driver.userId?.phone || null,
      email: trip.driver.userId?.email || null,
      rating: trip.driver.rating,
      totalTrips: trip.driver.totalTrips
    } : null,
    vehicle: vehicleDetails ? {
      type: vehicleDetails.type,
      make: vehicleDetails.make,
      model: vehicleDetails.model,
      color: vehicleDetails.color,
      plateNumber: vehicleDetails.plateNumber
    } : null,
    passengers: trip.passengers?.map(p => ({
      _id: p._id,
      userId: p.userId?._id,
      name: p.userId?.name || 'Unknown',
      phone: p.userId?.phone || null,
      email: p.userId?.email || null,
      seats: p.seats,
      pickupPoint: p.pickupPoint,
      dropPoint: p.dropPoint,
      fare: p.fare,
      paymentStatus: p.paymentStatus,
      boardedAt: p.boardedAt,
      droppedAt: p.droppedAt
    })) || [],
    fare: trip.fare,
    payment: trip.payment,
    availableSeats: trip.availableSeats,
    farePerSeat: trip.farePerSeat,
    instantBooking: trip.instantBooking,
    ladiesOnly: trip.ladiesOnly,
    trackingHistory: trip.tracking?.slice(-20) || [], // Last 20 tracking points
    hasActiveSOSAlert: !!sosAlert,
    sosAlert: sosAlert ? {
      _id: sosAlert._id,
      status: sosAlert.status,
      priority: sosAlert.priority,
      triggeredBy: {
        _id: sosAlert.triggeredBy?._id,
        name: sosAlert.triggeredBy?.name,
        phone: sosAlert.triggeredBy?.phone
      },
      location: sosAlert.location,
      createdAt: sosAlert.createdAt
    } : null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt
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
 * Filter trips by region (bounding box) and/or status
 * Requirements: 4.4 - Filter by region or status
 * 
 * @param {Object} filters - Filter criteria
 * @param {Object} filters.region - Bounding box {minLat, maxLat, minLng, maxLng}
 * @param {string|Array} filters.status - Status filter (single or array)
 * @param {number} filters.page - Page number
 * @param {number} filters.limit - Items per page
 * @returns {Promise<Object>} Filtered trips
 */
const filterTrips = async (filters = {}) => {
  const { region, status, page = 1, limit = 100 } = filters;
  
  // Build query
  const query = {};
  
  // Status filter
  if (status) {
    if (Array.isArray(status)) {
      query.status = { $in: status };
    } else {
      query.status = status;
    }
  } else {
    // Default: show active trips
    query.status = { $in: ['scheduled', 'driver_assigned', 'in_progress'] };
  }
  
  // For region filtering, we need to filter after fetching since tracking is an array
  const skip = (page - 1) * limit;
  
  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate({
        path: 'driver',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name phone'
        }
      })
      .select('tripId status source destination tracking scheduledAt startedAt')
      .sort({ scheduledAt: -1 })
      .lean(),
    Trip.countDocuments(query)
  ]);
  
  // Enrich with current location
  let enrichedTrips = trips.map(trip => {
    const realtimeLocation = getDriverLocation(trip._id.toString());
    const lastTrackedLocation = trip.tracking && trip.tracking.length > 0
      ? trip.tracking[trip.tracking.length - 1]
      : null;
    
    const currentLocation = realtimeLocation || lastTrackedLocation;
    
    return {
      _id: trip._id,
      tripId: trip.tripId,
      status: trip.status,
      source: trip.source,
      destination: trip.destination,
      scheduledAt: trip.scheduledAt,
      startedAt: trip.startedAt,
      currentLocation: currentLocation ? {
        coordinates: currentLocation.coordinates,
        timestamp: currentLocation.timestamp,
        isLive: !!realtimeLocation
      } : null,
      driver: trip.driver ? {
        name: trip.driver.userId?.name || 'Unknown',
        phone: trip.driver.userId?.phone || null
      } : null
    };
  });
  
  // Apply region filter if provided
  if (region && region.minLat !== undefined) {
    enrichedTrips = enrichedTrips.filter(trip => {
      if (!trip.currentLocation?.coordinates) return false;
      const { lat, lng } = trip.currentLocation.coordinates;
      return lat >= region.minLat && lat <= region.maxLat &&
             lng >= region.minLng && lng <= region.maxLng;
    });
  }
  
  // Apply pagination after filtering
  const paginatedTrips = enrichedTrips.slice(skip, skip + limit);
  
  return {
    trips: paginatedTrips,
    pagination: {
      page,
      limit,
      total: enrichedTrips.length,
      totalPages: Math.ceil(enrichedTrips.length / limit),
      hasNextPage: skip + limit < enrichedTrips.length,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Get trips with active SOS alerts (highlighted)
 * Requirements: 4.5 - Highlight affected trip with distinct visual indicator
 * 
 * @returns {Promise<Object>} Trips with active SOS alerts
 */
const getTripsWithSOSAlerts = async () => {
  // Get all active SOS alerts
  const activeAlerts = await SOSAlert.find({
    status: { $in: ['active', 'acknowledged'] }
  })
    .populate({
      path: 'tripId',
      populate: {
        path: 'driver',
        select: 'userId',
        populate: {
          path: 'userId',
          select: 'name phone'
        }
      }
    })
    .populate('triggeredBy', 'name phone')
    .sort({ createdAt: -1 })
    .lean();
  
  return {
    alerts: activeAlerts.map(alert => {
      const trip = alert.tripId;
      const realtimeLocation = trip ? getDriverLocation(trip._id.toString()) : null;
      
      return {
        alertId: alert._id,
        status: alert.status,
        priority: alert.priority,
        triggeredBy: {
          _id: alert.triggeredBy?._id,
          name: alert.triggeredBy?.name,
          phone: alert.triggeredBy?.phone
        },
        userType: alert.userType,
        location: alert.location,
        createdAt: alert.createdAt,
        trip: trip ? {
          _id: trip._id,
          tripId: trip.tripId,
          status: trip.status,
          source: trip.source,
          destination: trip.destination,
          currentLocation: realtimeLocation ? {
            coordinates: realtimeLocation.coordinates,
            timestamp: realtimeLocation.timestamp,
            isLive: true
          } : null,
          driver: trip.driver ? {
            name: trip.driver.userId?.name || 'Unknown',
            phone: trip.driver.userId?.phone || null
          } : null
        } : null
      };
    }),
    count: activeAlerts.length
  };
};

module.exports = {
  getActiveTrips,
  getTripDetails,
  filterTrips,
  getTripsWithSOSAlerts,
  calculateDistance
};
