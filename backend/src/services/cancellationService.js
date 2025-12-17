/**
 * Cancellation Service
 * Implements passenger and driver cancellation with refund policies
 * Integrates with subscription service for free cancellation benefits
 * 
 * Requirements: 6.1, 6.2, 7.1, 7.2, 7.3, 7.4
 */

const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const { PaymentStateMachine } = require('./paymentService');
const notificationService = require('./notificationService');
const subscriptionService = require('./subscriptionService');

/**
 * Cancellation policy configuration
 * Design Decision: Time-based refund percentages
 * Rationale: Encourages early cancellation while protecting drivers from last-minute cancellations
 */
const CANCELLATION_POLICY = {
  // Hours before trip start -> refund percentage
  FULL_REFUND_HOURS: 24,      // 100% refund if cancelled 24+ hours before
  PARTIAL_REFUND_HOURS: 6,    // 75% refund if cancelled 6-24 hours before
  MINIMAL_REFUND_HOURS: 2,    // 50% refund if cancelled 2-6 hours before
  NO_REFUND_HOURS: 0,         // 25% refund if cancelled less than 2 hours before
  
  FULL_REFUND_PERCENT: 100,
  PARTIAL_REFUND_PERCENT: 75,
  MINIMAL_REFUND_PERCENT: 50,
  LAST_MINUTE_REFUND_PERCENT: 25
};

/**
 * Calculate refund amount based on cancellation policy
 * @param {number} fare - Original fare amount
 * @param {Date} tripScheduledAt - Trip scheduled time
 * @param {Date} cancellationTime - Time of cancellation (defaults to now)
 * @returns {Object} Refund details with amount and percentage
 */
const calculateRefundAmount = (fare, tripScheduledAt, cancellationTime = new Date()) => {
  const hoursUntilTrip = (new Date(tripScheduledAt) - cancellationTime) / (1000 * 60 * 60);
  
  let refundPercent;
  let policyApplied;
  
  if (hoursUntilTrip >= CANCELLATION_POLICY.FULL_REFUND_HOURS) {
    refundPercent = CANCELLATION_POLICY.FULL_REFUND_PERCENT;
    policyApplied = 'full_refund';
  } else if (hoursUntilTrip >= CANCELLATION_POLICY.PARTIAL_REFUND_HOURS) {
    refundPercent = CANCELLATION_POLICY.PARTIAL_REFUND_PERCENT;
    policyApplied = 'partial_refund';
  } else if (hoursUntilTrip >= CANCELLATION_POLICY.MINIMAL_REFUND_HOURS) {
    refundPercent = CANCELLATION_POLICY.MINIMAL_REFUND_PERCENT;
    policyApplied = 'minimal_refund';
  } else {
    refundPercent = CANCELLATION_POLICY.LAST_MINUTE_REFUND_PERCENT;
    policyApplied = 'last_minute';
  }
  
  const refundAmount = Math.round(fare * (refundPercent / 100));
  
  return {
    originalFare: fare,
    refundAmount,
    refundPercent,
    policyApplied,
    hoursUntilTrip: Math.max(0, hoursUntilTrip)
  };
};

/**
 * Check if user can use free cancellation benefit
 * Requirements: 7.1, 7.2, 7.3, 7.4
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Free cancellation eligibility details
 */
const checkFreeCancellationEligibility = async (userId) => {
  try {
    const benefits = await subscriptionService.getRemainingBenefits(userId);
    
    return {
      eligible: benefits.freeCancellationsRemaining > 0,
      planId: benefits.planId,
      remaining: benefits.freeCancellationsRemaining,
      used: benefits.freeCancellationsUsed,
      limit: benefits.freeCancellationsLimit,
      subscriptionActive: benefits.subscriptionActive
    };
  } catch (error) {
    console.error('[CancellationService] Error checking free cancellation eligibility:', error);
    return {
      eligible: false,
      planId: 'normal',
      remaining: 0,
      used: 0,
      limit: 0,
      subscriptionActive: false
    };
  }
};

/**
 * Cancel a booking by passenger with refund policy
 * Design Decision: Refund amount based on time until trip start
 * Integrates with subscription service for free cancellation benefits
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger user ID
 * @param {string} reason - Cancellation reason
 * @param {boolean} useFreeCancellation - Whether to use free cancellation benefit (optional)
 * @returns {Promise<Object>} Cancellation result with refund details
 * 
 * Requirements: 6.1, 7.1, 7.2, 7.3, 7.4
 */
