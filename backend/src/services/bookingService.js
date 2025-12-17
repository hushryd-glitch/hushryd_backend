/**
 * Booking Service
 * Implements booking creation, seat reservation, and passenger booking management
 * 
 * Requirements: 3.4, 3.5, 3.6, 8.1, 8.3, 10.1, 10.2, 10.3, 10.4, 10.5
 */

const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const User = require('../models/User');
const { 
  getUserPriorityInfo, 
  calculateSeatHoldExpiry,
  sortByPriority 
} = require('../middleware/priorityAllocation');
const {
  validateWomenOnlyBooking,
  canUserBookWomenOnlyRide
} = require('./womenOnlyRideService');

/**
 * Validate booking data
 * @param {Object} bookingData - Booking data to validate
 * @returns {Object} Validation result with isValid and errors
 */
const validateBookingData = (bookingData) => {
  const errors = [];

  if (!bookingData.tripId) {
    errors.push('Trip ID is required');
  }

  if (!bookingData.seats || bookingData.seats < 1) {
    errors.push('At least 1 seat is required');
  } else if (bookingData.seats > 6) {
    errors.push('Maximum 6 seats allowed');
  }

  // Pickup point validation
  if (!bookingData.pickupPoint) {
    errors.push('Pickup point is required');
  } else {
    if (!bookingData.pickupPoint.address) errors.push('Pickup address is required');
    if (!bookingData.pickupPoint.coordinates?.lat || !bookingData.pickupPoint.coordinates?.lng) {
      errors.push('Pickup coordinates are required');
    }
  }

  // Drop point validation
  if (!bookingData.dropPoint) {
    errors.push('Drop point is required');
  } else {
    if (!bookingData.dropPoint.address) errors.push('Drop address is required');
    if (!bookingData.dropPoint.coordinates?.lat || !bookingData.dropPoint.coordinates?.lng) {
      errors.push('Drop coordinates are required');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};


/**
 * Get available seats for a trip
 * @param {string} tripId - Trip ID
 * @returns {number} Available seats
 */
const getAvailableSeats = async (tripId) => {
  const trip = await Trip.findById(tripId);
  if (!trip) return 0;

  // Count booked seats from confirmed bookings
  const bookings = await Booking.find({
    tripId,
    status: { $in: ['pending', 'confirmed'] }
  });

  const bookedSeats = bookings.reduce((sum, b) => sum + b.seats, 0);
  
  // Use trip's availableSeats if set, otherwise default to 6
  const maxSeats = trip.availableSeats || 6;
  return Math.max(0, maxSeats - bookedSeats);
};

/**
 * Validate seat availability for booking
 * Prevents overbooking by checking requested seats against available seats
 * 
 * Requirements: 5.2, 5.5
 * - 5.2: Validate that selected seats do not exceed available seats
 * - 5.5: Display error message and prevent booking if seats exceed available
 * 
 * @param {number} requestedSeats - Number of seats requested
 * @param {number} availableSeats - Number of seats available
 * @returns {Object} Validation result with isValid, error code, and message
 */
const validateSeatAvailability = (requestedSeats, availableSeats) => {
  // Validate requestedSeats is a positive integer
  if (!Number.isInteger(requestedSeats) || requestedSeats < 1) {
    return {
      isValid: false,
      code: 'INVALID_SEAT_COUNT',
      message: 'At least 1 seat is required'
    };
  }

  // Validate maximum seats per booking (6)
  if (requestedSeats > 6) {
    return {
      isValid: false,
      code: 'MAX_SEATS_EXCEEDED',
      message: 'Maximum 6 seats allowed per booking'
    };
  }

  // Validate against available seats (prevent overbooking)
  if (requestedSeats > availableSeats) {
    return {
      isValid: false,
      code: 'INSUFFICIENT_SEATS',
      message: availableSeats === 0 
        ? 'No seats available for this trip' 
        : `Only ${availableSeats} seat${availableSeats === 1 ? '' : 's'} available`
    };
  }

  return {
    isValid: true,
    code: null,
    message: null
  };
};

/**
 * Create a new booking with seat reservation
 * Design Decision: Atomic seat reservation to prevent overbooking
 * Rationale: Uses transaction-like pattern to ensure seat availability
 * 
 * @param {string} passengerId - Passenger user ID
 * @param {Object} bookingData - Booking details
 * @returns {Promise<Object>} Created booking
 * 
 * Requirements: 3.4
 */
const createBooking = async (passengerId, bookingData) => {
  // Validate booking data
  const validation = validateBookingData(bookingData);
  if (!validation.isValid) {
    const error = new Error(validation.errors.join(', '));
    error.code = 'INVALID_BOOKING_DATA';
    error.statusCode = 400;
    throw error;
  }

  // Verify passenger exists
  const passenger = await User.findById(passengerId);
  if (!passenger) {
    const error = new Error('Passenger not found');
    error.code = 'PASSENGER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Check if passenger profile is complete (name required)
  if (!passenger.name || passenger.name.trim() === '') {
    const error = new Error('Please complete your profile before booking. Name is required.');
    error.code = 'PROFILE_INCOMPLETE';
    error.statusCode = 400;
    throw error;
  }

  // Check if passenger has at least one emergency contact
  if (!passenger.emergencyContacts || passenger.emergencyContacts.length === 0) {
    const error = new Error('Please add at least one emergency contact before booking.');
    error.code = 'EMERGENCY_CONTACT_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  // Find trip
  const trip = await Trip.findById(bookingData.tripId);
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Check trip status - only allow booking for scheduled trips
  if (trip.status !== 'scheduled' && trip.status !== 'driver_assigned') {
    const error = new Error('Trip is not available for booking');
    error.code = 'TRIP_NOT_AVAILABLE';
    error.statusCode = 400;
    throw error;
  }

  // Women-only ride validation (Requirements 10.2, 10.3, 10.4)
  // Check if this is a women-only ride and validate user eligibility
  if (trip.isWomenOnly || trip.ladiesOnly) {
    const womenOnlyCheck = canUserBookWomenOnlyRide(passenger, trip);
    if (!womenOnlyCheck.canBook) {
      const error = new Error(womenOnlyCheck.message);
      error.code = womenOnlyCheck.reason;
      error.statusCode = 403;
      if (womenOnlyCheck.redirectTo) {
        error.redirectTo = womenOnlyCheck.redirectTo;
      }
      throw error;
    }

    // Validate passenger details if provided (Requirements 10.4)
    if (bookingData.passengerDetails && bookingData.passengerDetails.length > 0) {
      const passengerValidation = validateWomenOnlyBooking(passenger, trip, bookingData.passengerDetails);
      if (!passengerValidation.isValid) {
        const firstError = passengerValidation.errors[0];
        const error = new Error(firstError.message);
        error.code = firstError.code;
        error.statusCode = 403;
        throw error;
      }
    }
  }

  // Check if passenger already has a booking for this trip
  const existingBooking = await Booking.findOne({
    tripId: bookingData.tripId,
    passengerId,
    status: { $in: ['pending', 'confirmed'] }
  });

  if (existingBooking) {
    const error = new Error('You already have a booking for this trip');
    error.code = 'DUPLICATE_BOOKING';
    error.statusCode = 400;
    throw error;
  }

  // Check seat availability (prevent overbooking) - Requirements 5.2, 5.5
  const availableSeats = await getAvailableSeats(bookingData.tripId);
  const seatValidation = validateSeatAvailability(bookingData.seats, availableSeats);
  if (!seatValidation.isValid) {
    const error = new Error(seatValidation.message);
    error.code = seatValidation.code;
    error.statusCode = 400;
    throw error;
  }

  // Calculate fare
  const farePerSeat = trip.fare.total / 6; // Approximate fare per seat
  const totalFare = Math.round(farePerSeat * bookingData.seats);

  // Generate booking ID
  const bookingId = await Booking.generateBookingId();

  // Get user's priority info for seat hold duration
  // Requirements: 8.3 - Extended seat hold for subscribers (Normal: 5 min, Silver/Gold: 10 min)
  const priorityInfo = await getUserPriorityInfo(passengerId);
  const seatHoldMinutes = priorityInfo.seatHoldMinutes;
  
  // Set expiry time based on subscription tier
  const expiresAt = new Date(Date.now() + seatHoldMinutes * 60 * 1000);

  // Create booking with passenger's PIN for ride verification (Requirements 4.4, 8.2)
  const booking = new Booking({
    bookingId,
    tripId: bookingData.tripId,
    passengerId,
    seats: bookingData.seats,
    pickupPoint: bookingData.pickupPoint,
    dropPoint: bookingData.dropPoint,
    fare: totalFare,
    status: 'pending',
    paymentStatus: 'pending',
    bookedAt: new Date(),
    expiresAt,
    passengerPIN: passenger.bookingPIN, // Copy PIN for ride start verification
    driverResponse: {
      status: 'pending'
    }
  });

  await booking.save();

  // TODO: Send notification to driver via push, SMS, and WhatsApp
  // This would be implemented with notificationService

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      tripId: booking.tripId,
      seats: booking.seats,
      pickupPoint: booking.pickupPoint,
      dropPoint: booking.dropPoint,
      fare: booking.fare,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      bookedAt: booking.bookedAt
    }
  };
};


/**
 * Get passenger's bookings with filters
 * Design Decision: Support multiple filter types for flexible querying
 * 
 * @param {string} passengerId - Passenger user ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Paginated bookings
 * 
 * Requirements: 3.6
 */
const getPassengerBookings = async (passengerId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    status,
    startDate,
    endDate
  } = options;

  // Verify passenger exists
  const passenger = await User.findById(passengerId);
  if (!passenger) {
    const error = new Error('Passenger not found');
    error.code = 'PASSENGER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Build query
  const query = { passengerId };

  // Status filter
  if (status) {
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (validStatuses.includes(status)) {
      query.status = status;
    }
  }

  // Date range filter
  if (startDate || endDate) {
    query.bookedAt = {};
    if (startDate) {
      query.bookedAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.bookedAt.$lte = new Date(endDate);
    }
  }

  const skip = (page - 1) * limit;

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate({
        path: 'tripId',
        select: 'tripId source destination scheduledAt status driver',
        populate: {
          path: 'driver',
          select: 'userId',
          populate: {
            path: 'userId',
            select: 'name phone'
          }
        }
      })
      .sort({ bookedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments(query)
  ]);

  return {
    success: true,
    bookings,
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
 * Get booking by ID
 * Returns booking details including verification code for confirmed bookings
 * 
 * @param {string} bookingId - Booking ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Booking details with verification code
 * 
 * Requirements: 7.2
 */
const getBookingById = async (bookingId) => {
  const booking = await Booking.findByBookingId(bookingId);

  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Populate trip and driver details
  await booking.populate({
    path: 'tripId',
    select: 'tripId source destination scheduledAt status driver fare otp',
    populate: {
      path: 'driver',
      select: 'userId vehicles',
      populate: {
        path: 'userId',
        select: 'name phone email'
      }
    }
  });

  await booking.populate('passengerId', 'name phone email');

  return { success: true, booking };
};


/**
 * Confirm booking after successful payment
 * Design Decision: Updates booking status and adds passenger to trip
 * Generates unique verification code for ride start verification
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} paymentId - Payment gateway transaction ID
 * @returns {Promise<Object>} Confirmed booking with verification code
 * 
 * Requirements: 3.5, 7.1, 7.2, 7.3
 */
const confirmBooking = async (bookingId, paymentId) => {
  const booking = await Booking.findByBookingId(bookingId);

  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  if (booking.status !== 'pending') {
    const error = new Error('Booking cannot be confirmed in current status');
    error.code = 'INVALID_BOOKING_STATUS';
    error.statusCode = 400;
    throw error;
  }

  if (!paymentId) {
    const error = new Error('Payment ID is required');
    error.code = 'PAYMENT_ID_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  // Generate unique verification code (Requirements 7.1)
  const verificationService = require('./verificationService');
  const codeResult = await verificationService.generateCode(bookingId);
  const verificationCode = codeResult.code;

  // Update booking status
  booking.status = 'confirmed';
  booking.paymentStatus = 'paid';
  booking.paymentId = paymentId;
  booking.verificationCode = verificationCode;
  await booking.save();

  // Add passenger to trip's passengers array
  const trip = await Trip.findById(booking.tripId);
  if (trip) {
    const passengerEntry = {
      userId: booking.passengerId,
      seats: booking.seats,
      pickupPoint: booking.pickupPoint,
      dropPoint: booking.dropPoint,
      fare: booking.fare,
      paymentStatus: 'paid'
    };

    await Trip.findByIdAndUpdate(
      booking.tripId,
      { $push: { passengers: passengerEntry } }
    );
  }

  // Generate and send invoice (Requirements 13.1, 13.2, 13.3)
  // This runs asynchronously to not block the booking confirmation response
  const invoiceService = require('./invoiceService');
  invoiceService.generateAndSendInvoice(booking.bookingId || booking._id.toString())
    .then(result => {
      if (result.success) {
        console.log(`[Booking] Invoice generated and sent for booking ${booking.bookingId}`);
      } else {
        console.error(`[Booking] Failed to generate invoice for booking ${booking.bookingId}:`, result.error);
      }
    })
    .catch(error => {
      console.error(`[Booking] Error generating invoice for booking ${booking.bookingId}:`, error.message);
    });

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      tripId: booking.tripId,
      seats: booking.seats,
      fare: booking.fare,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentId: booking.paymentId,
      verificationCode: verificationCode // Include in response (Requirements 7.2)
    },
    message: 'Booking confirmed successfully'
  };
};

/**
 * Cancel a booking
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger ID (for authorization)
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Cancelled booking
 */
const cancelBooking = async (bookingId, passengerId, reason) => {
  const booking = await Booking.findByBookingId(bookingId);

  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify passenger owns this booking
  if (booking.passengerId.toString() !== passengerId) {
    const error = new Error('Unauthorized to cancel this booking');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check if booking can be cancelled
  if (booking.status === 'completed' || booking.status === 'cancelled') {
    const error = new Error('Booking cannot be cancelled in current status');
    error.code = 'INVALID_BOOKING_STATUS';
    error.statusCode = 400;
    throw error;
  }

  // Check if trip has started
  const trip = await Trip.findById(booking.tripId);
  if (trip && trip.status === 'in_progress') {
    const error = new Error('Cannot cancel booking after trip has started');
    error.code = 'TRIP_IN_PROGRESS';
    error.statusCode = 400;
    throw error;
  }

  // Update booking status
  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  booking.cancelReason = reason || 'Cancelled by passenger';
  booking.cancelledBy = 'passenger';
  await booking.save();

  // Remove passenger from trip if booking was confirmed
  if (trip) {
    await Trip.findByIdAndUpdate(
      booking.tripId,
      { $pull: { passengers: { userId: booking.passengerId } } }
    );
  }

  // Process refund if payment was made
  let refundInfo = null;
  if (booking.paymentStatus === 'paid') {
    // In production, this would trigger actual refund via payment gateway
    booking.paymentStatus = 'refunded';
    await booking.save();
    refundInfo = {
      amount: booking.fare,
      status: 'processed'
    };
  }

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      status: booking.status,
      cancelledAt: booking.cancelledAt,
      cancelReason: booking.cancelReason
    },
    refund: refundInfo,
    message: 'Booking cancelled successfully'
  };
};

/**
 * Driver accepts a booking request
 * Updates booking status, deducts seats, notifies passenger
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} driverId - Driver ID (for authorization)
 * @returns {Promise<Object>} Accepted booking
 * 
 * Requirements: 4.3
 */
const acceptBooking = async (bookingId, driverId) => {
  const booking = await Booking.findByBookingId(bookingId);

  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Get trip to verify driver ownership
  const trip = await Trip.findById(booking.tripId).populate('driver');
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify driver owns this trip
  const tripDriverId = trip.driver?._id?.toString() || trip.driver?.toString();
  const requestDriverId = driverId?.toString ? driverId.toString() : driverId;
  if (tripDriverId !== requestDriverId) {
    const error = new Error('Unauthorized to accept this booking');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check if booking is still pending
  if (booking.driverResponse?.status !== 'pending') {
    const error = new Error('Booking has already been responded to');
    error.code = 'ALREADY_RESPONDED';
    error.statusCode = 400;
    throw error;
  }

  // Check if booking has expired
  if (booking.expiresAt && new Date() > booking.expiresAt) {
    const error = new Error('Booking request has expired');
    error.code = 'BOOKING_EXPIRED';
    error.statusCode = 400;
    throw error;
  }

  // Update booking status
  booking.status = 'confirmed';
  booking.driverResponse = {
    status: 'accepted',
    respondedAt: new Date()
  };
  await booking.save();

  // Add passenger to trip
  const passengerEntry = {
    userId: booking.passengerId,
    seats: booking.seats,
    pickupPoint: booking.pickupPoint,
    dropPoint: booking.dropPoint,
    fare: booking.fare,
    paymentStatus: booking.paymentStatus
  };

  await Trip.findByIdAndUpdate(
    booking.tripId,
    { $push: { passengers: passengerEntry } }
  );

  // Check if trip is now fully booked
  await checkTripFullyBooked(booking.tripId);

  // TODO: Send notification to passenger about acceptance

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      status: booking.status,
      driverResponse: booking.driverResponse
    },
    message: 'Booking accepted successfully'
  };
};

/**
 * Driver declines a booking request
 * Updates booking status, releases payment hold, notifies passenger
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} driverId - Driver ID (for authorization)
 * @param {string} reason - Decline reason
 * @returns {Promise<Object>} Declined booking
 * 
 * Requirements: 4.4
 */
const declineBooking = async (bookingId, driverId, reason = '') => {
  const booking = await Booking.findByBookingId(bookingId);

  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Get trip to verify driver ownership
  const trip = await Trip.findById(booking.tripId).populate('driver');
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify driver owns this trip
  const tripDriverId = trip.driver?._id?.toString() || trip.driver?.toString();
  const requestDriverId = driverId?.toString ? driverId.toString() : driverId;
  if (tripDriverId !== requestDriverId) {
    const error = new Error('Unauthorized to decline this booking');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check if booking is still pending
  if (booking.driverResponse?.status !== 'pending') {
    const error = new Error('Booking has already been responded to');
    error.code = 'ALREADY_RESPONDED';
    error.statusCode = 400;
    throw error;
  }

  // Update booking status
  booking.status = 'cancelled';
  booking.cancelledBy = 'driver';
  booking.cancelledAt = new Date();
  booking.cancelReason = reason || 'Declined by driver';
  booking.driverResponse = {
    status: 'declined',
    respondedAt: new Date(),
    declineReason: reason
  };

  // Release payment hold if exists
  if (booking.paymentStatus === 'paid') {
    booking.paymentStatus = 'refunded';
    // TODO: Trigger actual refund via payment gateway
  }

  await booking.save();

  // TODO: Send notification to passenger with alternative trips

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      status: booking.status,
      driverResponse: booking.driverResponse
    },
    message: 'Booking declined'
  };
};

