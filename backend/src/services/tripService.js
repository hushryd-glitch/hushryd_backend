/**
 * Trip Service
 * Implements trip creation, management, and driver earnings
 * 
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6
 * 
 * Cache Integration:
 * Requirements: 6.4 - Invalidate trip cache on status change
 */

const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const bcrypt = require('bcryptjs');
const { invalidateTripCache } = require('./cacheService');
const { calculatePaymentBreakdown, PaymentStateMachine } = require('./paymentService');
const { generateOTPCode } = require('./otpService');

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Required document types for driver verification (vehicle documents only)
 * KYC is optional - not required for ride posting eligibility
 * Must match documentService.js REQUIRED_DOCUMENT_TYPES
 * 
 * Requirements: 9.1, 9.2 - Only vehicle documents required for ride posting
 */
const REQUIRED_DOCUMENT_TYPES = ['license', 'registration', 'insurance'];

/**
 * Check if driver is eligible to post rides based on document status
 * A driver is eligible if:
 * 1. They are already verified (verificationStatus === 'verified'), OR
 * 2. They have no required documents with 'rejected' status
 * Pending and approved documents are acceptable for ride posting.
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<{eligible: boolean, rejectedDocuments: Array}>}
 * - eligible: true if driver is verified or no required documents are rejected
 * - rejectedDocuments: Array of rejected documents with type and rejectionReason
 * 
 * Requirements: 2.2, 2.3, 3.1, 3.2
 */
const checkDriverDocumentEligibility = async (driverId) => {
  const mongoose = require('mongoose');
  
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate driverId format
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    error.statusCode = 400;
    throw error;
  }
  
  // Find driver with documents
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  
  // If driver is already verified, they can post rides
  if (driver.verificationStatus === 'verified') {
    return {
      eligible: true,
      rejectedDocuments: []
    };
  }
  
  // Get the latest document for each required type
  // Requirements: 4.3 - Consider only the latest version of each document type
  const latestDocumentsByType = {};
  for (const doc of driver.documents) {
    if (REQUIRED_DOCUMENT_TYPES.includes(doc.type)) {
      const existing = latestDocumentsByType[doc.type];
      if (!existing || new Date(doc.uploadedAt) > new Date(existing.uploadedAt)) {
        latestDocumentsByType[doc.type] = doc;
      }
    }
  }
  
  // Collect rejected documents with their reasons
  // Requirements: 2.3, 3.1, 3.2 - Return list of rejected documents with reasons
  const rejectedDocuments = [];
  
  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    const doc = latestDocumentsByType[docType];
    
    if (doc && doc.status === 'rejected') {
      rejectedDocuments.push({
        type: doc.type,
        status: doc.status,
        rejectionReason: doc.rejectionReason || 'No reason provided'
      });
    }
  }
  
  // Requirements: 2.2, 2.4, 3.3 - Driver is eligible if no rejected documents
  // Pending documents are OK - driver can post rides while documents are under review
  const eligible = rejectedDocuments.length === 0;
  
  return {
    eligible,
    rejectedDocuments
  };
};

/**
 * Validate trip creation data
 * Returns detailed validation errors for each missing or invalid field
 * 
 * @param {Object} tripData - Trip data to validate
 * @returns {Object} Validation result with isValid, errors array, and fieldErrors object
 * 
 * Requirements: 1.2, 1.3
 */
