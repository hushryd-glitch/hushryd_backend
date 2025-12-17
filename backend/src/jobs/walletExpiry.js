/**
 * Wallet Expiry Job
 * Scheduled job to handle wallet balance expiry and notifications
 * 
 * Requirements: 3.5 - Remove expired amount from wallet and notify user
 */

const { expirePromotionalCredits } = require('../services/walletService');
const { sendNotification } = require('../services/notificationService');
const User = require('../models/User');

/**
 * Process wallet balance expiry
 * Runs daily to expire old promotional credits and notify users
 */
const processWalletExpiry = async () => {
  console.log('[WalletExpiryJob] Starting wallet expiry processing...');
  
  try {
    // Expire promotional credits
    const expiryResults = await expirePromotionalCredits();
    
    console.log(`[WalletExpiryJob] Processed ${expiryResults.processed} expired credits, total amount: ₹${expiryResults.totalExpiredAmount}`);
    
    // Send notifications for expired amounts (if any users were affected)
    if (expiryResults.processed > 0) {
      await notifyExpiredBalances(expiryResults);
    }
    
    // Check for balances expiring soon and send warnings
    await sendExpiryWarnings();
    
    return {
      success: true,
      processed: expiryResults.processed,
      totalExpired: expiryResults.totalExpiredAmount
    };
    
  } catch (error) {
    console.error('[WalletExpiryJob] Error processing wallet expiry:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send notifications for expired balances
 * 
 * @param {Object} expiryResults - Results from expiry processing
 */
const notifyExpiredBalances = async (expiryResults) => {
  // Group expired entries by user
  const userExpiryMap = new Map();
  
  for (const entry of expiryResults.expiredEntries || []) {
    if (!userExpiryMap.has(entry.userId)) {
      userExpiryMap.set(entry.userId, {
        userId: entry.userId,
        totalExpired: 0,
        entries: []
      });
    }
    
    const userExpiry = userExpiryMap.get(entry.userId);
    userExpiry.totalExpired += entry.amount;
    userExpiry.entries.push(entry);
  }
  
  // Send notifications to affected users
  for (const [userId, expiryData] of userExpiryMap) {
    try {
      const user = await User.findById(userId);
      if (!user) continue;
      
      const message = `₹${expiryData.totalExpired} from your wallet has expired. Complete rides to earn more cashback!`;
      
      await sendNotification({
        userId: user._id,
        type: 'wallet_expired',
        title: 'Wallet Balance Expired',
        message: message,
        data: {
          expiredAmount: expiryData.totalExpired,
          entriesCount: expiryData.entries.length
        }
      });
      
      console.log(`[WalletExpiryJob] Sent expiry notification to user ${userId} for ₹${expiryData.totalExpired}`);
      
    } catch (error) {
      console.error(`[WalletExpiryJob] Failed to notify user ${userId}:`, error.message);
    }
  }
};

/**
 * Send warnings for balances expiring soon
 * Notifies users about balances expiring within 3 days
 */
const sendExpiryWarnings = async () => {
  const Transaction = require('../models/Transaction');
  
  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    
    // Find transactions expiring within 3 days
    const expiringTransactions = await Transaction.find({
      type: 'credit',
      category: { $in: ['promo', 'cashback'] },
      status: 'completed',
      expiryDate: { $lte: threeDaysFromNow, $gt: now }
    }).populate('userId', 'name email mobile');
    
    // Group by user and urgency
    const userWarnings = new Map();
    
    for (const tx of expiringTransactions) {
      if (!tx.userId) continue;
      
      const userId = tx.userId._id.toString();
      const isUrgent = tx.expiryDate <= oneDayFromNow;
      
      if (!userWarnings.has(userId)) {
        userWarnings.set(userId, {
          user: tx.userId,
          urgentAmount: 0,
          soonAmount: 0,
          urgentEntries: [],
          soonEntries: []
        });
      }
      
      const warning = userWarnings.get(userId);
      
      if (isUrgent) {
        warning.urgentAmount += tx.amount;
        warning.urgentEntries.push(tx);
      } else {
        warning.soonAmount += tx.amount;
        warning.soonEntries.push(tx);
      }
    }
    
    // Send warnings to users
    for (const [userId, warningData] of userWarnings) {
      try {
        let message, title, priority;
        
        if (warningData.urgentAmount > 0) {
          title = 'Urgent: Cashback Expiring Today!';
          message = `₹${warningData.urgentAmount} from your wallet expires within 24 hours. Book a ride now to use it!`;
          priority = 'high';
        } else {
          title = 'Cashback Expiring Soon';
          message = `₹${warningData.soonAmount} from your wallet expires within 3 days. Don't let it go to waste!`;
          priority = 'medium';
        }
        
        await sendNotification({
          userId: warningData.user._id,
          type: 'wallet_expiring',
          title: title,
          message: message,
          priority: priority,
          data: {
            urgentAmount: warningData.urgentAmount,
            soonAmount: warningData.soonAmount,
            totalAmount: warningData.urgentAmount + warningData.soonAmount
          }
        });
        
        console.log(`[WalletExpiryJob] Sent expiry warning to user ${userId} for ₹${warningData.urgentAmount + warningData.soonAmount}`);
        
      } catch (error) {
        console.error(`[WalletExpiryJob] Failed to send warning to user ${userId}:`, error.message);
      }
    }
    
    console.log(`[WalletExpiryJob] Sent expiry warnings to ${userWarnings.size} users`);
    
  } catch (error) {
    console.error('[WalletExpiryJob] Error sending expiry warnings:', error);
  }
};

/**
 * Schedule wallet expiry job
 * Sets up cron job to run daily at 9 AM
 */
const scheduleWalletExpiryJob = () => {
  const cron = require('node-cron');
  
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[WalletExpiryJob] Running scheduled wallet expiry job...');
    await processWalletExpiry();
  }, {
    timezone: 'Asia/Kolkata'
  });
  
  console.log('[WalletExpiryJob] Scheduled daily wallet expiry job at 9:00 AM IST');
};

module.exports = {
  processWalletExpiry,
  scheduleWalletExpiryJob,
  notifyExpiredBalances,
  sendExpiryWarnings
};