/**
 * Check if trip is fully booked and update status
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<boolean>} Whether trip is fully booked
 * 
 * Requirements: 4.5, 4.6
 */
const checkTripFullyBooked = async (tripId) => {
  const trip = await Trip.findById(tripId);
  if (!trip) return false;

  // Count confirmed booking seats
  const confirmedBookings = await Booking.find({
    tripId,
    status: 'confirmed'
  });

  const bookedSeats = confirmedBookings.reduce((sum, b) => sum + b.seats, 0);
  const maxSeats = 6; // Default max seats

  if (bookedSeats >= maxSeats) {
    await Trip.findByIdAndUpdate(tripId, { status: 'fully_booked' });
    return true;
  }

  return false;
};

/**
 * Auto-decline expired booking requests
 * Should be called by a cron job
 * 
 * @returns {Promise<Object>} Results of auto-decline operation
 * 
 * Requirements: 4.7
 */
const autoDeclineExpiredBookings = async () => {
  const now = new Date();

  // Find pending bookings that have expired
  const expiredBookings = await Booking.find({
    'driverResponse.status': 'pending',
    expiresAt: { $lt: now }
  });

  const results = {
    total: expiredBookings.length,
    declined: 0,
    failed: 0
  };

  for (const booking of expiredBookings) {
    try {
      booking.status = 'cancelled';
      booking.cancelledBy = 'system';
      booking.cancelledAt = now;
      booking.cancelReason = 'Auto-declined due to timeout';
      booking.driverResponse = {
        status: 'auto_declined',
        respondedAt: now
      };

      // Release payment hold if exists
      if (booking.paymentStatus === 'paid') {
        booking.paymentStatus = 'refunded';
      }

      await booking.save();

      // TODO: Send notification to passenger

      results.declined++;
    } catch (err) {
      console.error(`Failed to auto-decline booking ${booking._id}:`, err);
      results.failed++;
    }
  }

  return results;
};