const validateTripData = (tripData) => {
  const errors = [];
  const fieldErrors = {};

  // Source validation - address is required, coordinates are optional
  if (!tripData.source) {
    errors.push('Source location is required');
    fieldErrors.source = 'Source location is required';
  } else if (typeof tripData.source !== 'object') {
    errors.push('Source location must be an object');
    fieldErrors.source = 'Source location must be an object';
  } else {
    if (!tripData.source.address || (typeof tripData.source.address === 'string' && tripData.source.address.trim() === '')) {
      errors.push('Source address is required');
      fieldErrors['source.address'] = 'Source address is required';
    }
  }

  // Destination validation - address is required, coordinates are optional
  if (!tripData.destination) {
    errors.push('Destination location is required');
    fieldErrors.destination = 'Destination location is required';
  } else if (typeof tripData.destination !== 'object') {
    errors.push('Destination location must be an object');
    fieldErrors.destination = 'Destination location must be an object';
  } else {
    if (!tripData.destination.address || (typeof tripData.destination.address === 'string' && tripData.destination.address.trim() === '')) {
      errors.push('Destination address is required');
      fieldErrors['destination.address'] = 'Destination address is required';
    }
  }

  // Schedule validation - scheduledAt is required
  if (tripData.scheduledAt === undefined || tripData.scheduledAt === null || tripData.scheduledAt === '') {
    errors.push('Scheduled time is required');
    fieldErrors.scheduledAt = 'Scheduled time is required';
  } else {
    const scheduledDate = new Date(tripData.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      errors.push('Invalid scheduled time format');
      fieldErrors.scheduledAt = 'Invalid scheduled time format';
    } else if (scheduledDate <= new Date()) {
      errors.push('Scheduled time must be in the future');
      fieldErrors.scheduledAt = 'Scheduled time must be in the future';
    }
  }

  // Available seats validation - required field
  if (tripData.availableSeats === undefined || tripData.availableSeats === null) {
    errors.push('Available seats is required');
    fieldErrors.availableSeats = 'Available seats is required';
  } else if (typeof tripData.availableSeats !== 'number' || !Number.isInteger(tripData.availableSeats)) {
    errors.push('Available seats must be an integer');
    fieldErrors.availableSeats = 'Available seats must be an integer';
  } else if (tripData.availableSeats < 1) {
    errors.push('Available seats must be at least 1');
    fieldErrors.availableSeats = 'Available seats must be at least 1';
  } else if (tripData.availableSeats > 6) {
    errors.push('Available seats cannot exceed 6');
    fieldErrors.availableSeats = 'Available seats cannot exceed 6';
  }

  // Fare per seat validation - required field
  if (tripData.farePerSeat === undefined || tripData.farePerSeat === null) {
    errors.push('Fare per seat is required');
    fieldErrors.farePerSeat = 'Fare per seat is required';
  } else if (typeof tripData.farePerSeat !== 'number') {
    errors.push('Fare per seat must be a number');
    fieldErrors.farePerSeat = 'Fare per seat must be a number';
  } else if (tripData.farePerSeat < 0) {
    errors.push('Fare per seat cannot be negative');
    fieldErrors.farePerSeat = 'Fare per seat cannot be negative';
  }

  return {
    isValid: errors.length === 0,
    errors,
    fieldErrors
  };
};


/**
 * Create a new trip
 * Design Decision: Driver must be verified to create trips
 * Rationale: Ensures only approved drivers can offer rides
 * 
 * @param {string} driverId - Driver ID
 * @param {Object} tripData - Trip details
 * @returns {Promise<Object>} Created trip
 * 
 * Requirements: 1.2, 1.3, 2.2
 */
