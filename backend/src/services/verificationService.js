/**
 * Verification Service
 * Implements ride verification code generation and validation
 * 
 * Requirements: 7.1, 7.4, 7.5, 7.6
 */

const Booking = require('../models/Booking');
const Trip = require('../models/Trip');

// In-memory store for verification attempts (in production, use Redis)
const verificationAttempts = new Map();

// Store for active verification codes to ensure uniqueness
const activeVerificationCodes = new Map();

/**
 * Generate a unique 4-digit verification code
 * Ensures uniqueness within active bookings
 * 
 * Requirements: 7.1
 * 
 * @param {string} bookingId - Booking ID to associate with the code
 * @returns {Promise<Object>} Generated verification code details
 */
const generateCode = async (bookingId) => {
  // Find booking
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Check if booking already has a verification code
  if (booking.verificationCode) {
    return {
      success: true,
      code: booking.verificationCode,
      bookingId: booking.bookingId,
      existing: true
    };
  }

  // Generate unique 4-digit code
  let code;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    code = generateRandomCode();
    attempts++;
  } while (await isCodeInUse(code) && attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    const error = new Error('Unable to generate unique verification code');
    error.code = 'CODE_GENERATION_FAILED';
    error.statusCode = 500;
    throw error;
  }

  // Store code with booking
  booking.verificationCode = code;
  await booking.save();

  // Track active code
  activeVerificationCodes.set(code, {
    bookingId: booking._id.toString(),
    createdAt: new Date()
  });

  // Initialize attempt counter
  verificationAttempts.set(booking._id.toString(), {
    attempts: 0,
    maxAttempts: 3,
    lastAttempt: null
  });

  return {
    success: true,
    code,
    bookingId: booking.bookingId,
    existing: false,
    expiresAt: booking.expiresAt || null,
    maxAttempts: 3
  };
};

/**
 * Generate a random 4-digit code
 * @returns {string} 4-digit code string
 */
const generateRandomCode = () => {
  // Generate number between 1000 and 9999 (always 4 digits)
  const num = Math.floor(1000 + Math.random() * 9000);
  return String(num);
};

/**
 * Check if a verification code is already in use by an active booking
 * @param {string} code - Code to check
 * @returns {Promise<boolean>} True if code is in use
 */
const isCodeInUse = async (code) => {
  // Check in-memory cache first
  if (activeVerificationCodes.has(code)) {
    return true;
  }

  // Check database for active bookings with this code
  const existingBooking = await Booking.findOne({
    verificationCode: code,
    status: { $in: ['pending', 'confirmed'] }
  });

  return !!existingBooking;
};

/**
 * Validate verification code for ride start
 * Tracks validation attempts (max 3)
 * 
 * Requirements: 7.4, 7.5, 7.6
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} enteredCode - Code entered by driver
 * @returns {Promise<Object>} Validation result
 */
const validateCode = async (bookingId, enteredCode) => {
  // Find booking
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Check if booking is confirmed
  if (booking.status !== 'confirmed') {
    const error = new Error('Booking is not confirmed');
    error.code = 'BOOKING_NOT_CONFIRMED';
    error.statusCode = 400;
    throw error;
  }

  // Check if booking has a verification code
  if (!booking.verificationCode) {
    const error = new Error('No verification code found for this booking');
    error.code = 'NO_VERIFICATION_CODE';
    error.statusCode = 400;
    throw error;
  }

  // Get or initialize attempt tracking
  const bookingIdStr = booking._id.toString();
  let attemptData = verificationAttempts.get(bookingIdStr);
  
  if (!attemptData) {
    attemptData = {
      attempts: 0,
      maxAttempts: 3,
      lastAttempt: null
    };
    verificationAttempts.set(bookingIdStr, attemptData);
  }

  // Check if max attempts exceeded
  if (attemptData.attempts >= attemptData.maxAttempts) {
    return {
      success: false,
      isValid: false,
      message: 'Maximum verification attempts exceeded. Please contact support.',
      attemptsRemaining: 0,
      locked: true
    };
  }

  // Validate code format
  if (!enteredCode || !/^\d{4}$/.test(enteredCode)) {
    return {
      success: false,
      isValid: false,
      message: 'Invalid code format. Code must be 4 digits.',
      attemptsRemaining: attemptData.maxAttempts - attemptData.attempts
    };
  }

  // Increment attempt counter
  attemptData.attempts++;
  attemptData.lastAttempt = new Date();
  verificationAttempts.set(bookingIdStr, attemptData);

  // Compare codes
  const isValid = booking.verificationCode === enteredCode;

  if (isValid) {
    // Mark booking as verified
    booking.verifiedAt = new Date();
    await booking.save();

    // Clean up tracking data
    verificationAttempts.delete(bookingIdStr);
    activeVerificationCodes.delete(booking.verificationCode);

    return {
      success: true,
      isValid: true,
      message: 'Verification successful. Ride can start.',
      verifiedAt: booking.verifiedAt
    };
  }

  // Invalid code
  const attemptsRemaining = attemptData.maxAttempts - attemptData.attempts;
  
  return {
    success: true,
    isValid: false,
    message: attemptsRemaining > 0 
      ? `Incorrect code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`
      : 'Maximum verification attempts exceeded. Please contact support.',
    attemptsRemaining,
    locked: attemptsRemaining === 0
  };
};

