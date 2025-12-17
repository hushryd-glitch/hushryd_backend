/**
 * Subscription Expiry Cron Job
 * Runs daily to check and expire old subscriptions
 * 
 * Requirements: 3.5 - Downgrade expired users to Normal plan and send notifications
 */

const cron = require('node-cron');
const { checkAndExpireSubscriptions } = require('../services/subscriptionService');
const { sendNotification } = require('../services/notificationService');

/**
 * Send expiry notifications to users
 * @param {Array} expiredSubscriptions - List of expired subscriptions
 */
const sendExpiryNotifications = async (expiredSubscriptions) => {
  for (const subscription of expiredSubscriptions) {
    try {
      await sendNotification({
        userId: subscription.userId,
        type: 'subscription_expired',
        title: 'Subscription Expired',
        message: `Your ${subscription.planId} subscription has expired. You've been moved to the Normal plan.`,
        data: {
          subscriptionId: subscription.subscriptionId,
          planId: subscription.planId,
          expiredAt: subscription.expiredAt
        }
      });

      console.log(`[SubscriptionExpiry] Sent expiry notification to user ${subscription.userId}`);
    } catch (error) {
      console.error(`[SubscriptionExpiry] Failed to send notification to user ${subscription.userId}:`, error.message);
    }
  }
};

/**
 * Main cron job function
 */
const runSubscriptionExpiryCheck = async () => {
  console.log('[SubscriptionExpiry] Starting subscription expiry check...');
  
  try {
    const results = await checkAndExpireSubscriptions();
    
    console.log(`[SubscriptionExpiry] Processed ${results.processed} subscriptions`);
    
    if (results.expired.length > 0) {
      console.log(`[SubscriptionExpiry] Expired ${results.expired.length} subscriptions`);
      await sendExpiryNotifications(results.expired);
    }
    
    if (results.errors.length > 0) {
      console.error(`[SubscriptionExpiry] ${results.errors.length} errors occurred:`, results.errors);
    }
    
    console.log('[SubscriptionExpiry] Subscription expiry check completed successfully');
  } catch (error) {
    console.error('[SubscriptionExpiry] Failed to run subscription expiry check:', error);
  }
};

/**
 * Schedule the cron job to run daily at 2:00 AM
 * Requirements: Run daily to check and expire subscriptions
 */
const scheduleSubscriptionExpiryJob = () => {
  // Run daily at 2:00 AM
  const job = cron.schedule('0 2 * * *', runSubscriptionExpiryCheck, {
    scheduled: false,
    timezone: 'Asia/Kolkata'
  });

  console.log('[SubscriptionExpiry] Subscription expiry cron job scheduled (daily at 2:00 AM IST)');
  return job;
};

module.exports = {
  runSubscriptionExpiryCheck,
  scheduleSubscriptionExpiryJob,
  sendExpiryNotifications
};