/**
 * Get pending booking requests for a driver
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Pending booking requests
 * 
 * Requirements: 4.2
 */
const getDriverBookingRequests = async (driverId) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Get all trips for this driver
  const Driver = require('../models/Driver');
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const trips = await Trip.find({ driver: driverIdStr, status: { $in: ['scheduled', 'driver_assigned'] } });
  const tripIds = trips.map(t => t._id);

  // Get pending bookings for these trips
  const pendingBookings = await Booking.find({
    tripId: { $in: tripIds },
    'driverResponse.status': 'pending',
    $or: [
      { expiresAt: { $gt: new Date() } },
      { expiresAt: null }
    ]
  })
    .populate('passengerId', 'name phone email')
    .populate('tripId', 'tripId source destination scheduledAt')
    .sort({ createdAt: -1 });

  return {
    success: true,
    bookings: pendingBookings.map(b => ({
      _id: b._id,
      bookingId: b.bookingId,
      passenger: {
        name: b.passengerId?.name,
        phone: b.passengerId?.phone
      },
      trip: {
        tripId: b.tripId?.tripId,
        source: b.tripId?.source?.address,
        destination: b.tripId?.destination?.address,
        scheduledAt: b.tripId?.scheduledAt
      },
      seats: b.seats,
      pickupPoint: b.pickupPoint,
      fare: b.fare,
      expiresAt: b.expiresAt,
      createdAt: b.createdAt
    }))
  };
};

