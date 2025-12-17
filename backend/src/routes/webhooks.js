/**
 * Webhook Routes
 * Handles Cashfree payment gateway webhooks
 * 
 * Requirements: 1.5, 1.6, 7.2, 10.3
 */

const express = require('express');
const { verifyWebhookSignature } = require('../services/cashfreeService');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { sendNotification } = require('../services/notificationService');
const { 
  activateSubscription, 
  getSubscriptionByOrderId 
} = require('../services/subscriptionService');

const router = express.Router();

/**
 * Cashfree Webhook Event Types
 */
const WEBHOOK_EVENTS = {
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS_WEBHOOK',
  PAYMENT_FAILED: 'PAYMENT_FAILED_WEBHOOK',
  PAYMENT_USER_DROPPED: 'PAYMENT_USER_DROPPED_WEBHOOK',
  REFUND_STATUS: 'REFUND_STATUS_WEBHOOK',
  PAYOUT_STATUS: 'PAYOUT_STATUS_WEBHOOK'
};

/**
 * Extract payment method details from Cashfree payment data
 * @param {Object} paymentData - Payment data from webhook
 * @returns {Object} Normalized payment method object
 */
const extractPaymentMethod = (paymentData) => {
  const method = paymentData?.payment_method || {};
  
  if (method.upi) {
    return {
      type: 'upi',
      provider: method.upi.upi_id || 'UPI',
      last4: null
    };
  }
  
  if (method.card) {
    return {
      type: 'card',
      provider: method.card.card_network || 'Card',
      last4: method.card.card_last4 || null
    };
  }
  
  if (method.netbanking) {
    return {
      type: 'netbanking',
      provider: method.netbanking.netbanking_bank_name || 'Net Banking',
      last4: null
    };
  }
  
  if (method.wallet) {
    return {
      type: 'wallet',
      provider: method.wallet.wallet_name || 'Wallet',
      last4: null
    };
  }
  
  return {
    type: 'unknown',
    provider: null,
    last4: null
  };
};


/**
 * Check if a webhook event has already been processed (idempotency)
 * Requirements: 10.3 - Process webhooks idempotently
 * 
 * @param {string} orderId - Cashfree order ID
 * @param {string} eventType - Webhook event type
 * @param {string} paymentId - Cashfree payment ID (optional)
 * @returns {Promise<boolean>} True if already processed
 */
const isWebhookAlreadyProcessed = async (orderId, eventType, paymentId = null) => {
  // For payment success, check if transaction is already authorized/captured
  if (eventType === WEBHOOK_EVENTS.PAYMENT_SUCCESS) {
    const existingTransaction = await Transaction.findOne({
      orderId,
      status: { $in: ['authorized', 'captured', 'completed'] }
    });
    return !!existingTransaction;
  }
  
  // For payment failed, check if transaction is already marked as failed
  if (eventType === WEBHOOK_EVENTS.PAYMENT_FAILED || eventType === WEBHOOK_EVENTS.PAYMENT_USER_DROPPED) {
    const existingTransaction = await Transaction.findOne({
      orderId,
      status: 'failed'
    });
    return !!existingTransaction;
  }
  
  // For refunds, check by refund ID
  if (eventType === WEBHOOK_EVENTS.REFUND_STATUS && paymentId) {
    const existingRefund = await Transaction.findOne({
      'cashfreeData.refundId': paymentId,
      type: 'refund',
      status: { $in: ['completed', 'failed'] }
    });
    return !!existingRefund;
  }
  
  return false;
};

/**
 * Handle successful payment webhook
 * Requirements: 1.5 - Update booking status to confirmed
 * 
 * @param {Object} data - Webhook payload data
 * @returns {Promise<Object>} Processing result
 */
