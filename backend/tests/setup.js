/**
 * Jest Test Setup
 * Runs before all tests to configure the test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRY = '1h';
process.env.OTP_EXPIRY_MINUTES = '5';
process.env.OTP_MAX_ATTEMPTS = '3';

// Mock external service credentials for testing
process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.TWILIO_PHONE_NUMBER = '+1234567890';
process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
process.env.SENDGRID_FROM_EMAIL = 'test@hushryd.com';
process.env.WHATSAPP_API_KEY = 'test-whatsapp-key';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-whatsapp-id';
process.env.RAZORPAY_KEY_ID = 'test-razorpay-id';
process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-secret';
process.env.MONGODB_URI = 'mongodb://localhost:27017/hushryd-test';

// Global test utilities
global.testUtils = {
  /**
   * Generate a random phone number for testing
   * @returns {string} Valid Indian phone number
   */
  generatePhone: () => {
    const prefix = ['6', '7', '8', '9'][Math.floor(Math.random() * 4)];
    const rest = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    return prefix + rest;
  },

  /**
   * Generate a random email for testing
   * @returns {string} Valid email address
   */
  generateEmail: () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const name = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${name}@test.com`;
  },

  /**
   * Generate a random 6-digit OTP
   * @returns {string} 6-digit OTP
   */
  generateOTP: () => {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
};

// Increase timeout for property tests
jest.setTimeout(30000);
