/**
 * Notification Service
 * Design Decision: Channel abstraction with template rendering and logging
 * Rationale: Enables multi-channel notifications with consistent interface and audit trail
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

const NotificationLog = require('../models/NotificationLog');

/**
 * Notification templates with variable placeholders
 * Variables are denoted by {{variableName}}
 */
const templates = {
  // Booking confirmation templates with PIN (Requirements 6.1, 6.2, 6.3, 6.4)
  booking_confirmation_email: {
    subject: 'HushRyd Booking Confirmed - {{tripId}}',
    body: `Dear {{userName}},

Your booking has been confirmed!

🔐 YOUR BOOKING PIN: {{bookingPIN}}
(Share this PIN with the driver when boarding)

Trip Details:
- Booking ID: {{bookingId}}
- Trip ID: {{tripId}}
- From: {{source}}
- To: {{destination}}
- Date: {{scheduledDate}}
- Time: {{scheduledTime}}
- Seats: {{seats}}
- Fare: ₹{{fare}}

Driver Details:
- Name: {{driverName}}
- Vehicle: {{vehicleInfo}}
- Contact: {{driverPhone}}

Thank you for choosing HushRyd!`
  },
  
  booking_confirmation_sms: {
    body: `HushRyd: Booking {{bookingId}} confirmed! PIN: {{bookingPIN}}. {{source}} to {{destination}} on {{scheduledDate}} at {{scheduledTime}}. Fare: ₹{{fare}}. Driver: {{driverName}}`
  },
  
  booking_confirmation_whatsapp: {
    body: `🚗 *HushRyd Booking Confirmed*

🔐 *Your Booking PIN: {{bookingPIN}}*
(Share with driver when boarding)

Booking ID: {{bookingId}}
Trip ID: {{tripId}}
📍 From: {{source}}
📍 To: {{destination}}
📅 Date: {{scheduledDate}}
⏰ Time: {{scheduledTime}}
🪑 Seats: {{seats}}
💰 Fare: ₹{{fare}}

Driver: {{driverName}}
Vehicle: {{vehicleInfo}}

Safe travels! 🙏`
  },
  
  // Trip status templates
  trip_started: {
    body: `HushRyd: Your trip {{tripId}} has started. Driver {{driverName}} is on the way. Track your ride in the app.`
  },
  
  trip_completed: {
    body: `HushRyd: Trip {{tripId}} completed! Total fare: ₹{{fare}}. Thank you for riding with us. Rate your experience in the app.`
  },
  
  trip_cancelled: {
    body: `HushRyd: Trip {{tripId}} has been cancelled. {{reason}} If you have questions, contact support.`
  },
  
  // OTP templates
  otp_sms: {
    body: `{{otp}} is your HushRyd verification code. Valid for 5 minutes. Do not share this code with anyone.`
  },
  
  otp_email: {
    subject: 'HushRyd Verification Code',
    body: `Your verification code is: {{otp}}

This code is valid for 5 minutes. Do not share this code with anyone.

If you didn't request this code, please ignore this email.`
  },
  
  // SOS templates
  sos_emergency_contact: {
    body: `🚨 EMERGENCY ALERT: {{userName}} has triggered an SOS alert. Location: {{locationLink}}. Trip ID: {{tripId}}. Please contact them immediately.`
  },
  
  // Document verification templates
  document_approved: {
    body: `HushRyd: Your {{documentType}} has been verified and approved. You can now accept rides.`
  },
  
  document_rejected: {
    body: `HushRyd: Your {{documentType}} was not approved. Reason: {{reason}}. Please upload a valid document.`
  },
  
  // Driver account activation notification - Requirements: 11.5
  driver_account_activated: {
    subject: '🎉 Your Driver Account is Now Active!',
    body: `Congratulations {{driverName}}!

Your HushRyd driver account has been fully verified and activated. All your documents have been approved.

You can now:
✅ Post rides and accept passengers
✅ Start earning with HushRyd
✅ Access all driver features

Start your first trip today!

Thank you for joining HushRyd.
Safe travels!`
  },
  
  document_expiry_reminder: {
    body: `HushRyd: Your {{documentType}} expires on {{expiryDate}}. Please renew it to continue driving.`
  },
  
  // Operations team notification for new document submission
  document_submission_ops: {
    subject: 'New Document Submission - {{documentType}}',
    body: `A new document has been submitted for verification.

Driver: {{driverName}}
Document Type: {{documentType}}
Document ID: {{documentId}}

Please review this document in the admin dashboard.`
  },
  
  // Missing documents notification for drivers
  missing_documents: {
    subject: 'Action Required: Missing Documents',
    body: `Dear {{driverName}},

The following documents are required to complete your driver verification:

{{documentList}}

{{customMessage}}

Please upload these documents in the HushRyd app to start accepting rides.

Thank you,
HushRyd Team`
  },
  
  // Payout failure notification for admins (Requirements: 6.5)
  payout_failure_admin: {
    subject: '⚠️ Payout Failed - Action Required',
    body: `A driver payout has failed and requires attention.

Transaction Details:
- Transaction ID: {{transactionId}}
- Trip ID: {{tripId}}
- Driver ID: {{driverId}}
- Amount: ₹{{amount}}
- Failed At: {{failedAt}}
- Retry Attempts: {{retryCount}}

Failure Reason: {{failureReason}}

Please review this payout in the admin dashboard and take appropriate action.

This is an automated notification from HushRyd Payment System.`
  },
  
  // Safety check notification for stationary vehicle detection
  // Requirements: 8.2, 8.3 - Send notification with safety options
  safety_check: {
    subject: 'Safety Check - HushRyd',
    body: `Is everything okay? Your vehicle has been stationary for an extended period.

Please respond to confirm your safety:
- Tap "Confirm Safety" if everything is fine
- Tap "Request Help" if you need assistance

Event ID: {{eventId}}
Trip ID: {{tripId}}`
  },
  
  // Safety check push notification template
  safety_check_push: {
    body: `Is everything okay? Your vehicle has been stationary for an extended period. Please confirm your safety or request help.`
  },
  
  // Cashback credit notification templates
  // Requirements: 4.4 - Notify user with amount and expiry
  cashback_credit_sms: {
    body: `🎉 HushRyd: ₹{{amount}} cashback credited to your wallet! Valid till {{expiryDate}}. Wallet balance: ₹{{walletBalance}}. Use it on your next ride!`
  },
  
  cashback_credit_email: {
    subject: 'Cashback Credited - ₹{{amount}} Added to Your Wallet',
    body: `Dear {{userName}},

🎉 Great news! Your cashback has been credited.

💰 Amount Credited: ₹{{amount}}
📅 Valid Until: {{expiryDate}}
💳 Current Wallet Balance: ₹{{walletBalance}}

You can use this cashback on your next ride booking. The cashback will be automatically applied during payment.

Thank you for choosing HushRyd!

Best regards,
HushRyd Team`
  },
  
  cashback_credit_whatsapp: {
    body: `🎉 *Cashback Credited!*

💰 *₹{{amount}} added to your wallet*
📅 Valid until: {{expiryDate}}
💳 Wallet balance: ₹{{walletBalance}}

Use this cashback on your next ride! It will be automatically applied during payment.

Thank you for riding with HushRyd! 🚗`
  },
  
  // Referral reward notification templates
  // Requirements: 2.5 - Send notification to both parties with reward details
  referral_reward_referee_sms: {
    body: `🎉 HushRyd: Welcome bonus! ₹{{amount}} credited to your wallet for joining through {{referrerName}}'s referral. Wallet balance: ₹{{walletBalance}}.`
  },
  
  referral_reward_referee_email: {
    subject: 'Welcome Bonus - ₹{{amount}} Added to Your Wallet!',
    body: `Dear {{userName}},

🎉 Welcome to HushRyd! Your referral reward has been credited.

💰 Welcome Bonus: ₹{{amount}}
👥 Referred by: {{referrerName}}
💳 Current Wallet Balance: ₹{{walletBalance}}

You can use this bonus on your next ride booking. The amount will be automatically applied during payment.

Thank you for joining HushRyd!

Best regards,
HushRyd Team`
  },
  
  referral_reward_referee_whatsapp: {
    body: `🎉 *Welcome to HushRyd!*

💰 *₹{{amount}} welcome bonus credited!*
👥 Referred by: {{referrerName}}
💳 Wallet balance: ₹{{walletBalance}}

Use this bonus on your first ride! It will be automatically applied during payment.

Welcome aboard! 🚗`
  },
  
  referral_reward_referrer_sms: {
    body: `🎉 HushRyd: Your friend {{refereeName}} joined! ₹{{amount}} referral reward credited to your wallet. Wallet balance: ₹{{walletBalance}}.`
  },
  
  referral_reward_referrer_email: {
    subject: 'Referral Reward - ₹{{amount}} Earned!',
    body: `Dear {{userName}},

🎉 Great news! Your referral reward has been credited.

💰 Referral Reward: ₹{{amount}}
👥 Friend Joined: {{refereeName}}
💳 Current Wallet Balance: ₹{{walletBalance}}

Keep sharing your referral code to earn more rewards!

Your referral code: {{referralCode}}

Thank you for spreading the word about HushRyd!

Best regards,
HushRyd Team`
  },
  
  referral_reward_referrer_whatsapp: {
    body: `🎉 *Referral Reward Earned!*

💰 *₹{{amount}} credited to your wallet*
👥 Your friend {{refereeName}} joined HushRyd!
💳 Wallet balance: ₹{{walletBalance}}

Keep sharing your referral code: *{{referralCode}}*

Thank you for spreading the word! 🚗`
  }
};

