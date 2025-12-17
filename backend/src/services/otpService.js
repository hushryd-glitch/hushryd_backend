/**
 * OTP Service
 * Handles OTP generation, storage, verification, and SMS delivery
 * Design Decision: 6-digit OTP with bcrypt hashing and 5-minute expiry
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
const bcrypt = require('bcryptjs');
const OTP = require('../models/OTP');
const NotificationLog = require('../models/NotificationLog');
const { getInstance: getTwilioService } = require('./twilioService');
const { createLogger } = require('./loggerService');
const loggerService = createLogger('otp');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 3;
const BCRYPT_SALT_ROUNDS = 10;
const SMS_MAX_RETRIES = 3;
const SMS_RETRY_INTERVAL_MS = 10000; // 10 seconds

// Demo OTP for testing - always works with code "123456"
// Set DEMO_OTP_ENABLED=true in .env to enable
const DEMO_OTP_ENABLED = process.env.DEMO_OTP_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
const DEMO_OTP_CODE = '123456';

/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit numeric OTP
 */
const generateOTPCode = () => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

/**
 * Format phone number for Indian numbers (+91)
 * @param {string} phone - Phone number in various formats
 * @returns {string} Formatted phone number in E.164 format
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If already has country code (starts with +), return as is
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Indian numbers: add +91 prefix for 10-digit numbers
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  
  // If 12 digits starting with 91, add +
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  
  // If 11 digits starting with 0 (local format), remove 0 and add +91
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.substring(1)}`;
  }
  
  // Default: add + prefix
  return `+${digits}`;
};

/**
 * Mask phone number showing only last 4 digits
 * @param {string} phone - Phone number to mask
 * @returns {string} Masked phone number (e.g., "******1234")
 */
const maskPhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Remove all non-digit characters for processing
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 4) {
    return '*'.repeat(digits.length);
  }
  
  const lastFour = digits.slice(-4);
  const maskedPart = '*'.repeat(digits.length - 4);
  
  return maskedPart + lastFour;
};

/**
 * Calculate expiry timestamp (5 minutes from now)
 * @returns {Date} Expiry timestamp
 */
const calculateExpiry = () => {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
};

/**
 * Generate and store OTP for a given identifier
 * @param {string} identifier - Phone number or email
 * @param {string} type - 'phone' or 'email'
 * @returns {Promise<{otp: string, expiresAt: Date}>} Plain OTP and expiry time
 */
const generateOTP = async (identifier, type) => {
  if (!identifier || !type) {
    throw new Error('Identifier and type are required');
  }
  
  if (!['phone', 'email'].includes(type)) {
    throw new Error('Type must be phone or email');
  }
  
  // Generate 6-digit OTP
  const plainOTP = generateOTPCode();
  
  // Log OTP to console for development/testing
  // TODO: Remove this in production!
  console.log('\n========================================');
  console.log(`🔐 OTP for ${maskPhoneNumber(identifier)}: ${plainOTP}`);
  console.log(`   Expires in ${OTP_EXPIRY_MINUTES} minutes`);
  if (DEMO_OTP_ENABLED) {
    console.log(`   💡 Demo OTP: ${DEMO_OTP_CODE} (always works)`);
  }
  console.log('========================================\n');
  
  // Hash the OTP for secure storage
  const hashedOTP = await bcrypt.hash(plainOTP, BCRYPT_SALT_ROUNDS);
  
  // Calculate expiry (5 minutes from now)
  const expiresAt = calculateExpiry();
  
  // Store OTP (removes any existing OTPs for this identifier)
  await OTP.createOTP(identifier, type, hashedOTP);
  
  return {
    otp: plainOTP,
    expiresAt
  };
};


/**
 * Verify OTP for a given identifier
 * @param {string} identifier - Phone number or email
 * @param {string} type - 'phone' or 'email'
 * @param {string} submittedOTP - OTP submitted by user
 * @returns {Promise<{success: boolean, error?: string, errorCode?: string}>}
 */