const createTrip = async (driverId, tripData) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate trip data with detailed field-level errors
  const validation = validateTripData(tripData);
  if (!validation.isValid) {
    const error = new Error(validation.errors.join(', '));
    error.code = 'INVALID_TRIP_DATA';
    error.statusCode = 400;
    error.errors = validation.errors;
    error.fieldErrors = validation.fieldErrors;
    throw error;
  }

  // Check driver document eligibility for ride posting
  // Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3
  // A driver can post rides if they have no rejected documents
  // Pending documents are OK - driver can post while documents are under review
  const eligibility = await checkDriverDocumentEligibility(driverIdStr);
  
  if (!eligibility.eligible) {
    // Requirements: 2.3, 3.1, 3.2 - Return detailed error with rejected documents list
    const error = new Error('Cannot create trip: Some documents need attention');
    error.code = 'DOCUMENTS_NEED_ATTENTION';
    error.statusCode = 403;
    error.rejectedDocuments = eligibility.rejectedDocuments;
    throw error;
  }
  
  // Get driver for vehicle validation (driver existence already verified by checkDriverDocumentEligibility)
  const driver = await Driver.findById(driverIdStr);

  // Validate vehicle if provided (handle empty string, null, undefined, or non-string as no vehicle)
  // Vehicle is optional - trips can be created without a vehicle
  let vehicleId = null;
  
  // Check if vehicleId was provided and is valid
  if (tripData.vehicleId && typeof tripData.vehicleId === 'string' && tripData.vehicleId.trim()) {
    const providedVehicleId = tripData.vehicleId.trim();
    // Only validate if driver has vehicles
    if (driver.vehicles && driver.vehicles.length > 0) {
      const vehicle = driver.vehicles.find(v => v._id.toString() === providedVehicleId);
      if (vehicle) {
        // Found the vehicle, check if active
        if (vehicle.isActive) {
          vehicleId = providedVehicleId;
        }
        // If not active, we'll try to use another vehicle or proceed without
      }
    }
  }
  
  // If no valid vehicleId yet, try to use driver's first active vehicle
  if (!vehicleId && driver.vehicles && driver.vehicles.length > 0) {
    const activeVehicle = driver.vehicles.find(v => v.isActive);
    if (activeVehicle) {
      vehicleId = activeVehicle._id;
    } else {
      // Use first vehicle even if not active
      vehicleId = driver.vehicles[0]._id;
    }
  }
  
  // vehicleId can be null if driver has no vehicles - that's OK

  // Generate trip ID
  const tripId = await Trip.generateTripId();

  // Generate OTP for trip start
  const plainOTP = generateOTPCode();
  const hashedOTP = await bcrypt.hash(plainOTP, BCRYPT_SALT_ROUNDS);

  // Calculate fare breakdown
  const totalFare = tripData.farePerSeat * tripData.availableSeats;
  const fareBreakdown = {
    baseFare: Math.round(totalFare * 0.7),
    distanceCharge: Math.round(totalFare * 0.2),
    tollCharges: 0,
    platformFee: Math.round(totalFare * 0.08),
    taxes: Math.round(totalFare * 0.02),
    total: totalFare
  };

  // Calculate payment breakdown
  const paymentBreakdown = calculatePaymentBreakdown(totalFare);

  // Build source and destination with optional coordinates
  const source = {
    address: tripData.source.address,
    coordinates: tripData.source.coordinates || { lat: 0, lng: 0 }
  };

  const destination = {
    address: tripData.destination.address,
    coordinates: tripData.destination.coordinates || { lat: 0, lng: 0 }
  };

  // Process boarding points - Requirements: 12.3
  const boardingPoints = (tripData.boardingPoints || []).map(bp => ({
    id: bp.id || `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: bp.name,
    address: bp.address,
    coordinates: bp.coordinates || [0, 0],
    time: bp.time,
    landmark: bp.landmark || ''
  }));

  // Process dropping points - Requirements: 12.3
  const droppingPoints = (tripData.droppingPoints || []).map(dp => ({
    id: dp.id || `dp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: dp.name,
    address: dp.address,
    coordinates: dp.coordinates || [0, 0],
    time: dp.time,
    landmark: dp.landmark || ''
  }));

  // Create trip with empty passengers array (passengers book later)
  const trip = new Trip({
    tripId,
    driver: driverIdStr,
    vehicle: vehicleId,
    passengers: [],
    source,
    destination,
    stopovers: tripData.stopovers || [],
    scheduledAt: new Date(tripData.scheduledAt),
    status: 'scheduled',
    availableSeats: tripData.availableSeats,
    farePerSeat: tripData.farePerSeat,
    fare: fareBreakdown,
    payment: {
      ...paymentBreakdown,
      transactions: []
    },
    otp: hashedOTP,
    route: tripData.route || {
      distance: tripData.distance || 0,
      duration: tripData.duration || 0,
      polyline: tripData.polyline || ''
    },
    instantBooking: tripData.instantBooking || false,
    ladiesOnly: tripData.ladiesOnly || false,
    description: tripData.description || '',
    boardingPoints: boardingPoints,
    droppingPoints: droppingPoints
  });

  // Save the trip
  await trip.save();

  // Invalidate trip search cache on new trip creation - Requirements: 6.4
  await invalidateTripCache();

  return {
    success: true,
    trip: {
      _id: trip._id,
      tripId: trip.tripId,
      source: trip.source,
      destination: trip.destination,
      scheduledAt: trip.scheduledAt,
      availableSeats: tripData.availableSeats,
      farePerSeat: tripData.farePerSeat,
      fare: trip.fare,
      status: trip.status,
      vehicle: vehicleId,
      route: trip.route,
      boardingPoints: trip.boardingPoints,
      droppingPoints: trip.droppingPoints
    },
    otp: plainOTP // Return plain OTP to driver for sharing with passengers
  };
};


