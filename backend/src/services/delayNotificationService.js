/**
 * Delay Notification Service
 * Design Decision: Proactive user notification when processing is delayed
 * Rationale: Keep users informed about delays to maintain trust and reduce support tickets
 * 
 * Requirements: 8.3 - Notify users when document processing delayed, show queue position and estimated time
 */

const { getQueueStatus } = require('../queues/documentQueue');
const { sendNotificationWithIsolation } = require('./serviceIsolationService');

/**
 * Delay thresholds in minutes
 */
const DELAY_THRESHOLDS = {
  DOCUMENT_PROCESSING: 5,    // Notify if document processing takes > 5 minutes
  PAYMENT_CONFIRMATION: 2,   // Notify if payment confirmation takes > 2 minutes
  NOTIFICATION_DELIVERY: 10  // Notify if notification delivery takes > 10 minutes
};

/**
 * Queue depth thresholds that trigger delay notifications
 */
const QUEUE_DEPTH_THRESHOLDS = {
  DOCUMENT_PROCESSING: 100,  // Notify if queue depth > 100
  HIGH_LOAD: 500            // High load warning threshold
};

/**
 * Calculate estimated wait time based on queue position and processing rate
 * @param {number} queuePosition - Position in queue
 * @param {number} processingRate - Items processed per minute
 * @returns {Object} Estimated wait time details
 */
const calculateEstimatedWait = (queuePosition, processingRate = 100) => {
  const effectiveRate = processingRate > 0 ? processingRate : 100;
  const estimatedMinutes = Math.ceil(queuePosition / effectiveRate);
  
  let waitDescription;
  if (estimatedMinutes <= 1) {
    waitDescription = 'less than a minute';
  } else if (estimatedMinutes <= 5) {
    waitDescription = `about ${estimatedMinutes} minutes`;
  } else if (estimatedMinutes <= 15) {
    waitDescription = `approximately ${estimatedMinutes} minutes`;
  } else if (estimatedMinutes <= 30) {
    waitDescription = 'about 15-30 minutes';
  } else {
    waitDescription = 'more than 30 minutes';
  }

  return {
    estimatedMinutes,
    waitDescription,
    queuePosition,
    processingRate: effectiveRate
  };
};

/**
 * Check if document processing is delayed and should notify user
 * @param {number} queuePosition - Current queue position
 * @returns {Object} Delay status
 */
const checkDocumentProcessingDelay = async (queuePosition) => {
  const queueStatus = await getQueueStatus();
  const waitInfo = calculateEstimatedWait(queuePosition, queueStatus.processingRate);

  const isDelayed = waitInfo.estimatedMinutes > DELAY_THRESHOLDS.DOCUMENT_PROCESSING;
  const isHighLoad = queueStatus.waiting > QUEUE_DEPTH_THRESHOLDS.HIGH_LOAD;

  return {
    isDelayed,
    isHighLoad,
    ...waitInfo,
    queueDepth: queueStatus.waiting,
    activeProcessing: queueStatus.active,
    shouldNotify: isDelayed || isHighLoad
  };
};

/**
 * Generate delay notification message for document processing
 * Requirements: 8.3 - Show queue position and estimated time
 * 
 * @param {Object} params - Notification parameters
 * @param {string} params.documentType - Type of document being processed
 * @param {number} params.queuePosition - Position in queue
 * @param {string} params.waitDescription - Human-readable wait time
 * @param {boolean} params.isHighLoad - Whether system is under high load
 * @returns {Object} Notification message content
 */
const generateDelayNotificationMessage = ({ documentType, queuePosition, waitDescription, isHighLoad }) => {
  const baseMessage = `Your ${documentType} is being processed.`;
  
  let statusMessage;
  if (isHighLoad) {
    statusMessage = `Due to high demand, processing may take longer than usual.`;
  } else {
    statusMessage = `We're processing documents as quickly as possible.`;
  }

  const positionMessage = `Queue position: ${queuePosition}`;
  const timeMessage = `Estimated wait: ${waitDescription}`;

  return {
    title: 'Document Processing Update',
    body: `${baseMessage} ${statusMessage}\n\n${positionMessage}\n${timeMessage}\n\nWe'll notify you when processing is complete.`,
    shortBody: `${documentType} processing - Position ${queuePosition}, ${waitDescription} wait`,
    data: {
      type: 'document_processing_delay',
      documentType,
      queuePosition,
      waitDescription
    }
  };
};


/**
 * Send delay notification to user for document processing
 * Requirements: 8.3 - Notify users when document processing delayed
 * 
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - User ID to notify
 * @param {string} params.documentType - Type of document
 * @param {number} params.queuePosition - Position in queue
 * @param {string} params.channel - Notification channel (push, sms, email)
 * @param {string} params.recipient - Recipient address/token
 * @returns {Promise<Object>} Notification result
 */