/**
 * Get verification attempts for a booking
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Attempt information
 */
const getAttempts = async (bookingId) => {
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const bookingIdStr = booking._id.toString();
  const attemptData = verificationAttempts.get(bookingIdStr);

  if (!attemptData) {
    return {
      success: true,
      attempts: 0,
      maxAttempts: 3,
      attemptsRemaining: 3,
      locked: false
    };
  }

  return {
    success: true,
    attempts: attemptData.attempts,
    maxAttempts: attemptData.maxAttempts,
    attemptsRemaining: attemptData.maxAttempts - attemptData.attempts,
    lastAttempt: attemptData.lastAttempt,
    locked: attemptData.attempts >= attemptData.maxAttempts
  };
};

/**
 * Reset verification attempts for a booking
 * Used by support staff to unlock verification
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Reset result
 */
const resetAttempts = async (bookingId) => {
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const bookingIdStr = booking._id.toString();
  verificationAttempts.delete(bookingIdStr);

  return {
    success: true,
    message: 'Verification attempts reset successfully',
    bookingId: booking.bookingId
  };
};

/**
 * Start ride after successful verification
 * Updates trip status to in_progress
 * 
 * Requirements: 7.5
 * 
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Ride start result
 */
const startRideAfterVerification = async (bookingId) => {
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Check if booking is verified
  if (!booking.verifiedAt) {
    const error = new Error('Booking has not been verified');
    error.code = 'NOT_VERIFIED';
    error.statusCode = 400;
    throw error;
  }

  // Get trip and update status
  const trip = await Trip.findById(booking.tripId);
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Update trip status to in_progress
  if (trip.status !== 'in_progress') {
    trip.status = 'in_progress';
    trip.startedAt = new Date();
    await trip.save();
  }

  return {
    success: true,
    message: 'Ride started successfully',
    tripId: trip.tripId,
    startedAt: trip.startedAt
  };
};

/**
 * Validate verification code format
 * @param {string} code - Code to validate
 * @returns {Object} Validation result
 */
const validateCodeFormat = (code) => {
  if (!code) {
    return { isValid: false, message: 'Code is required' };
  }
  
  if (typeof code !== 'string') {
    return { isValid: false, message: 'Code must be a string' };
  }
  
  if (!/^\d{4}$/.test(code)) {
    return { isValid: false, message: 'Code must be exactly 4 digits' };
  }
  
  return { isValid: true, message: 'Valid code format' };
};

/**
 * Clean up expired verification codes
 * Should be called periodically by a background job
 * @returns {Promise<Object>} Cleanup results
 */
const cleanupExpiredCodes = async () => {
  const now = new Date();
  let cleaned = 0;

  // Clean up in-memory tracking for completed/cancelled bookings
  for (const [code, data] of activeVerificationCodes.entries()) {
    const booking = await Booking.findById(data.bookingId);
    if (!booking || !['pending', 'confirmed'].includes(booking.status)) {
      activeVerificationCodes.delete(code);
      verificationAttempts.delete(data.bookingId);
      cleaned++;
    }
  }

  return {
    success: true,
    cleanedCodes: cleaned,
    timestamp: now
  };
};

module.exports = {
  generateCode,
  generateRandomCode,
  isCodeInUse,
  validateCode,
  getAttempts,
  resetAttempts,
  startRideAfterVerification,
  validateCodeFormat,
  cleanupExpiredCodes
};
