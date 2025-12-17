/**
 * LocationShare Model
 * Stores live location sharing sessions for drivers and passengers
 * Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Maximum contacts allowed per sharing session (Requirements: 2.2)
const MAX_CONTACTS = 5;

const ContactSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  notifiedAt: {
    type: Date,
    default: null
  },
  trackingUrl: {
    type: String,
    default: null
  },
  notificationStatus: {
    sms: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false }
  }
}, { _id: true });

const LocationShareSchema = new Schema({
  tripId: {
    type: Schema.Types.ObjectId,
    ref: 'Trip',
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userType: {
    type: String,
    enum: ['driver', 'passenger'],
    required: true
  },
  contacts: {
    type: [ContactSchema],
    validate: {
      validator: function(contacts) {
        return contacts.length <= MAX_CONTACTS;
      },
      message: `Cannot share location with more than ${MAX_CONTACTS} contacts`
    },
    default: []
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  lastLocation: {
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },
    timestamp: { type: Date, default: null }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
LocationShareSchema.index({ tripId: 1, userId: 1 });
LocationShareSchema.index({ tripId: 1, isActive: 1 });
LocationShareSchema.index({ userId: 1, isActive: 1 });

/**
 * Static method to find active sharing session for a trip and user
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Active sharing session or null
 */
LocationShareSchema.statics.findActiveSession = function(tripId, userId) {
  return this.findOne({
    tripId,
    userId,
    isActive: true
  });
};

/**
 * Static method to find all active sessions for a trip
 * @param {string} tripId - Trip ID
 * @returns {Promise<Array>} Array of active sessions
 */
LocationShareSchema.statics.findActiveSessionsByTrip = function(tripId) {
  return this.find({
    tripId,
    isActive: true
  });
};

/**
 * Static method to deactivate all sessions for a trip
 * Requirements: 2.5, 3.4 - Auto-stop sharing when trip ends
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Update result
 */
LocationShareSchema.statics.deactivateByTrip = function(tripId) {
  return this.updateMany(
    { tripId, isActive: true },
    { 
      $set: { 
        isActive: false, 
        endedAt: new Date() 
      } 
    }
  );
};

/**
 * Instance method to add a contact
 * Requirements: 2.2 - Allow selection of up to 5 emergency contacts
 * @param {Object} contact - Contact to add
 * @returns {Promise<Object>} Updated document
 */
LocationShareSchema.methods.addContact = function(contact) {
  if (this.contacts.length >= MAX_CONTACTS) {
    const error = new Error(`Cannot add more than ${MAX_CONTACTS} contacts`);
    error.code = 'MAX_CONTACTS_EXCEEDED';
    throw error;
  }
  
  this.contacts.push(contact);
  return this.save();
};

/**
 * Instance method to update last known location
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @returns {Promise<Object>} Updated document
 */
LocationShareSchema.methods.updateLastLocation = function(coordinates) {
  this.lastLocation = {
    coordinates,
    timestamp: new Date()
  };
  return this.save();
};

/**
 * Instance method to stop sharing
 * @returns {Promise<Object>} Updated document
 */
LocationShareSchema.methods.stopSharing = function() {
  this.isActive = false;
  this.endedAt = new Date();
  return this.save();
};

/**
 * Instance method to get contact count
 * @returns {number} Number of contacts
 */
LocationShareSchema.methods.getContactCount = function() {
  return this.contacts.length;
};

// Export MAX_CONTACTS for use in validation
LocationShareSchema.statics.MAX_CONTACTS = MAX_CONTACTS;

const LocationShare = mongoose.model('LocationShare', LocationShareSchema);

module.exports = LocationShare;