/**
 * Validate passenger PIN for ride start verification
 * Design Decision: PIN validation is done against the booking's stored PIN
 * Rationale: Ensures the correct passenger boards the vehicle
 * 
 * Requirements: 8.2, 8.3, 8.4
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} enteredPIN - PIN entered by passenger
 * @returns {Promise<Object>} Validation result
 */
const validatePassengerPIN = async (bookingId, enteredPIN) => {
  const booking = await Booking.findByBookingId(bookingId);
  
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  
  // Check if booking is confirmed
  if (booking.status !== 'confirmed') {
    const error = new Error('Booking is not confirmed');
    error.code = 'BOOKING_NOT_CONFIRMED';
    error.statusCode = 400;
    throw error;
  }
  
  // Validate PIN format
  if (!enteredPIN || !/^\d{4}$/.test(enteredPIN)) {
    return {
      success: false,
      isValid: false,
      message: 'Invalid PIN format. PIN must be 4 digits.'
    };
  }
  
  // Compare entered PIN with stored PIN
  const isValid = booking.passengerPIN === enteredPIN;
  
  if (isValid) {
    // Mark passenger as verified
    booking.verifiedAt = new Date();
    await booking.save();
  }
  
  return {
    success: true,
    isValid,
    message: isValid ? 'PIN verified successfully' : 'Incorrect PIN. Please try again.'
  };
};