const handlePaymentSuccess = async (data) => {
  const { order, payment } = data;
  const orderId = order?.order_id;
  const paymentId = payment?.cf_payment_id;
  
  if (!orderId) {
    throw new Error('Missing order_id in webhook payload');
  }
  
  // Find the transaction by order ID
  const transaction = await Transaction.findOne({ orderId });
  if (!transaction) {
    console.warn(`Transaction not found for order: ${orderId}`);
    return { success: false, reason: 'Transaction not found' };
  }
  
  // Update transaction status to authorized (payment held)
  transaction.status = 'authorized';
  transaction.paymentMethod = extractPaymentMethod(payment);
  transaction.cashfreeData.paymentId = paymentId?.toString();
  transaction.metadata = {
    ...transaction.metadata,
    paymentTime: payment?.payment_time,
    bankReference: payment?.bank_reference
  };
  await transaction.save();
  
  // Update booking status to confirmed
  // Requirements: 1.5
  const booking = await Booking.findById(transaction.bookingId);
  if (booking) {
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    await booking.save();
    
    // Generate and send invoice (Requirements 13.1, 13.2, 13.3)
    const invoiceService = require('../services/invoiceService');
    invoiceService.generateAndSendInvoice(booking.bookingId || booking._id.toString())
      .then(result => {
        if (result.success) {
          console.log(`[Webhook] Invoice generated and sent for booking ${booking.bookingId}`);
        } else {
          console.error(`[Webhook] Failed to generate invoice for booking ${booking.bookingId}:`, result.error);
        }
      })
      .catch(error => {
        console.error(`[Webhook] Error generating invoice for booking ${booking.bookingId}:`, error.message);
      });
    
    // Send notification to user about successful payment
    try {
      const user = await User.findById(transaction.userId);
      if (user?.phone) {
        await sendNotification({
          userId: transaction.userId,
          channel: 'sms',
          template: 'booking_confirmation_sms',
          recipient: user.phone,
          data: {
            bookingId: booking.bookingId,
            source: transaction.rideDetails?.origin || 'Pickup',
            destination: transaction.rideDetails?.destination || 'Drop',
            scheduledDate: transaction.rideDetails?.departureTime 
              ? new Date(transaction.rideDetails.departureTime).toLocaleDateString('en-IN')
              : 'TBD',
            scheduledTime: transaction.rideDetails?.departureTime
              ? new Date(transaction.rideDetails.departureTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : 'TBD',
            fare: transaction.amount,
            bookingPIN: booking.passengerPIN || 'N/A',
            driverName: transaction.rideDetails?.driverName || 'Driver'
          },
          relatedEntity: { type: 'booking', id: booking._id }
        });
      }
    } catch (notifyError) {
      console.error('Failed to send payment success notification:', notifyError.message);
      // Don't fail the webhook processing for notification errors
    }
  }
  
  console.log(`Payment success processed for order: ${orderId}, booking: ${booking?.bookingId}`);
  
  return {
    success: true,
    orderId,
    transactionId: transaction.transactionId,
    bookingId: booking?.bookingId,
    status: 'authorized'
  };
};


/**
 * Handle failed payment webhook
 * Requirements: 1.6 - Display error message and allow retry
 * 
 * @param {Object} data - Webhook payload data
 * @returns {Promise<Object>} Processing result
 */
const handlePaymentFailed = async (data) => {
  const { order, payment, error_details } = data;
  const orderId = order?.order_id;
  
  if (!orderId) {
    throw new Error('Missing order_id in webhook payload');
  }
  
  // Find the transaction by order ID
  const transaction = await Transaction.findOne({ orderId });
  if (!transaction) {
    console.warn(`Transaction not found for order: ${orderId}`);
    return { success: false, reason: 'Transaction not found' };
  }
  
  // Update transaction status to failed
  transaction.status = 'failed';
  transaction.paymentMethod = extractPaymentMethod(payment);
  transaction.metadata = {
    ...transaction.metadata,
    failureReason: error_details?.error_description || payment?.payment_message || 'Payment failed',
    errorCode: error_details?.error_code || payment?.payment_status,
    paymentTime: payment?.payment_time
  };
  await transaction.save();
  
  // Update booking - keep as pending so user can retry
  const booking = await Booking.findById(transaction.bookingId);
  if (booking) {
    // Don't change booking status, just clear payment ID so user can retry
    booking.paymentId = null;
    await booking.save();
    
    // Send notification to user about failed payment
    // Requirements: 1.6
    try {
      const user = await User.findById(transaction.userId);
      if (user?.phone) {
        await sendNotification({
          userId: transaction.userId,
          channel: 'sms',
          template: 'otp_sms', // Reusing template format for simple message
          recipient: user.phone,
          data: {
            otp: '' // Not used, but template requires it
          },
          metadata: {
            customMessage: `HushRyd: Payment failed for booking ${booking.bookingId}. ${error_details?.error_description || 'Please try again with a different payment method.'}`
          },
          relatedEntity: { type: 'booking', id: booking._id }
        });
      }
    } catch (notifyError) {
      console.error('Failed to send payment failure notification:', notifyError.message);
    }
  }
  
  console.log(`Payment failed processed for order: ${orderId}, reason: ${error_details?.error_description || 'Unknown'}`);
  
  return {
    success: true,
    orderId,
    transactionId: transaction.transactionId,
    bookingId: booking?.bookingId,
    status: 'failed',
    reason: error_details?.error_description || 'Payment failed'
  };
};

/**
 * Handle user dropped payment webhook
 * User abandoned the payment flow
 * 
 * @param {Object} data - Webhook payload data
 * @returns {Promise<Object>} Processing result
 */
const handlePaymentUserDropped = async (data) => {
  const { order } = data;
  const orderId = order?.order_id;
  
  if (!orderId) {
    throw new Error('Missing order_id in webhook payload');
  }
  
  // Find the transaction by order ID
  const transaction = await Transaction.findOne({ orderId });
  if (!transaction) {
    console.warn(`Transaction not found for order: ${orderId}`);
    return { success: false, reason: 'Transaction not found' };
  }
  
  // Update transaction status to failed (user dropped)
  transaction.status = 'failed';
  transaction.metadata = {
    ...transaction.metadata,
    failureReason: 'User abandoned payment',
    errorCode: 'USER_DROPPED'
  };
  await transaction.save();
  
  // Update booking - keep as pending so user can retry
  const booking = await Booking.findById(transaction.bookingId);
  if (booking) {
    booking.paymentId = null;
    await booking.save();
  }
  
  console.log(`Payment user dropped processed for order: ${orderId}`);
  
  return {
    success: true,
    orderId,
    transactionId: transaction.transactionId,
    status: 'failed',
    reason: 'User abandoned payment'
  };
};


/**
 * POST /api/webhooks/cashfree
 * Main webhook endpoint for Cashfree payment events
 * 
 * Requirements: 7.2, 10.3
 * - Verify webhook signature before processing
 * - Handle PAYMENT_SUCCESS_WEBHOOK - update booking status, create transaction
 * - Handle PAYMENT_FAILED_WEBHOOK - update booking status, notify user
 * - Implement idempotent processing using transaction ID
 */
router.post('/cashfree', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Get raw body for signature verification
    const rawBody = req.body.toString('utf8');
    
    // Get signature headers
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'] || '';
    
    // Verify webhook signature
    // Requirements: 7.2
    if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
      console.warn('Webhook signature verification failed');
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }
    
    // Parse the payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse webhook payload:', parseError.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON payload'
      });
    }
    
    const eventType = payload.type;
    const data = payload.data;
    
    console.log(`Received Cashfree webhook: ${eventType}`, {
      orderId: data?.order?.order_id,
      paymentId: data?.payment?.cf_payment_id
    });
    
    // Check for idempotency - skip if already processed
    // Requirements: 10.3
    const orderId = data?.order?.order_id;
    const paymentId = data?.payment?.cf_payment_id || data?.refund?.cf_refund_id;
    
    if (await isWebhookAlreadyProcessed(orderId, eventType, paymentId)) {
      console.log(`Webhook already processed for order: ${orderId}, event: ${eventType}`);
      return res.status(200).json({
        success: true,
        message: 'Webhook already processed',
        idempotent: true
      });
    }
    
    // Route to appropriate handler based on event type
    let result;
    switch (eventType) {
      case WEBHOOK_EVENTS.PAYMENT_SUCCESS:
        result = await handlePaymentSuccess(data);
        break;
        
      case WEBHOOK_EVENTS.PAYMENT_FAILED:
        result = await handlePaymentFailed(data);
        break;
        
      case WEBHOOK_EVENTS.PAYMENT_USER_DROPPED:
        result = await handlePaymentUserDropped(data);
        break;
        
      case WEBHOOK_EVENTS.REFUND_STATUS:
        // Refund webhooks will be handled in task 12
        console.log(`Refund webhook received for order: ${orderId}`);
        result = { success: true, message: 'Refund webhook acknowledged' };
        break;
        
      case WEBHOOK_EVENTS.PAYOUT_STATUS:
        // Payout webhooks will be handled in task 10
        console.log(`Payout webhook received`);
        result = { success: true, message: 'Payout webhook acknowledged' };
        break;
        
      default:
        console.warn(`Unknown webhook event type: ${eventType}`);
        result = { success: true, message: 'Unknown event type acknowledged' };
    }
    
    // Always return 200 to acknowledge receipt
    // Cashfree will retry if we return non-2xx
    res.status(200).json({
      success: true,
      event: eventType,
      ...result
    });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Return 200 even on error to prevent Cashfree from retrying
    // Log the error for investigation
    res.status(200).json({
      success: false,
      error: 'Internal processing error',
      message: 'Webhook acknowledged but processing failed'
    });
  }
});

