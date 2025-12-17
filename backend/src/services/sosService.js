/**
 * SOS Service
 * Handles emergency alert triggering, notifications, and resolution
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5
 */

const SOSAlert = require('../models/SOSAlert');
const User = require('../models/User');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const { sendNotification, sendMultiChannel } = require('./notificationService');
const { broadcastSOSAlert, broadcastSOSUpdate, broadcastTripLocation, getIO } = require('./socketService');

// Store active SOS tracking intervals
const activeSOSTracking = new Map();

/**
 * Generate a live location link for emergency contacts
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @param {string} alertId - SOS alert ID
 * @returns {string} Live location URL
 */
const generateLocationLink = (coordinates, alertId) => {
  // In production, this would link to a real-time tracking page
  const baseUrl = process.env.APP_BASE_URL || 'https://hushryd.com';
  return `${baseUrl}/sos/track/${alertId}?lat=${coordinates.lat}&lng=${coordinates.lng}`;
};

/**
 * Identify stops from location tracking data
 * A stop is defined as staying within 50m for more than 2 minutes
 * @param {Array} trackingHistory - Array of tracking entries
 * @returns {Array} Array of identified stops
 */
const identifyStopsFromTracking = (trackingHistory) => {
  if (!trackingHistory || trackingHistory.length < 2) {
    return [];
  }

  const stops = [];
  const STOP_RADIUS_KM = 0.05; // 50 meters
  const MIN_STOP_DURATION_MS = 2 * 60 * 1000; // 2 minutes

  let stopStart = null;
  let stopLocation = null;

  for (let i = 1; i < trackingHistory.length; i++) {
    const prev = trackingHistory[i - 1];
    const curr = trackingHistory[i];

    const distance = calculateDistanceKm(
      prev.coordinates,
      curr.coordinates
    );

    if (distance <= STOP_RADIUS_KM) {
      if (!stopStart) {
        stopStart = prev.timestamp;
        stopLocation = prev.coordinates;
      }
    } else {
      if (stopStart) {
        const duration = new Date(curr.timestamp) - new Date(stopStart);
        if (duration >= MIN_STOP_DURATION_MS) {
          stops.push({
            location: {
              lat: stopLocation.lat,
              lng: stopLocation.lng
            },
            startedAt: stopStart,
            duration: Math.floor(duration / 1000) // Convert to seconds
          });
        }
        stopStart = null;
        stopLocation = null;
      }
    }
  }

  // Check if still stopped at the end
  if (stopStart && trackingHistory.length > 0) {
    const lastEntry = trackingHistory[trackingHistory.length - 1];
    const duration = new Date(lastEntry.timestamp) - new Date(stopStart);
    if (duration >= MIN_STOP_DURATION_MS) {
      stops.push({
        location: {
          lat: stopLocation.lat,
          lng: stopLocation.lng
        },
        startedAt: stopStart,
        duration: Math.floor(duration / 1000)
      });
    }
  }

  return stops;
};

/**
 * Calculate distance between two coordinates in km (Haversine formula)
 * @param {Object} coord1 - First coordinate {lat, lng}
 * @param {Object} coord2 - Second coordinate {lat, lng}
 * @returns {number} Distance in kilometers
 */
