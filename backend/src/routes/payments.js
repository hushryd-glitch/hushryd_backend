/**
 * Payment Routes
 * API endpoints for Cashfree payment integration
 * 
 * Requirements: 1.1, 1.5, 2.1, 3.2, 5.1
 */

const express = require('express');
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createOrder, isServiceAvailable } = require('../services/cashfreeService');
const { calculatePaymentBreakdown, PLATFORM_FEE } = require('../services/cashfreePaymentCalculation');
const { 
  verifyPassengerOTP, 
  capturePayments, 
  verifyOTPAndCapturePayments,
  getPassengerVerificationStatus 
} = require('../services/paymentService');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const User = require('../models/User');

const router = express.Router();

// Validation schemas
const initiatePaymentSchema = Joi.object({
  bookingId: Joi.string().required(),
  hasFreeCancellation: Joi.boolean().default(false),
  returnUrl: Joi.string().uri().optional(),
  source: Joi.string().valid('web', 'mobile').default('web')
});

/**
 * Generate unique order ID for Cashfree
 * @param {string} bookingId - Booking ID
 * @returns {string} Unique order ID
 */
const generateOrderId = (bookingId) => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `HR-${bookingId.slice(-6)}-${timestamp}-${random}`.toUpperCase();
};

/**
 * POST /api/payments/initiate
 * Initiate payment for a booking
 * Creates Cashfree order with authorization (hold) mode
 * 
 * Requirements: 1.1, 1.5, 2.1, 3.2
 */
