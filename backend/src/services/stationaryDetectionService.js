/**
 * Stationary Detection Service
 * Monitors vehicle movement and triggers safety checks when stationary
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

const StationaryEvent = require('../models/StationaryEvent');
const Trip = require('../models/Trip');
const Booking = require('../models/Booking');
const SupportTicket = require('../models/SupportTicket');
const { triggerSOS } = require('./sosService');
const { sendNotification } = require('./notificationService');

// Constants for stationary detection
const STATIONARY_THRESHOLD_METERS = 50; // < 50m movement
const STATIONARY_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ESCALATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for escalation
const EARTH_RADIUS_KM = 6371;

// Store monitoring state per trip
const monitoringState = new Map();

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} coord1 - First coordinate {lat, lng}
 * @param {Object} coord2 - Second coordinate {lat, lng}
 * @returns {number} Distance in meters
 */
const calculateDistanceMeters = (coord1, coord2) => {
  if (!coord1 || !coord2) return Infinity;
  
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c * 1000; // Convert to meters
};

const toRad = (deg) => deg * (Math.PI / 180);

/**
 * Start monitoring a trip for stationary detection
 * Requirements: 8.1 - Monitor vehicle movement using GPS coordinates
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Monitoring start result
 */
const startMonitoring = async (tripId) => {
  if (monitoringState.has(tripId)) {
    return {
      success: true,
      tripId,
      message: 'Monitoring already active',
      isNew: false
    };
  }

  const trip = await Trip.findById(tripId);
  if (!trip) {
    throw new Error('Trip not found');
  }

  // Initialize monitoring state
  monitoringState.set(tripId, {
    lastLocation: null,
    lastMovementTime: Date.now(),
    stationaryStartTime: null,
    activeEventId: null
  });

  return {
    success: true,
    tripId,
    message: 'Stationary monitoring started',
    isNew: true
  };
};

/**
 * Stop monitoring a trip
 * @param {string} tripId - Trip ID
 * @returns {Object} Monitoring stop result
 */
const stopMonitoring = (tripId) => {
  const state = monitoringState.get(tripId);
  
  if (state) {
    monitoringState.delete(tripId);
    return {
      success: true,
      tripId,
      message: 'Stationary monitoring stopped'
    };
  }

  return {
    success: false,
    tripId,
    message: 'No active monitoring found'
  };
};

/**
 * Check if vehicle is stationary based on location history
 * Requirements: 8.2 - Detect stationary state (< 50m movement in 15 minutes)
 * 
 * @param {Object} currentLocation - Current coordinates {lat, lng}
 * @param {Object} state - Current monitoring state
 * @returns {Object} Stationary check result
 */
const checkStationary = (currentLocation, state) => {
  const now = Date.now();
  
  if (!state.lastLocation) {
    return {
      isStationary: false,
      distance: 0,
      duration: 0
    };
  }

  const distance = calculateDistanceMeters(state.lastLocation, currentLocation);
  
  // Vehicle has moved more than threshold
  if (distance > STATIONARY_THRESHOLD_METERS) {
    return {
      isStationary: false,
      distance,
      duration: 0,
      moved: true
    };
  }

  // Vehicle is stationary - calculate duration
  const stationaryStart = state.stationaryStartTime || now;
  const duration = now - stationaryStart;

  return {
    isStationary: true,
    distance,
    duration,
    stationaryStartTime: stationaryStart,
    thresholdReached: duration >= STATIONARY_DURATION_MS
  };
};

/**
 * Process a location update for stationary detection
 * Requirements: 8.1, 8.2 - Monitor movement and detect stationary state
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @returns {Promise<Object>} Processing result
 */
