/**
 * Payment Service
 * Implements payment calculation, state machine, and financial operations
 * 
 * Requirements: 5.2, 5.4
 * Requirements: 8.2, 8.4 - Circuit breaker protection for payment gateway calls
 * Requirements: 8.4 - Queue payment confirmations on timeout, allow trip to proceed
 */

const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { getCircuitBreaker, CircuitBreakers } = require('./circuitBreakerService');
const { processPaymentWithIsolation, queuePaymentConfirmation } = require('./serviceIsolationService');
const cashfreeService = require('./cashfreeService');

/**
 * Fixed platform fee for driver (₹15)
 */
const DRIVER_PLATFORM_FEE = 15;

/**
 * Fixed platform fee for passenger (₹15)
 */
const PASSENGER_PLATFORM_FEE = 15;

/**
 * Total platform fee per booking (driver + passenger)
 */
const TOTAL_PLATFORM_FEE = DRIVER_PLATFORM_FEE + PASSENGER_PLATFORM_FEE;

/**
 * Driver advance percentage (70% of driver total after platform fee)
 */
const DRIVER_ADVANCE_RATE = 0.70;

/**
 * Calculate payment breakdown for a trip
 * Design Decision: Fixed ₹15 platform fee for both driver and passenger
 * Rationale: Simple, transparent pricing - driver pays ₹15, passenger pays ₹15
 * Driver gets 70% advance at trip start, remaining 30% released after completion
 * 
 * @param {number} totalFare - Total fare amount (what passenger pays excluding platform fee)
 * @param {number} seats - Number of seats booked (default 1)
 * @returns {Object} Payment breakdown with all components
 */
const calculatePaymentBreakdown = (totalFare, seats = 1) => {
  if (typeof totalFare !== 'number' || isNaN(totalFare)) {
    throw new Error('INVALID_FARE_AMOUNT');
  }
  
  if (totalFare < 0) {
    throw new Error('NEGATIVE_FARE_NOT_ALLOWED');
  }

  // Platform fee is ₹15 per seat for both driver and passenger
  const driverPlatformFee = DRIVER_PLATFORM_FEE * seats;
  const passengerPlatformFee = PASSENGER_PLATFORM_FEE * seats;
  const totalPlatformFee = driverPlatformFee + passengerPlatformFee;
  
  // Total collected from passenger = fare + passenger platform fee
  const totalCollected = totalFare + passengerPlatformFee;
  
  // Driver gets fare minus their platform fee
  const driverTotal = totalFare - driverPlatformFee;
  const driverAdvance = Math.round(driverTotal * DRIVER_ADVANCE_RATE);
  const vaultAmount = driverTotal - driverAdvance;

  return {
    totalCollected,
    platformCommission: totalPlatformFee,
    driverPlatformFee,
    passengerPlatformFee,
    driverAdvance,
    vaultAmount,
    vaultStatus: 'locked'
  };
};

/**
 * Validate payment breakdown integrity
 * Ensures: totalCollected = platformCommission + driverAdvance + vaultAmount
 * 
 * @param {Object} breakdown - Payment breakdown object
 * @returns {boolean} True if breakdown is valid
 */
const validatePaymentBreakdown = (breakdown) => {
  if (!breakdown) return false;
  
  const { totalCollected, platformCommission, driverAdvance, vaultAmount } = breakdown;
  
  // Check all values are numbers
  if ([totalCollected, platformCommission, driverAdvance, vaultAmount].some(
    v => typeof v !== 'number' || isNaN(v)
  )) {
    return false;
  }

  // Check integrity: totalCollected = platformCommission + driverAdvance + vaultAmount
  const sum = platformCommission + driverAdvance + vaultAmount;
  return totalCollected === sum;
};

/**
 * Execute payment gateway call with circuit breaker protection
 * Requirements: 8.2, 8.4 - Circuit breaker for payment gateway
 * 
 * @param {Function} gatewayCall - Async function that calls the payment gateway
 * @returns {Promise<any>} Result of the gateway call
 */
const executePaymentGatewayCall = async (gatewayCall) => {
  const circuitBreaker = getCircuitBreaker(CircuitBreakers.PAYMENT, {
    failureThreshold: 50,
    resetTimeout: 30000
  });

  return circuitBreaker.execute(gatewayCall);
};

/**
 * Simulate Razorpay payout (in production, this would be actual API call)
 * Protected by circuit breaker
 * 
 * @param {Object} payoutData - Payout details
 * @returns {Promise<Object>} Payout result
 */
