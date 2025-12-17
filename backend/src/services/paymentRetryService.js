/**
 * Payment Retry Service
 * Handles payment failure scenarios and retry mechanisms
 * 
 * Requirements: 9.5 - Create payment failure handling and retry mechanisms
 */

const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const { queuePaymentConfirmation } = require('../queues/paymentConfirmationQueue');
const { sendPaymentFailureNotification, sendPaymentRetryNotification } = require('./notificationService');

/**
 * Payment failure reasons and their retry strategies
 */
const FAILURE_REASONS = {
  NETWORK_ERROR: {
    retryable: true,
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000
  },
  INSUFFICIENT_FUNDS: {
    retryable: false,
    userAction: 'ADD_FUNDS'
  },
  CARD_DECLINED: {
    retryable: true,
    maxRetries: 2,
    userAction: 'TRY_DIFFERENT_CARD'
  },
  GATEWAY_TIMEOUT: {
    retryable: true,
    maxRetries: 3,
    backoffMultiplier: 1.5,
    initialDelay: 2000
  },
  INVALID_CARD: {
    retryable: false,
    userAction: 'CHECK_CARD_DETAILS'
  },
  EXPIRED_CARD: {
    retryable: false,
    userAction: 'UPDATE_CARD'
  },
  GATEWAY_ERROR: {
    retryable: true,
    maxRetries: 2,
    backoffMultiplier: 2,
    initialDelay: 5000
  },
  AUTHENTICATION_FAILED: {
    retryable: false,
    userAction: 'VERIFY_OTP'
  }
};

/**
 * Classify payment failure reason
 * @param {string} errorMessage - Error message from payment gateway
 * @param {string} errorCode - Error code from payment gateway
 * @returns {Object} Failure classification
 */
const classifyFailureReason = (errorMessage, errorCode) => {
  const message = (errorMessage || '').toLowerCase();
  const code = (errorCode || '').toLowerCase();

  // Network and timeout errors
  if (message.includes('timeout') || message.includes('network') || code.includes('timeout')) {
    return { reason: 'GATEWAY_TIMEOUT', ...FAILURE_REASONS.GATEWAY_TIMEOUT };
  }

  // Insufficient funds
  if (message.includes('insufficient') || message.includes('balance') || code.includes('insufficient')) {
    return { reason: 'INSUFFICIENT_FUNDS', ...FAILURE_REASONS.INSUFFICIENT_FUNDS };
  }

  // Card declined
  if (message.includes('declined') || message.includes('rejected') || code.includes('declined')) {
    return { reason: 'CARD_DECLINED', ...FAILURE_REASONS.CARD_DECLINED };
  }

  // Invalid card details
  if (message.includes('invalid card') || message.includes('card number') || code.includes('invalid_card')) {
    return { reason: 'INVALID_CARD', ...FAILURE_REASONS.INVALID_CARD };
  }

  // Expired card
  if (message.includes('expired') || code.includes('expired')) {
    return { reason: 'EXPIRED_CARD', ...FAILURE_REASONS.EXPIRED_CARD };
  }

  // Authentication failed (OTP, 3D Secure)
  if (message.includes('authentication') || message.includes('otp') || code.includes('auth')) {
    return { reason: 'AUTHENTICATION_FAILED', ...FAILURE_REASONS.AUTHENTICATION_FAILED };
  }

  // Default to gateway error
  return { reason: 'GATEWAY_ERROR', ...FAILURE_REASONS.GATEWAY_ERROR };
};

/**
 * Handle payment failure and determine retry strategy
 * Requirements: 9.5 - Create payment failure handling and retry mechanisms
 * 
 * @param {Object} failureData - Payment failure data
 * @param {string} failureData.orderId - Cashfree order ID
 * @param {string} failureData.transactionId - Internal transaction ID
 * @param {string} failureData.errorMessage - Error message
 * @param {string} failureData.errorCode - Error code
 * @param {number} failureData.currentRetryCount - Current retry count
 * @returns {Promise<Object>} Retry strategy and next steps
 */
const handlePaymentFailure = async (failureData) => {
  const { orderId, transactionId, errorMessage, errorCode, currentRetryCount = 0 } = failureData;

  // Find the transaction
  const transaction = await Transaction.findOne({
    $or: [
      { orderId },
      { transactionId }
    ]
  });

  if (!transaction) {
    throw new Error('Transaction not found for failure handling');
  }

  // Classify the failure reason
  const classification = classifyFailureReason(errorMessage, errorCode);

  // Update transaction with failure details
  transaction.status = 'failed';
  transaction.failureReason = classification.reason;
  transaction.errorMessage = errorMessage;
  transaction.errorCode = errorCode;
  transaction.retryCount = currentRetryCount;
  transaction.metadata = {
    ...transaction.metadata,
    failureClassification: classification,
    failedAt: new Date()
  };

  await transaction.save();

  // Determine if retry is possible
  const canRetry = classification.retryable && 
                   currentRetryCount < (classification.maxRetries || 0);

  let retryStrategy = null;
  let nextRetryAt = null;

  if (canRetry) {
    // Calculate retry delay with exponential backoff
    const baseDelay = classification.initialDelay || 1000;
    const multiplier = classification.backoffMultiplier || 2;
    const retryDelay = baseDelay * Math.pow(multiplier, currentRetryCount);
    
    nextRetryAt = new Date(Date.now() + retryDelay);

    retryStrategy = {
      canRetry: true,
      nextRetryAt,
      retryCount: currentRetryCount + 1,
      maxRetries: classification.maxRetries,
      retryDelay
    };

    // Queue automatic retry if configured
    if (classification.autoRetry !== false) {
      await queuePaymentRetry(transaction, retryStrategy);
    }
  }

  // Send failure notification to user
  await sendPaymentFailureNotification(transaction, classification);

  // Update booking status if needed
  if (transaction.bookingId) {
    const booking = await Booking.findById(transaction.bookingId);
    if (booking && booking.paymentStatus !== 'failed') {
      booking.paymentStatus = 'failed';
      booking.paymentFailureReason = classification.reason;
      await booking.save();
    }
  }

  return {
    success: false,
    failureReason: classification.reason,
    retryable: classification.retryable,
    retryStrategy,
    userAction: classification.userAction,
    message: getFailureMessage(classification),
    transactionId: transaction.transactionId,
    orderId: transaction.orderId
  };
};