const calculateDistanceKm = (coord1, coord2) => {
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
 * Capture complete journey data for SOS alert
 * Requirements: 5.1, 5.5 - Collect route history, identify stops, include current location
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Journey details
 */
const captureJourneyData = async (tripId) => {
  const trip = await Trip.findById(tripId)
    .populate({
      path: 'driver',
      select: 'userId vehicles',
      populate: {
        path: 'userId',
        select: 'name phone'
      }
    });

  if (!trip) {
    return null;
  }

  // Get route taken from trip tracking history
  const routeTaken = (trip.tracking || []).map(entry => ({
    lat: entry.coordinates?.lat,
    lng: entry.coordinates?.lng,
    timestamp: entry.timestamp
  })).filter(entry => entry.lat && entry.lng);

  // Identify stops from tracking data
  const stops = identifyStopsFromTracking(trip.tracking || []);

  // Get driver details snapshot
  let driverSnapshot = {};
  if (trip.driver) {
    driverSnapshot = {
      userId: trip.driver.userId?._id || trip.driver.userId,
      name: trip.driver.userId?.name || 'Unknown',
      phone: trip.driver.userId?.phone || ''
    };
  }

  // Get vehicle details snapshot
  let vehicleSnapshot = {};
  if (trip.driver?.vehicles && trip.vehicle) {
    const vehicle = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
    if (vehicle) {
      vehicleSnapshot = {
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        plateNumber: vehicle.plateNumber || vehicle.registrationNumber,
        type: vehicle.type
      };
    }
  }

  // Get trip route
  const tripRoute = {
    source: {
      address: trip.source?.address || '',
      coordinates: {
        lat: trip.source?.coordinates?.lat,
        lng: trip.source?.coordinates?.lng
      }
    },
    destination: {
      address: trip.destination?.address || '',
      coordinates: {
        lat: trip.destination?.coordinates?.lat,
        lng: trip.destination?.coordinates?.lng
      }
    }
  };

  return {
    routeTaken,
    stops,
    driverSnapshot,
    vehicleSnapshot,
    tripRoute
  };
};

/**
 * Trigger an SOS alert
 * Captures GPS coordinates and timestamp immediately, creates alert record
 * Requirements: 7.1
 * 
 * @param {Object} params - SOS trigger parameters
 * @param {string} params.tripId - Trip ID
 * @param {string} params.userId - User triggering SOS
 * @param {string} params.userType - 'passenger' or 'driver'
 * @param {Object} params.location - GPS location {coordinates: {lat, lng}, address}
 * @returns {Promise<Object>} Created SOS alert
 */
const triggerSOS = async ({ tripId, userId, userType, location }) => {
  // Validate required fields
  if (!tripId) {
    const error = new Error('Trip ID is required');
    error.code = 'TRIP_ID_REQUIRED';
    throw error;
  }

  if (!userId) {
    const error = new Error('User ID is required');
    error.code = 'USER_ID_REQUIRED';
    throw error;
  }

  if (!userType || !['passenger', 'driver'].includes(userType)) {
    const error = new Error('Valid user type (passenger/driver) is required');
    error.code = 'INVALID_USER_TYPE';
    throw error;
  }

  if (!location?.coordinates?.lat || !location?.coordinates?.lng) {
    const error = new Error('GPS coordinates are required');
    error.code = 'COORDINATES_REQUIRED';
    throw error;
  }

  // Verify trip exists
  const trip = await Trip.findById(tripId);
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  // Verify user exists
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Capture journey data - Requirements: 5.1, 5.5
  const journeyData = await captureJourneyData(tripId);

  // Create SOS alert with immediate timestamp capture
  const sosAlert = new SOSAlert({
    tripId,
    triggeredBy: userId,
    userType,
    location: {
      coordinates: {
        lat: location.coordinates.lat,
        lng: location.coordinates.lng
      },
      address: location.address || ''
    },
    status: 'active',
    priority: 'critical',
    notificationsSent: {
      adminNotified: false,
      emergencyContactsNotified: false,
      customerSupportNotified: false
    },
    // Add journey details - Requirements: 5.5
    journeyDetails: journeyData ? {
      routeTaken: journeyData.routeTaken,
      stops: journeyData.stops,
      driverSnapshot: journeyData.driverSnapshot,
      vehicleSnapshot: journeyData.vehicleSnapshot,
      tripRoute: journeyData.tripRoute
    } : {},
    // Initialize continuous tracking - Requirements: 5.6
    continuousTracking: {
      isActive: true,
      lastBroadcastAt: new Date(),
      trackingHistory: [{
        coordinates: {
          lat: location.coordinates.lat,
          lng: location.coordinates.lng
        },
        timestamp: new Date()
      }]
    }
  });

  await sosAlert.save();

  return {
    alertId: sosAlert._id,
    tripId: sosAlert.tripId,
    userId: sosAlert.triggeredBy,
    status: sosAlert.status,
    location: sosAlert.location,
    createdAt: sosAlert.createdAt,
    priority: sosAlert.priority,
    hasJourneyDetails: !!journeyData
  };
};


/**
 * Notify admin dashboard about SOS alert (high-priority)
 * Requirements: 5.2, 7.2 - Ensure delivery within 5 seconds via WebSocket
 * 
 * @param {string} alertId - SOS alert ID
 * @returns {Promise<Object>} Notification result
 */
const notifyAdminDashboard = async (alertId) => {
  const alert = await SOSAlert.findById(alertId)
    .populate('tripId')
    .populate('triggeredBy', 'name phone email');

  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  // Send real-time WebSocket notification to admin dashboard
  const socketResult = broadcastSOSAlert({
    alertId: alert._id,
    tripId: alert.tripId?.tripId || alert.tripId,
    triggeredBy: {
      _id: alert.triggeredBy?._id,
      name: alert.triggeredBy?.name,
      phone: alert.triggeredBy?.phone
    },
    userType: alert.userType,
    location: alert.location,
    journeyDetails: alert.journeyDetails,
    status: alert.status,
    createdAt: alert.createdAt
  });
  
  alert.notificationsSent.adminNotified = true;
  alert.notificationsSent.notifiedAt = new Date();
  await alert.save();

  return {
    alertId: alert._id,
    adminNotified: true,
    notifiedAt: alert.notificationsSent.notifiedAt,
    socketDelivery: socketResult
  };
};

/**
 * Notify both super admin and customer support dashboards about SOS alert
 * Requirements: 5.2, 5.3 - Send alert to both dashboards within 5 seconds
 * 
 * @param {string} alertId - SOS alert ID
 * @returns {Promise<Object>} Notification results for both dashboards
 */
const notifyAllDashboards = async (alertId) => {
  const alert = await SOSAlert.findById(alertId)
    .populate('tripId')
    .populate('triggeredBy', 'name phone email');

  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  const startTime = Date.now();

  // Send real-time WebSocket notification to both dashboards
  const socketResult = broadcastSOSAlert({
    alertId: alert._id,
    tripId: alert.tripId?.tripId || alert.tripId,
    triggeredBy: {
      _id: alert.triggeredBy?._id,
      name: alert.triggeredBy?.name,
      phone: alert.triggeredBy?.phone
    },
    userType: alert.userType,
    location: alert.location,
    journeyDetails: alert.journeyDetails,
    status: alert.status,
    createdAt: alert.createdAt
  });

  const deliveryTime = Date.now() - startTime;
  
  // Update notification status
  alert.notificationsSent.adminNotified = socketResult.adminNotified;
  alert.notificationsSent.customerSupportNotified = socketResult.supportNotified;
  alert.notificationsSent.notifiedAt = new Date();
  await alert.save();

  // Log warning if delivery exceeded 5 seconds - Requirements: 5.2, 5.3
  if (deliveryTime > 5000) {
    console.warn(`SOS dashboard notification exceeded 5 seconds: ${deliveryTime}ms for alert ${alertId}`);
  }

  return {
    alertId: alert._id,
    adminNotified: socketResult.adminNotified,
    customerSupportNotified: socketResult.supportNotified,
    notifiedAt: alert.notificationsSent.notifiedAt,
    deliveryTimeMs: deliveryTime,
    withinTimeLimit: deliveryTime <= 5000,
    socketDelivery: socketResult
  };
};

/**
 * Notify emergency contacts about SOS alert
 * Requirements: 7.3
 * 
 * @param {string} alertId - SOS alert ID
 * @returns {Promise<Object>} Notification results
 */
const notifyEmergencyContacts = async (alertId) => {
  const alert = await SOSAlert.findById(alertId)
    .populate('tripId')
    .populate('triggeredBy', 'name phone email emergencyContacts');

  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  const user = alert.triggeredBy;
  const emergencyContacts = user.emergencyContacts || [];

  if (emergencyContacts.length === 0) {
    return {
      alertId: alert._id,
      contactsNotified: 0,
      results: []
    };
  }

  // Generate live location link
  const locationLink = generateLocationLink(alert.location.coordinates, alert._id);

  const notificationResults = [];

  // Send notifications to all emergency contacts
  for (const contact of emergencyContacts) {
    try {
      const result = await sendNotification({
        userId: user._id,
        channel: 'sms',
        template: 'sos_emergency_contact',
        recipient: contact.phone,
        data: {
          userName: user.name || 'A HushRyd user',
          locationLink,
          tripId: alert.tripId?.tripId || alert.tripId
        },
        relatedEntity: {
          type: 'sos_alert',
          id: alert._id
        },
        metadata: {
          contactName: contact.name,
          relationship: contact.relationship,
          priority: 'critical'
        }
      });

      notificationResults.push({
        contactName: contact.name,
        phone: contact.phone,
        success: result.success,
        error: result.error
      });
    } catch (error) {
      notificationResults.push({
        contactName: contact.name,
        phone: contact.phone,
        success: false,
        error: error.message
      });
    }
  }

  // Update alert with notification status
  alert.notificationsSent.emergencyContactsNotified = true;
  if (!alert.notificationsSent.notifiedAt) {
    alert.notificationsSent.notifiedAt = new Date();
  }
  await alert.save();

  return {
    alertId: alert._id,
    contactsNotified: notificationResults.filter(r => r.success).length,
    totalContacts: emergencyContacts.length,
    results: notificationResults
  };
};

/**
 * Get SOS alert details for admin dashboard
 * Requirements: 7.4
 * 
 * @param {string} alertId - SOS alert ID
 * @returns {Promise<Object>} Complete alert details
 */
const getAlertDetails = async (alertId) => {
  const alert = await SOSAlert.findById(alertId)
    .populate({
      path: 'tripId',
      populate: [
        { path: 'driver', select: 'userId' },
        { path: 'passengers.userId', select: 'name phone email' }
      ]
    })
    .populate('triggeredBy', 'name phone email emergencyContacts')
    .populate('acknowledgedBy', 'name email')
    .populate('resolvedBy', 'name email');

  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  return {
    _id: alert._id,
    tripId: alert.tripId?.tripId,
    tripDetails: alert.tripId ? {
      _id: alert.tripId._id,
      status: alert.tripId.status,
      source: alert.tripId.source,
      destination: alert.tripId.destination,
      driver: alert.tripId.driver,
      passengers: alert.tripId.passengers
    } : null,
    triggeredBy: {
      _id: alert.triggeredBy._id,
      name: alert.triggeredBy.name,
      phone: alert.triggeredBy.phone,
      email: alert.triggeredBy.email
    },
    userType: alert.userType,
    location: alert.location,
    status: alert.status,
    priority: alert.priority,
    acknowledgedBy: alert.acknowledgedBy,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedBy: alert.resolvedBy,
    resolvedAt: alert.resolvedAt,
    resolution: alert.resolution,
    actionsTaken: alert.actionsTaken,
    notificationsSent: alert.notificationsSent,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    // Contact options
    contactOptions: {
      userPhone: alert.triggeredBy.phone,
      userEmail: alert.triggeredBy.email,
      emergencyContacts: alert.triggeredBy.emergencyContacts || []
    }
  };
};


/**
 * Get all SOS alerts with optional filters
 * Requirements: 7.4
 * 
 * @param {Object} options - Query options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @param {string} options.status - Filter by status
 * @returns {Promise<Object>} Paginated alerts
 */
const getAlerts = async ({ page = 1, limit = 20, status } = {}) => {
  const query = {};
  
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const [alerts, total] = await Promise.all([
    SOSAlert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('tripId', 'tripId status source destination')
      .populate('triggeredBy', 'name phone email')
      .lean(),
    SOSAlert.countDocuments(query)
  ]);

  return {
    alerts: alerts.map(alert => ({
      _id: alert._id,
      tripId: alert.tripId?.tripId,
      tripObjectId: alert.tripId?._id,
      triggeredBy: {
        _id: alert.triggeredBy?._id,
        name: alert.triggeredBy?.name,
        phone: alert.triggeredBy?.phone
      },
      userType: alert.userType,
      location: alert.location,
      status: alert.status,
      priority: alert.priority,
      notificationsSent: alert.notificationsSent,
      createdAt: alert.createdAt
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Acknowledge an SOS alert
 * @param {string} alertId - SOS alert ID
 * @param {string} adminId - Admin user ID acknowledging the alert
 * @returns {Promise<Object>} Updated alert
 */
const acknowledgeAlert = async (alertId, adminId) => {
  const alert = await SOSAlert.findById(alertId);

  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  if (alert.status === 'resolved') {
    const error = new Error('Alert is already resolved');
    error.code = 'ALERT_ALREADY_RESOLVED';
    throw error;
  }

  await alert.acknowledge(adminId);

  // Broadcast status update to admin dashboard
  broadcastSOSUpdate({
    alertId: alert._id,
    status: alert.status,
    acknowledgedBy: adminId
  });

  return {
    alertId: alert._id,
    status: alert.status,
    acknowledgedBy: alert.acknowledgedBy,
    acknowledgedAt: alert.acknowledgedAt
  };
};

/**
 * Resolve an SOS alert
 * Requirements: 7.5
 * 
 * @param {string} alertId - SOS alert ID
 * @param {Object} params - Resolution parameters
 * @param {string} params.adminId - Admin user ID resolving the alert
 * @param {string} params.resolution - Resolution description
 * @param {Array<string>} params.actionsTaken - List of actions taken
 * @returns {Promise<Object>} Resolved alert with timeline
 */
const resolveAlert = async (alertId, { adminId, resolution, actionsTaken = [] }) => {
  const alert = await SOSAlert.findById(alertId)
    .populate('triggeredBy', 'name phone email')
    .populate('acknowledgedBy', 'name email');

  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  if (alert.status === 'resolved') {
    const error = new Error('Alert is already resolved');
    error.code = 'ALERT_ALREADY_RESOLVED';
    throw error;
  }

  if (!resolution || resolution.trim() === '') {
    const error = new Error('Resolution description is required');
    error.code = 'RESOLUTION_REQUIRED';
    throw error;
  }

  // Resolve the alert
  await alert.resolve(adminId, resolution, actionsTaken);

  // Stop continuous tracking - Requirements: 5.6
  await alert.stopContinuousTracking();
  
  // Stop the tracking interval if active
  const intervalId = activeSOSTracking.get(alertId);
  if (intervalId) {
    clearInterval(intervalId);
    activeSOSTracking.delete(alertId);
  }

  // Broadcast resolution to admin dashboard
  broadcastSOSUpdate({
    alertId: alert._id,
    status: 'resolved',
    resolvedBy: adminId,
    resolution
  });

  // Build timeline
  const timeline = [
    {
      event: 'triggered',
      timestamp: alert.createdAt,
      user: alert.triggeredBy?.name || 'Unknown'
    }
  ];

  if (alert.acknowledgedAt) {
    timeline.push({
      event: 'acknowledged',
      timestamp: alert.acknowledgedAt,
      user: alert.acknowledgedBy?.name || 'Admin'
    });
  }

  timeline.push({
    event: 'resolved',
    timestamp: alert.resolvedAt,
    user: adminId,
    resolution: alert.resolution,
    actionsTaken: alert.actionsTaken
  });

  return {
    alertId: alert._id,
    status: alert.status,
    resolution: alert.resolution,
    actionsTaken: alert.actionsTaken,
    resolvedBy: alert.resolvedBy,
    resolvedAt: alert.resolvedAt,
    timeline,
    // Duration from trigger to resolution
    resolutionTimeMs: alert.resolvedAt - alert.createdAt
  };
};

/**
 * Get active alerts count (for dashboard badge)
 * @returns {Promise<Object>} Active alerts count
 */
const getActiveAlertsCount = async () => {
  const [active, acknowledged] = await Promise.all([
    SOSAlert.countDocuments({ status: 'active' }),
    SOSAlert.countDocuments({ status: 'acknowledged' })
  ]);

  return {
    active,
    acknowledged,
    total: active + acknowledged
  };
};

/**
 * Start continuous SOS tracking - broadcasts location every 5 seconds
 * Requirements: 5.6 - Continue tracking and broadcasting location updates every 5 seconds until resolved
 * 
 * @param {string} alertId - SOS alert ID
 * @returns {Object} Tracking start result
 */
const startContinuousTracking = (alertId) => {
  // Check if already tracking
  if (activeSOSTracking.has(alertId)) {
    return { 
      success: true, 
      alertId, 
      message: 'Tracking already active',
      isNew: false
    };
  }

  // Start interval for continuous tracking (every 5 seconds)
  const intervalId = setInterval(async () => {
    try {
      const alert = await SOSAlert.findById(alertId);
      
      if (!alert || alert.status === 'resolved') {
        // Stop tracking if alert is resolved or not found
        stopContinuousTracking(alertId);
        return;
      }

      // Get latest location from trip tracking if available
      const tripTrackingService = require('./tripTrackingService');
      const tripLocation = await tripTrackingService.getCurrentLocation(alert.tripId);
      
      if (tripLocation?.location?.coordinates) {
        const coordinates = tripLocation.location.coordinates;
        
        // Update alert's continuous tracking
        await alert.updateContinuousTracking(coordinates);
        
        // Broadcast location update to dashboards
        broadcastSOSUpdate({
          alertId: alert._id,
          status: alert.status,
          location: {
            coordinates,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error(`Error in continuous SOS tracking for ${alertId}:`, error.message);
    }
  }, 5000); // 5 seconds interval

  activeSOSTracking.set(alertId, intervalId);

  return {
    success: true,
    alertId,
    message: 'Continuous tracking started',
    isNew: true,
    intervalMs: 5000
  };
};

/**
 * Stop continuous SOS tracking
 * @param {string} alertId - SOS alert ID
 * @returns {Object} Tracking stop result
 */
const stopContinuousTracking = (alertId) => {
  const intervalId = activeSOSTracking.get(alertId);
  
  if (intervalId) {
    clearInterval(intervalId);
    activeSOSTracking.delete(alertId);
    
    return {
      success: true,
      alertId,
      message: 'Continuous tracking stopped'
    };
  }

  return {
    success: false,
    alertId,
    message: 'No active tracking found'
  };
};

/**
 * Update SOS location during continuous tracking
 * Requirements: 5.6
 * 
 * @param {string} alertId - SOS alert ID
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @returns {Promise<Object>} Update result
 */
const updateSOSLocation = async (alertId, coordinates) => {
  const alert = await SOSAlert.findById(alertId);
  
  if (!alert) {
    const error = new Error('SOS alert not found');
    error.code = 'ALERT_NOT_FOUND';
    throw error;
  }

  if (alert.status === 'resolved') {
    const error = new Error('Cannot update location for resolved alert');
    error.code = 'ALERT_RESOLVED';
    throw error;
  }

  // Update continuous tracking
  await alert.updateContinuousTracking(coordinates);

  // Broadcast update to dashboards
  broadcastSOSUpdate({
    alertId: alert._id,
    status: alert.status,
    location: {
      coordinates,
      timestamp: new Date().toISOString()
    }
  });

  return {
    success: true,
    alertId: alert._id,
    location: coordinates,
    timestamp: new Date().toISOString()
  };
};

/**
 * Get active SOS tracking count
 * @returns {Object} Active tracking stats
 */
const getActiveTrackingStats = () => {
  return {
    activeCount: activeSOSTracking.size,
    alertIds: Array.from(activeSOSTracking.keys())
  };
};

module.exports = {
  triggerSOS,
  notifyAdminDashboard,
  notifyAllDashboards,
  notifyEmergencyContacts,
  getAlertDetails,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getActiveAlertsCount,
  generateLocationLink,
  captureJourneyData,
  identifyStopsFromTracking,
  calculateDistanceKm,
  // Continuous tracking - Requirements: 5.6
  startContinuousTracking,
  stopContinuousTracking,
  updateSOSLocation,
  getActiveTrackingStats
};