/**
 * Check if all passengers for a trip have verified their PINs
 * Design Decision: Trip can only start when all boarded passengers are verified
 * Rationale: Ensures safety and correct passenger identification
 * 
 * Requirements: 8.5
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Verification status
 */
const canStartTrip = async (tripId) => {
  // Get all confirmed bookings for this trip
  const bookings = await Booking.find({
    tripId,
    status: 'confirmed'
  });
  
  if (bookings.length === 0) {
    return {
      canStart: false,
      message: 'No confirmed bookings for this trip',
      totalPassengers: 0,
      verifiedPassengers: 0
    };
  }
  
  // Count verified passengers
  const verifiedBookings = bookings.filter(b => b.verifiedAt);
  const allVerified = verifiedBookings.length === bookings.length;
  
  return {
    canStart: allVerified,
    message: allVerified 
      ? 'All passengers verified. Trip can start.'
      : `${verifiedBookings.length} of ${bookings.length} passengers verified`,
    totalPassengers: bookings.length,
    verifiedPassengers: verifiedBookings.length,
    unverifiedBookings: bookings
      .filter(b => !b.verifiedAt)
      .map(b => ({
        bookingId: b.bookingId,
        passengerId: b.passengerId
      }))
  };
};

/**
 * Get upcoming bookings for a user sorted by departure time
 * Design Decision: Returns bookings in chronological order with "Upcoming Soon" flag
 * Rationale: Helps passengers track their upcoming rides
 * 
 * Requirements: 7.2, 7.3, 7.4
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Upcoming bookings
 */
