/**
 * ShareLink Model
 * Stores shareable tracking links for ride sharing
 * 
 * Requirements: 6.2
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * ShareLink Schema
 * Stores share link tokens for public trip tracking
 */
const ShareLinkSchema = new mongoose.Schema({
  token: {
    type: String,
    unique: true,
    required: [true, 'Token is required'],
    index: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: [true, 'Booking ID is required'],
    index: true
  },
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: [true, 'Trip ID is required'],
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator ID is required']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
    index: true
  },
  accessCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes
ShareLinkSchema.index({ tripId: 1, isActive: 1 });
ShareLinkSchema.index({ token: 1, isActive: 1 });

/**
 * Generate a unique share token
 * @returns {string} Unique token
 */
ShareLinkSchema.statics.generateToken = function() {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Create a new share link
 * @param {Object} params - Share link parameters
 * @returns {Promise<Object>} Created share link
 */
ShareLinkSchema.statics.createShareLink = async function(params) {
  const { bookingId, tripId, createdBy, expiresAt } = params;
  
  const token = this.generateToken();
  
  const shareLink = new this({
    token,
    bookingId,
    tripId,
    createdBy,
    expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // Default 24 hours
    isActive: true
  });
  
  await shareLink.save();
  
  return shareLink;
};

/**
 * Find share link by token
 * @param {string} token - Share token
 * @returns {Promise<Object>} Share link document
 */
ShareLinkSchema.statics.findByToken = async function(token) {
  return this.findOne({ token, isActive: true });
};

/**
 * Expire all share links for a trip
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Update result
 */
ShareLinkSchema.statics.expireByTrip = async function(tripId) {
  return this.updateMany(
    { tripId, isActive: true },
    { $set: { isActive: false } }
  );
};

/**
 * Increment access count
 */
ShareLinkSchema.methods.incrementAccess = async function() {
  this.accessCount += 1;
  return this.save();
};

/**
 * Check if link is expired
 * @returns {boolean} Whether link is expired
 */
ShareLinkSchema.methods.isExpired = function() {
  return !this.isActive || new Date() > this.expiresAt;
};

const ShareLink = mongoose.model('ShareLink', ShareLinkSchema);

module.exports = ShareLink;