const cancelPassengerBooking = async (bookingId, passengerId, reason, useFreeCancellation = true) => {
  // Find booking
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
  if (booking.status === 'completed') {
    const error = new Error('Cannot cancel a completed booking');
    error.code = 'BOOKING_COMPLETED';
    error.statusCode = 400;
    throw error;
  }

  if (booking.status === 'cancelled') {
    const error = new Error('Booking is already cancelled');
    error.code = 'BOOKING_ALREADY_CANCELLED';
    error.statusCode = 400;
    throw error;
  }

  // Get trip to check status and scheduled time
  const trip = await Trip.findById(booking.tripId);
  if (!trip) {
    const error = new Error('Associated trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Cannot cancel if trip is in progress
  if (trip.status === 'in_progress') {
    const error = new Error('Cannot cancel booking after trip has started');
    error.code = 'TRIP_IN_PROGRESS';
    error.statusCode = 400;
    throw error;
  }

  // Check for free cancellation eligibility
  // Requirements: 7.1, 7.2 - Check if free cancellations remain before applying charges
  let freeCancellationUsed = false;
  let freeCancellationDetails = null;
  
  if (useFreeCancellation) {
    const eligibility = await checkFreeCancellationEligibility(passengerId);
    
    if (eligibility.eligible) {
      // Requirements: 7.3 - Use free cancellation and decrement count
      const useResult = await subscriptionService.useFreeCancellation(passengerId);
      
      if (useResult.success) {
        freeCancellationUsed = true;
        freeCancellationDetails = {
          planId: eligibility.planId,
          used: useResult.used,
          limit: useResult.limit,
          remaining: useResult.remaining
        };
      }
    }
  }

  // Calculate refund based on policy or free cancellation
  let refundDetails = null;
  if (booking.paymentStatus === 'paid') {
    if (freeCancellationUsed) {
      // Requirements: 7.3 - Free cancellation results in full refund
      refundDetails = {
        originalFare: booking.fare,
        refundAmount: booking.fare,
        refundPercent: 100,
        policyApplied: 'free_cancellation',
        hoursUntilTrip: (new Date(trip.scheduledAt) - new Date()) / (1000 * 60 * 60),
        freeCancellation: true,
        freeCancellationDetails
      };
    } else {
      // Requirements: 7.4 - Apply standard cancellation charges when free cancellations exhausted
      refundDetails = calculateRefundAmount(booking.fare, trip.scheduledAt);
      refundDetails.freeCancellation = false;
      refundDetails.freeCancellationDetails = null;
    }
    
    // Process refund via payment service
    if (refundDetails.refundAmount > 0) {
      await PaymentStateMachine.onRefund(
        trip._id,
        refundDetails.refundAmount,
        freeCancellationUsed 
          ? 'Free cancellation benefit used' 
          : (reason || 'Passenger cancellation'),
        passengerId
      );
    }
    
    booking.paymentStatus = 'refunded';
  }

  // Update booking status
  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  booking.cancelReason = reason || 'Cancelled by passenger';
  booking.cancelledBy = 'passenger';
  booking.freeCancellationUsed = freeCancellationUsed;
  await booking.save();

  // Remove passenger from trip's passengers array
  await Trip.findByIdAndUpdate(
    booking.tripId,
    { $pull: { passengers: { userId: booking.passengerId } } }
  );

  // Notify driver about cancellation
  try {
    const driverId = trip.driver?._id?.toString() || trip.driver?.toString();
    const driver = await Driver.findById(driverId).populate('userId');
    if (driver && driver.userId) {
      await notificationService.sendNotification(driver.userId._id, {
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        message: `A passenger has cancelled their booking for trip ${trip.tripId}`,
        data: { tripId: trip.tripId, bookingId: booking.bookingId }
      });
    }
  } catch (notifyError) {
    console.error('Failed to send cancellation notification:', notifyError);
  }

  // Build response message
  let message;
  if (freeCancellationUsed) {
    message = `Booking cancelled using free cancellation benefit. Full refund of ₹${refundDetails.refundAmount} will be processed. ${freeCancellationDetails.remaining} free cancellation(s) remaining this month.`;
  } else if (refundDetails) {
    message = `Booking cancelled. Refund of ₹${refundDetails.refundAmount} (${refundDetails.refundPercent}%) will be processed.`;
  } else {
    message = 'Booking cancelled successfully';
  }

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      status: booking.status,
      cancelledAt: booking.cancelledAt,
      cancelReason: booking.cancelReason,
      cancelledBy: booking.cancelledBy,
      freeCancellationUsed
    },
    refund: refundDetails,
    freeCancellation: freeCancellationUsed ? freeCancellationDetails : null,
    message
  };
};


/**
 * Cancel a trip by driver with full refunds for all passengers
 * Design Decision: Driver cancellation always results in full refunds
 * 
 * @param {string} tripId - Trip ID
 * @param {string} driverId - Driver ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Cancellation result with refund details
 * 
 * Requirements: 6.2
 */