/**
 * Render a template with variable substitution
 * @param {string} templateName - Name of the template
 * @param {Object} data - Variables to substitute
 * @returns {Object} Rendered template with subject (if applicable) and body
 */
const renderTemplate = (templateName, data = {}) => {
  const template = templates[templateName];
  
  if (!template) {
    throw new Error(`Template '${templateName}' not found`);
  }
  
  const render = (text) => {
    if (!text) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  };
  
  return {
    subject: render(template.subject),
    body: render(template.body)
  };
};

/**
 * Channel handlers - to be implemented by specific channel services
 * Each channel must implement: send(recipient, content, attachments)
 */
const channels = {};

/**
 * Register a notification channel
 * @param {string} channelName - Channel identifier (sms, email, whatsapp)
 * @param {Object} handler - Channel handler with send method
 */
const registerChannel = (channelName, handler) => {
  if (!handler || typeof handler.send !== 'function') {
    throw new Error(`Channel handler must implement send method`);
  }
  channels[channelName] = handler;
};

/**
 * Get registered channel
 * @param {string} channelName - Channel identifier
 * @returns {Object} Channel handler
 */
const getChannel = (channelName) => {
  return channels[channelName];
};

/**
 * Create a notification log entry
 * @param {Object} params - Notification parameters
 * @returns {Promise<Object>} Created notification log
 */
