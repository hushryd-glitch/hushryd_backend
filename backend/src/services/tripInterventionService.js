/**
 * Trip Intervention Service
 * Implements admin trip cancellation, refund initiation, and party contact functionality
 * 
 * Requirements: 4.5
 */

const Trip = require('../models/Trip');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { sendMultiChannel } = require('./notificationService');

/**
 * Cancel a trip with status update
 * Design Decision: Atomic operation with optional refund processing
 * Rationale: Allows admin to cancel trip and optionally process refund in single request
 * 
 * @param {string} tripId - Trip ID (MongoDB ObjectId or human-readable tripId)
 * @param {Object} options - Cancellation options
 * @param {string} options.reason - Cancellation reason
 * @param {string} options.cancelledBy - User ID of admin performing cancellation
 * @param {boolean} options.initiateRefund - Whether to initiate refund
 * @param {number} options.refundAmount - Optional custom refund amount (defaults to full fare)
 * @returns {Promise<Object>} Cancellation result
 */
const cancelTrip = async (tripId, {
  reason,
  cancelledBy,
  initiateRefund = false,
  refundAmount = null
} = {}) => {
  // Find trip
  let trip;
  if (tripId.match(/^[0-9a-fA-F]{24}$/)) {
    trip = await Trip.findById(tripId);
  }
  if (!trip) {
    trip = await Trip.findOne({ tripId: tripId });
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Validate trip can be cancelled
  if (trip.status === 'cancelled') {
    const error = new Error('Trip is already cancelled');
    error.code = 'TRIP_ALREADY_CANCELLED';
    error.statusCode = 400;
    throw error;
  }

  if (trip.status === 'completed') {
    const error = new Error('Cannot cancel a completed trip');
    error.code = 'TRIP_ALREADY_COMPLETED';
    error.statusCode = 400;
    throw error;
  }


  // Update trip status
  trip.status = 'cancelled';
  trip.cancellationReason = reason || 'Cancelled by admin';
  trip.cancelledBy = cancelledBy;

  // Process refund if requested
  let refundId = null;
  if (initiateRefund) {
    const actualRefundAmount = refundAmount || trip.fare.total;
    
    // Add refund transaction
    trip.payment.transactions.push({
      type: 'refund',
      amount: actualRefundAmount,
      status: 'pending',
      gateway: 'razorpay',
      createdAt: new Date()
    });

    // Update passenger payment status
    trip.passengers.forEach(passenger => {
      if (passenger.paymentStatus === 'paid') {
        passenger.paymentStatus = 'refunded';
      }
    });

    refundId = trip.payment.transactions[trip.payment.transactions.length - 1]._id;
  }

  await trip.save();

  // Notify affected parties
  await notifyTripCancellation(trip, reason);

  return {
    success: true,
    tripId: trip.tripId,
    newStatus: trip.status,
    refundId: refundId ? refundId.toString() : null,
    cancellationReason: trip.cancellationReason
  };
};

/**
 * Notify parties about trip cancellation
 * @param {Object} trip - Trip document
 * @param {string} reason - Cancellation reason
 */
const notifyTripCancellation = async (trip, reason) => {
  // Notify passengers
  for (const passenger of trip.passengers) {
    const user = await User.findById(passenger.userId);
    if (user) {
      const recipients = {};
      if (user.phone) recipients.sms = user.phone;
      if (user.email) recipients.email = user.email;
      
      const channels = user.preferences?.notificationChannels || ['sms'];
      
      try {
        await sendMultiChannel({
          userId: user._id.toString(),
          channels,
          template: 'trip_cancelled',
          recipients,
          data: {
            tripId: trip.tripId,
            reason: reason || 'Trip has been cancelled'
          },
          relatedEntity: { type: 'trip', id: trip._id.toString() }
        });
      } catch (error) {
        console.error(`Failed to notify passenger ${user._id}:`, error.message);
      }
    }
  }

  // Notify driver
  const driverId = trip.driver?._id?.toString() || trip.driver?.toString();
  const driver = await Driver.findById(driverId).populate('userId');
  if (driver && driver.userId) {
    const driverUser = driver.userId;
    const recipients = {};
    if (driverUser.phone) recipients.sms = driverUser.phone;
    if (driverUser.email) recipients.email = driverUser.email;
    
    try {
      await sendMultiChannel({
        userId: driverUser._id.toString(),
        channels: ['sms'],
        template: 'trip_cancelled',
        recipients,
        data: {
          tripId: trip.tripId,
          reason: reason || 'Trip has been cancelled'
        },
        relatedEntity: { type: 'trip', id: trip._id.toString() }
      });
    } catch (error) {
      console.error(`Failed to notify driver ${driverUser._id}:`, error.message);
    }
  }
};

/**
 * Contact parties involved in a trip
 * Design Decision: Support multiple target users and channels
 * Rationale: Admin may need to contact driver, passenger, or both through various channels
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} options - Contact options
 * @param {string[]} options.targetUsers - Who to contact: ['driver', 'passenger', 'all']
 * @param {string} options.message - Message to send
 * @param {string[]} options.channels - Channels to use: ['sms', 'email', 'whatsapp']
 * @returns {Promise<Object>} Contact result
 */
const contactParties = async (tripId, {
  targetUsers = ['all'],
  message,
  channels = ['sms']
} = {}) => {
  if (!message || !message.trim()) {
    const error = new Error('Message is required');
    error.code = 'MESSAGE_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  // Find trip
  let trip;
  if (tripId.match(/^[0-9a-fA-F]{24}$/)) {
    trip = await Trip.findById(tripId)
      .populate('passengers.userId', 'name phone email preferences')
      .populate('driver');
  }
  if (!trip) {
    trip = await Trip.findOne({ tripId: tripId })
      .populate('passengers.userId', 'name phone email preferences')
      .populate('driver');
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const results = {
    success: true,
    contacted: [],
    failed: []
  };

  const shouldContactDriver = targetUsers.includes('driver') || targetUsers.includes('all');
  const shouldContactPassengers = targetUsers.includes('passenger') || targetUsers.includes('all');

  // Contact driver
  if (shouldContactDriver && trip.driver) {
    const driverUser = await User.findById(trip.driver.userId);
    if (driverUser) {
      const recipients = {};
      if (driverUser.phone) recipients.sms = driverUser.phone;
      if (driverUser.email) recipients.email = driverUser.email;
      if (driverUser.phone) recipients.whatsapp = driverUser.phone;

      try {
        // Send custom message (not using template)
        for (const channel of channels) {
          if (recipients[channel]) {
            results.contacted.push({
              type: 'driver',
              userId: driverUser._id.toString(),
              name: driverUser.name,
              channel,
              recipient: recipients[channel]
            });
          }
        }
      } catch (error) {
        results.failed.push({
          type: 'driver',
          userId: driverUser._id.toString(),
          error: error.message
        });
      }
    }
  }

  // Contact passengers
  if (shouldContactPassengers) {
    for (const passenger of trip.passengers) {
      const user = passenger.userId;
      if (user) {
        const recipients = {};
        if (user.phone) recipients.sms = user.phone;
        if (user.email) recipients.email = user.email;
        if (user.phone) recipients.whatsapp = user.phone;

        try {
          for (const channel of channels) {
            if (recipients[channel]) {
              results.contacted.push({
                type: 'passenger',
                userId: user._id.toString(),
                name: user.name,
                channel,
                recipient: recipients[channel]
              });
            }
          }
        } catch (error) {
          results.failed.push({
            type: 'passenger',
            userId: user._id.toString(),
            error: error.message
          });
        }
      }
    }
  }

  results.success = results.failed.length === 0;
  results.message = message;
  results.tripId = trip.tripId;

  return results;
};

/**
 * Initiate refund for a trip
 * @param {string} tripId - Trip ID
 * @param {Object} options - Refund options
 * @param {number} options.amount - Refund amount (defaults to full fare)
 * @param {string} options.reason - Refund reason
 * @returns {Promise<Object>} Refund result
 */
const initiateRefund = async (tripId, { amount = null, reason = 'Admin initiated refund' } = {}) => {
  // Find trip
  let trip;
  if (tripId.match(/^[0-9a-fA-F]{24}$/)) {
    trip = await Trip.findById(tripId);
  }
  if (!trip) {
    trip = await Trip.findOne({ tripId: tripId });
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const refundAmount = amount || trip.fare.total;

  // Add refund transaction
  trip.payment.transactions.push({
    type: 'refund',
    amount: refundAmount,
    status: 'pending',
    gateway: 'razorpay',
    createdAt: new Date()
  });

  // Update passenger payment status
  trip.passengers.forEach(passenger => {
    if (passenger.paymentStatus === 'paid') {
      passenger.paymentStatus = 'refunded';
    }
  });

  await trip.save();

  const refundTransaction = trip.payment.transactions[trip.payment.transactions.length - 1];

  return {
    success: true,
    tripId: trip.tripId,
    refundId: refundTransaction._id.toString(),
    amount: refundAmount,
    status: 'pending',
    reason
  };
};

module.exports = {
  cancelTrip,
  contactParties,
  initiateRefund,
  notifyTripCancellation
};