const processLocationUpdate = async (tripId, coordinates) => {
  if (!coordinates?.lat || !coordinates?.lng) {
    throw new Error('Valid coordinates are required');
  }

  let state = monitoringState.get(tripId);
  
  // Auto-start monitoring if not active
  if (!state) {
    await startMonitoring(tripId);
    state = monitoringState.get(tripId);
  }

  const stationaryCheck = checkStationary(coordinates, state);
  const now = Date.now();

  // Vehicle moved - reset stationary tracking
  if (!stationaryCheck.isStationary || stationaryCheck.moved) {
    // If there was an active stationary event, resolve it
    if (state.activeEventId) {
      await resolveEventVehicleMoved(state.activeEventId);
    }

    // Update state
    state.lastLocation = coordinates;
    state.lastMovementTime = now;
    state.stationaryStartTime = null;
    state.activeEventId = null;
    monitoringState.set(tripId, state);

    return {
      tripId,
      isStationary: false,
      distance: stationaryCheck.distance,
      action: 'movement_detected'
    };
  }

  // Vehicle is stationary
  if (!state.stationaryStartTime) {
    state.stationaryStartTime = now;
  }

  // Check if threshold reached and no alert sent yet
  if (stationaryCheck.thresholdReached && !state.activeEventId) {
    // Create stationary event and send alert
    const event = await createStationaryEvent(tripId, coordinates);
    state.activeEventId = event._id.toString();
    
    // Send safety check notification
    await sendSafetyCheckNotification(tripId, event._id);
    
    monitoringState.set(tripId, state);

    return {
      tripId,
      isStationary: true,
      duration: stationaryCheck.duration,
      thresholdReached: true,
      eventId: event._id,
      action: 'alert_triggered'
    };
  }

  // Update state
  state.lastLocation = coordinates;
  monitoringState.set(tripId, state);

  return {
    tripId,
    isStationary: true,
    duration: stationaryCheck.duration,
    thresholdReached: stationaryCheck.thresholdReached,
    action: state.activeEventId ? 'monitoring_active_event' : 'monitoring'
  };
};

/**
 * Create a stationary event record
 * @param {string} tripId - Trip ID
 * @param {Object} coordinates - GPS coordinates
 * @returns {Promise<Object>} Created event
 */
const createStationaryEvent = async (tripId, coordinates) => {
  // Get passenger from booking
  const booking = await Booking.findOne({ 
    tripId, 
    status: { $in: ['confirmed', 'in_progress'] }
  }).select('passengerId');

  if (!booking) {
    throw new Error('No active booking found for trip');
  }

  const event = new StationaryEvent({
    tripId,
    passengerId: booking.passengerId,
    location: {
      coordinates: {
        lat: coordinates.lat,
        lng: coordinates.lng
      }
    },
    startedAt: new Date(),
    status: 'monitoring'
  });

  await event.save();
  return event;
};

/**
 * Send safety check push notification to passenger
 * Requirements: 8.2, 8.3 - Send notification with safety options
 * 
 * @param {string} tripId - Trip ID
 * @param {string} eventId - Stationary event ID
 * @returns {Promise<Object>} Notification result
 */
const sendSafetyCheckNotification = async (tripId, eventId) => {
  const event = await StationaryEvent.findById(eventId).populate('passengerId', 'name phone');
  
  if (!event) {
    throw new Error('Stationary event not found');
  }

  // Mark alert as sent
  await event.markAlertSent();

  // Send push notification
  // Note: In production, this would use FCM or similar push service
  const notificationResult = await sendNotification({
    userId: event.passengerId._id,
    channel: 'push',
    template: 'safety_check',
    recipient: event.passengerId._id.toString(),
    data: {
      eventId: event._id.toString(),
      tripId: tripId.toString(),
      message: 'Is everything okay?',
      options: ['Confirm Safety', 'Request Help']
    },
    relatedEntity: {
      type: 'stationary_event',
      id: event._id
    },
    metadata: {
      priority: 'high',
      requiresResponse: true
    }
  });

  // Schedule escalation check
  scheduleEscalationCheck(eventId);

  return {
    success: true,
    eventId: event._id,
    notificationSent: true,
    alertSentAt: event.alertSentAt
  };
};

/**
 * Build safety check notification content
 * Requirements: 8.3 - Include "Confirm Safety" and "Request Help" options
 * 
 * @param {string} eventId - Stationary event ID
 * @returns {Object} Notification content with options
 */
const buildSafetyCheckNotification = (eventId) => {
  return {
    title: 'Safety Check',
    body: 'Is everything okay?',
    data: {
      type: 'safety_check',
      eventId: eventId.toString()
    },
    actions: [
      {
        id: 'confirm_safe',
        title: 'Confirm Safety',
        type: 'button'
      },
      {
        id: 'request_help',
        title: 'Request Help',
        type: 'button',
        destructive: true
      }
    ]
  };
};

/**
 * Handle passenger safety response
 * Requirements: 8.4, 8.5 - Log confirmation or trigger SOS
 * 
 * @param {string} eventId - Stationary event ID
 * @param {string} response - 'safe' or 'help'
 * @returns {Promise<Object>} Response handling result
 */
