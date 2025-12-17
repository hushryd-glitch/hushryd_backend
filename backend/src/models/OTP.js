const mongoose = require('mongoose');

/**
 * OTP Schema
 * Design Decision: Store hashed OTP codes with TTL index for automatic cleanup
 * Rationale: Security through hashing, automatic expiry cleanup reduces database maintenance
 */
const OTPSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: [true, 'Identifier (phone or email) is required'],
    trim: true,
    index: true
  },
  type: {
    type: String,
    required: [true, 'OTP type is required'],
    enum: ['phone', 'email']
  },
  code: {
    type: String,
    required: [true, 'OTP code is required']
    // Note: This stores the bcrypt hashed OTP, not plaintext
  },
  attempts: {
    type: Number,
    default: 0,
    max: [3, 'Maximum attempts exceeded']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry time is required']
  },
  verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// TTL index to auto-delete expired OTPs
// MongoDB will automatically remove documents when expiresAt time is reached
// Note: expiresAt already has index: true in schema, but we need TTL behavior
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });

// Compound index for efficient lookups
OTPSchema.index({ identifier: 1, type: 1 });

/**
 * Check if OTP is expired
 * @returns {boolean} True if expired
 */
OTPSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

/**
 * Check if maximum attempts exceeded
 * @returns {boolean} True if max attempts exceeded
 */
OTPSchema.methods.isLocked = function() {
  return this.attempts >= 3;
};

/**
 * Increment attempt counter
 * @returns {Promise<Object>} Updated OTP document
 */
OTPSchema.methods.incrementAttempts = async function() {
  this.attempts += 1;
  return this.save();
};

/**
 * Static method to create OTP with 5-minute expiry
 * @param {string} identifier - Phone or email
 * @param {string} type - 'phone' or 'email'
 * @param {string} hashedCode - Bcrypt hashed OTP code
 * @returns {Promise<Object>} Created OTP document
 */
OTPSchema.statics.createOTP = async function(identifier, type, hashedCode) {
  // Remove any existing OTPs for this identifier
  await this.deleteMany({ identifier, type });
  
  // Create new OTP with 5-minute expiry
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  
  return this.create({
    identifier,
    type,
    code: hashedCode,
    expiresAt,
    attempts: 0,
    verified: false
  });
};

/**
 * Static method to find valid OTP for verification
 * @param {string} identifier - Phone or email
 * @param {string} type - 'phone' or 'email'
 * @returns {Promise<Object|null>} OTP document or null
 */
OTPSchema.statics.findValidOTP = async function(identifier, type) {
  return this.findOne({
    identifier,
    type,
    verified: false,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 3 }
  });
};

const OTP = mongoose.model('OTP', OTPSchema);

module.exports = OTP;