const createNotificationLog = async ({
  userId,
  channel,
  template,
  recipient,
  content,
  relatedEntity = null,
  metadata = {}
}) => {
  const log = new NotificationLog({
    userId,
    channel,
    template,
    recipient,
    content,
    status: 'pending',
    attempts: 0,
    relatedEntity,
    metadata
  });
  
  return log.save();
};

/**
 * Send notification through a specific channel
 * @param {Object} params - Notification parameters
 * @returns {Promise<Object>} Send result with notification log
 */
const sendNotification = async ({
  userId,
  channel,
  template,
  recipient,
  data = {},
  attachments = [],
  relatedEntity = null,
  metadata = {}
}) => {
  // Validate channel - if not registered, log and return success (don't block operations)
  const channelHandler = channels[channel];
  if (!channelHandler) {
    console.log(`[Notification] Channel '${channel}' is not registered. Skipping notification.`);
    return {
      success: true,
      notificationId: null,
      channel,
      recipient,
      skipped: true,
      reason: `Channel '${channel}' not configured`
    };
  }
  
  // Render template
  const rendered = renderTemplate(template, data);
  
  // Create notification log
  const notificationLog = await createNotificationLog({
    userId,
    channel,
    template,
    recipient,
    content: rendered.body,
    relatedEntity,
    metadata: { ...metadata, subject: rendered.subject }
  });
  
  try {
    // Send through channel
    const result = await channelHandler.send(recipient, rendered, attachments);
    
    // Update log with success
    await notificationLog.recordAttempt(true);
    
    return {
      success: true,
      notificationId: notificationLog._id,
      channel,
      recipient,
      messageId: result.messageId
    };
  } catch (error) {
    // Update log with failure
    await notificationLog.recordAttempt(false, error.message);
    
    return {
      success: false,
      notificationId: notificationLog._id,
      channel,
      recipient,
      error: error.message
    };
  }
};

/**
 * Send notification to multiple channels
 * @param {Object} params - Notification parameters
 * @returns {Promise<Object[]>} Array of send results
 */
