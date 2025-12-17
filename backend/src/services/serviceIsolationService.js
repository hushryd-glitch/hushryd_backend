/**
 * Service Isolation Service
 * Design Decision: Isolate external service failures to prevent cascade failures
 * Rationale: Core operations (trips, bookings) continue even when external services fail
 * 
 * Requirements: 8.3, 8.4, 8.5 - Graceful degradation and service isolation
 */

const { getCircuitBreaker, CircuitBreakers, CircuitState } = require('./circuitBreakerService');
const { getDocumentQueue, getQueueStatus } = require('../queues/documentQueue');

/**
 * Queue names for isolated services
 */
const IsolationQueues = {
  NOTIFICATION: 'notification-queue',
  PAYMENT: 'payment-queue'
};

/**
 * In-memory queues for service isolation (in production, use Redis/BullMQ)
 * These queues store operations when external services are unavailable
 */
const isolationQueues = {
  notifications: [],
  payments: []
};

/**
 * Queue size limits
 */
const QUEUE_LIMITS = {
  notifications: 10000,
  payments: 1000
};

/**
 * Notification Queue Item Schema
 * @typedef {Object} NotificationQueueItem
 * @property {string} id - Unique identifier
 * @property {string} type - Notification type
 * @property {Object} data - Notification data
 * @property {number} attempts - Number of retry attempts
 * @property {Date} createdAt - When the item was queued
 * @property {Date} lastAttemptAt - Last retry attempt time
 * @property {string} status - pending, processing, completed, failed
 */

/**
 * Payment Queue Item Schema
 * @typedef {Object} PaymentQueueItem
 * @property {string} id - Unique identifier
 * @property {string} type - Payment operation type (confirmation, refund)
 * @property {Object} data - Payment data
 * @property {number} attempts - Number of retry attempts
 * @property {Date} createdAt - When the item was queued
 * @property {string} tripId - Associated trip ID
 * @property {string} status - pending, processing, completed, failed
 */

/**
 * Generate unique ID for queue items
 * @returns {string} Unique identifier
 */
const generateQueueId = () => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};


/**
 * Queue a notification for later delivery when notification service fails
 * Requirements: 8.5 - Queue notifications on service failure
 * 
 * @param {Object} notificationData - Notification data to queue
 * @param {string} notificationData.userId - User ID
 * @param {string} notificationData.channel - Notification channel (sms, email, whatsapp)
 * @param {string} notificationData.template - Template name
 * @param {string} notificationData.recipient - Recipient address
 * @param {Object} notificationData.data - Template data
 * @returns {Object} Queue result with position and estimated delivery
 */
const queueNotification = (notificationData) => {
  // Check queue limit
  if (isolationQueues.notifications.length >= QUEUE_LIMITS.notifications) {
    console.warn('[ServiceIsolation] Notification queue full, dropping oldest items');
    // Remove oldest 10% of items
    const removeCount = Math.ceil(QUEUE_LIMITS.notifications * 0.1);
    isolationQueues.notifications.splice(0, removeCount);
  }

  const queueItem = {
    id: generateQueueId(),
    type: 'notification',
    data: notificationData,
    attempts: 0,
    createdAt: new Date(),
    lastAttemptAt: null,
    status: 'pending'
  };

  isolationQueues.notifications.push(queueItem);

  const position = isolationQueues.notifications.length;
  const estimatedDeliveryMinutes = Math.ceil(position / 100); // ~100 notifications/min

  console.log(`[ServiceIsolation] Notification queued: ${queueItem.id}, position: ${position}`);

  return {
    success: true,
    queued: true,
    queueId: queueItem.id,
    queuePosition: position,
    estimatedDeliveryMinutes,
    message: 'Notification queued for delivery when service recovers'
  };
};

/**
 * Queue a payment confirmation for later processing when payment gateway fails
 * Requirements: 8.4 - Queue payment confirmations on timeout
 * 
 * @param {Object} paymentData - Payment data to queue
 * @param {string} paymentData.tripId - Trip ID
 * @param {string} paymentData.type - Payment type (confirmation, refund, payout)
 * @param {number} paymentData.amount - Payment amount
 * @param {Object} paymentData.metadata - Additional payment metadata
 * @returns {Object} Queue result
 */
const queuePaymentConfirmation = (paymentData) => {
  // Check queue limit
  if (isolationQueues.payments.length >= QUEUE_LIMITS.payments) {
    console.warn('[ServiceIsolation] Payment queue full, cannot accept more items');
    return {
      success: false,
      queued: false,
      error: 'Payment queue is full',
      message: 'Please try again later'
    };
  }

  const queueItem = {
    id: generateQueueId(),
    type: paymentData.type || 'confirmation',
    data: paymentData,
    tripId: paymentData.tripId,
    attempts: 0,
    createdAt: new Date(),
    lastAttemptAt: null,
    status: 'pending'
  };

  isolationQueues.payments.push(queueItem);

  const position = isolationQueues.payments.length;

  console.log(`[ServiceIsolation] Payment queued: ${queueItem.id}, tripId: ${paymentData.tripId}, position: ${position}`);

  return {
    success: true,
    queued: true,
    queueId: queueItem.id,
    queuePosition: position,
    tripId: paymentData.tripId,
    message: 'Payment confirmation queued - trip can proceed'
  };
};