const initiateRazorpayPayout = async (payoutData) => {
  return executePaymentGatewayCall(async () => {
    // In production, this would be:
    // const payout = await razorpay.payouts.create({
    //   account_number: payoutData.accountNumber,
    //   amount: payoutData.amount * 100, // Razorpay uses paise
    //   currency: 'INR',
    //   mode: 'IMPS',
    //   purpose: payoutData.purpose,
    //   fund_account_id: payoutData.fundAccountId
    // });
    // return payout;
    
    // Simulated response for development
    return {
      id: `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'processed',
      amount: payoutData.amount
    };
  });
};

/**
 * Initiate payout with service isolation - queues on failure, allows trip to proceed
 * Requirements: 8.4 - Queue payment confirmations on timeout, allow trip to proceed
 * 
 * @param {Object} payoutData - Payout details
 * @param {string} payoutData.tripId - Trip ID for tracking
 * @param {number} payoutData.amount - Payout amount
 * @param {string} payoutData.purpose - Payout purpose
 * @returns {Promise<Object>} Payout result or queue confirmation
 */
const initiatePayoutWithIsolation = async (payoutData) => {
  const paymentFn = async () => {
    return initiateRazorpayPayout(payoutData);
  };

  const paymentQueueData = {
    tripId: payoutData.tripId,
    type: 'payout',
    amount: payoutData.amount,
    purpose: payoutData.purpose,
    metadata: payoutData
  };

  const result = await processPaymentWithIsolation(paymentFn, paymentQueueData);

  if (result.queued) {
    console.log(`[PaymentService] Payout queued for trip ${payoutData.tripId}, trip can proceed`);
  }

  return result;
};

/**
 * Process payment confirmation with isolation - allows trip to proceed on gateway failure
 * Requirements: 8.4 - Queue payment confirmations on timeout, allow trip to proceed
 * 
 * @param {string} tripId - Trip ID
 * @param {string} paymentId - Payment gateway ID
 * @param {number} amount - Payment amount
 * @returns {Promise<Object>} Confirmation result
 */
const confirmPaymentWithIsolation = async (tripId, paymentId, amount) => {
  const paymentFn = async () => {
    // In production, this would verify with Razorpay
    return {
      id: paymentId,
      status: 'confirmed',
      amount
    };
  };

  const paymentQueueData = {
    tripId,
    type: 'confirmation',
    paymentId,
    amount
  };

  const result = await processPaymentWithIsolation(paymentFn, paymentQueueData);

  if (result.queued) {
    // Trip can proceed even if payment confirmation is queued
    console.log(`[PaymentService] Payment confirmation queued for trip ${tripId}, trip can proceed`);
    return {
      ...result,
      tripCanProceed: true,
      pendingConfirmation: true
    };
  }

  return result;
};

/**
 * Simulate Razorpay refund (in production, this would be actual API call)
 * Protected by circuit breaker
 * 
 * @param {Object} refundData - Refund details
 * @returns {Promise<Object>} Refund result
 */
const initiateRazorpayRefund = async (refundData) => {
  return executePaymentGatewayCall(async () => {
    // In production, this would be:
    // const refund = await razorpay.payments.refund(refundData.paymentId, {
    //   amount: refundData.amount * 100, // Razorpay uses paise
    //   speed: 'normal',
    //   notes: { reason: refundData.reason }
    // });
    // return refund;
    
    // Simulated response for development
    return {
      id: `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'processed',
      amount: refundData.amount
    };
  });
};

/**
 * Payment State Machine
 * Design Decision: Atomic updates with transaction logging
 * Rationale: Every payment state change creates an audit trail
 */