const cancelDriverTrip = async (tripId, driverId, reason) => {
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
    const error = new Error('Unauthorized to cancel this trip');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check if trip can be cancelled
  if (trip.status === 'completed') {
    const error = new Error('Cannot cancel a completed trip');
    error.code = 'TRIP_COMPLETED';
    error.statusCode = 400;
    throw error;
  }

  if (trip.status === 'cancelled') {
    const error = new Error('Trip is already cancelled');
    error.code = 'TRIP_ALREADY_CANCELLED';
    error.statusCode = 400;
    throw error;
  }

  // Get all confirmed bookings for this trip
  const bookings = await Booking.find({
    tripId: trip._id,
    status: { $in: ['pending', 'confirmed'] }
  }).populate('passengerId', 'name phone email');

  const refundResults = [];
  const notificationPromises = [];

  // Process full refunds for all passengers
  for (const booking of bookings) {
    const refundInfo = {
      bookingId: booking.bookingId,
      passengerId: booking.passengerId._id,
      passengerName: booking.passengerId.name,
      originalFare: booking.fare,
      refundAmount: 0,
      refundPercent: 0,
      status: 'no_refund_needed'
    };

    if (booking.paymentStatus === 'paid') {
      // Full refund for driver cancellation
      refundInfo.refundAmount = booking.fare;
      refundInfo.refundPercent = 100;
      refundInfo.status = 'processed';

      // Process refund
      await PaymentStateMachine.onRefund(
        trip._id,
        booking.fare,
        `Driver cancelled trip: ${reason || 'No reason provided'}`,
        booking.passengerId._id.toString()
      );

      booking.paymentStatus = 'refunded';
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelReason = `Trip cancelled by driver: ${reason || 'No reason provided'}`;
    booking.cancelledBy = 'driver';
    await booking.save();

    refundResults.push(refundInfo);

    // Queue notification for passenger
    if (booking.passengerId) {
      notificationPromises.push(
        notificationService.sendNotification(booking.passengerId._id, {
          type: 'trip_cancelled',
          title: 'Trip Cancelled',
          message: `Your trip ${trip.tripId} has been cancelled by the driver. ${refundInfo.refundAmount > 0 ? `Full refund of ₹${refundInfo.refundAmount} will be processed.` : ''}`,
          data: { tripId: trip.tripId, bookingId: booking.bookingId, refundAmount: refundInfo.refundAmount }
        }).catch(err => console.error('Notification failed:', err))
      );
    }
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

  // Send all notifications (don't wait for them)
  Promise.all(notificationPromises).catch(err => 
    console.error('Some notifications failed:', err)
  );

  const totalRefunded = refundResults.reduce((sum, r) => sum + r.refundAmount, 0);

  return {
    success: true,
    trip: {
      _id: updatedTrip._id,
      tripId: updatedTrip.tripId,
      status: updatedTrip.status,
      cancellationReason: updatedTrip.cancellationReason
    },
    refunds: {
      totalPassengers: bookings.length,
      totalRefunded,
      details: refundResults
    },
    message: `Trip cancelled. ${bookings.length} passenger(s) notified. Total refund: ₹${totalRefunded}`
  };
};

/**
 * Get cancellation policy details
 * @returns {Object} Cancellation policy configuration
 */
const getCancellationPolicy = () => {
  return {
    policy: CANCELLATION_POLICY,
    description: {
      full_refund: `100% refund if cancelled ${CANCELLATION_POLICY.FULL_REFUND_HOURS}+ hours before trip`,
      partial_refund: `${CANCELLATION_POLICY.PARTIAL_REFUND_PERCENT}% refund if cancelled ${CANCELLATION_POLICY.PARTIAL_REFUND_HOURS}-${CANCELLATION_POLICY.FULL_REFUND_HOURS} hours before trip`,
      minimal_refund: `${CANCELLATION_POLICY.MINIMAL_REFUND_PERCENT}% refund if cancelled ${CANCELLATION_POLICY.MINIMAL_REFUND_HOURS}-${CANCELLATION_POLICY.PARTIAL_REFUND_HOURS} hours before trip`,
      last_minute: `${CANCELLATION_POLICY.LAST_MINUTE_REFUND_PERCENT}% refund if cancelled less than ${CANCELLATION_POLICY.MINIMAL_REFUND_HOURS} hours before trip`,
      driver_cancellation: '100% refund for all passengers when driver cancels',
      free_cancellation: 'Silver subscribers get 2 free cancellations/month, Gold subscribers get 5 free cancellations/month with 100% refund'
    }
  };
};

/**
 * Get free cancellation status for a user
 * Requirements: 7.1, 7.2 - Check free cancellation availability
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Free cancellation status
 */
const getFreeCancellationStatus = async (userId) => {
  const eligibility = await checkFreeCancellationEligibility(userId);
  
  return {
    available: eligibility.eligible,
    planId: eligibility.planId,
    remaining: eligibility.remaining,
    used: eligibility.used,
    limit: eligibility.limit,
    subscriptionActive: eligibility.subscriptionActive,
    message: eligibility.eligible
      ? `You have ${eligibility.remaining} free cancellation(s) remaining this month`
      : eligibility.subscriptionActive
        ? 'You have used all your free cancellations for this month'
        : 'Upgrade to Silver or Gold plan to get free cancellations'
  };
};

module.exports = {
  CANCELLATION_POLICY,
  calculateRefundAmount,
  cancelPassengerBooking,
  cancelDriverTrip,
  getCancellationPolicy,
  checkFreeCancellationEligibility,
  getFreeCancellationStatus
};