const getUpcomingBookings = async (userId) => {
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  // Get confirmed bookings with future trips
  const bookings = await Booking.find({
    passengerId: userId,
    status: { $in: ['pending', 'confirmed'] }
  })
    .populate({
      path: 'tripId',
      match: { scheduledAt: { $gte: now } },
      select: 'tripId source destination scheduledAt status driver',
      populate: {
        path: 'driver',
        select: 'userId rating',
        populate: {
          path: 'userId',
          select: 'name phone'
        }
      }
    })
    .lean();
  
  // Filter out bookings where trip didn't match (past trips)
  const upcomingBookings = bookings
    .filter(b => b.tripId)
    .map(b => {
      const departureTime = new Date(b.tripId.scheduledAt);
      const isUpcomingSoon = departureTime <= twentyFourHoursFromNow;
      
      return {
        _id: b._id,
        bookingId: b.bookingId,
        status: b.status,
        seats: b.seats,
        fare: b.fare,
        passengerPIN: b.passengerPIN,
        pickupPoint: b.pickupPoint,
        dropPoint: b.dropPoint,
        trip: {
          _id: b.tripId._id,
          tripId: b.tripId.tripId,
          source: b.tripId.source,
          destination: b.tripId.destination,
          scheduledAt: b.tripId.scheduledAt,
          status: b.tripId.status,
          driver: b.tripId.driver ? {
            name: b.tripId.driver.userId?.name,
            phone: b.tripId.driver.userId?.phone,
            rating: b.tripId.driver.rating
          } : null
        },
        isUpcomingSoon,
        departureTime
      };
    })
    // Sort by departure time ascending (chronological order)
    .sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  
  return {
    success: true,
    bookings: upcomingBookings,
    total: upcomingBookings.length
  };
};