const PaymentStateMachine = {
  /**
   * Handle payment collection from passenger
   * Called when passenger completes payment via Razorpay
   * 
   * @param {string} tripId - Trip ID
   * @param {string} razorpayPaymentId - Razorpay payment ID
   * @param {number} amount - Amount collected
   * @returns {Promise<Object>} Updated trip
   */
  onPaymentCollected: async (tripId, razorpayPaymentId, amount) => {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      const error = new Error('Trip not found');
      error.code = 'TRIP_NOT_FOUND';
      throw error;
    }

    const transaction = {
      type: 'collection',
      amount: amount || trip.payment.totalCollected,
      status: 'completed',
      gateway: 'razorpay',
      gatewayTransactionId: razorpayPaymentId,
      createdAt: new Date()
    };

    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      { $push: { 'payment.transactions': transaction } },
      { new: true }
    );

    return updatedTrip;
  },

  /**
   * Handle trip start - pay driver advance
   * Called when driver starts the trip (verifies OTP)
   * 
   * @param {string} tripId - Trip ID
   * @param {string} payoutId - Razorpay payout ID (optional, for testing)
   * @returns {Promise<Object>} Updated trip with advance transaction
   */
  onTripStart: async (tripId, payoutId = null) => {
    const trip = await Trip.findById(tripId).populate('driver');
    if (!trip) {
      const error = new Error('Trip not found');
      error.code = 'TRIP_NOT_FOUND';
      throw error;
    }

    if (trip.status !== 'scheduled' && trip.status !== 'driver_assigned') {
      const error = new Error('Trip cannot be started in current status');
      error.code = 'INVALID_TRIP_STATUS';
      throw error;
    }

    const { driverAdvance } = trip.payment;

    // In production, this would initiate Razorpay payout
    // const payout = await razorpay.payouts.create({...});
    const gatewayTransactionId = payoutId || `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const transaction = {
      type: 'advance',
      amount: driverAdvance,
      status: 'completed',
      gateway: 'razorpay',
      gatewayTransactionId,
      createdAt: new Date()
    };

    // Update driver earnings
    if (trip.driver) {
      await Driver.findByIdAndUpdate(trip.driver._id || trip.driver, {
        $inc: {
          'earnings.pending': driverAdvance,
          'earnings.vault': trip.payment.vaultAmount
        }
      });
    }

    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      {
        status: 'in_progress',
        startedAt: new Date(),
        $push: { 'payment.transactions': transaction }
      },
      { new: true }
    );

    return updatedTrip;
  },

  /**
   * Handle trip completion - release vault amount
   * Called when driver completes the trip
   * 
   * @param {string} tripId - Trip ID
   * @param {string} payoutId - Razorpay payout ID (optional, for testing)
   * @returns {Promise<Object>} Updated trip with vault release transaction
   */
  onTripComplete: async (tripId, payoutId = null) => {
    const trip = await Trip.findById(tripId).populate('driver');
    if (!trip) {
      const error = new Error('Trip not found');
      error.code = 'TRIP_NOT_FOUND';
      throw error;
    }

    if (trip.status !== 'in_progress') {
      const error = new Error('Trip must be in progress to complete');
      error.code = 'INVALID_TRIP_STATUS';
      throw error;
    }

    if (trip.payment.vaultStatus === 'released') {
      const error = new Error('Vault already released');
      error.code = 'VAULT_ALREADY_RELEASED';
      throw error;
    }

    const { vaultAmount } = trip.payment;

    // In production, this would initiate Razorpay payout
    const gatewayTransactionId = payoutId || `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const transaction = {
      type: 'payout',
      amount: vaultAmount,
      status: 'completed',
      gateway: 'razorpay',
      gatewayTransactionId,
      createdAt: new Date()
    };

    // Update driver earnings
    if (trip.driver) {
      await Driver.findByIdAndUpdate(trip.driver._id || trip.driver, {
        $inc: {
          'earnings.total': trip.payment.driverAdvance + vaultAmount,
          'earnings.pending': -trip.payment.driverAdvance,
          'earnings.vault': -vaultAmount
        }
      });
    }

    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      {
        status: 'completed',
        completedAt: new Date(),
        'payment.vaultStatus': 'released',
        $push: { 'payment.transactions': transaction }
      },
      { new: true }
    );

    // Update all confirmed bookings for this trip to completed status and credit cashback
    // Requirements: 4.1, 4.2, 4.3 - Credit cashback after ride completion
    const Booking = require('../models/Booking');
    const confirmedBookings = await Booking.find({
      tripId,
      status: 'confirmed'
    }).populate('passengerId', 'phone email name');

    // Process cashback for each passenger
    const subscriptionService = require('./subscriptionService');
    const walletService = require('./walletService');
    const notificationService = require('./notificationService');

    for (const booking of confirmedBookings) {
      try {
        // Update booking status to completed
        booking.status = 'completed';
        await booking.save();

        // Get user's subscription to determine cashback amount and expiry
        const userSubscription = await subscriptionService.getUserSubscription(booking.passengerId._id);
        
        if (userSubscription && !userSubscription.isDefault && userSubscription.plan.features.cashbackRewards) {
          const cashbackAmount = userSubscription.plan.benefits.cashbackPerBooking;
          const expiryDays = userSubscription.plan.benefits.cashbackValidityDays;

          // Credit cashback to user's wallet
          // Property 4: Silver cashback amount - ₹50
          // Property 5: Gold cashback amount - ₹75  
          // Property 6: Cashback expiry by plan (Silver: 10 days, Gold: 15 days)
          const cashbackEntry = await walletService.creditCashback(
            booking.passengerId._id,
            cashbackAmount,
            booking._id,
            expiryDays
          );

          // Send cashback notification
          // Requirements: 4.4 - Notify user with amount and expiry
          await notificationService.sendCashbackCreditNotification(
            booking.passengerId,
            cashbackAmount,
            cashbackEntry.expiresAt,
            cashbackEntry.walletBalance
          );

          console.log(`[PaymentService] Credited ₹${cashbackAmount} cashback to user ${booking.passengerId._id} for booking ${booking.bookingId}`);
        }
      } catch (error) {
        console.error(`[PaymentService] Error processing cashback for booking ${booking.bookingId}:`, error.message);
        // Don't fail trip completion if cashback processing fails
      }
    }

    return updatedTrip;
  },

  /**
   * Handle refund processing
   * Called when admin initiates a refund
   * 
   * @param {string} tripId - Trip ID
   * @param {number} refundAmount - Amount to refund
   * @param {string} reason - Refund reason
   * @param {string} passengerId - Passenger user ID (optional)
   * @param {string} refundId - Razorpay refund ID (optional, for testing)
   * @returns {Promise<Object>} Updated trip with refund transaction
   */
  onRefund: async (tripId, refundAmount, reason, passengerId = null, refundId = null) => {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      const error = new Error('Trip not found');
      error.code = 'TRIP_NOT_FOUND';
      throw error;
    }

    if (typeof refundAmount !== 'number' || refundAmount <= 0) {
      const error = new Error('Invalid refund amount');
      error.code = 'INVALID_REFUND_AMOUNT';
      throw error;
    }

    if (refundAmount > trip.payment.totalCollected) {
      const error = new Error('Refund amount exceeds total collected');
      error.code = 'REFUND_EXCEEDS_TOTAL';
      throw error;
    }

    // In production, this would initiate Razorpay refund
    const gatewayTransactionId = refundId || `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const transaction = {
      type: 'refund',
      amount: refundAmount,
      status: 'completed',
      gateway: 'razorpay',
      gatewayTransactionId,
      createdAt: new Date()
    };

    const updateQuery = {
      $push: { 'payment.transactions': transaction }
    };

    // Update passenger payment status if specified
    if (passengerId) {
      const updatedTrip = await Trip.findOneAndUpdate(
        { _id: tripId, 'passengers.userId': passengerId },
        {
          ...updateQuery,
          $set: { 'passengers.$.paymentStatus': 'refunded' }
        },
        { new: true }
      );
      return updatedTrip;
    }

    // Update all passengers to refunded if no specific passenger
    const updatedTrip = await Trip.findByIdAndUpdate(
      tripId,
      updateQuery,
      { new: true }
    );

    // Update all passengers' payment status
    if (updatedTrip && updatedTrip.passengers) {
      await Trip.updateOne(
        { _id: tripId },
        { $set: { 'passengers.$[].paymentStatus': 'refunded' } }
      );
    }

    return Trip.findById(tripId);
  }
};

// ============================================
// OTP Verification and Payment Capture
// Requirements: 5.2, 5.3
// ============================================

/**
 * Verify passenger OTP and update pickup status
 * Updates passenger pickup status to 'picked_up' with timestamp
 * Checks if all passengers for trip are verified
 * 
 * Requirements: 5.2
 * 
 * @param {string} bookingId - Booking ID (MongoDB ObjectId or human-readable)
 * @param {string} otp - OTP entered by passenger
 * @returns {Promise<Object>} Verification result with pickup status
 */
const verifyPassengerOTP = async (bookingId, otp) => {
  // Find the booking
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
  
  // Check if already picked up
  if (booking.pickupStatus === 'picked_up') {
    return {
      success: true,
      isValid: true,
      alreadyVerified: true,
      message: 'Passenger already verified and picked up',
      booking: {
        bookingId: booking.bookingId,
        pickupStatus: booking.pickupStatus,
        pickedUpAt: booking.pickedUpAt
      }
    };
  }
  
  // Validate OTP format
  if (!otp || typeof otp !== 'string') {
    return {
      success: false,
      isValid: false,
      message: 'OTP is required'
    };
  }
  
  // Normalize OTP (trim whitespace)
  const normalizedOTP = otp.trim();
  
  // Validate OTP format (4 digits)
  if (!/^\d{4}$/.test(normalizedOTP)) {
    return {
      success: false,
      isValid: false,
      message: 'Invalid OTP format. OTP must be 4 digits.'
    };
  }
  
  // Compare OTP with stored passengerPIN or verificationCode
  const storedOTP = booking.passengerPIN || booking.verificationCode;
  
  if (!storedOTP) {
    const error = new Error('No OTP configured for this booking');
    error.code = 'OTP_NOT_CONFIGURED';
    error.statusCode = 400;
    throw error;
  }
  
  const isValid = normalizedOTP === storedOTP;
  
  if (!isValid) {
    return {
      success: false,
      isValid: false,
      message: 'Incorrect OTP. Please try again.'
    };
  }
  
  // OTP is valid - update pickup status
  const pickedUpAt = new Date();
  
  booking.pickupStatus = 'picked_up';
  booking.pickedUpAt = pickedUpAt;
  booking.verifiedAt = pickedUpAt;
  await booking.save();
  
  // Also update the passenger entry in the Trip's passengers array
  const trip = await Trip.findById(booking.tripId);
  if (trip) {
    await Trip.updateOne(
      { _id: booking.tripId, 'passengers.userId': booking.passengerId },
      { 
        $set: { 
          'passengers.$.boardedAt': pickedUpAt 
        } 
      }
    );
  }
  
  // Check if all passengers for this trip are verified
  const allPassengersVerified = await checkAllPassengersVerified(booking.tripId);
  
  return {
    success: true,
    isValid: true,
    message: 'OTP verified successfully. Passenger marked as picked up.',
    booking: {
      bookingId: booking.bookingId,
      pickupStatus: 'picked_up',
      pickedUpAt
    },
    allPassengersVerified,
    tripId: booking.tripId
  };
};

/**
 * Check if all passengers for a trip have been verified/picked up
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<boolean>} True if all passengers are verified
 */
const checkAllPassengersVerified = async (tripId) => {
  // Get all confirmed bookings for this trip
  const bookings = await Booking.find({
    tripId,
    status: 'confirmed'
  });
  
  if (bookings.length === 0) {
    return false;
  }
  
  // Check if all bookings have pickupStatus = 'picked_up'
  const allVerified = bookings.every(b => b.pickupStatus === 'picked_up');
  
  return allVerified;
};

/**
 * Get verification status for all passengers of a trip
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Verification status details
 */
const getPassengerVerificationStatus = async (tripId) => {
  const bookings = await Booking.find({
    tripId,
    status: 'confirmed'
  }).populate('passengerId', 'name phone');
  
  const totalPassengers = bookings.length;
  const verifiedPassengers = bookings.filter(b => b.pickupStatus === 'picked_up').length;
  const allVerified = totalPassengers > 0 && verifiedPassengers === totalPassengers;
  
  return {
    tripId,
    totalPassengers,
    verifiedPassengers,
    allVerified,
    passengers: bookings.map(b => ({
      bookingId: b.bookingId,
      passengerName: b.passengerId?.name || 'Unknown',
      passengerPhone: b.passengerId?.phone,
      seats: b.seats,
      pickupStatus: b.pickupStatus || 'pending',
      pickedUpAt: b.pickedUpAt
    }))
  };
};

/**
 * Capture all held payments for a trip when all passengers are verified
 * Captures payments via Cashfree API and updates transaction statuses
 * 
 * Requirements: 5.3
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Capture results for all payments
 */
const capturePayments = async (tripId) => {
  // Verify all passengers are picked up first
  const allVerified = await checkAllPassengersVerified(tripId);
  
  if (!allVerified) {
    const verificationStatus = await getPassengerVerificationStatus(tripId);
    const error = new Error(
      `Cannot capture payments. ${verificationStatus.verifiedPassengers} of ${verificationStatus.totalPassengers} passengers verified.`
    );
    error.code = 'NOT_ALL_PASSENGERS_VERIFIED';
    error.statusCode = 400;
    error.verificationStatus = verificationStatus;
    throw error;
  }
  
  // Find all authorized transactions for this trip
  const transactions = await Transaction.find({
    tripId,
    type: 'collection',
    status: 'authorized'
  });
  
  if (transactions.length === 0) {
    // Check if payments are already captured
    const capturedTransactions = await Transaction.find({
      tripId,
      type: 'collection',
      status: 'captured'
    });
    
    if (capturedTransactions.length > 0) {
      return {
        success: true,
        message: 'Payments already captured',
        alreadyCaptured: true,
        capturedCount: capturedTransactions.length,
        totalAmount: capturedTransactions.reduce((sum, t) => sum + t.amount, 0)
      };
    }
    
    return {
      success: true,
      message: 'No authorized payments to capture',
      capturedCount: 0,
      totalAmount: 0
    };
  }
  
  const captureResults = [];
  let totalCaptured = 0;
  let failedCaptures = 0;
  
  // Capture each authorized payment
  for (const transaction of transactions) {
    try {
      // Call Cashfree API to capture the payment
      const captureResponse = await cashfreeService.capturePayment(
        transaction.orderId,
        transaction.amount
      );
      
      // Update transaction status to captured
      transaction.status = 'captured';
      transaction.cashfreeData.paymentId = captureResponse.paymentId;
      transaction.metadata = {
        ...transaction.metadata,
        capturedAt: new Date(),
        captureResponse
      };
      await transaction.save();
      
      // Update booking payment status
      if (transaction.bookingId) {
        await Booking.findByIdAndUpdate(transaction.bookingId, {
          paymentStatus: 'captured'
        });
      }
      
      totalCaptured += transaction.amount;
      captureResults.push({
        transactionId: transaction.transactionId,
        orderId: transaction.orderId,
        amount: transaction.amount,
        status: 'captured',
        success: true
      });
      
    } catch (captureError) {
      console.error(`Failed to capture payment for order ${transaction.orderId}:`, captureError);
      
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.metadata = {
        ...transaction.metadata,
        captureError: captureError.message,
        captureAttemptedAt: new Date()
      };
      await transaction.save();
      
      failedCaptures++;
      captureResults.push({
        transactionId: transaction.transactionId,
        orderId: transaction.orderId,
        amount: transaction.amount,
        status: 'failed',
        success: false,
        error: captureError.message
      });
    }
  }
  
  // Update trip status to in_progress if all captures successful
  if (failedCaptures === 0 && captureResults.length > 0) {
    await Trip.findByIdAndUpdate(tripId, {
      status: 'in_progress',
      startedAt: new Date()
    });
  }
  
  return {
    success: failedCaptures === 0,
    message: failedCaptures === 0 
      ? 'All payments captured successfully' 
      : `${failedCaptures} of ${transactions.length} captures failed`,
    capturedCount: captureResults.filter(r => r.success).length,
    failedCount: failedCaptures,
    totalAmount: totalCaptured,
    results: captureResults
  };
};

/**
 * Verify OTP and automatically capture payments if all passengers verified
 * Combines OTP verification with automatic payment capture
 * 
 * Requirements: 5.2, 5.3
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} otp - OTP entered by passenger
 * @returns {Promise<Object>} Combined verification and capture result
 */
const verifyOTPAndCapturePayments = async (bookingId, otp) => {
  // First verify the OTP
  const verificationResult = await verifyPassengerOTP(bookingId, otp);
  
  if (!verificationResult.isValid) {
    return verificationResult;
  }
  
  // If all passengers are now verified, capture payments
  if (verificationResult.allPassengersVerified) {
    try {
      const captureResult = await capturePayments(verificationResult.tripId);
      
      return {
        ...verificationResult,
        paymentsCaptured: true,
        captureResult
      };
    } catch (captureError) {
      console.error('Payment capture failed after OTP verification:', captureError);
      
      return {
        ...verificationResult,
        paymentsCaptured: false,
        captureError: captureError.message
      };
    }
  }
  
  return {
    ...verificationResult,
    paymentsCaptured: false,
    message: verificationResult.message + ' Waiting for other passengers to be verified.'
  };
};

// ============================================
// Driver Beneficiary Registration
// Requirements: 6.1
// ============================================

/**
 * Register driver as a Cashfree beneficiary for payouts
 * Called when driver completes registration with bank account details
 * 
 * Requirements: 6.1 - Register driver as beneficiary with bank account details
 * 
 * @param {string} driverId - Driver ID (MongoDB ObjectId)
 * @returns {Promise<Object>} Registration result with beneficiary ID
 */
const registerDriverBeneficiary = async (driverId) => {
  // Find the driver with user details
  const driver = await Driver.findById(driverId).populate('userId', 'name email phone');
  
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  
  // Check if driver has bank details
  if (!driver.bankDetails || !driver.bankDetails.accountNumber || !driver.bankDetails.ifscCode) {
    const error = new Error('Driver bank details not configured');
    error.code = 'BANK_DETAILS_MISSING';
    error.statusCode = 400;
    throw error;
  }
  
  // Check if already registered
  if (driver.bankDetails.beneficiaryId && driver.bankDetails.beneficiaryStatus === 'registered') {
    return {
      success: true,
      alreadyRegistered: true,
      beneficiaryId: driver.bankDetails.beneficiaryId,
      message: 'Driver already registered as beneficiary'
    };
  }
  
  const user = driver.userId;
  
  // Prepare beneficiary data
  const beneficiaryData = {
    beneficiaryId: `DRIVER_${driverId}`,
    name: driver.bankDetails.accountHolderName || user?.name || 'Driver',
    email: user?.email || `driver_${driverId}@hushryd.com`,
    phone: user?.phone || '9999999999',
    bankAccount: driver.bankDetails.accountNumber,
    ifsc: driver.bankDetails.ifscCode
  };
  
  try {
    // Register with Cashfree
    const result = await cashfreeService.addBeneficiary(beneficiaryData);
    
    // Update driver record with beneficiary ID
    driver.bankDetails.beneficiaryId = result.beneficiaryId;
    driver.bankDetails.beneficiaryStatus = 'registered';
    driver.bankDetails.beneficiaryRegisteredAt = new Date();
    await driver.save();
    
    return {
      success: true,
      beneficiaryId: result.beneficiaryId,
      status: result.status,
      message: result.message
    };
    
  } catch (error) {
    // Update driver record with failed status
    driver.bankDetails.beneficiaryStatus = 'failed';
    await driver.save();
    
    console.error(`Failed to register driver ${driverId} as beneficiary:`, error);
    throw error;
  }
};

/**
 * Check if driver has bank account registered
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Bank account status
 */
const checkDriverBankAccount = async (driverId) => {
  const driver = await Driver.findById(driverId);
  
  if (!driver) {
    return {
      hasBankAccount: false,
      hasWallet: true, // All drivers have wallet by default
      reason: 'Driver not found'
    };
  }
  
  const hasBankAccount = !!(
    driver.bankDetails && 
    driver.bankDetails.accountNumber && 
    driver.bankDetails.ifscCode
  );
  
  const isBeneficiaryRegistered = !!(
    driver.bankDetails?.beneficiaryId && 
    driver.bankDetails?.beneficiaryStatus === 'registered'
  );
  
  return {
    hasBankAccount,
    isBeneficiaryRegistered,
    hasWallet: true, // All drivers have wallet by default
    beneficiaryId: driver.bankDetails?.beneficiaryId,
    beneficiaryStatus: driver.bankDetails?.beneficiaryStatus
  };
};

// ============================================
// Driver Earnings Payout
// Requirements: 5.4, 6.2, 6.3, 6.4, 6.5
// ============================================

// Import payout queue for failure handling
const payoutQueue = require('../queues/payoutQueue');

/**
 * Credit driver earnings after ride starts (all passengers picked up)
 * Checks if driver has bank account - uses IMPS transfer or credits to wallet
 * Creates payout transaction record
 * Queues failed payouts for retry with exponential backoff (Requirements: 6.5)
 * 
 * Requirements: 5.4, 6.2, 6.3, 6.4, 6.5
 * 
 * @param {string} tripId - Trip ID
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Payout result with transaction details
 */
const creditDriverEarnings = async (tripId, driverId) => {
  // Find the trip
  const trip = await Trip.findById(tripId);
  
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  
  // Find the driver
  const driver = await Driver.findById(driverId).populate('userId', 'name email phone');
  
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  
  // Calculate driver earnings from trip
  // Get all captured transactions for this trip
  const capturedTransactions = await Transaction.find({
    tripId,
    type: { $in: ['collection', 'capture'] },
    status: 'captured'
  });
  
  // Calculate total fare collected (excluding platform fees)
  let totalFareCollected = 0;
  let totalPlatformFee = 0;
  
  for (const txn of capturedTransactions) {
    if (txn.breakdown) {
      totalFareCollected += txn.breakdown.baseFare || 0;
      totalPlatformFee += txn.breakdown.platformFee || 0;
    } else {
      // Fallback: assume platform fee is ₹10 per transaction
      totalFareCollected += txn.amount - 10;
      totalPlatformFee += 10;
    }
  }
  
  // Driver earnings = total fare collected (platform fee already deducted from passenger payment)
  const driverEarnings = totalFareCollected;
  
  if (driverEarnings <= 0) {
    return {
      success: true,
      message: 'No earnings to credit',
      amount: 0,
      destination: 'none'
    };
  }
  
  // Check driver's bank account status
  const bankStatus = await checkDriverBankAccount(driverId);
  
  // Generate transaction ID early for tracking
  const transactionId = await Transaction.generateTransactionId();
  
  // Determine payout destination
  let payoutDestination = 'wallet'; // Default to wallet
  let payoutResult = null;
  let transactionStatus = 'completed';
  let payoutQueued = false;
  
  // Requirements 6.2, 6.3: Check if driver has bank account
  if (bankStatus.hasBankAccount && bankStatus.isBeneficiaryRegistered) {
    // Transfer via IMPS to bank account (Requirements: 6.3)
    payoutDestination = 'bank_account';
    
    try {
      // Generate unique transfer ID
      const transferId = `PAYOUT_${tripId}_${Date.now()}`;
      
      // Initiate payout via Cashfree
      payoutResult = await cashfreeService.initiatePayout({
        beneficiaryId: bankStatus.beneficiaryId,
        amount: driverEarnings,
        transferId,
        transferMode: 'IMPS',
        remarks: `HushRyd earnings for trip ${trip.tripId || tripId}`
      });
      
      transactionStatus = payoutResult.status === 'SUCCESS' ? 'completed' : 'pending';
      
    } catch (payoutError) {
      console.error(`Payout to bank failed for driver ${driverId}:`, payoutError);
      
      // Requirements 6.5: Queue failed payout for retry
      try {
        const queueResult = await payoutQueue.queueFailedPayout({
          tripId,
          driverId,
          amount: driverEarnings,
          beneficiaryId: bankStatus.beneficiaryId,
          transactionId,
          driverName: driver.userId?.name,
          tripDetails: {
            origin: trip.source?.address,
            destination: trip.destination?.address
          }
        }, payoutError.message);
        
        payoutQueued = true;
        transactionStatus = 'pending';
        payoutResult = {
          error: payoutError.message,
          queued: true,
          queueJobId: queueResult.jobId,
          nextRetryAt: queueResult.nextRetryAt
        };
        
        // Send admin notification for payout failure (Requirements: 6.5)
        await payoutQueue.notifyAdminPayoutFailure({
          tripId,
          driverId,
          amount: driverEarnings,
          transactionId
        }, payoutError.message);
        
      } catch (queueError) {
        console.error('Failed to queue payout for retry:', queueError);
        
        // Fall back to wallet credit if queue also fails
        payoutDestination = 'wallet';
        payoutResult = {
          error: payoutError.message,
          queueError: queueError.message,
          fallbackToWallet: true
        };
      }
    }
  } else {
    // Credit to wallet (Requirements: 6.2)
    payoutDestination = 'wallet';
  }
  
  // Update driver earnings
  if (payoutDestination === 'wallet') {
    // Credit to wallet
    await Driver.findByIdAndUpdate(driverId, {
      $inc: {
        'earnings.total': driverEarnings,
        'earnings.pending': driverEarnings
      }
    });
  } else if (payoutDestination === 'bank_account' && transactionStatus === 'completed') {
    // Bank transfer successful
    await Driver.findByIdAndUpdate(driverId, {
      $inc: {
        'earnings.total': driverEarnings
      }
    });
  } else if (payoutQueued) {
    // Payout queued - mark as pending in driver earnings
    await Driver.findByIdAndUpdate(driverId, {
      $inc: {
        'earnings.pending': driverEarnings
      }
    });
  }
  
  // Create payout transaction record
  const payoutTransaction = new Transaction({
    transactionId,
    orderId: `PAYOUT_${tripId}`,
    tripId,
    driverId,
    type: 'payout',
    status: transactionStatus,
    amount: driverEarnings,
    currency: 'INR',
    breakdown: {
      baseFare: totalFareCollected,
      platformFee: totalPlatformFee
    },
    cashfreeData: {
      payoutId: payoutResult?.transferId,
      referenceId: payoutResult?.referenceId
    },
    rideDetails: {
      origin: trip.source?.address,
      destination: trip.destination?.address,
      departureTime: trip.scheduledAt,
      driverName: driver.userId?.name
    },
    metadata: {
      payoutDestination,
      payoutResult,
      beneficiaryId: bankStatus.beneficiaryId,
      payoutQueued
    }
  });
  
  await payoutTransaction.save();
  
  return {
    success: !payoutQueued || payoutDestination === 'wallet',
    transactionId,
    amount: driverEarnings,
    destination: payoutDestination,
    status: transactionStatus,
    queued: payoutQueued,
    message: payoutQueued 
      ? 'Payout failed and queued for retry. Admin notified.'
      : (payoutDestination === 'wallet' 
        ? 'Earnings credited to driver wallet'
        : 'Earnings transferred to bank account via IMPS'),
    payoutDetails: payoutResult
  };
};

/**
 * Get driver earnings summary
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Earnings summary
 */
const getDriverEarningsSummary = async (driverId) => {
  const driver = await Driver.findById(driverId);
  
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  
  // Get recent payout transactions
  const recentPayouts = await Transaction.find({
    driverId,
    type: 'payout'
  })
    .sort({ createdAt: -1 })
    .limit(10);
  
  return {
    total: driver.earnings?.total || 0,
    pending: driver.earnings?.pending || 0,
    vault: driver.earnings?.vault || 0,
    hasBankAccount: !!(driver.bankDetails?.accountNumber),
    isBeneficiaryRegistered: driver.bankDetails?.beneficiaryStatus === 'registered',
    recentPayouts: recentPayouts.map(p => ({
      transactionId: p.transactionId,
      amount: p.amount,
      status: p.status,
      destination: p.metadata?.payoutDestination,
      createdAt: p.createdAt
    }))
  };
};

module.exports = {
  calculatePaymentBreakdown,
  validatePaymentBreakdown,
  PaymentStateMachine,
  executePaymentGatewayCall,
  initiateRazorpayPayout,
  initiateRazorpayRefund,
  initiatePayoutWithIsolation,
  confirmPaymentWithIsolation,
  // OTP Verification and Payment Capture (Requirements: 5.2, 5.3)
  verifyPassengerOTP,
  checkAllPassengersVerified,
  getPassengerVerificationStatus,
  capturePayments,
  verifyOTPAndCapturePayments,
  // Driver Beneficiary Registration (Requirements: 6.1)
  registerDriverBeneficiary,
  checkDriverBankAccount,
  // Driver Earnings Payout (Requirements: 5.4, 6.2, 6.3, 6.4)
  creditDriverEarnings,
  getDriverEarningsSummary,
  // Constants
  DRIVER_PLATFORM_FEE,
  PASSENGER_PLATFORM_FEE,
  TOTAL_PLATFORM_FEE,
  DRIVER_ADVANCE_RATE
};