const sendMultiChannel = async ({
  userId,
  channels: channelList,
  template,
  recipients,
  data = {},
  attachments = [],
  relatedEntity = null,
  metadata = {}
}) => {
  const results = [];
  
  for (const channel of channelList) {
    const recipient = recipients[channel];
    if (!recipient) continue;
    
    // Use channel-specific template if available
    const channelTemplate = templates[`${template}_${channel}`] 
      ? `${template}_${channel}` 
      : template;
    
    try {
      const result = await sendNotification({
        userId,
        channel,
        template: channelTemplate,
        recipient,
        data,
        attachments: channel === 'whatsapp' || channel === 'email' ? attachments : [],
        relatedEntity,
        metadata
      });
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        channel,
        recipient,
        error: error.message
      });
    }
  }
  
  return results;
};

/**
 * Get notification status
 * @param {string} notificationId - Notification log ID
 * @returns {Promise<Object>} Notification log
 */
const getNotificationStatus = async (notificationId) => {
  return NotificationLog.findById(notificationId);
};

/**
 * Get notifications for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object[]>} Notification logs
 */
const getUserNotifications = async (userId, { status, channel, limit = 20, skip = 0 } = {}) => {
  const query = { userId };
  if (status) query.status = status;
  if (channel) query.channel = channel;
  
  return NotificationLog.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

/**
 * Send booking confirmation notifications via all channels
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * 
 * @param {Object} booking - Booking object with trip and user details
 * @returns {Promise<Object>} Notification results
 */
const sendBookingConfirmation = async (booking) => {
  const {
    _id: bookingId,
    bookingId: bookingRef,
    tripId,
    passengerId,
    seats,
    fare,
    passengerPIN
  } = booking;

  // Get trip details
  const Trip = require('../models/Trip');
  const User = require('../models/User');
  
  const trip = await Trip.findById(tripId)
    .populate({
      path: 'driver',
      select: 'userId vehicles',
      populate: {
        path: 'userId',
        select: 'name phone'
      }
    });

  const passenger = await User.findById(passengerId);

  if (!trip || !passenger) {
    throw new Error('Trip or passenger not found');
  }

  // Format date and time
  const scheduledDate = new Date(trip.scheduledAt).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const scheduledTime = new Date(trip.scheduledAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Get vehicle info
  let vehicleInfo = 'Vehicle details pending';
  if (trip.driver?.vehicles && trip.vehicle) {
    const vehicle = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
    if (vehicle) {
      vehicleInfo = `${vehicle.make} ${vehicle.model} (${vehicle.color})`;
    }
  }

  const notificationData = {
    userName: passenger.name || 'Passenger',
    bookingId: bookingRef,
    tripId: trip.tripId,
    source: trip.source?.address || 'Pickup location',
    destination: trip.destination?.address || 'Drop location',
    scheduledDate,
    scheduledTime,
    seats: seats || 1,
    fare: fare || 0,
    bookingPIN: passengerPIN || 'N/A',
    driverName: trip.driver?.userId?.name || 'Driver',
    driverPhone: trip.driver?.userId?.phone || 'N/A',
    vehicleInfo
  };

  // Build recipients object
  const recipients = {
    email: passenger.email,
    sms: passenger.phone,
    whatsapp: passenger.phone
  };

  // Determine which channels to use based on user preferences
  const channelsToUse = [];
  if (passenger.email) channelsToUse.push('email');
  if (passenger.phone) {
    channelsToUse.push('sms');
    // Check if user has whatsapp preference
    if (passenger.preferences?.notificationChannels?.includes('whatsapp')) {
      channelsToUse.push('whatsapp');
    }
  }

  // Send notifications
  const results = await sendMultiChannel({
    userId: passenger._id,
    channels: channelsToUse,
    template: 'booking_confirmation',
    recipients,
    data: notificationData,
    relatedEntity: {
      type: 'booking',
      id: bookingId
    },
    metadata: {
      bookingId: bookingRef,
      tripId: trip.tripId
    }
  });

  return {
    success: true,
    bookingId: bookingRef,
    channelsSent: results.filter(r => r.success).length,
    totalChannels: results.length,
    results
  };
};

/**
 * Send cashback credit notification to user
 * Requirements: 4.4 - Notify user via SMS/email with amount and expiry
 * 
 * @param {Object} user - User object with contact details
 * @param {number} amount - Cashback amount credited
 * @param {Date} expiryDate - Cashback expiry date
 * @param {number} walletBalance - Current wallet balance
 * @returns {Promise<Object>} Notification results
 */
const sendCashbackCreditNotification = async (user, amount, expiryDate, walletBalance) => {
  if (!user || !amount || !expiryDate) {
    throw new Error('User, amount, and expiry date are required');
  }

  // Format expiry date
  const formattedExpiryDate = new Date(expiryDate).toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const notificationData = {
    userName: user.name || 'User',
    amount: amount,
    expiryDate: formattedExpiryDate,
    walletBalance: walletBalance || 0
  };

  // Build recipients object
  const recipients = {
    email: user.email,
    sms: user.phone,
    whatsapp: user.phone
  };

  // Determine which channels to use based on user preferences
  const channelsToUse = [];
  if (user.email) channelsToUse.push('email');
  if (user.phone) {
    channelsToUse.push('sms');
    // Check if user has whatsapp preference
    if (user.preferences?.notificationChannels?.includes('whatsapp')) {
      channelsToUse.push('whatsapp');
    }
  }

  // Send notifications
  const results = await sendMultiChannel({
    userId: user._id,
    channels: channelsToUse,
    template: 'cashback_credit',
    recipients,
    data: notificationData,
    relatedEntity: {
      type: 'cashback',
      id: user._id
    },
    metadata: {
      amount,
      expiryDate: expiryDate.toISOString(),
      walletBalance
    }
  });

  return {
    success: true,
    userId: user._id,
    amount,
    channelsSent: results.filter(r => r.success).length,
    totalChannels: results.length,
    results
  };
};

/**
 * Send referral reward notification to user
 * Requirements: 2.5 - Send notification to both parties with reward details
 * 
 * @param {string} userId - User ID to send notification to
 * @param {Object} rewardData - Reward details
 * @returns {Promise<Object>} Notification results
 */
const sendReferralRewardNotification = async (userId, rewardData) => {
  if (!userId || !rewardData) {
    throw new Error('User ID and reward data are required');
  }

  const User = require('../models/User');
  const Wallet = require('../models/Wallet');
  
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const wallet = await Wallet.findOne({ userId });
  const walletBalance = wallet ? wallet.totalBalance : 0;

  const { type, amount, referrerName, refereeName } = rewardData;

  let notificationData = {
    userName: user.name || 'User',
    amount: amount,
    walletBalance: walletBalance
  };

  let templatePrefix = '';

  if (type === 'referee') {
    // Notification for new user who got welcome bonus
    notificationData.referrerName = referrerName;
    templatePrefix = 'referral_reward_referee';
  } else if (type === 'referrer') {
    // Notification for existing user who got referral reward
    notificationData.refereeName = refereeName;
    notificationData.referralCode = user.referralCode;
    templatePrefix = 'referral_reward_referrer';
  } else {
    throw new Error('Invalid reward type. Must be "referee" or "referrer"');
  }

  // Build recipients object
  const recipients = {
    email: user.email,
    sms: user.phone,
    whatsapp: user.phone
  };

  // Determine which channels to use based on user preferences
  const channelsToUse = [];
  if (user.email) channelsToUse.push('email');
  if (user.phone) {
    channelsToUse.push('sms');
    // Check if user has whatsapp preference
    if (user.preferences?.notificationChannels?.includes('whatsapp')) {
      channelsToUse.push('whatsapp');
    }
  }

  // Send notifications
  const results = await sendMultiChannel({
    userId: user._id,
    channels: channelsToUse,
    template: templatePrefix,
    recipients,
    data: notificationData,
    relatedEntity: {
      type: 'referral_reward',
      id: user._id
    },
    metadata: {
      rewardType: type,
      amount,
      walletBalance
    }
  });

  return {
    success: true,
    userId: user._id,
    rewardType: type,
    amount,
    channelsSent: results.filter(r => r.success).length,
    totalChannels: results.length,
    results
  };
};

module.exports = {
  templates,
  renderTemplate,
  registerChannel,
  getChannel,
  createNotificationLog,
  sendNotification,
  sendMultiChannel,
  getNotificationStatus,
  getUserNotifications,
  sendBookingConfirmation,
  sendCashbackCreditNotification,
  sendReferralRewardNotification
};