/**
 * Send notification with automatic fallback to queue on failure
 * Requirements: 8.5 - Continue core operations when notification service fails
 * 
 * @param {Function} sendFn - Function that sends the notification
 * @param {Object} notificationData - Notification data for queuing on failure
 * @returns {Promise<Object>} Send result or queue result
 */
const sendNotificationWithIsolation = async (sendFn, notificationData) => {
  const circuitBreaker = getCircuitBreaker(CircuitBreakers.NOTIFICATION, {
    failureThreshold: 30,
    resetTimeout: 30000
  });

  // Check if circuit is open - queue immediately
  if (circuitBreaker.getState() === CircuitState.OPEN) {
    console.log('[ServiceIsolation] Notification circuit open, queuing notification');
    return queueNotification(notificationData);
  }

  try {
    // Try to send through circuit breaker
    const result = await circuitBreaker.execute(sendFn);
    return {
      success: true,
      sent: true,
      result
    };
  } catch (error) {
    // On failure, queue the notification
    console.warn(`[ServiceIsolation] Notification failed, queuing: ${error.message}`);
    const queueResult = queueNotification(notificationData);
    return {
      ...queueResult,
      originalError: error.message
    };
  }
};

/**
 * Process payment with automatic fallback to queue on gateway failure
 * Requirements: 8.4 - Allow trip to proceed when payment gateway is slow
 * 
 * @param {Function} paymentFn - Function that processes the payment
 * @param {Object} paymentData - Payment data for queuing on failure
 * @returns {Promise<Object>} Payment result or queue result
 */
const processPaymentWithIsolation = async (paymentFn, paymentData) => {
  const circuitBreaker = getCircuitBreaker(CircuitBreakers.PAYMENT, {
    failureThreshold: 50,
    resetTimeout: 30000
  });

  // Check if circuit is open - queue immediately
  if (circuitBreaker.getState() === CircuitState.OPEN) {
    console.log('[ServiceIsolation] Payment circuit open, queuing payment');
    return queuePaymentConfirmation(paymentData);
  }

  try {
    // Try to process through circuit breaker with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Payment gateway timeout')), 10000);
    });

    const result = await Promise.race([
      circuitBreaker.execute(paymentFn),
      timeoutPromise
    ]);

    return {
      success: true,
      processed: true,
      result
    };
  } catch (error) {
    // On failure or timeout, queue the payment and allow trip to proceed
    console.warn(`[ServiceIsolation] Payment failed/timeout, queuing: ${error.message}`);
    const queueResult = queuePaymentConfirmation(paymentData);
    return {
      ...queueResult,
      tripCanProceed: true,
      originalError: error.message
    };
  }
};


/**
 * Process queued notifications when service recovers
 * @param {Function} sendFn - Function to send notifications
 * @param {number} batchSize - Number of notifications to process
 * @returns {Promise<Object>} Processing results
 */
const processQueuedNotifications = async (sendFn, batchSize = 50) => {
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 0
  };

  const circuitBreaker = getCircuitBreaker(CircuitBreakers.NOTIFICATION);
  
  // Don't process if circuit is still open
  if (circuitBreaker.getState() === CircuitState.OPEN) {
    results.remaining = isolationQueues.notifications.filter(n => n.status === 'pending').length;
    return results;
  }

  const pendingItems = isolationQueues.notifications
    .filter(item => item.status === 'pending')
    .slice(0, batchSize);

  for (const item of pendingItems) {
    results.processed++;
    item.status = 'processing';
    item.lastAttemptAt = new Date();
    item.attempts++;

    try {
      await circuitBreaker.execute(() => sendFn(item.data));
      item.status = 'completed';
      results.succeeded++;
    } catch (error) {
      if (item.attempts >= 3) {
        item.status = 'failed';
        results.failed++;
      } else {
        item.status = 'pending'; // Will retry later
      }
    }
  }

  // Clean up completed/failed items older than 1 hour
  const oneHourAgo = Date.now() - 3600000;
  isolationQueues.notifications = isolationQueues.notifications.filter(item => 
    item.status === 'pending' || 
    (item.status === 'processing') ||
    (new Date(item.createdAt).getTime() > oneHourAgo)
  );

  results.remaining = isolationQueues.notifications.filter(n => n.status === 'pending').length;
  return results;
};

/**
 * Process queued payments when gateway recovers
 * @param {Function} processFn - Function to process payments
 * @param {number} batchSize - Number of payments to process
 * @returns {Promise<Object>} Processing results
 */
