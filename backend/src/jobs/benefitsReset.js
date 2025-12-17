/**
 * Monthly Benefits Reset Cron Job
 * Runs on subscription anniversary to reset free cancellations
 * 
 * Requirements: 7.5 - Restore free cancellation count to plan limit
 */

const cron = require('node-cron');
const { resetMonthlyBenefits } = require('../services/subscriptionService');
const { sendNotification } = require('../services/notificationService');

/**
 * Send benefits reset notifications to users
 * @param {Array} resetSubscriptions - List of subscriptions that had benefits reset
 */
const sendBenefitsResetNotifications = async (resetSubscriptions) => {
  for (const subscription of resetSubscriptions) {
    try {
      // Get plan details to show the reset limit
      const { getPlanById } = require('../config/subscriptionPlans');
      const plan = getPlanById(subscription.planId);
      const freeCancellationsLimit = plan?.benefits?.freeCancellationsPerMonth || 0;

      await sendNotification({
        userId: subscription.userId,
        type: 'benefits_reset',
        title: 'Monthly Benefits Reset',
        message: `Your ${subscription.planId} subscription benefits have been reset! You now have ${freeCancellationsLimit} free cancellations for this month.`,
        data: {
          subscriptionId: subscription.subscriptionId,
          planId: subscription.planId,
          freeCancellationsLimit,
          previousUsed: subscription.previousFreeCancellationsUsed,
          nextResetAt: subscription.nextResetAt
        }
      });

      console.log(`[BenefitsReset] Sent reset notification to user ${subscription.userId} (${subscription.planId} plan)`);
    } catch (error) {
      console.error(`[BenefitsReset] Failed to send notification to user ${subscription.userId}:`, error.message);
    }
  }
};

/**
 * Main cron job function
 */
const runBenefitsResetCheck = async () => {
  console.log('[BenefitsReset] Starting monthly benefits reset check...');
  
  try {
    const results = await resetMonthlyBenefits();
    
    console.log(`[BenefitsReset] Processed ${results.processed} subscriptions`);
    
    if (results.reset.length > 0) {
      console.log(`[BenefitsReset] Reset benefits for ${results.reset.length} subscriptions`);
      await sendBenefitsResetNotifications(results.reset);
    }
    
    if (results.errors.length > 0) {
      console.error(`[BenefitsReset] ${results.errors.length} errors occurred:`, results.errors);
    }
    
    console.log('[BenefitsReset] Monthly benefits reset check completed successfully');
  } catch (error) {
    console.error('[BenefitsReset] Failed to run benefits reset check:', error);
  }
};

/**
 * Schedule the cron job to run daily at 4:00 AM
 * Note: This runs daily to check for subscriptions that need benefits reset,
 * but the actual reset logic in the service only resets when benefitsResetAt is reached
 * Requirements: Run on subscription anniversary to reset free cancellations
 */
const scheduleBenefitsResetJob = () => {
  // Run daily at 4:00 AM (after other jobs)
  const job = cron.schedule('0 4 * * *', runBenefitsResetCheck, {
    scheduled: false,
    timezone: 'Asia/Kolkata'
  });

  console.log('[BenefitsReset] Monthly benefits reset cron job scheduled (daily at 4:00 AM IST)');
  return job;
};

module.exports = {
  runBenefitsResetCheck,
  scheduleBenefitsResetJob,
  sendBenefitsResetNotifications
};