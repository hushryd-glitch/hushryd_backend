/**
 * Location Sharing Service
 * Handles live location sharing for drivers and passengers
 * Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4
 */

const LocationShare = require('../models/LocationShare');
const Trip = require('../models/Trip');
const crypto = require('crypto');

// Maximum contacts allowed (Requirements: 2.2)
const MAX_CONTACTS = LocationShare.MAX_CONTACTS;

// Location update interval in milliseconds (Requirements: 2.3, 3.3)
const LOCATION_UPDATE_INTERVAL_MS = 10000;

/**
 * Start location sharing for a trip
 * Requirements: 2.1, 2.2 - Enable live location sharing with up to 5 contacts
 * 
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID (driver or passenger)
 * @param {string} userType - 'driver' or 'passenger'
 * @param {Array} contacts - Array of contacts to share with
 * @returns {Promise<Object>} Share session details
 */
const startSharing = async (tripId, userId, userType, contacts = []) => {
  // Validate trip exists
  const trip = await Trip.findById(tripId);
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  // Validate contact limit (Requirements: 2.2)
  if (contacts.length > MAX_CONTACTS) {
    const error = new Error(`Cannot share location with more than ${MAX_CONTACTS} contacts`);
    error.code = 'MAX_CONTACTS_EXCEEDED';
    throw error;
  }

  // Check for existing active session
  let session = await LocationShare.findActiveSession(tripId, userId);
  
  if (session) {
    // Update existing session with new contacts
    session.contacts = contacts.map(contact => ({
      name: contact.name,
      phone: contact.phone,
      trackingUrl: generateTrackingUrl(tripId, contact.phone),
      notifiedAt: null,
      notificationStatus: { sms: false, whatsapp: false }
    }));
    await session.save();
  } else {
    // Create new session
    session = new LocationShare({
      tripId,
      userId,
      userType,
      contacts: contacts.map(contact => ({
        name: contact.name,
        phone: contact.phone,
        trackingUrl: generateTrackingUrl(tripId, contact.phone),
        notifiedAt: null,
        notificationStatus: { sms: false, whatsapp: false }
      })),
      isActive: true,
      startedAt: new Date()
    });
    await session.save();
  }

  return {
    sessionId: session._id,
    tripId: session.tripId,
    userId: session.userId,
    userType: session.userType,
    contacts: session.contacts,
    isActive: session.isActive,
    startedAt: session.startedAt
  };
};

/**
 * Generate a unique tracking URL for a contact
 * @param {string} tripId - Trip ID
 * @param {string} phone - Contact phone number
 * @returns {string} Tracking URL
 */
const generateTrackingUrl = (tripId, phone) => {
  const token = crypto.randomBytes(16).toString('hex');
  const baseUrl = process.env.APP_BASE_URL || 'https://hushryd.com';
  return `${baseUrl}/track/share/${token}`;
};

/**
 * Update location for a sharing session
 * Requirements: 2.3, 3.3 - Broadcast GPS coordinates to contacts every 10 seconds
 * 
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @returns {Promise<Object>} Update result with contacts to notify
 */
const updateLocation = async (tripId, userId, coordinates) => {
  // Validate coordinates
  if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
    const error = new Error('Valid coordinates are required');
    error.code = 'INVALID_COORDINATES';
    throw error;
  }

  // Find active session
  const session = await LocationShare.findActiveSession(tripId, userId);
  
  if (!session) {
    const error = new Error('No active sharing session found');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  // Update last location
  session.lastLocation = {
    coordinates,
    timestamp: new Date()
  };
  await session.save();

  // Return contacts to broadcast to
  return {
    sessionId: session._id,
    tripId: session.tripId,
    contacts: session.contacts,
    location: session.lastLocation,
    contactCount: session.contacts.length
  };
};

/**
 * Stop location sharing for a session
 * Requirements: 2.5 - Auto-stop sharing when trip ends
 * 
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Stop result
 */
const stopSharing = async (tripId, userId) => {
  const session = await LocationShare.findActiveSession(tripId, userId);
  
  if (!session) {
    return {
      success: true,
      message: 'No active session to stop'
    };
  }

  await session.stopSharing();

  return {
    success: true,
    sessionId: session._id,
    tripId: session.tripId,
    contacts: session.contacts,
    endedAt: session.endedAt
  };
};

/**
 * Stop all location sharing sessions for a trip
 * Requirements: 2.5, 3.4 - Auto-stop sharing when trip ends and notify contacts
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Cleanup result with contacts to notify
 */