const verifyOTP = async (identifier, type, submittedOTP) => {
  if (!identifier || !type || !submittedOTP) {
    return {
      success: false,
      error: 'Identifier, type, and OTP are required',
      errorCode: 'AUTH_001'
    };
  }
  
  // Check for demo OTP first (123456 always works in dev mode)
  if (DEMO_OTP_ENABLED && submittedOTP === DEMO_OTP_CODE) {
    console.log(`\n✅ Demo OTP accepted for ${maskPhoneNumber(identifier)}\n`);
    
    // Mark any existing OTP as verified
    await OTP.updateMany(
      { identifier, type, verified: false },
      { $set: { verified: true } }
    );
    
    return { success: true };
  }
  
  // Find OTP record
  const otpRecord = await OTP.findOne({ identifier, type, verified: false });
  
  if (!otpRecord) {
    return {
      success: false,
      error: 'No OTP found. Please request a new OTP.',
      errorCode: 'AUTH_002'
    };
  }
  
  // Check if expired
  if (otpRecord.isExpired()) {
    return {
      success: false,
      error: 'OTP has expired. Please request a new OTP.',
      errorCode: 'AUTH_002'
    };
  }
  
  // Check if locked (max attempts exceeded)
  if (otpRecord.isLocked()) {
    return {
      success: false,
      error: 'Maximum attempts exceeded. Please request a new OTP.',
      errorCode: 'AUTH_004'
    };
  }
  
  // Compare OTP with stored hash
  const isMatch = await bcrypt.compare(submittedOTP, otpRecord.code);
  
  if (!isMatch) {
    // Increment attempt counter atomically
    await OTP.findByIdAndUpdate(otpRecord._id, { $inc: { attempts: 1 } });
    
    const remainingAttempts = OTP_MAX_ATTEMPTS - (otpRecord.attempts + 1);
    
    return {
      success: false,
      error: remainingAttempts > 0 
        ? `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`
        : 'Maximum attempts exceeded. Please request a new OTP.',
      errorCode: remainingAttempts > 0 ? 'AUTH_003' : 'AUTH_004'
    };
  }
  
  // Mark OTP as verified atomically
  const updated = await OTP.findByIdAndUpdate(
    otpRecord._id,
    { $set: { verified: true } },
    { new: true }
  );
  
  if (!updated) {
    return {
      success: false,
      error: 'OTP verification failed. Please request a new OTP.',
      errorCode: 'AUTH_002'
    };
  }
  
  return { success: true };
};

/**
 * Check if OTP is locked or expired (for validation before verification)
 * @param {string} identifier - Phone number or email
 * @param {string} type - 'phone' or 'email'
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
const checkOTPStatus = async (identifier, type) => {
  const otpRecord = await OTP.findOne({ identifier, type, verified: false });
  
  if (!otpRecord) {
    return { valid: false, reason: 'No OTP found' };
  }
  
  if (otpRecord.isExpired()) {
    return { valid: false, reason: 'OTP expired' };
  }
  
  if (otpRecord.isLocked()) {
    return { valid: false, reason: 'Maximum attempts exceeded' };
  }
  
  return { valid: true };
};

/**
 * Sleep utility for retry intervals
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send OTP via SMS with retry mechanism
 * @param {string} phoneNumber - Phone number to send OTP to
 * @param {string} otp - OTP code to send
 * @param {string} userId - User ID for logging (optional)
 * @returns {Promise<{success: boolean, messageId?: string, maskedPhone: string, attempts: number, error?: string}>}
 */
