/**
 * Cron Jobs Manager
 * Manages all scheduled cron jobs for the HushRyd platform
 * 
 * This module initializes and starts all cron jobs:
 * - Subscription expiry check (daily at 2:00 AM)
 * - Cashback expiry check (daily at 3:00 AM)
 * - Monthly benefits reset (daily at 4:00 AM)
 */

const { scheduleSubscriptionExpiryJob } = require('./subscriptionExpiry');
const { scheduleCashbackExpiryJob } = require('./cashbackExpiry');
const { scheduleBenefitsResetJob } = require('./benefitsReset');
const { scheduleWalletExpiryJob } = require('./walletExpiry');

// Store job instances
let jobs = {
  subscriptionExpiry: null,
  cashbackExpiry: null,
  benefitsReset: null,
  walletExpiry: null
};

/**
 * Initialize and start all cron jobs
 */
const startCronJobs = () => {
  console.log('[CronJobs] Initializing cron jobs...');
  
  try {
    // Schedule all jobs
    jobs.subscriptionExpiry = scheduleSubscriptionExpiryJob();
    jobs.cashbackExpiry = scheduleCashbackExpiryJob();
    jobs.benefitsReset = scheduleBenefitsResetJob();
    scheduleWalletExpiryJob(); // This job manages its own scheduling
    
    // Start all jobs
    jobs.subscriptionExpiry.start();
    jobs.cashbackExpiry.start();
    jobs.benefitsReset.start();
    
    console.log('[CronJobs] All cron jobs started successfully');
    console.log('[CronJobs] Schedule:');
    console.log('[CronJobs]   - Subscription expiry: Daily at 2:00 AM IST');
    console.log('[CronJobs]   - Cashback expiry: Daily at 3:00 AM IST');
    console.log('[CronJobs]   - Benefits reset: Daily at 4:00 AM IST');
    console.log('[CronJobs]   - Wallet expiry: Daily at 9:00 AM IST');
  } catch (error) {
    console.error('[CronJobs] Failed to start cron jobs:', error);
    throw error;
  }
};

/**
 * Stop all cron jobs
 */
const stopCronJobs = () => {
  console.log('[CronJobs] Stopping cron jobs...');
  
  Object.keys(jobs).forEach(jobName => {
    if (jobs[jobName]) {
      jobs[jobName].stop();
      console.log(`[CronJobs] Stopped ${jobName} job`);
    }
  });
  
  console.log('[CronJobs] All cron jobs stopped');
};

/**
 * Get status of all cron jobs
 */
const getCronJobsStatus = () => {
  return {
    subscriptionExpiry: {
      running: jobs.subscriptionExpiry ? jobs.subscriptionExpiry.running : false,
      schedule: '0 2 * * *', // Daily at 2:00 AM
      timezone: 'Asia/Kolkata'
    },
    cashbackExpiry: {
      running: jobs.cashbackExpiry ? jobs.cashbackExpiry.running : false,
      schedule: '0 3 * * *', // Daily at 3:00 AM
      timezone: 'Asia/Kolkata'
    },
    benefitsReset: {
      running: jobs.benefitsReset ? jobs.benefitsReset.running : false,
      schedule: '0 4 * * *', // Daily at 4:00 AM
      timezone: 'Asia/Kolkata'
    }
  };
};

/**
 * Manually trigger a specific job (for testing/admin purposes)
 */
const triggerJob = async (jobName) => {
  console.log(`[CronJobs] Manually triggering ${jobName} job...`);
  
  try {
    switch (jobName) {
      case 'subscriptionExpiry':
        const { runSubscriptionExpiryCheck } = require('./subscriptionExpiry');
        await runSubscriptionExpiryCheck();
        break;
      
      case 'cashbackExpiry':
        const { runCashbackExpiryCheck } = require('./cashbackExpiry');
        await runCashbackExpiryCheck();
        break;
      
      case 'benefitsReset':
        const { runBenefitsResetCheck } = require('./benefitsReset');
        await runBenefitsResetCheck();
        break;
      
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
    
    console.log(`[CronJobs] Successfully triggered ${jobName} job`);
  } catch (error) {
    console.error(`[CronJobs] Failed to trigger ${jobName} job:`, error);
    throw error;
  }
};

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('[CronJobs] Received SIGINT, stopping cron jobs...');
  stopCronJobs();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[CronJobs] Received SIGTERM, stopping cron jobs...');
  stopCronJobs();
  process.exit(0);
});

module.exports = {
  startCronJobs,
  stopCronJobs,
  getCronJobsStatus,
  triggerJob
};