/**
 * Allocate seats with priority ordering
 * When multiple users request the same seats, prioritize by subscription tier
 * 
 * Requirements: 8.1 - Prioritize Gold > Silver > Normal users
 * Property 13: Priority ordering
 * 
 * @param {string} tripId - Trip ID
 * @param {number} requestedSeats - Number of seats requested
 * @returns {Promise<Object>} Allocation result with prioritized pending bookings
 */
const allocateSeatsWithPriority = async (tripId, requestedSeats) => {
  // Get all pending bookings for this trip
  const pendingBookings = await Booking.find({
    tripId,
    status: 'pending',
    $or: [
      { expiresAt: { $gt: new Date() } },
      { expiresAt: null }
    ]
  }).lean();

  if (pendingBookings.length === 0) {
    return {
      hasPendingBookings: false,
      sortedBookings: [],
      totalPendingSeats: 0
    };
  }

  // Sort pending bookings by priority (Gold > Silver > Normal)
  const sortedBookings = await sortByPriority(pendingBookings);
  
  // Calculate total pending seats
  const totalPendingSeats = pendingBookings.reduce((sum, b) => sum + b.seats, 0);

  return {
    hasPendingBookings: true,
    sortedBookings,
    totalPendingSeats
  };
};

/**
 * Process pending bookings with priority allocation
 * Confirms bookings in priority order until seats are exhausted
 * 
 * Requirements: 8.1 - Gold > Silver > Normal priority
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Processing results
 */