/**
 * Queue payment retry for automatic processing
 * @param {Object} transaction - Transaction document
 * @param {Object} retryStrategy - Retry strategy details
 */
const queuePaymentRetry = async (transaction, retryStrategy) => {
  try {
    const retryData = {
      orderId: transaction.orderId,
      transactionId: transaction.transactionId,
      bookingId: transaction.bookingId,
      retryCount: retryStrategy.retryCount,
      scheduledFor: retryStrategy.nextRetryAt,
      type: 'payment_retry'
    };

    await queuePaymentConfirmation(retryData);
    
    console.log(`[PaymentRetryService] Queued retry ${retryStrategy.retryCount} for transaction ${transaction.transactionId}`);
  } catch (error) {
    console.error('[PaymentRetryService] Failed to queue payment retry:', error);
  }
};

/**
 * Get user-friendly failure message
 * @param {Object} classification - Failure classification
 * @returns {string} User-friendly message
 */
const getFailureMessage = (classification) => {
  const messages = {
    NETWORK_ERROR: 'Payment failed due to network issues. Please try again.',
    INSUFFICIENT_FUNDS: 'Payment failed due to insufficient funds. Please add money to your account or try a different payment method.',
    CARD_DECLINED: 'Your card was declined. Please try a different card or contact your bank.',
    GATEWAY_TIMEOUT: 'Payment timed out. Please try again.',
    INVALID_CARD: 'Invalid card details. Please check your card number, expiry date, and CVV.',
    EXPIRED_CARD: 'Your card has expired. Please use a different card.',
    GATEWAY_ERROR: 'Payment gateway error. Please try again or use a different payment method.',
    AUTHENTICATION_FAILED: 'Payment authentication failed. Please verify your OTP or try again.'
  };

  return messages[classification.reason] || 'Payment failed. Please try again or contact support.';
};

/**
 * Retry a failed payment
 * Requirements: 9.5 - Create payment failure handling and retry mechanisms
 * 
 * @param {string} transactionId - Transaction ID to retry
 * @returns {Promise<Object>} Retry result
 */
const retryPayment = async (transactionId) => {
  const transaction = await Transaction.findOne({ transactionId });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'failed') {
    throw new Error('Can only retry failed transactions');
  }

  // Check if retry is allowed
  const classification = transaction.metadata?.failureClassification;
  if (!classification?.retryable) {
    throw new Error('This payment failure is not retryable');
  }

  const currentRetryCount = transaction.retryCount || 0;
  if (currentRetryCount >= (classification.maxRetries || 0)) {
    throw new Error('Maximum retry attempts exceeded');
  }

  // Reset transaction status for retry
  transaction.status = 'pending';
  transaction.retryCount = currentRetryCount + 1;
  transaction.metadata = {
    ...transaction.metadata,
    retryAttemptedAt: new Date(),
    previousFailureReason: transaction.failureReason
  };
  
  // Clear failure fields for fresh attempt
  delete transaction.failureReason;
  delete transaction.errorMessage;
  delete transaction.errorCode;

  await transaction.save();

  // Send retry notification
  await sendPaymentRetryNotification(transaction);

  return {
    success: true,
    message: 'Payment retry initiated',
    transactionId: transaction.transactionId,
    retryCount: transaction.retryCount
  };
};

/**
 * Get payment failure statistics for monitoring
 * @param {Date} startDate - Start date for statistics
 * @param {Date} endDate - End date for statistics
 * @returns {Promise<Object>} Failure statistics
 */
const getFailureStatistics = async (startDate, endDate) => {
  const matchStage = {
    status: 'failed',
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };

  const stats = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$failureReason',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgRetryCount: { $avg: '$retryCount' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const totalFailures = await Transaction.countDocuments(matchStage);
  const totalFailedAmount = await Transaction.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  return {
    totalFailures,
    totalFailedAmount: totalFailedAmount[0]?.total || 0,
    failuresByReason: stats,
    period: { startDate, endDate }
  };
};

module.exports = {
  handlePaymentFailure,
  retryPayment,
  classifyFailureReason,
  getFailureStatistics,
  FAILURE_REASONS
};