const handleSafetyResponse = async (eventId, response) => {
  const event = await StationaryEvent.findById(eventId)
    .populate('tripId')
    .populate('passengerId', 'name phone');

  if (!event) {
    throw new Error('Stationary event not found');
  }

  if (event.passengerResponse?.responded) {
    return {
      success: false,
      eventId,
      message: 'Response already recorded'
    };
  }

  // Record the response
  await event.recordResponse(response);

  if (response === 'safe') {
    // Requirements: 8.4 - Log safety confirmation and continue monitoring
    return {
      success: true,
      eventId,
      response: 'safe',
      action: 'safety_confirmed',
      message: 'Safety confirmed, continuing monitoring'
    };
  }

  if (response === 'help') {
    // Requirements: 8.5 - Trigger SOS alert automatically
    const sosResult = await triggerSOSFromStationaryEvent(event);
    
    return {
      success: true,
      eventId,
      response: 'help',
      action: 'sos_triggered',
      sosAlertId: sosResult.alertId,
      message: 'SOS alert triggered'
    };
  }

  throw new Error('Invalid response type');
};

/**
 * Trigger SOS alert from stationary event
 * Requirements: 8.5 - Trigger SOS on help request
 * 
 * @param {Object} event - Stationary event
 * @returns {Promise<Object>} SOS trigger result
 */
const triggerSOSFromStationaryEvent = async (event) => {
  const sosResult = await triggerSOS({
    tripId: event.tripId._id || event.tripId,
    userId: event.passengerId._id || event.passengerId,
    userType: 'passenger',
    location: {
      coordinates: event.location.coordinates,
      address: event.location.address
    }
  });

  // Link SOS alert to stationary event
  await event.linkSOSAlert(sosResult.alertId);

  return sosResult;
};

// Store escalation timeouts
const escalationTimeouts = new Map();

/**
 * Schedule escalation check for no response
 * Requirements: 8.6 - Attempt call after 5 minutes of no response
 * 
 * @param {string} eventId - Stationary event ID
 */
const scheduleEscalationCheck = (eventId) => {
  // Clear any existing timeout
  if (escalationTimeouts.has(eventId)) {
    clearTimeout(escalationTimeouts.get(eventId));
  }

  const timeoutId = setTimeout(async () => {
    try {
      await checkAndEscalate(eventId);
    } catch (error) {
      console.error(`Escalation check failed for event ${eventId}:`, error.message);
    }
  }, ESCALATION_TIMEOUT_MS);

  escalationTimeouts.set(eventId, timeoutId);
};

/**
 * Check if escalation is needed and perform it
 * Requirements: 8.6, 8.7 - Call passenger, escalate to support if unanswered
 * 
 * @param {string} eventId - Stationary event ID
 * @returns {Promise<Object>} Escalation result
 */
const checkAndEscalate = async (eventId) => {
  const event = await StationaryEvent.findById(eventId)
    .populate('tripId')
    .populate('passengerId', 'name phone');

  if (!event) {
    return { success: false, message: 'Event not found' };
  }

  // Skip if already responded or resolved
  if (event.passengerResponse?.responded || 
      ['safe_confirmed', 'help_requested', 'escalated', 'resolved'].includes(event.status)) {
    return { success: true, message: 'No escalation needed', reason: 'already_handled' };
  }

  // Attempt to call passenger
  const callResult = await attemptPassengerCall(event);
  await event.recordCallAttempt(callResult.answered);

  if (callResult.answered) {
    return {
      success: true,
      action: 'call_answered',
      message: 'Passenger answered call'
    };
  }

  // Call not answered - escalate to customer support
  // Requirements: 8.7 - Escalate with trip details and location
  const escalationResult = await escalateToSupport(event);

  return {
    success: true,
    action: 'escalated_to_support',
    supportTicketId: escalationResult.ticketId,
    message: 'Escalated to customer support'
  };
};

/**
 * Attempt to call passenger
 * Requirements: 8.6 - Attempt call after 5 minutes of no response
 * 
 * @param {Object} event - Stationary event with populated passenger
 * @returns {Promise<Object>} Call attempt result
 */
const attemptPassengerCall = async (event) => {
  // In production, this would integrate with Twilio or similar
  // For now, we simulate the call attempt
  const twilioService = require('./twilioService');
  
  try {
    const callResult = await twilioService.makeCall(
      event.passengerId.phone,
      `This is HushRyd safety check. Your vehicle has been stationary for an extended period. Please confirm you are safe by pressing 1, or press 2 if you need help.`
    );

    return {
      attempted: true,
      answered: callResult.answered || false,
      callSid: callResult.callSid
    };
  } catch (error) {
    console.error('Call attempt failed:', error.message);
    return {
      attempted: true,
      answered: false,
      error: error.message
    };
  }
};