const sendOTPViaSMS = async (phoneNumber, otp, userId = null) => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const maskedPhone = maskPhoneNumber(phoneNumber);
  const twilioService = getTwilioService();
  
  let lastError = null;
  let attempts = 0;
  let messageId = null;
  let notificationLog = null;
  
  // Create notification log entry for tracking
  if (userId) {
    try {
      notificationLog = new NotificationLog({
        userId,
        channel: 'sms',
        template: 'otp_verification',
        recipient: maskedPhone,
        content: `Your HushRyd verification code is: ${otp}`,
        status: 'pending',
        attempts: 0
      });
      await notificationLog.save();
    } catch (logError) {
      loggerService.warn('Failed to create notification log', { error: logError.message });
    }
  }
  
  // Retry loop with max 3 attempts
  for (let attempt = 1; attempt <= SMS_MAX_RETRIES; attempt++) {
    attempts = attempt;
    
    try {
      loggerService.info(`SMS delivery attempt ${attempt}/${SMS_MAX_RETRIES}`, {
        phone: maskedPhone,
        attempt
      });
      
      const result = await twilioService.send(formattedPhone, {
        body: `Your HushRyd verification code is: ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`
      });
      
      messageId = result.messageId;
      
      // Log successful delivery
      loggerService.info('OTP SMS delivered successfully', {
        phone: maskedPhone,
        messageId,
        attempt
      });
      
      // Update notification log
      if (notificationLog) {
        notificationLog.status = 'sent';
        notificationLog.attempts = attempt;
        notificationLog.lastAttemptAt = new Date();
        notificationLog.metadata = { messageId };
        await notificationLog.save();
      }
      
      return {
        success: true,
        messageId,
        maskedPhone,
        attempts
      };
    } catch (error) {
      lastError = error;
      
      loggerService.warn(`SMS delivery attempt ${attempt} failed`, {
        phone: maskedPhone,
        attempt,
        error: error.message
      });
      
      // Update notification log with attempt
      if (notificationLog) {
        notificationLog.attempts = attempt;
        notificationLog.lastAttemptAt = new Date();
        notificationLog.errorMessage = error.message;
        await notificationLog.save();
      }
      
      // Wait before retry (except on last attempt)
      if (attempt < SMS_MAX_RETRIES) {
        await sleep(SMS_RETRY_INTERVAL_MS);
      }
    }
  }
  
  // All retries failed
  loggerService.error('OTP SMS delivery failed after all retries', {
    phone: maskedPhone,
    attempts,
    error: lastError?.message
  });
  
  // Mark notification as failed
  if (notificationLog) {
    notificationLog.status = 'failed';
    await notificationLog.save();
  }
  
  return {
    success: false,
    maskedPhone,
    attempts,
    error: lastError?.message || 'SMS delivery failed after all retries'
  };
};

/**
 * Generate OTP and send via SMS
 * @param {string} phoneNumber - Phone number to send OTP to
 * @param {string} userId - User ID for logging (optional)
 * @returns {Promise<{success: boolean, maskedPhone: string, expiresAt?: Date, error?: string}>}
 */
const generateAndSendOTP = async (phoneNumber, userId = null) => {
  try {
    // Generate OTP
    const { otp, expiresAt } = await generateOTP(phoneNumber, 'phone');
    
    // Send via SMS
    const smsResult = await sendOTPViaSMS(phoneNumber, otp, userId);
    
    if (smsResult.success) {
      return {
        success: true,
        maskedPhone: smsResult.maskedPhone,
        expiresAt,
        messageId: smsResult.messageId
      };
    } else {
      return {
        success: false,
        maskedPhone: smsResult.maskedPhone,
        error: smsResult.error,
        attempts: smsResult.attempts
      };
    }
  } catch (error) {
    loggerService.error('Failed to generate and send OTP', { error: error.message });
    return {
      success: false,
      maskedPhone: maskPhoneNumber(phoneNumber),
      error: error.message
    };
  }
};

/**
 * Get SMS delivery status from notification log
 * @param {string} messageId - Twilio message ID
 * @returns {Promise<{status: string, attempts: number, lastAttemptAt?: Date}>}
 */
const getDeliveryStatus = async (messageId) => {
  const log = await NotificationLog.findOne({ 'metadata.messageId': messageId });
  
  if (!log) {
    return { status: 'unknown', attempts: 0 };
  }
  
  return {
    status: log.status,
    attempts: log.attempts,
    lastAttemptAt: log.lastAttemptAt,
    deliveredAt: log.deliveredAt
  };
};

module.exports = {
  generateOTPCode,
  calculateExpiry,
  generateOTP,
  verifyOTP,
  checkOTPStatus,
  formatPhoneNumber,
  maskPhoneNumber,
  sendOTPViaSMS,
  generateAndSendOTP,
  getDeliveryStatus,
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  SMS_MAX_RETRIES,
  SMS_RETRY_INTERVAL_MS
};