const processQueuedPayments = async (processFn, batchSize = 20) => {
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 0
  };

  const circuitBreaker = getCircuitBreaker(CircuitBreakers.PAYMENT);
  
  // Don't process if circuit is still open
  if (circuitBreaker.getState() === CircuitState.OPEN) {
    results.remaining = isolationQueues.payments.filter(p => p.status === 'pending').length;
    return results;
  }

  const pendingItems = isolationQueues.payments
    .filter(item => item.status === 'pending')
    .slice(0, batchSize);

  for (const item of pendingItems) {
    results.processed++;
    item.status = 'processing';
    item.lastAttemptAt = new Date();
    item.attempts++;

    try {
      await circuitBreaker.execute(() => processFn(item.data));
      item.status = 'completed';
      results.succeeded++;
    } catch (error) {
      if (item.attempts >= 3) {
        item.status = 'failed';
        results.failed++;
        console.error(`[ServiceIsolation] Payment permanently failed: ${item.id}, tripId: ${item.tripId}`);
      } else {
        item.status = 'pending'; // Will retry later
      }
    }
  }

  // Clean up completed items (keep failed for audit)
  isolationQueues.payments = isolationQueues.payments.filter(item => 
    item.status === 'pending' || 
    item.status === 'processing' ||
    item.status === 'failed'
  );

  results.remaining = isolationQueues.payments.filter(p => p.status === 'pending').length;
  return results;
};

/**
 * Get isolation queue status
 * @returns {Object} Queue statistics
 */
const getIsolationQueueStatus = () => {
  const notificationStats = {
    total: isolationQueues.notifications.length,
    pending: isolationQueues.notifications.filter(n => n.status === 'pending').length,
    processing: isolationQueues.notifications.filter(n => n.status === 'processing').length,
    completed: isolationQueues.notifications.filter(n => n.status === 'completed').length,
    failed: isolationQueues.notifications.filter(n => n.status === 'failed').length
  };

  const paymentStats = {
    total: isolationQueues.payments.length,
    pending: isolationQueues.payments.filter(p => p.status === 'pending').length,
    processing: isolationQueues.payments.filter(p => p.status === 'processing').length,
    completed: isolationQueues.payments.filter(p => p.status === 'completed').length,
    failed: isolationQueues.payments.filter(p => p.status === 'failed').length
  };

  return {
    notifications: notificationStats,
    payments: paymentStats,
    limits: QUEUE_LIMITS
  };
};

/**
 * Get pending items from a specific queue
 * @param {string} queueType - 'notifications' or 'payments'
 * @param {number} limit - Maximum items to return
 * @returns {Array} Pending queue items
 */
const getPendingItems = (queueType, limit = 100) => {
  const queue = isolationQueues[queueType];
  if (!queue) return [];

  return queue
    .filter(item => item.status === 'pending')
    .slice(0, limit)
    .map(item => ({
      id: item.id,
      type: item.type,
      createdAt: item.createdAt,
      attempts: item.attempts,
      ...(item.tripId && { tripId: item.tripId })
    }));
};

/**
 * Clear completed items from queues
 * @returns {Object} Cleanup results
 */
const clearCompletedItems = () => {
  const notificationsBefore = isolationQueues.notifications.length;
  const paymentsBefore = isolationQueues.payments.length;

  isolationQueues.notifications = isolationQueues.notifications.filter(
    item => item.status !== 'completed'
  );
  isolationQueues.payments = isolationQueues.payments.filter(
    item => item.status !== 'completed'
  );

  return {
    notificationsCleared: notificationsBefore - isolationQueues.notifications.length,
    paymentsCleared: paymentsBefore - isolationQueues.payments.length
  };
};

/**
 * Check if core operations should proceed despite service failures
 * @param {string} serviceType - Type of service that failed
 * @returns {boolean} True if core operations should continue
 */
const shouldCoreOperationsProceed = (serviceType) => {
  // Core operations always proceed - external service failures are isolated
  // This is the key principle of service isolation
  const nonCriticalServices = ['notification', 'email', 'sms', 'whatsapp', 'analytics'];
  
  if (nonCriticalServices.includes(serviceType)) {
    return true;
  }

  // For payment, check if we can queue
  if (serviceType === 'payment') {
    return isolationQueues.payments.length < QUEUE_LIMITS.payments;
  }

  return true;
};

// Export for testing
const _getQueues = () => isolationQueues;
const _clearQueues = () => {
  isolationQueues.notifications = [];
  isolationQueues.payments = [];
};

module.exports = {
  IsolationQueues,
  queueNotification,
  queuePaymentConfirmation,
  sendNotificationWithIsolation,
  processPaymentWithIsolation,
  processQueuedNotifications,
  processQueuedPayments,
  getIsolationQueueStatus,
  getPendingItems,
  clearCompletedItems,
  shouldCoreOperationsProceed,
  QUEUE_LIMITS,
  // Testing exports
  _getQueues,
  _clearQueues
};