const stopAllSharingForTrip = async (tripId) => {
  // Get all active sessions before deactivating
  const activeSessions = await LocationShare.findActiveSessionsByTrip(tripId);
  
  // Collect all contacts that need to be notified
  const contactsToNotify = [];
  for (const session of activeSessions) {
    for (const contact of session.contacts) {
      contactsToNotify.push({
        sessionId: session._id,
        userId: session.userId,
        userType: session.userType,
        contact: {
          name: contact.name,
          phone: contact.phone
        }
      });
    }
  }

  // Deactivate all sessions
  const result = await LocationShare.deactivateByTrip(tripId);

  return {
    success: true,
    tripId,
    deactivatedCount: result.modifiedCount,
    contactsToNotify
  };
};

/**
 * Get active sharing session for a user
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Active session or null
 */
const getActiveSession = async (tripId, userId) => {
  return LocationShare.findActiveSession(tripId, userId);
};

/**
 * Get all active sessions for a trip
 * @param {string} tripId - Trip ID
 * @returns {Promise<Array>} Array of active sessions
 */
const getActiveSessionsForTrip = async (tripId) => {
  return LocationShare.findActiveSessionsByTrip(tripId);
};

/**
 * Add a contact to an existing session
 * Requirements: 2.2 - Allow selection of up to 5 emergency contacts
 * 
 * @param {string} sessionId - Session ID
 * @param {Object} contact - Contact to add {name, phone}
 * @returns {Promise<Object>} Updated session
 */
