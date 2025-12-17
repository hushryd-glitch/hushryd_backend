/**
 * Notification Retry Service
 * Design Decision: Exponential backoff retry mechanism with logging
 * Rationale: Ensures reliable notification delivery with proper failure handling
 * 
 * Requirements: 3.5
 */

const NotificationLog = require('../models/NotificationLog');

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,      // 1 second base delay
  maxDelayMs: 30000,      // 30 seconds max delay
  backoffMultiplier: 2    // Exponential backoff multiplier
};

/**
 * Calculate delay for exponential backoff
 * @param {number} attempt - Current attempt number (1-based)
 * @returns {number} Delay in milliseconds
 */
const calculateBackoffDelay = (attempt) => {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a notification send operation with exponential backoff
 * @param {Function} sendFn - Function that sends the notification
 * @param {Object} notificationLog - Notification log document
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} Result of the send operation
 */
const retryWithBackoff = async (sendFn, notificationLog, options = {}) => {
  const maxAttempts = options.maxAttempts || RETRY_CONFIG.maxAttempts;
  let lastError = null;
  
  // Start from current attempt count
  const startAttempt = notificationLog.attempts + 1;
  
  for (let attempt = startAttempt; attempt <= maxAttempts; attempt++) {
    try {
      // Execute the send function
      const result = await sendFn();
      
      // Update notification log with success
      notificationLog.attempts = attempt;
      notificationLog.lastAttemptAt = new Date();
      notificationLog.status = 'sent';
      await notificationLog.save();
      
      return {
        success: true,
        attempts: attempt,
        result
      };
    } catch (error) {
      lastError = error;
      
      // Log the failed attempt
      notificationLog.attempts = attempt;
      notificationLog.lastAttemptAt = new Date();
      notificationLog.errorMessage = error.message;
      
      if (attempt >= maxAttempts) {
        // Max attempts reached - mark as failed
        notificationLog.status = 'failed';
        await notificationLog.save();
        
        return {
          success: false,
          attempts: attempt,
          error: error.message,
          exhausted: true
        };
      }
      
      // Save intermediate state
      await notificationLog.save();
      
      // Calculate and apply backoff delay
      const delay = calculateBackoffDelay(attempt);
      await sleep(delay);
    }
  }
  
  return {
    success: false,
    attempts: maxAttempts,
    error: lastError?.message || 'Unknown error',
    exhausted: true
  };
};

/**
 * Process pending notifications for retry
 * @param {Object} channelHandlers - Map of channel name to handler
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results
 */
const processPendingRetries = async (channelHandlers, options = {}) => {
  const limit = options.limit || 100;
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: []
  };
  
  // Get pending notifications that haven't exhausted retries
  const pendingNotifications = await NotificationLog.find({
    status: 'pending',
    attempts: { $lt: RETRY_CONFIG.maxAttempts }
  })
    .sort({ createdAt: 1 })
    .limit(limit);
  
  for (const notification of pendingNotifications) {
    results.processed++;
    
    const channelHandler = channelHandlers[notification.channel];
    if (!channelHandler) {
      results.errors.push({
        notificationId: notification._id,
        error: `No handler for channel: ${notification.channel}`
      });
      continue;
    }
    
    // Create send function for retry
    const sendFn = async () => {
      return channelHandler.send(
        notification.recipient,
        { body: notification.content, subject: notification.metadata?.subject },
        notification.metadata?.attachments || []
      );
    };
    
    const result = await retryWithBackoff(sendFn, notification);
    
    if (result.success) {
      results.succeeded++;
    } else {
      results.failed++;
      results.errors.push({
        notificationId: notification._id,
        error: result.error,
        attempts: result.attempts
      });
    }
  }
  
  return results;
};

/**
 * Get retry statistics
 * @returns {Promise<Object>} Retry statistics
 */
const getRetryStats = async () => {
  const [pending, failed, sent] = await Promise.all([
    NotificationLog.countDocuments({ status: 'pending' }),
    NotificationLog.countDocuments({ status: 'failed' }),
    NotificationLog.countDocuments({ status: 'sent' })
  ]);
  
  // Get failed notifications by channel
  const failedByChannel = await NotificationLog.aggregate([
    { $match: { status: 'failed' } },
    { $group: { _id: '$channel', count: { $sum: 1 } } }
  ]);
  
  return {
    pending,
    failed,
    sent,
    failedByChannel: failedByChannel.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {})
  };
};

/**
 * Manually retry a specific notification
 * @param {string} notificationId - Notification log ID
 * @param {Object} channelHandler - Channel handler to use
 * @returns {Promise<Object>} Retry result
 */
const retryNotification = async (notificationId, channelHandler) => {
  const notification = await NotificationLog.findById(notificationId);
  
  if (!notification) {
    throw new Error('Notification not found');
  }
  
  if (notification.status === 'delivered') {
    return {
      success: true,
      message: 'Notification already delivered',
      skipped: true
    };
  }
  
  // Reset attempts if previously failed
  if (notification.status === 'failed') {
    notification.attempts = 0;
    notification.status = 'pending';
    await notification.save();
  }
  
  const sendFn = async () => {
    return channelHandler.send(
      notification.recipient,
      { body: notification.content, subject: notification.metadata?.subject },
      notification.metadata?.attachments || []
    );
  };
  
  return retryWithBackoff(sendFn, notification);
};

module.exports = {
  RETRY_CONFIG,
  calculateBackoffDelay,
  retryWithBackoff,
  processPendingRetries,
  getRetryStats,
  retryNotification
};