/**
 * Escalate to customer support
 * Requirements: 8.7 - Escalate with trip details and location
 * 
 * @param {Object} event - Stationary event
 * @returns {Promise<Object>} Escalation result
 */
const escalateToSupport = async (event) => {
  // Generate ticket ID
  const ticketId = await SupportTicket.generateTicketId();
  
  // Create support ticket with trip details
  const ticket = new SupportTicket({
    ticketId,
    category: 'safety',
    priority: 'critical',
    status: 'open',
    subject: `Safety Escalation - Stationary Vehicle Alert`,
    description: `Passenger did not respond to safety check after vehicle was stationary for 15+ minutes.`,
    userId: event.passengerId._id || event.passengerId,
    relatedTrip: event.tripId._id || event.tripId,
    relatedEntity: {
      type: 'trip',
      id: event.tripId._id || event.tripId
    },
    metadata: {
      stationaryEventId: event._id,
      location: event.location,
      stationaryDuration: event.duration,
      alertSentAt: event.alertSentAt,
      callAttempted: true,
      callAnswered: false
    }
  });

  await ticket.save();

  // Update event with escalation info
  await event.escalateToSupport(ticket._id);

  // Notify support dashboard via WebSocket
  const { broadcastSupportEscalation } = require('./socketService');
  broadcastSupportEscalation({
    ticketId: ticket._id,
    type: 'safety_escalation',
    tripId: event.tripId._id || event.tripId,
    passengerId: event.passengerId._id || event.passengerId,
    location: event.location,
    priority: 'critical'
  });

  return {
    success: true,
    ticketId: ticket._id,
    escalatedAt: new Date()
  };
};

/**
 * Resolve stationary event due to vehicle movement
 * @param {string} eventId - Stationary event ID
 * @returns {Promise<Object>} Resolution result
 */
const resolveEventVehicleMoved = async (eventId) => {
  const event = await StationaryEvent.findById(eventId);
  
  if (!event) {
    return { success: false, message: 'Event not found' };
  }

  if (['safe_confirmed', 'help_requested', 'resolved'].includes(event.status)) {
    return { success: true, message: 'Event already resolved' };
  }

  await event.resolveVehicleMoved();

  // Clear escalation timeout
  if (escalationTimeouts.has(eventId)) {
    clearTimeout(escalationTimeouts.get(eventId));
    escalationTimeouts.delete(eventId);
  }

  return {
    success: true,
    eventId,
    resolution: 'vehicle_moved'
  };
};

/**
 * Get active stationary events for a trip
 * @param {string} tripId - Trip ID
 * @returns {Promise<Array>} Active events
 */
const getActiveEventsForTrip = async (tripId) => {
  return StationaryEvent.getActiveForTrip(tripId);
};

/**
 * Get monitoring state for a trip
 * @param {string} tripId - Trip ID
 * @returns {Object|null} Monitoring state
 */
const getMonitoringState = (tripId) => {
  return monitoringState.get(tripId) || null;
};

/**
 * Get all active monitoring trips
 * @returns {Array} Array of trip IDs being monitored
 */
const getActiveMonitoringTrips = () => {
  return Array.from(monitoringState.keys());
};

/**
 * Clear all monitoring state (for testing/cleanup)
 */
const clearAllMonitoring = () => {
  // Clear all escalation timeouts
  for (const timeoutId of escalationTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  escalationTimeouts.clear();
  monitoringState.clear();
};

module.exports = {
  // Core monitoring functions
  startMonitoring,
  stopMonitoring,
  processLocationUpdate,
  
  // Stationary detection
  checkStationary,
  calculateDistanceMeters,
  
  // Safety check
  sendSafetyCheckNotification,
  buildSafetyCheckNotification,
  handleSafetyResponse,
  
  // Escalation
  checkAndEscalate,
  attemptPassengerCall,
  escalateToSupport,
  scheduleEscalationCheck,
  
  // Event management
  createStationaryEvent,
  resolveEventVehicleMoved,
  getActiveEventsForTrip,
  triggerSOSFromStationaryEvent,
  
  // State management
  getMonitoringState,
  getActiveMonitoringTrips,
  clearAllMonitoring,
  
  // Constants (exported for testing)
  STATIONARY_THRESHOLD_METERS,
  STATIONARY_DURATION_MS,
  ESCALATION_TIMEOUT_MS
};