const sendDocumentDelayNotification = async ({ userId, documentType, queuePosition, channel = 'push', recipient }) => {
  const delayStatus = await checkDocumentProcessingDelay(queuePosition);
  
  // Only send if actually delayed
  if (!delayStatus.shouldNotify) {
    return {
      sent: false,
      reason: 'Processing not delayed enough to notify',
      estimatedMinutes: delayStatus.estimatedMinutes
    };
  }

  const message = generateDelayNotificationMessage({
    documentType,
    queuePosition: delayStatus.queuePosition,
    waitDescription: delayStatus.waitDescription,
    isHighLoad: delayStatus.isHighLoad
  });

  const notificationData = {
    userId,
    channel,
    template: 'document_processing_delay',
    recipient,
    data: {
      title: message.title,
      body: message.body,
      ...message.data
    }
  };

  // Use service isolation to ensure notification doesn't block core operations
  const sendFn = async () => {
    // In production, this would call the actual notification service
    console.log(`[DelayNotification] Sending delay notification to user ${userId}: ${message.shortBody}`);
    return { sent: true, message: message.shortBody };
  };

  return sendNotificationWithIsolation(sendFn, notificationData);
};

/**
 * Send payment delay notification to user
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - User ID to notify
 * @param {string} params.tripId - Trip ID
 * @param {string} params.paymentType - Type of payment (confirmation, payout)
 * @param {string} params.channel - Notification channel
 * @param {string} params.recipient - Recipient address
 * @returns {Promise<Object>} Notification result
 */
const sendPaymentDelayNotification = async ({ userId, tripId, paymentType, channel = 'push', recipient }) => {
  const message = {
    title: 'Payment Processing Update',
    body: `Your ${paymentType} for trip ${tripId} is being processed. Your trip can continue normally. We'll confirm the payment shortly.`,
    shortBody: `Payment ${paymentType} processing for trip ${tripId}`,
    data: {
      type: 'payment_delay',
      tripId,
      paymentType
    }
  };

  const notificationData = {
    userId,
    channel,
    template: 'payment_delay',
    recipient,
    data: message.data
  };

  const sendFn = async () => {
    console.log(`[DelayNotification] Sending payment delay notification to user ${userId}: ${message.shortBody}`);
    return { sent: true, message: message.shortBody };
  };

  return sendNotificationWithIsolation(sendFn, notificationData);
};

/**
 * Check queue status and send batch delay notifications if needed
 * Called periodically to notify users about delays
 * 
 * @param {Function} getUsersInQueue - Function to get users waiting in queue
 * @returns {Promise<Object>} Batch notification results
 */
const checkAndNotifyDelays = async (getUsersInQueue) => {
  const queueStatus = await getQueueStatus();
  const results = {
    checked: true,
    queueDepth: queueStatus.waiting,
    notificationsSent: 0,
    isHighLoad: queueStatus.waiting > QUEUE_DEPTH_THRESHOLDS.HIGH_LOAD
  };

  // Only send notifications if queue is significantly backed up
  if (queueStatus.waiting < QUEUE_DEPTH_THRESHOLDS.DOCUMENT_PROCESSING) {
    results.reason = 'Queue depth below notification threshold';
    return results;
  }

  // Get users waiting in queue (implementation depends on how jobs are tracked)
  if (typeof getUsersInQueue === 'function') {
    try {
      const usersInQueue = await getUsersInQueue();
      
      for (const user of usersInQueue) {
        if (user.queuePosition > QUEUE_DEPTH_THRESHOLDS.DOCUMENT_PROCESSING) {
          await sendDocumentDelayNotification({
            userId: user.userId,
            documentType: user.documentType,
            queuePosition: user.queuePosition,
            channel: user.preferredChannel || 'push',
            recipient: user.recipient
          });
          results.notificationsSent++;
        }
      }
    } catch (error) {
      console.error('[DelayNotification] Error sending batch notifications:', error);
      results.error = error.message;
    }
  }

  return results;
};

/**
 * Get current delay status for display to users
 * @returns {Promise<Object>} Current system delay status
 */
const getDelayStatus = async () => {
  const queueStatus = await getQueueStatus();
  
  const status = {
    documentProcessing: {
      queueDepth: queueStatus.waiting,
      activeProcessing: queueStatus.active,
      processingRate: queueStatus.processingRate,
      estimatedWaitMinutes: queueStatus.estimatedWaitMinutes,
      isDelayed: queueStatus.waiting > QUEUE_DEPTH_THRESHOLDS.DOCUMENT_PROCESSING,
      isHighLoad: queueStatus.waiting > QUEUE_DEPTH_THRESHOLDS.HIGH_LOAD
    },
    thresholds: {
      delayNotificationMinutes: DELAY_THRESHOLDS.DOCUMENT_PROCESSING,
      queueDepthThreshold: QUEUE_DEPTH_THRESHOLDS.DOCUMENT_PROCESSING,
      highLoadThreshold: QUEUE_DEPTH_THRESHOLDS.HIGH_LOAD
    }
  };

  // Add user-friendly status message
  if (status.documentProcessing.isHighLoad) {
    status.message = 'System is experiencing high load. Document processing may be delayed.';
    status.severity = 'warning';
  } else if (status.documentProcessing.isDelayed) {
    status.message = 'Document processing is slightly delayed. Thank you for your patience.';
    status.severity = 'info';
  } else {
    status.message = 'All systems operating normally.';
    status.severity = 'normal';
  }

  return status;
};

module.exports = {
  DELAY_THRESHOLDS,
  QUEUE_DEPTH_THRESHOLDS,
  calculateEstimatedWait,
  checkDocumentProcessingDelay,
  generateDelayNotificationMessage,
  sendDocumentDelayNotification,
  sendPaymentDelayNotification,
  checkAndNotifyDelays,
  getDelayStatus
};