const addContact = async (sessionId, contact) => {
  const session = await LocationShare.findById(sessionId);
  
  if (!session) {
    const error = new Error('Session not found');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  if (!session.isActive) {
    const error = new Error('Session is not active');
    error.code = 'SESSION_INACTIVE';
    throw error;
  }

  // Check contact limit
  if (session.contacts.length >= MAX_CONTACTS) {
    const error = new Error(`Cannot add more than ${MAX_CONTACTS} contacts`);
    error.code = 'MAX_CONTACTS_EXCEEDED';
    throw error;
  }

  const newContact = {
    name: contact.name,
    phone: contact.phone,
    trackingUrl: generateTrackingUrl(session.tripId, contact.phone),
    notifiedAt: null,
    notificationStatus: { sms: false, whatsapp: false }
  };

  session.contacts.push(newContact);
  await session.save();

  return {
    sessionId: session._id,
    contacts: session.contacts,
    contactCount: session.contacts.length
  };
};

/**
 * Remove a contact from a session
 * @param {string} sessionId - Session ID
 * @param {string} contactPhone - Contact phone to remove
 * @returns {Promise<Object>} Updated session
 */
const removeContact = async (sessionId, contactPhone) => {
  const session = await LocationShare.findById(sessionId);
  
  if (!session) {
    const error = new Error('Session not found');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  session.contacts = session.contacts.filter(c => c.phone !== contactPhone);
  await session.save();

  return {
    sessionId: session._id,
    contacts: session.contacts,
    contactCount: session.contacts.length
  };
};

/**
 * Mark a contact as notified
 * @param {string} sessionId - Session ID
 * @param {string} contactPhone - Contact phone
 * @param {string} channel - Notification channel ('sms' or 'whatsapp')
 * @returns {Promise<Object>} Updated session
 */
const markContactNotified = async (sessionId, contactPhone, channel) => {
  const session = await LocationShare.findById(sessionId);
  
  if (!session) {
    const error = new Error('Session not found');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  const contact = session.contacts.find(c => c.phone === contactPhone);
  if (contact) {
    contact.notifiedAt = new Date();
    if (channel === 'sms' || channel === 'whatsapp') {
      contact.notificationStatus[channel] = true;
    }
    await session.save();
  }

  return {
    sessionId: session._id,
    contact
  };
};

/**
 * Validate contacts array
 * @param {Array} contacts - Contacts to validate
 * @returns {Object} Validation result
 */
const validateContacts = (contacts) => {
  if (!Array.isArray(contacts)) {
    return { valid: false, error: 'Contacts must be an array' };
  }

  if (contacts.length > MAX_CONTACTS) {
    return { 
      valid: false, 
      error: `Cannot share with more than ${MAX_CONTACTS} contacts`,
      code: 'MAX_CONTACTS_EXCEEDED'
    };
  }

  for (const contact of contacts) {
    if (!contact.name || !contact.phone) {
      return { valid: false, error: 'Each contact must have name and phone' };
    }
  }

  return { valid: true };
};

// ============================================
// Passenger Location Sharing Functions
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
// ============================================

const Booking = require('../models/Booking');
const ShareLink = require('../models/ShareLink');
const notificationService = require('./notificationService');

// Register tracking link notification templates
notificationService.templates.tracking_link_sms = {
  body: `HushRyd: {{passengerName}} is sharing their ride with you. Track their journey: {{trackingUrl}}. Trip: {{source}} to {{destination}}.`
};

notificationService.templates.tracking_link_whatsapp = {
  body: `🚗 *HushRyd Live Tracking*

{{passengerName}} is sharing their ride with you.

📍 From: {{source}}
📍 To: {{destination}}

🔗 Track their journey:
{{trackingUrl}}

Stay connected and ensure their safety! 🙏`
};

/**
 * Start passenger location sharing for a booking
 * Requirements: 3.1, 3.2 - Enable live location sharing for passengers
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger user ID
 * @param {Array} contacts - Array of emergency contacts to share with
 * @returns {Promise<Object>} Share session with tracking URLs
 */
const startPassengerSharing = async (bookingId, passengerId, contacts = []) => {
  // Validate booking exists and belongs to passenger
  const booking = await Booking.findById(bookingId).populate('tripId');
  
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    throw error;
  }

  if (booking.passengerId.toString() !== passengerId) {
    const error = new Error('Unauthorized to share this booking');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const trip = booking.tripId;
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  // Validate contact limit (Requirements: 3.2 - share with emergency contacts)
  if (contacts.length > MAX_CONTACTS) {
    const error = new Error(`Cannot share location with more than ${MAX_CONTACTS} contacts`);
    error.code = 'MAX_CONTACTS_EXCEEDED';
    throw error;
  }

  // Generate unique tracking token for this sharing session
  const trackingToken = crypto.randomBytes(16).toString('hex');
  const baseUrl = process.env.APP_BASE_URL || 'https://hushryd.com';
  const trackingUrl = `${baseUrl}/track/share/${trackingToken}`;

  // Create share link for public tracking access
  const shareLink = await ShareLink.createShareLink({
    bookingId: booking._id,
    tripId: trip._id,
    createdBy: passengerId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  });

  // Create location sharing session
  const contactsWithUrls = contacts.map(contact => ({
    name: contact.name,
    phone: contact.phone,
    trackingUrl: `${baseUrl}/track/share/${shareLink.token}`,
    notifiedAt: null,
    notificationStatus: { sms: false, whatsapp: false }
  }));

  // Check for existing active session
  let session = await LocationShare.findActiveSession(trip._id.toString(), passengerId);
  
  if (session) {
    // Update existing session with new contacts
    session.contacts = contactsWithUrls;
    await session.save();
  } else {
    // Create new session
    session = new LocationShare({
      tripId: trip._id,
      userId: passengerId,
      userType: 'passenger',
      contacts: contactsWithUrls,
      isActive: true,
      startedAt: new Date()
    });
    await session.save();
  }

  return {
    sessionId: session._id,
    bookingId: booking._id,
    tripId: trip._id,
    trackingUrl: `${baseUrl}/track/share/${shareLink.token}`,
    trackingToken: shareLink.token,
    contacts: session.contacts,
    isActive: session.isActive,
    startedAt: session.startedAt,
    expiresAt: shareLink.expiresAt
  };
};

/**
 * Generate a shareable tracking URL for a passenger booking
 * Requirements: 3.2 - Send tracking links to emergency contacts
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger user ID
 * @returns {Promise<Object>} Tracking URL details
 */
const generatePassengerTrackingUrl = async (bookingId, passengerId) => {
  const booking = await Booking.findById(bookingId).populate('tripId');
  
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    throw error;
  }

  if (booking.passengerId.toString() !== passengerId) {
    const error = new Error('Unauthorized to generate tracking URL');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const trip = booking.tripId;
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  // Create share link
  const shareLink = await ShareLink.createShareLink({
    bookingId: booking._id,
    tripId: trip._id,
    createdBy: passengerId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  const baseUrl = process.env.APP_BASE_URL || 'https://hushryd.com';

  return {
    token: shareLink.token,
    url: `${baseUrl}/track/share/${shareLink.token}`,
    bookingId: booking._id,
    tripId: trip._id,
    expiresAt: shareLink.expiresAt
  };
};

/**
 * Get tracking data for a shared link (public access)
 * Requirements: 3.5 - Display passenger location, driver details, vehicle info
 * 
 * @param {string} token - Share link token
 * @returns {Promise<Object>} Tracking data with passenger location, driver, vehicle
 */
const getPassengerTrackingData = async (token) => {
  const shareLink = await ShareLink.findByToken(token);
  
  if (!shareLink) {
    const error = new Error('Tracking link not found');
    error.code = 'LINK_NOT_FOUND';
    throw error;
  }

  if (shareLink.isExpired()) {
    const error = new Error('Tracking link has expired');
    error.code = 'LINK_EXPIRED';
    throw error;
  }

  // Increment access count
  await shareLink.incrementAccess();

  // Get booking with trip and driver details
  const booking = await Booking.findById(shareLink.bookingId)
    .populate({
      path: 'tripId',
      populate: {
        path: 'driver',
        select: 'userId vehicles rating',
        populate: {
          path: 'userId',
          select: 'name phone'
        }
      }
    })
    .populate('passengerId', 'name');

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

  // Check if trip is completed
  if (trip.status === 'completed' || trip.status === 'cancelled') {
    return {
      status: 'completed',
      message: 'This ride has ended',
      tripId: trip.tripId,
      completedAt: trip.completedAt
    };
  }

  // Get passenger's current location from location sharing session
  const session = await LocationShare.findActiveSession(trip._id.toString(), booking.passengerId._id.toString());
  const passengerLocation = session?.lastLocation || null;

  // Get driver's current location from trip tracking
  const driverLocation = trip.tracking && trip.tracking.length > 0
    ? trip.tracking[trip.tracking.length - 1]
    : null;

  // Get vehicle details
  let vehicleInfo = null;
  if (trip.driver?.vehicles && trip.vehicle) {
    const vehicle = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
    if (vehicle) {
      vehicleInfo = {
        type: vehicle.type,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        plateNumber: vehicle.registrationNumber
      };
    }
  }

  // Build response with all required fields (Requirements: 3.5)
  return {
    status: trip.status,
    tripId: trip.tripId,
    passengerName: booking.passengerId?.name || 'Passenger',
    passengerLocation: passengerLocation ? {
      coordinates: passengerLocation.coordinates,
      timestamp: passengerLocation.timestamp
    } : null,
    driverLocation: driverLocation ? {
      coordinates: driverLocation.coordinates,
      timestamp: driverLocation.timestamp
    } : null,
    driver: trip.driver?.userId ? {
      name: trip.driver.userId.name || 'Driver',
      rating: trip.driver.rating || 0
    } : null,
    vehicle: vehicleInfo,
    route: {
      source: trip.source,
      destination: trip.destination,
      pickupPoint: booking.pickupPoint,
      dropPoint: booking.dropPoint
    },
    eta: trip.currentETA || null,
    isLive: trip.status === 'in_progress'
  };
};

/**
 * Update passenger location during ride
 * Requirements: 3.3 - Update passenger position every 10 seconds
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger user ID
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @returns {Promise<Object>} Update result
 */
const updatePassengerLocation = async (bookingId, passengerId, coordinates) => {
  const booking = await Booking.findById(bookingId);
  
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    throw error;
  }

  if (booking.passengerId.toString() !== passengerId) {
    const error = new Error('Unauthorized');
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  // Update location in the sharing session
  return updateLocation(booking.tripId.toString(), passengerId, coordinates);
};

/**
 * Send tracking links to emergency contacts via SMS and WhatsApp
 * Requirements: 3.2 - Send tracking links to selected emergency contacts via SMS and WhatsApp
 * 
 * @param {string} sessionId - Location sharing session ID
 * @param {Object} tripDetails - Trip details for notification
 * @returns {Promise<Object>} Notification results
 */
const sendTrackingLinksToContacts = async (sessionId, tripDetails = {}) => {
  const session = await LocationShare.findById(sessionId);
  
  if (!session) {
    const error = new Error('Session not found');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  if (!session.isActive) {
    const error = new Error('Session is not active');
    error.code = 'SESSION_INACTIVE';
    throw error;
  }

  const results = [];
  const User = require('../models/User');
  
  // Get passenger name
  const passenger = await User.findById(session.userId);
  const passengerName = passenger?.name || 'A HushRyd passenger';

  for (const contact of session.contacts) {
    const notificationData = {
      passengerName,
      trackingUrl: contact.trackingUrl,
      source: tripDetails.source || 'Pickup location',
      destination: tripDetails.destination || 'Drop location',
      contactName: contact.name
    };

    const contactResults = {
      phone: contact.phone,
      name: contact.name,
      sms: { sent: false, error: null },
      whatsapp: { sent: false, error: null }
    };

    // Send SMS notification
    try {
      const smsResult = await notificationService.sendNotification({
        userId: session.userId,
        channel: 'sms',
        template: 'tracking_link_sms',
        recipient: contact.phone,
        data: notificationData,
        relatedEntity: {
          type: 'location_share',
          id: session._id
        },
        metadata: {
          tripId: session.tripId,
          contactPhone: contact.phone
        }
      });
      
      contactResults.sms.sent = smsResult.success;
      if (!smsResult.success) {
        contactResults.sms.error = smsResult.error || smsResult.reason;
      }
    } catch (error) {
      contactResults.sms.error = error.message;
    }

    // Send WhatsApp notification
    try {
      const whatsappResult = await notificationService.sendNotification({
        userId: session.userId,
        channel: 'whatsapp',
        template: 'tracking_link_whatsapp',
        recipient: contact.phone,
        data: notificationData,
        relatedEntity: {
          type: 'location_share',
          id: session._id
        },
        metadata: {
          tripId: session.tripId,
          contactPhone: contact.phone
        }
      });
      
      contactResults.whatsapp.sent = whatsappResult.success;
      if (!whatsappResult.success) {
        contactResults.whatsapp.error = whatsappResult.error || whatsappResult.reason;
      }
    } catch (error) {
      contactResults.whatsapp.error = error.message;
    }

    // Update contact notification status in session
    const contactIndex = session.contacts.findIndex(c => c.phone === contact.phone);
    if (contactIndex !== -1) {
      session.contacts[contactIndex].notifiedAt = new Date();
      session.contacts[contactIndex].notificationStatus = {
        sms: contactResults.sms.sent,
        whatsapp: contactResults.whatsapp.sent
      };
    }

    results.push(contactResults);
  }

  // Save updated notification status
  await session.save();

  return {
    sessionId: session._id,
    tripId: session.tripId,
    contactsNotified: results.filter(r => r.sms.sent || r.whatsapp.sent).length,
    totalContacts: session.contacts.length,
    results
  };
};

/**
 * Start passenger sharing and send tracking links to contacts
 * Requirements: 3.1, 3.2 - Combined flow for starting sharing and notifying contacts
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger user ID
 * @param {Array} contacts - Array of emergency contacts
 * @param {boolean} sendNotifications - Whether to send notifications immediately
 * @returns {Promise<Object>} Share session with notification results
 */
const startPassengerSharingWithNotifications = async (bookingId, passengerId, contacts = [], sendNotifications = true) => {
  // Start the sharing session
  const shareResult = await startPassengerSharing(bookingId, passengerId, contacts);
  
  // If no contacts or notifications disabled, return early
  if (!sendNotifications || contacts.length === 0) {
    return {
      ...shareResult,
      notificationResults: null
    };
  }

  // Get trip details for notification
  const booking = await Booking.findById(bookingId).populate('tripId');
  const tripDetails = {
    source: booking?.tripId?.source?.address || 'Pickup location',
    destination: booking?.tripId?.destination?.address || 'Drop location'
  };

  // Send tracking links to contacts
  const notificationResults = await sendTrackingLinksToContacts(
    shareResult.sessionId.toString(),
    tripDetails
  );

  return {
    ...shareResult,
    notificationResults
  };
};

module.exports = {
  startSharing,
  updateLocation,
  stopSharing,
  stopAllSharingForTrip,
  getActiveSession,
  getActiveSessionsForTrip,
  addContact,
  removeContact,
  markContactNotified,
  validateContacts,
  generateTrackingUrl,
  // Passenger sharing functions (Requirements: 3.1, 3.2, 3.3, 3.4, 3.5)
  startPassengerSharing,
  generatePassengerTrackingUrl,
  getPassengerTrackingData,
  updatePassengerLocation,
  // Notification functions (Requirements: 3.2)
  sendTrackingLinksToContacts,
  startPassengerSharingWithNotifications,
  MAX_CONTACTS,
  LOCATION_UPDATE_INTERVAL_MS
};
