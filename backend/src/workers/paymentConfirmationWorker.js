/**
 * Payment Confirmation Worker
 * Processes queued payment confirmations and reconciles payment status with Cashfree
 * 
 * Requirements: 10.2 - Queue payment confirmations when API times out
 * Requirements: 10.4 - Poll Cashfree API to reconcile payment status
 * Requirements: 10.5 - Process queued payments on system recovery
 */

const { Worker } = require('bullmq');
const { QUEUE_NAME } = require('../queues/paymentConfirmationQueue');

// Worker instance
let paymentConfirmationWorker = null;

/**
 * Get Redis connection options for BullMQ
 * @returns {Object} Redis connection configuration
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      maxRetriesPerRequest: null
    };
  } catch (error) {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null
    };
  }
};

/**
 * Process a payment confirmation job
 * Polls Cashfree API to get actual payment status and updates records
 * 
 * Requirements: 10.4 - Poll Cashfree API to reconcile payment status
 * 
 * @param {Object} job - BullMQ job
 * @returns {Promise<Object>} Processing result
 */
const processPaymentConfirmation = async (job) => {
  const { orderId, bookingId, tripId, transactionId, amount, type } = job.data;
  
  console.log(`[PaymentConfirmationWorker] Processing confirmation for order: ${orderId}`);
  
  // Lazy load services to avoid circular dependencies
  const cashfreeService = require('../services/cashfreeService');
  const Transaction = require('../models/Transaction');
  const Booking = require('../models/Booking');
  
  try {
    // Check if circuit breaker is still open
    if (cashfreeService.isCircuitOpen()) {
      console.log(`[PaymentConfirmationWorker] Circuit still open, will retry later`);
      throw new Error('Circuit breaker is open - will retry later');
    }
    
    // Poll Cashfree for payment status
    const paymentStatus = await cashfreeService.getPaymentStatus(orderId);
    
    if (!paymentStatus || paymentStatus.length === 0) {
      console.log(`[PaymentConfirmationWorker] No payment found for order: ${orderId}`);
      return {
        success: false,
        orderId,
        message: 'No payment found'
      };
    }
    
    // Get the latest payment
    const latestPayment = paymentStatus[0];
    
    // Update transaction record
    if (transactionId) {
      await Transaction.findOneAndUpdate(
        { transactionId },
        {
          status: mapCashfreeStatus(latestPayment.paymentStatus),
          'cashfreeData.paymentId': latestPayment.cfPaymentId,
          'metadata.reconciledAt': new Date(),
          'metadata.reconciledStatus': latestPayment.paymentStatus
        }
      );
    }
    
    // Update booking if payment is successful
    if (bookingId && latestPayment.paymentStatus === 'SUCCESS') {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: 'paid'
      });
    }
    
    console.log(`[PaymentConfirmationWorker] Reconciled order ${orderId}: ${latestPayment.paymentStatus}`);
    
    return {
      success: true,
      orderId,
      paymentStatus: latestPayment.paymentStatus,
      reconciledAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`[PaymentConfirmationWorker] Failed to process order ${orderId}:`, error.message);
    throw error; // Let BullMQ handle retry
  }
};

/**
 * Process a reconciliation job
 * Handles scheduled reconciliation of pending payments
 * 
 * Requirements: 10.5 - Process queued payments on system recovery
 * 
 * @param {Object} job - BullMQ job
 * @returns {Promise<Object>} Processing result
 */
const processReconciliation = async (job) => {
  const { orderId, transactionId, expectedStatus } = job.data;
  
  console.log(`[PaymentConfirmationWorker] Processing reconciliation for order: ${orderId}`);
  
  const cashfreeService = require('../services/cashfreeService');
  const Transaction = require('../models/Transaction');
  
  try {
    // Check circuit breaker
    if (cashfreeService.isCircuitOpen()) {
      throw new Error('Circuit breaker is open');
    }
    
    // Get current payment status from Cashfree
    const paymentStatus = await cashfreeService.getPaymentStatus(orderId);
    
    if (!paymentStatus || paymentStatus.length === 0) {
      return {
        success: false,
        orderId,
        message: 'Payment not found in Cashfree'
      };
    }
    
    const latestPayment = paymentStatus[0];
    const actualStatus = mapCashfreeStatus(latestPayment.paymentStatus);
    
    // Update transaction with reconciled status
    if (transactionId) {
      await Transaction.findOneAndUpdate(
        { transactionId },
        {
          status: actualStatus,
          'metadata.reconciledAt': new Date(),
          'metadata.cashfreeStatus': latestPayment.paymentStatus,
          'metadata.reconciliationJobId': job.id
        }
      );
    }
    
    return {
      success: true,
      orderId,
      expectedStatus,
      actualStatus,
      matched: expectedStatus === actualStatus
    };
    
  } catch (error) {
    console.error(`[PaymentConfirmationWorker] Reconciliation failed for ${orderId}:`, error.message);
    throw error;
  }
};

/**
 * Process scheduled reconciliation
 * Finds all pending transactions and reconciles them
 * 
 * Requirements: 10.5 - Process queued payments on system recovery
 * 
 * @param {Object} job - BullMQ job
 * @returns {Promise<Object>} Processing result
 */
