/**
 * Cashback Expiry Cron Job
 * Runs daily to expire old cashback entries
 * 
 * Requirements: 4.5 - Remove expired amount from wallet and send notifications
 */

const cron = require('node-cron');
const { expireCashback } = require('../services/walletService');
const { sendNotification } = require('../services/notificationService');

/**
 * Send expiry notifications to users
 * @param {Array} expiredEntries - List of expired cashback entries
 */
const sendExpiryNotifications = async (expiredEntries) => {
  // Group expired entries by user
  const userExpiryMap = new Map();
  
  for (const entry of expiredEntries) {
    const userId = entry.userId.toString();
    if (!userExpiryMap.has(userId)) {
      userExpiryMap.set(userId, {
        userId: entry.userId,
        totalExpired: 0,
        entries: []
      });
    }
    
    const userExpiry = userExpiryMap.get(userId);
    userExpiry.totalExpired += entry.amount;
    userExpiry.entries.push(entry);
  }

  // Send notifications to each user
  for (const [userId, expiryData] of userExpiryMap) {
    try {
      await sendNotification({
        userId: expiryData.userId,
        type: 'cashback_expired',
        title: 'Cashback Expired',
        message: `₹${expiryData.totalExpired} cashback has expired from your wallet. Use your cashback before it expires!`,
        data: {
          totalExpired: expiryData.totalExpired,
          entriesCount: expiryData.entries.length,
          expiredAt: new Date().toISOString()
        }
      });

      console.log(`[CashbackExpiry] Sent expiry notification to user ${userId} for ₹${expiryData.totalExpired}`);
    } catch (error) {
      console.error(`[CashbackExpiry] Failed to send notification to user ${userId}:`, error.message);
    }
  }
};

/**
 * Main cron job function
 */
const runCashbackExpiryCheck = async () => {
  console.log('[CashbackExpiry] Starting cashback expiry check...');
  
  try {
    const results = await expireCashback();
    
    console.log(`[CashbackExpiry] Processed ${results.processed} wallets`);
    console.log(`[CashbackExpiry] Total expired amount: ₹${results.totalExpiredAmount}`);
    
    if (results.expiredEntries.length > 0) {
      console.log(`[CashbackExpiry] Expired ${results.expiredEntries.length} cashback entries`);
      await sendExpiryNotifications(results.expiredEntries);
    }
    
    if (results.errors.length > 0) {
      console.error(`[CashbackExpiry] ${results.errors.length} errors occurred:`, results.errors);
    }
    
    console.log('[CashbackExpiry] Cashback expiry check completed successfully');
  } catch (error) {
    console.error('[CashbackExpiry] Failed to run cashback expiry check:', error);
  }
};

/**
 * Schedule the cron job to run daily at 3:00 AM
 * Requirements: Run daily to expire old cashback entries
 */
const scheduleCashbackExpiryJob = () => {
  // Run daily at 3:00 AM (after subscription expiry job)
  const job = cron.schedule('0 3 * * *', runCashbackExpiryCheck, {
    scheduled: false,
    timezone: 'Asia/Kolkata'
  });

  console.log('[CashbackExpiry] Cashback expiry cron job scheduled (daily at 3:00 AM IST)');
  return job;
};

module.exports = {
  runCashbackExpiryCheck,
  scheduleCashbackExpiryJob,
  sendExpiryNotifications
};