/**
 * Get driver's trips with filters
 * Design Decision: Support multiple filter types for flexible querying
 * 
 * @param {string} driverId - Driver ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Paginated trips
 * 
 * Requirements: 2.3
 */
const getDriverTrips = async (driverId, options = {}) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const {
    page = 1,
    limit = 20,
    status,
    startDate,
    endDate
  } = options;

  // Verify driver exists
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Build query
  const query = { driver: driverIdStr };

  // Status filter
  if (status) {
    const validStatuses = ['scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled'];
    if (validStatuses.includes(status)) {
      query.status = status;
    }
  }

  // Date range filter
  if (startDate || endDate) {
    query.scheduledAt = {};
    if (startDate) {
      query.scheduledAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.scheduledAt.$lte = new Date(endDate);
    }
  }

  const skip = (page - 1) * limit;

  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate('passengers.userId', 'name phone email')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(query)
  ]);

  // Add booked seats calculation
  const tripsWithSeats = trips.map(trip => {
    const bookedSeats = trip.passengers.reduce((sum, p) => sum + p.seats, 0);
    return {
      ...trip,
      bookedSeats,
      // Use stored availableSeats, fallback to calculation for legacy trips
      availableSeats: trip.availableSeats !== undefined 
        ? trip.availableSeats 
        : Math.max(0, (trip.fare?.total / (trip.farePerSeat || 1)) - bookedSeats)
    };
  });

  return {
    success: true,
    trips: tripsWithSeats,
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
 * Regex patterns for valid trip ID formats
 * MongoDB ObjectId: 24 hexadecimal characters
 * Human-readable Trip ID: HR-YYYY-NNNNNN format
 * 
 * Requirements: 4.1, 4.2, 4.3
 */
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const TRIP_ID_REGEX = /^HR-\d{4}-\d{6}$/;

/**
 * Validate if the provided ID is a valid trip identifier format
 * @param {string} id - The trip ID to validate
 * @returns {Object} Validation result with isValid flag and idType
 * 
 * Requirements: 4.3
 */
const validateTripIdFormat = (id) => {
  // Check for null, undefined, or empty values
  if (!id || id === 'undefined' || id === 'null') {
    return { isValid: false, error: 'Trip ID is required' };
  }

  // Ensure it's a string and trim whitespace
  const tripId = String(id).trim();
  
  if (tripId.length === 0) {
    return { isValid: false, error: 'Trip ID cannot be empty' };
  }

  // Check if it matches either valid format
  const isValidObjectId = OBJECT_ID_REGEX.test(tripId);
  const isValidTripId = TRIP_ID_REGEX.test(tripId);

  if (!isValidObjectId && !isValidTripId) {
    return { 
      isValid: false, 
      error: 'Invalid trip ID format',
      idType: null
    };
  }

  return { 
    isValid: true, 
    tripId,
    idType: isValidObjectId ? 'objectId' : 'tripId'
  };
};

/**
 * Get trip by ID
 * Supports both MongoDB ObjectId and human-readable Trip ID (HR-YYYY-NNNNNN)
 * 
 * @param {string} tripId - Trip ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Trip details
 * 
 * Requirements: 4.1, 4.2, 4.3
 */
const getTripById = async (tripId) => {
  // Validate trip ID format first - Requirements: 4.3
  const validation = validateTripIdFormat(tripId);
  if (!validation.isValid) {
    const error = new Error(validation.error);
    error.code = 'INVALID_TRIP_ID';
    error.statusCode = 400;
    throw error;
  }

  let trip;

  // Try MongoDB ObjectId first - Requirements: 4.1
  if (validation.idType === 'objectId') {
    trip = await Trip.findById(validation.tripId)
      .populate('driver')
      .populate('passengers.userId', 'name phone email')
      .lean();
  }

  // Fallback to human-readable tripId - Requirements: 4.2
  if (!trip) {
    trip = await Trip.findOne({ tripId: validation.tripId })
      .populate('driver')
      .populate('passengers.userId', 'name phone email')
      .lean();
  }

  // Return 404 if trip not found by either method - Requirements: 4.3
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Calculate booked seats
  const bookedSeats = trip.passengers?.reduce((sum, p) => sum + (p.seats || 0), 0) || 0;
  
  // Add computed fields for legacy trips that don't have availableSeats stored
  if (trip.availableSeats === undefined) {
    trip.availableSeats = Math.max(0, (trip.fare?.total / (trip.farePerSeat || 1)) - bookedSeats);
  }
  
  trip.bookedSeats = bookedSeats;

  return { success: true, trip };
};


/**
 * Start a trip with OTP verification
 * Design Decision: OTP verification ensures passenger is present
 * 
 * @param {string} tripId - Trip ID
 * @param {string} driverId - Driver ID (for authorization)
 * @param {string} otp - OTP provided by passenger
 * @returns {Promise<Object>} Updated trip
 * 
 * Requirements: 2.4
 */
const startTrip = async (tripId, driverId, otp) => {
  // Find trip
  let trip = await Trip.findById(tripId);
  if (!trip) {
    trip = await Trip.findOne({ tripId });
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify driver owns this trip
  if (trip.driver.toString() !== driverId) {
    const error = new Error('Unauthorized to start this trip');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check trip status
  if (trip.status !== 'scheduled' && trip.status !== 'driver_assigned') {
    const error = new Error('Trip cannot be started in current status');
    error.code = 'INVALID_TRIP_STATUS';
    error.statusCode = 400;
    throw error;
  }

  // Verify OTP
  if (!otp) {
    const error = new Error('OTP is required to start trip');
    error.code = 'OTP_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const isValidOTP = await bcrypt.compare(otp, trip.otp);
  if (!isValidOTP) {
    const error = new Error('Invalid OTP');
    error.code = 'INVALID_OTP';
    error.statusCode = 401;
    throw error;
  }

  // Use payment state machine to handle trip start
  const updatedTrip = await PaymentStateMachine.onTripStart(trip._id);

  // Invalidate trip cache on status change - Requirements: 6.4
  await invalidateTripCache(trip._id.toString());

  return {
    success: true,
    trip: {
      _id: updatedTrip._id,
      tripId: updatedTrip.tripId,
      status: updatedTrip.status,
      startedAt: updatedTrip.startedAt
    },
    message: 'Trip started successfully'
  };
};

/**
 * Complete a trip
 * Design Decision: Triggers payment processing and vault release
 * 
 * @param {string} tripId - Trip ID
 * @param {string} driverId - Driver ID (for authorization)
 * @returns {Promise<Object>} Updated trip
 * 
 * Requirements: 2.5
 */
const completeTrip = async (tripId, driverId) => {
  // Find trip
  let trip = await Trip.findById(tripId);
  if (!trip) {
    trip = await Trip.findOne({ tripId });
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify driver owns this trip
  if (trip.driver.toString() !== driverId) {
    const error = new Error('Unauthorized to complete this trip');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check trip status
  if (trip.status !== 'in_progress') {
    const error = new Error('Trip must be in progress to complete');
    error.code = 'INVALID_TRIP_STATUS';
    error.statusCode = 400;
    throw error;
  }

  // Use payment state machine to handle trip completion
  const updatedTrip = await PaymentStateMachine.onTripComplete(trip._id);

  // Update driver total trips count
  await Driver.findByIdAndUpdate(driverId, {
    $inc: { totalTrips: 1 }
  });

  // Expire all share links for this trip (Requirements: 6.5)
  try {
    const { expireShareLinks } = require('./tripTrackingService');
    await expireShareLinks(trip._id);
  } catch (err) {
    // Log but don't fail trip completion if share link expiration fails
    console.error('Failed to expire share links for trip:', trip._id, err.message);
  }

  // Invalidate trip cache on status change - Requirements: 6.4
  await invalidateTripCache(trip._id.toString());

  return {
    success: true,
    trip: {
      _id: updatedTrip._id,
      tripId: updatedTrip.tripId,
      status: updatedTrip.status,
      completedAt: updatedTrip.completedAt,
      payment: {
        vaultStatus: updatedTrip.payment.vaultStatus,
        driverAdvance: updatedTrip.payment.driverAdvance,
        vaultAmount: updatedTrip.payment.vaultAmount
      }
    },
    message: 'Trip completed successfully. Payment processed.'
  };
};


/**
 * Get driver earnings summary and transaction history
 * Design Decision: Aggregate earnings from driver record and trip transactions
 * 
 * @param {string} driverId - Driver ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Earnings summary and transactions
 * 
 * Requirements: 2.6
 */
const getDriverEarnings = async (driverId, options = {}) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const {
    page = 1,
    limit = 20,
    startDate,
    endDate
  } = options;

  // Get driver with earnings
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Build query for completed trips
  const query = {
    driver: driverIdStr,
    status: 'completed'
  };

  if (startDate || endDate) {
    query.completedAt = {};
    if (startDate) {
      query.completedAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.completedAt.$lte = new Date(endDate);
    }
  }

  const skip = (page - 1) * limit;

  // Get completed trips with payment transactions
  const [trips, total] = await Promise.all([
    Trip.find(query)
      .select('tripId completedAt payment.driverAdvance payment.vaultAmount payment.transactions fare.total')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(query)
  ]);

  // Build transaction history from trips
  const transactions = trips.map(trip => ({
    tripId: trip.tripId,
    completedAt: trip.completedAt,
    totalFare: trip.fare?.total || 0,
    driverAdvance: trip.payment?.driverAdvance || 0,
    vaultAmount: trip.payment?.vaultAmount || 0,
    totalEarned: (trip.payment?.driverAdvance || 0) + (trip.payment?.vaultAmount || 0),
    paymentTransactions: trip.payment?.transactions || []
  }));

  // Calculate totals for the period
  const periodTotals = await Trip.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: { $add: ['$payment.driverAdvance', '$payment.vaultAmount'] } },
        totalTrips: { $sum: 1 },
        totalFare: { $sum: '$fare.total' }
      }
    }
  ]);

  const periodSummary = periodTotals[0] || { totalEarnings: 0, totalTrips: 0, totalFare: 0 };

  return {
    success: true,
    earnings: {
      total: driver.earnings.total,
      pending: driver.earnings.pending,
      vault: driver.earnings.vault,
      totalTrips: driver.totalTrips
    },
    periodSummary: {
      totalEarnings: periodSummary.totalEarnings,
      totalTrips: periodSummary.totalTrips,
      totalFare: periodSummary.totalFare
    },
    transactions,
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
 * Cancel a trip by driver
 * @param {string} tripId - Trip ID
 * @param {string} driverId - Driver ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Cancelled trip
 */
const cancelTrip = async (tripId, driverId, reason) => {
  let trip = await Trip.findById(tripId);
  if (!trip) {
    trip = await Trip.findOne({ tripId });
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify driver owns this trip
  if (trip.driver.toString() !== driverId) {
    const error = new Error('Unauthorized to cancel this trip');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check if trip can be cancelled
  if (trip.status === 'completed' || trip.status === 'cancelled') {
    const error = new Error('Trip cannot be cancelled in current status');
    error.code = 'INVALID_TRIP_STATUS';
    error.statusCode = 400;
    throw error;
  }

  // Update trip status
  const updatedTrip = await Trip.findByIdAndUpdate(
    trip._id,
    {
      status: 'cancelled',
      cancellationReason: reason || 'Cancelled by driver',
      cancelledBy: driverId
    },
    { new: true }
  );

  // Process refunds for all passengers if any have paid
  // This would trigger the refund flow in a real implementation

  // Invalidate trip cache on status change - Requirements: 6.4
  await invalidateTripCache(trip._id.toString());

  return {
    success: true,
    trip: {
      _id: updatedTrip._id,
      tripId: updatedTrip.tripId,
      status: updatedTrip.status,
      cancellationReason: updatedTrip.cancellationReason
    },
    message: 'Trip cancelled successfully'
  };
};

module.exports = {
  validateTripData,
  createTrip,
  getDriverTrips,
  getTripById,
  startTrip,
  completeTrip,
  getDriverEarnings,
  cancelTrip,
  checkDriverDocumentEligibility,
  REQUIRED_DOCUMENT_TYPES
};