router.post('/initiate', authenticateToken, validate(initiatePaymentSchema), async (req, res) => {
  try {
    const { bookingId, hasFreeCancellation, returnUrl, source } = req.body;
    const userId = req.user._id;


    // Check if Cashfree service is available
    if (!isServiceAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Payment service is temporarily unavailable. Please try again later.',
        code: 'PAYMENT_SERVICE_UNAVAILABLE'
      });
    }

    // Find the booking
    const booking = await Booking.findByBookingId(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    // Verify the booking belongs to the user
    if (booking.passengerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to initiate payment for this booking',
        code: 'UNAUTHORIZED'
      });
    }

    // Check booking status
    if (booking.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot initiate payment for booking with status: ${booking.status}`,
        code: 'INVALID_BOOKING_STATUS'
      });
    }

    // Check if payment already initiated
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment already completed for this booking',
        code: 'PAYMENT_ALREADY_COMPLETED'
      });
    }

    // Get trip details for departure time (needed for Free Cancellation)
    const trip = await Trip.findById(booking.tripId);
    if (!trip) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found',
        code: 'TRIP_NOT_FOUND'
      });
    }

    // Get user details for Cashfree order
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Calculate payment breakdown with platform fee and optional Free Cancellation
    // Requirements: 2.1, 3.2
    const breakdown = calculatePaymentBreakdown(booking.fare, {
      hasFreeCancellation,
      appliedDiscount: 0, // TODO: Integrate with discount/coupon system
      source
    });

    // Generate unique order ID
    const orderId = generateOrderId(booking.bookingId);

    // Prepare customer details for Cashfree
    const customerDetails = {
      customerId: userId.toString(),
      name: user.name || 'HushRyd User',
      email: user.email || `${user.phone}@hushryd.com`,
      phone: user.phone
    };

    // Prepare order metadata
    const orderMeta = {
      returnUrl: returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/bookings/${bookingId}/payment-status`,
      notifyUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/webhooks/cashfree`,
      paymentMethods: null // Allow all payment methods (UPI, cards, netbanking, wallets)
    };

    // Create Cashfree order with authorization mode
    // Requirements: 1.1, 5.1
    const orderResponse = await createOrder({
      orderId,
      amount: breakdown.totalAmount,
      currency: 'INR',
      customerDetails,
      orderMeta,
      note: `HushRyd Booking: ${booking.bookingId}`
    });

    // Generate transaction ID
    const transactionId = await Transaction.generateTransactionId();

    // Create transaction record
    // Requirements: 9.1, 9.2
    const transaction = new Transaction({
      transactionId,
      orderId: orderResponse.orderId,
      bookingId: booking._id,
      tripId: booking.tripId,
      userId: userId,
      type: 'collection',
      status: 'pending',
      amount: breakdown.totalAmount,
      currency: 'INR',
      breakdown: {
        baseFare: breakdown.baseFare,
        platformFee: breakdown.platformFee,
        freeCancellationFee: breakdown.freeCancellationFee,
        discountApplied: breakdown.appliedDiscount
      },
      cashfreeData: {
        orderId: orderResponse.orderId,
        referenceId: orderResponse.cfOrderId
      },
      rideDetails: {
        origin: trip.source?.address || trip.source,
        destination: trip.destination?.address || trip.destination,
        departureTime: trip.scheduledAt,
        passengerName: user.name
      },
      metadata: {
        source,
        hasFreeCancellation,
        bookingId: booking.bookingId
      }
    });

    await transaction.save();

    // Update booking with payment initiation info
    booking.paymentId = orderId;
    await booking.save();

    // Return payment session for frontend checkout
    // Requirements: 1.1, 1.5
    res.status(200).json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        orderId: orderResponse.orderId,
        paymentSessionId: orderResponse.paymentSessionId,
        orderAmount: orderResponse.orderAmount,
        orderCurrency: orderResponse.orderCurrency,
        transactionId: transaction.transactionId,
        breakdown: {
          baseFare: breakdown.baseFare,
          platformFee: breakdown.platformFee,
          freeCancellationFee: breakdown.freeCancellationFee,
          appliedDiscount: breakdown.appliedDiscount,
          totalAmount: breakdown.totalAmount
        },
        hasFreeCancellation,
        booking: {
          bookingId: booking.bookingId,
          tripId: booking.tripId,
          seats: booking.seats,
          fare: booking.fare
        }
      }
    });

  } catch (error) {
    console.error('Payment initiation error:', error);

    // Handle specific Cashfree errors
    if (error.message?.includes('Cashfree is not configured')) {
      return res.status(503).json({
        success: false,
        error: 'Payment service is not configured',
        code: 'PAYMENT_NOT_CONFIGURED'
      });
    }

    // Handle circuit breaker open
    if (error.message?.includes('Circuit breaker is open')) {
      return res.status(503).json({
        success: false,
        error: 'Payment service is temporarily unavailable due to high error rate',
        code: 'CIRCUIT_BREAKER_OPEN'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      code: 'PAYMENT_INITIATION_FAILED'
    });
  }
});

/**
 * GET /api/payments/:orderId/status
 * Get payment status for an order
 * 
 * Requirements: 10.4
 */
router.get('/:orderId/status', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    // Find transaction by order ID
    const transactions = await Transaction.findByOrderId(orderId);
    if (!transactions || transactions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
        code: 'TRANSACTION_NOT_FOUND'
      });
    }

    const transaction = transactions[0];

    // Verify the transaction belongs to the user
    if (transaction.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view this transaction',
        code: 'UNAUTHORIZED'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: transaction.orderId,
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        breakdown: transaction.breakdown,
        paymentMethod: transaction.paymentMethod,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status',
      code: 'STATUS_FETCH_FAILED'
    });
  }
});

/**
 * GET /api/payments/booking/:bookingId
 * Get payment details for a booking
 */
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id;

    // Find booking
    const booking = await Booking.findByBookingId(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
        code: 'BOOKING_NOT_FOUND'
      });
    }

    // Verify the booking belongs to the user
    if (booking.passengerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view payment for this booking',
        code: 'UNAUTHORIZED'
      });
    }

    // Find transactions for this booking
    const transactions = await Transaction.findByBookingId(booking._id);

    res.status(200).json({
      success: true,
      data: {
        bookingId: booking.bookingId,
        paymentStatus: booking.paymentStatus,
        fare: booking.fare,
        transactions: transactions.map(t => ({
          transactionId: t.transactionId,
          orderId: t.orderId,
          type: t.type,
          status: t.status,
          amount: t.amount,
          breakdown: t.breakdown,
          paymentMethod: t.paymentMethod,
          createdAt: t.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Get booking payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment details',
      code: 'PAYMENT_FETCH_FAILED'
    });
  }
});

// Validation schema for OTP verification
const verifyOTPSchema = Joi.object({
  bookingId: Joi.string().required(),
  otp: Joi.string().pattern(/^\d{4}$/).required().messages({
    'string.pattern.base': 'OTP must be exactly 4 digits'
  })
});

/**
 * POST /api/payments/verify-otp
 * Verify passenger OTP and update pickup status
 * Automatically captures payments when all passengers are verified
 * 
 * Requirements: 5.2, 5.3
 */
router.post('/verify-otp', authenticateToken, validate(verifyOTPSchema), async (req, res) => {
  try {
    const { bookingId, otp } = req.body;

    // Verify OTP and capture payments if all passengers verified
    const result = await verifyOTPAndCapturePayments(bookingId, otp);

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        error: result.message,
        code: 'INVALID_OTP'
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        booking: result.booking,
        allPassengersVerified: result.allPassengersVerified,
        paymentsCaptured: result.paymentsCaptured,
        captureResult: result.captureResult
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);

    if (error.code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }

    if (error.code === 'BOOKING_NOT_CONFIRMED' || error.code === 'OTP_NOT_CONFIGURED') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP',
      code: 'OTP_VERIFICATION_FAILED'
    });
  }
});

/**
 * POST /api/payments/capture/:tripId
 * Manually capture all held payments for a trip
 * Only works when all passengers are verified
 * 
 * Requirements: 5.3
 */
router.post('/capture/:tripId', authenticateToken, async (req, res) => {
  try {
    const { tripId } = req.params;

    // Capture all payments for the trip
    const result = await capturePayments(tripId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
        code: 'CAPTURE_FAILED',
        data: result
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });

  } catch (error) {
    console.error('Payment capture error:', error);

    if (error.code === 'NOT_ALL_PASSENGERS_VERIFIED') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
        verificationStatus: error.verificationStatus
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to capture payments',
      code: 'CAPTURE_FAILED'
    });
  }
});

/**
 * GET /api/payments/verification-status/:tripId
 * Get verification status for all passengers of a trip
 * 
 * Requirements: 5.2
 */
router.get('/verification-status/:tripId', authenticateToken, async (req, res) => {
  try {
    const { tripId } = req.params;

    const status = await getPassengerVerificationStatus(tripId);

    res.status(200).json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get verification status',
      code: 'STATUS_FETCH_FAILED'
    });
  }
});

module.exports = router;