const processPendingBookingsWithPriority = async (tripId) => {
  const trip = await Trip.findById(tripId);
  if (!trip) {
    return { success: false, error: 'Trip not found' };
  }

  // Get available seats
  const availableSeats = await getAvailableSeats(tripId);
  if (availableSeats <= 0) {
    return { 
      success: true, 
      processed: 0, 
      message: 'No seats available' 
    };
  }

  // Get pending bookings sorted by priority
  const { sortedBookings } = await allocateSeatsWithPriority(tripId, availableSeats);
  
  let remainingSeats = availableSeats;
  const results = {
    confirmed: [],
    waitlisted: [],
    processed: 0
  };

  for (const booking of sortedBookings) {
    if (booking.seats <= remainingSeats) {
      // Can allocate seats to this booking
      try {
        const bookingDoc = await Booking.findById(booking._id);
        if (bookingDoc && bookingDoc.status === 'pending') {
          // Mark as ready for confirmation (payment still needed)
          bookingDoc.driverResponse = {
            status: 'accepted',
            respondedAt: new Date()
          };
          await bookingDoc.save();
          
          remainingSeats -= booking.seats;
          results.confirmed.push({
            bookingId: booking.bookingId,
            seats: booking.seats,
            priority: booking.priorityInfo?.planId || 'normal'
          });
        }
      } catch (error) {
        console.error(`[BookingService] Error processing booking ${booking._id}:`, error.message);
      }
    } else {
      // Not enough seats - add to waitlist
      results.waitlisted.push({
        bookingId: booking.bookingId,
        seats: booking.seats,
        priority: booking.priorityInfo?.planId || 'normal'
      });
    }
    results.processed++;
  }

  return {
    success: true,
    ...results,
    remainingSeats
  };
};

/**
 * Get seat hold expiry time for a user based on subscription
 * Requirements: 8.3 - Normal: 5 minutes, Silver/Gold: 10 minutes
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Date>} Expiry timestamp
 */
const getSeatHoldExpiry = async (userId) => {
  return calculateSeatHoldExpiry(userId);
};

module.exports = {
  validateBookingData,
  validateSeatAvailability,
  getAvailableSeats,
  createBooking,
  getPassengerBookings,
  getBookingById,
  confirmBooking,
  cancelBooking,
  acceptBooking,
  declineBooking,
  checkTripFullyBooked,
  autoDeclineExpiredBookings,
  getDriverBookingRequests,
  validatePassengerPIN,
  canStartTrip,
  getUpcomingBookings,
  // Priority allocation functions (Requirements: 8.1, 8.3)
  allocateSeatsWithPriority,
  processPendingBookingsWithPriority,
  getSeatHoldExpiry
};