/**
 * GET /api/webhooks/cashfree/health
 * Health check endpoint for webhook service
 */
router.get('/cashfree/health', (req, res) => {
  res.json({
    success: true,
    service: 'cashfree-webhook',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});


/**
 * Handle subscription payment success
 * Requirements: 11.2 - Activate subscription via webhook confirmation
 * 
 * @param {Object} data - Webhook payload data
 * @returns {Promise<Object>} Processing result
 */
const handleSubscriptionPaymentSuccess = async (data) => {
  const { order, payment } = data;
  const orderId = order?.order_id;
  const paymentId = payment?.cf_payment_id;
  
  if (!orderId) {
    throw new Error('Missing order_id in webhook payload');
  }
  
  // Check if this is a subscription order (starts with SUB-)
  if (!orderId.startsWith('SUB-')) {
    return { success: false, reason: 'Not a subscription order' };
  }
  
  // Find the pending subscription by order ID
  const pendingSubscription = await getSubscriptionByOrderId(orderId);
  if (!pendingSubscription) {
    console.warn(`Subscription not found for order: ${orderId}`);
    return { success: false, reason: 'Subscription not found' };
  }
  
  // Activate the subscription
  // Requirements: 11.2 - Activate subscription on successful payment
  const activatedSubscription = await activateSubscription(
    pendingSubscription.userId,
    pendingSubscription.planId,
    paymentId?.toString(),
    orderId
  );
  
  // Create transaction record for subscription payment
  const transactionId = await Transaction.generateTransactionId();
  const transaction = new Transaction({
    transactionId,
    orderId,
    userId: pendingSubscription.userId,
    type: 'subscription',
    status: 'completed',
    amount: activatedSubscription.plan.price,
    currency: 'INR',
    breakdown: {
      baseFare: activatedSubscription.plan.price,
      platformFee: 0,
      freeCancellationFee: 0,
      discountApplied: 0
    },
    cashfreeData: {
      orderId,
      paymentId: paymentId?.toString()
    },
    paymentMethod: extractPaymentMethod(payment),
    metadata: {
      subscriptionId: activatedSubscription.subscriptionId,
      planId: activatedSubscription.planId,
      planName: activatedSubscription.plan.name,
      expiresAt: activatedSubscription.expiresAt
    }
  });
  
  await transaction.save();
  
  // Send notification to user about successful subscription
  try {
    const user = await User.findById(pendingSubscription.userId);
    if (user?.phone) {
      await sendNotification({
        userId: pendingSubscription.userId,
        channel: 'sms',
        template: 'otp_sms', // Reusing template format
        recipient: user.phone,
        data: {
          otp: '' // Not used
        },
        metadata: {
          customMessage: `HushRyd: Your ${activatedSubscription.plan.name} subscription is now active! Enjoy ${activatedSubscription.benefits.freeCancellationsPerMonth} free cancellations and ₹${activatedSubscription.benefits.cashbackPerBooking} cashback per ride. Valid until ${new Date(activatedSubscription.expiresAt).toLocaleDateString('en-IN')}.`
        },
        relatedEntity: { type: 'subscription', id: activatedSubscription.subscriptionId }
      });
    }
  } catch (notifyError) {
    console.error('Failed to send subscription activation notification:', notifyError.message);
  }
  
  console.log(`Subscription activated for order: ${orderId}, user: ${pendingSubscription.userId}, plan: ${activatedSubscription.planId}`);
  
  return {
    success: true,
    orderId,
    subscriptionId: activatedSubscription.subscriptionId,
    planId: activatedSubscription.planId,
    expiresAt: activatedSubscription.expiresAt,
    status: 'activated'
  };
};


/**
 * Handle subscription payment failure
 * 
 * @param {Object} data - Webhook payload data
 * @returns {Promise<Object>} Processing result
 */
const handleSubscriptionPaymentFailed = async (data) => {
  const { order, error_details } = data;
  const orderId = order?.order_id;
  
  if (!orderId) {
    throw new Error('Missing order_id in webhook payload');
  }
  
  // Check if this is a subscription order
  if (!orderId.startsWith('SUB-')) {
    return { success: false, reason: 'Not a subscription order' };
  }
  
  // Find the pending subscription
  const pendingSubscription = await getSubscriptionByOrderId(orderId);
  if (!pendingSubscription) {
    console.warn(`Subscription not found for order: ${orderId}`);
    return { success: false, reason: 'Subscription not found' };
  }
  
  // Update subscription status to failed (will be cleaned up or user can retry)
  const Subscription = require('../models/Subscription');
  await Subscription.findOneAndUpdate(
    { orderId },
    { status: 'cancelled' }
  );
  
  // Notify user about failed payment
  try {
    const user = await User.findById(pendingSubscription.userId);
    if (user?.phone) {
      await sendNotification({
        userId: pendingSubscription.userId,
        channel: 'sms',
        template: 'otp_sms',
        recipient: user.phone,
        data: { otp: '' },
        metadata: {
          customMessage: `HushRyd: Subscription payment failed. ${error_details?.error_description || 'Please try again.'}`
        },
        relatedEntity: { type: 'subscription', id: pendingSubscription._id }
      });
    }
  } catch (notifyError) {
    console.error('Failed to send subscription failure notification:', notifyError.message);
  }
  
  console.log(`Subscription payment failed for order: ${orderId}, reason: ${error_details?.error_description || 'Unknown'}`);
  
  return {
    success: true,
    orderId,
    status: 'failed',
    reason: error_details?.error_description || 'Payment failed'
  };
};


/**
 * POST /api/webhooks/subscription
 * Webhook endpoint for subscription payment events
 * 
 * Requirements: 11.2 - Activate subscription via webhook confirmation
 */
router.post('/subscription', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Get raw body for signature verification
    const rawBody = req.body.toString('utf8');
    
    // Get signature headers
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'] || '';
    
    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
      console.warn('Subscription webhook signature verification failed');
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }
    
    // Parse the payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse subscription webhook payload:', parseError.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON payload'
      });
    }
    
    const eventType = payload.type;
    const data = payload.data;
    
    console.log(`Received subscription webhook: ${eventType}`, {
      orderId: data?.order?.order_id,
      paymentId: data?.payment?.cf_payment_id
    });
    
    // Route to appropriate handler based on event type
    let result;
    switch (eventType) {
      case WEBHOOK_EVENTS.PAYMENT_SUCCESS:
        result = await handleSubscriptionPaymentSuccess(data);
        break;
        
      case WEBHOOK_EVENTS.PAYMENT_FAILED:
      case WEBHOOK_EVENTS.PAYMENT_USER_DROPPED:
        result = await handleSubscriptionPaymentFailed(data);
        break;
        
      default:
        console.warn(`Unknown subscription webhook event type: ${eventType}`);
        result = { success: true, message: 'Unknown event type acknowledged' };
    }
    
    // Always return 200 to acknowledge receipt
    res.status(200).json({
      success: true,
      event: eventType,
      ...result
    });
    
  } catch (error) {
    console.error('Subscription webhook processing error:', error);
    
    // Return 200 even on error to prevent Cashfree from retrying
    res.status(200).json({
      success: false,
      error: 'Internal processing error',
      message: 'Webhook acknowledged but processing failed'
    });
  }
});


/**
 * GET /api/webhooks/subscription/health
 * Health check endpoint for subscription webhook service
 */
router.get('/subscription/health', (req, res) => {
  res.json({
    success: true,
    service: 'subscription-webhook',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});


module.exports = router;
