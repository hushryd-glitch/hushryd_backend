const mongoose = require('mongoose');

/**
 * SOS Alert Schema
 * Design Decision: Comprehensive tracking of emergency alerts with resolution workflow
 * Rationale: Critical for safety - must capture all details for incident response and audit
 */
const SOSAlertSchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: [true, 'Trip ID is required'],
    index: true
  },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User who triggered SOS is required'],
    index: true
  },
  userType: {
    type: String,
    required: [true, 'User type is required'],
    enum: ['passenger', 'driver']
  },
  location: {
    coordinates: {
      lat: {
        type: Number,
        required: [true, 'Latitude is required'],
        min: -90,
        max: 90
      },
      lng: {
        type: Number,
        required: [true, 'Longitude is required'],
        min: -180,
        max: 180
      }
    },
    address: {
      type: String,
      trim: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved'],
    default: 'active',
    index: true
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledgedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  resolution: {
    type: String,
    trim: true
  },
  actionsTaken: [{
    type: String,
    trim: true
  }],
  notificationsSent: {
    adminNotified: {
      type: Boolean,
      default: false
    },
    emergencyContactsNotified: {
      type: Boolean,
      default: false
    },
    customerSupportNotified: {
      type: Boolean,
      default: false
    },
    notifiedAt: {
      type: Date
    }
  },
  priority: {
    type: String,
    enum: ['high', 'critical'],
    default: 'critical'
  },
  // Journey details - Requirements: 5.5
  journeyDetails: {
    // Route taken - array of coordinates
    routeTaken: [{
      lat: {
        type: Number,
        min: -90,
        max: 90
      },
      lng: {
        type: Number,
        min: -180,
        max: 180
      },
      timestamp: {
        type: Date
      }
    }],
    // Stops made during the journey
    stops: [{
      location: {
        lat: {
          type: Number,
          min: -90,
          max: 90
        },
        lng: {
          type: Number,
          min: -180,
          max: 180
        },
        address: String
      },
      startedAt: {
        type: Date
      },
      duration: {
        type: Number // Duration in seconds
      }
    }],
    // Driver details snapshot at time of SOS
    driverSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // Vehicle details snapshot at time of SOS
    vehicleSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // Trip source and destination
    tripRoute: {
      source: {
        address: String,
        coordinates: {
          lat: Number,
          lng: Number
        }
      },
      destination: {
        address: String,
        coordinates: {
          lat: Number,
          lng: Number
        }
      }
    }
  },
  // Continuous tracking during active SOS - Requirements: 5.6
  continuousTracking: {
    isActive: {
      type: Boolean,
      default: true
    },
    lastBroadcastAt: {
      type: Date
    },
    trackingHistory: [{
      coordinates: {
        lat: Number,
        lng: Number
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
SOSAlertSchema.index({ status: 1, createdAt: -1 });
SOSAlertSchema.index({ 'location.coordinates.lat': 1, 'location.coordinates.lng': 1 });

/**
 * Acknowledge the SOS alert
 * @param {ObjectId} userId - User acknowledging the alert
 * @returns {Promise<Object>} Updated alert
 */
SOSAlertSchema.methods.acknowledge = async function(userId) {
  this.status = 'acknowledged';
  this.acknowledgedBy = userId;
  this.acknowledgedAt = new Date();
  return this.save();
};

/**
 * Resolve the SOS alert
 * @param {ObjectId} userId - User resolving the alert
 * @param {string} resolution - Resolution description
 * @param {Array<string>} actionsTaken - List of actions taken
 * @returns {Promise<Object>} Updated alert
 */
SOSAlertSchema.methods.resolve = async function(userId, resolution, actionsTaken = []) {
  this.status = 'resolved';
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  this.resolution = resolution;
  this.actionsTaken = actionsTaken;
  return this.save();
};

/**
 * Mark notifications as sent
 * @param {boolean} adminNotified - Whether admin was notified
 * @param {boolean} emergencyContactsNotified - Whether emergency contacts were notified
 * @returns {Promise<Object>} Updated alert
 */
SOSAlertSchema.methods.markNotificationsSent = async function(adminNotified, emergencyContactsNotified) {
  this.notificationsSent = {
    adminNotified,
    emergencyContactsNotified,
    notifiedAt: new Date()
  };
  return this.save();
};

/**
 * Get active alerts (for admin dashboard)
 * @returns {Promise<Array>} Active SOS alerts
 */
SOSAlertSchema.statics.getActiveAlerts = function() {
  return this.find({ status: { $in: ['active', 'acknowledged'] } })
    .sort({ createdAt: -1 })
    .populate('tripId')
    .populate('triggeredBy', 'name phone email');
};

/**
 * Add journey details to the SOS alert
 * Requirements: 5.5
 * @param {Object} journeyData - Journey details
 * @returns {Promise<Object>} Updated alert
 */
SOSAlertSchema.methods.addJourneyDetails = async function(journeyData) {
  this.journeyDetails = {
    routeTaken: journeyData.routeTaken || [],
    stops: journeyData.stops || [],
    driverSnapshot: journeyData.driverSnapshot || {},
    vehicleSnapshot: journeyData.vehicleSnapshot || {},
    tripRoute: journeyData.tripRoute || {}
  };
  return this.save();
};

/**
 * Update continuous tracking location
 * Requirements: 5.6
 * @param {Object} coordinates - GPS coordinates {lat, lng}
 * @returns {Promise<Object>} Updated alert
 */
SOSAlertSchema.methods.updateContinuousTracking = async function(coordinates) {
  if (!this.continuousTracking) {
    this.continuousTracking = {
      isActive: true,
      trackingHistory: []
    };
  }
  
  this.continuousTracking.lastBroadcastAt = new Date();
  this.continuousTracking.trackingHistory.push({
    coordinates: {
      lat: coordinates.lat,
      lng: coordinates.lng
    },
    timestamp: new Date()
  });
  
  // Keep only last 100 tracking entries to prevent unbounded growth
  if (this.continuousTracking.trackingHistory.length > 100) {
    this.continuousTracking.trackingHistory = 
      this.continuousTracking.trackingHistory.slice(-100);
  }
  
  return this.save();
};

/**
 * Stop continuous tracking (when alert is resolved)
 * @returns {Promise<Object>} Updated alert
 */
SOSAlertSchema.methods.stopContinuousTracking = async function() {
  if (this.continuousTracking) {
    this.continuousTracking.isActive = false;
  }
  return this.save();
};

/**
 * Get alerts with active continuous tracking
 * @returns {Promise<Array>} Alerts with active tracking
 */
SOSAlertSchema.statics.getAlertsWithActiveTracking = function() {
  return this.find({ 
    status: { $in: ['active', 'acknowledged'] },
    'continuousTracking.isActive': true
  })
    .sort({ createdAt: -1 })
    .populate('tripId')
    .populate('triggeredBy', 'name phone email');
};

const SOSAlert = mongoose.model('SOSAlert', SOSAlertSchema);

module.exports = SOSAlert;