const processScheduledReconciliation = async (job) => {
  console.log('[PaymentConfirmationWorker] Running scheduled reconciliation');
  
  const cashfreeService = require('../services/cashfreeService');
  const Transaction = require('../models/Transaction');
  
  // Check if service is available
  if (cashfreeService.isCircuitOpen()) {
    console.log('[PaymentConfirmationWorker] Circuit open, skipping scheduled reconciliation');
    return {
      success: false,
      reason: 'Circuit breaker open',
      skipped: true
    };
  }
  
  try {
    // Find transactions that need reconciliation
    // These are transactions in 'pending' or 'authorized' status older than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const pendingTransactions = await Transaction.find({
      status: { $in: ['pending', 'authorized'] },
      type: 'collection',
      createdAt: { $lt: fiveMinutesAgo },
      'metadata.reconciledAt': { $exists: false }
    }).limit(20);
    
    if (pendingTransactions.length === 0) {
      return {
        success: true,
        processed: 0,
        message: 'No pending transactions to reconcile'
      };
    }
    
    let reconciled = 0;
    let failed = 0;
    
    for (const txn of pendingTransactions) {
      try {
        const paymentStatus = await cashfreeService.getPaymentStatus(txn.orderId);
        
        if (paymentStatus && paymentStatus.length > 0) {
          const latestPayment = paymentStatus[0];
          const newStatus = mapCashfreeStatus(latestPayment.paymentStatus);
          
          txn.status = newStatus;
          txn.metadata = {
            ...txn.metadata,
            reconciledAt: new Date(),
            cashfreeStatus: latestPayment.paymentStatus
          };
          await txn.save();
          
          reconciled++;
        }
      } catch (error) {
        console.error(`[PaymentConfirmationWorker] Failed to reconcile ${txn.orderId}:`, error.message);
        failed++;
        
        // If circuit opens during reconciliation, stop processing
        if (cashfreeService.isCircuitOpen()) {
          console.log('[PaymentConfirmationWorker] Circuit opened, stopping reconciliation');
          break;
        }
      }
    }
    
    console.log(`[PaymentConfirmationWorker] Scheduled reconciliation complete: ${reconciled} reconciled, ${failed} failed`);
    
    return {
      success: true,
      processed: pendingTransactions.length,
      reconciled,
      failed
    };
    
  } catch (error) {
    console.error('[PaymentConfirmationWorker] Scheduled reconciliation error:', error);
    throw error;
  }
};

/**
 * Map Cashfree payment status to internal status
 * @param {string} cashfreeStatus - Cashfree payment status
 * @returns {string} Internal status
 */
const mapCashfreeStatus = (cashfreeStatus) => {
  const statusMap = {
    'SUCCESS': 'captured',
    'PENDING': 'pending',
    'FAILED': 'failed',
    'CANCELLED': 'cancelled',
    'VOID': 'voided',
    'NOT_ATTEMPTED': 'pending',
    'USER_DROPPED': 'cancelled',
    'AUTHORIZED': 'authorized'
  };
  
  return statusMap[cashfreeStatus] || 'pending';
};

/**
 * Initialize the payment confirmation worker
 * @returns {Worker} BullMQ Worker instance
 */
const initializePaymentConfirmationWorker = () => {
  if (paymentConfirmationWorker) {
    return paymentConfirmationWorker;
  }

  const connection = getRedisConnection();

  paymentConfirmationWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case 'confirm-payment':
          return processPaymentConfirmation(job);
        case 'reconcile-payment':
          return processReconciliation(job);
        case 'scheduled-reconciliation':
          return processScheduledReconciliation(job);
        default:
          console.warn(`[PaymentConfirmationWorker] Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 jobs concurrently
      limiter: {
        max: 10,
        duration: 1000 // Max 10 jobs per second to avoid rate limiting
      }
    }
  );

  paymentConfirmationWorker.on('completed', (job, result) => {
    console.log(`[PaymentConfirmationWorker] Job ${job.id} completed:`, result);
  });

  paymentConfirmationWorker.on('failed', (job, error) => {
    console.error(`[PaymentConfirmationWorker] Job ${job.id} failed:`, error.message);
  });

  paymentConfirmationWorker.on('error', (error) => {
    console.error('[PaymentConfirmationWorker] Worker error:', error);
  });

  console.log('✓ Payment confirmation worker initialized');
  return paymentConfirmationWorker;
};

/**
 * Get the worker instance
 * @returns {Worker|null} Worker instance
 */
const getPaymentConfirmationWorker = () => {
  return paymentConfirmationWorker;
};

/**
 * Close the worker
 * @returns {Promise<void>}
 */
const closePaymentConfirmationWorker = async () => {
  if (paymentConfirmationWorker) {
    await paymentConfirmationWorker.close();
    paymentConfirmationWorker = null;
    console.log('[PaymentConfirmationWorker] Worker closed');
  }
};

module.exports = {
  initializePaymentConfirmationWorker,
  getPaymentConfirmationWorker,
  closePaymentConfirmationWorker,
  processPaymentConfirmation,
  processReconciliation,
  processScheduledReconciliation,
  mapCashfreeStatus
};
