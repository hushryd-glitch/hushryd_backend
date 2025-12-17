const mongoose = require('mongoose');

/**
 * StationaryEvent Schema
 * Tracks when a vehicle stops moving for extended periods during a trip
 * Requirements: 8.1 - Monitor vehicle movement using GPS coordinates
 */
const StationaryEventSchema = new mongoose.Schema({
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: [true, 'Trip ID is required'],
    index: true
  },
  passengerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Passenger ID is required'],
    index: true
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
  startedAt: {
    type: Date,
    required: [true, 'Stationary start time is required'],
    default: Date.now
  },
  duration: {
    type: Number, // Duration in seconds
    default: 0
  },
  alertSentAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['monitoring', 'alert_sent', 'safe_confirmed', 'help_requested', 'escalated', 'resolved'],
    default: 'monitoring',
    index: true
  },
  passengerResponse: {
    responded: {
      type: Boolean,
      default: false
    },
    respondedAt: {
      type: Date
    },
    response: {
      type: String,
      enum: ['safe', 'help', 'no_response']
    }
  },
  escalation: {
    callAttempted: {
      type: Boolean,
      default: false
    },
    callAttemptedAt: {
      type: Date
    },
    callAnswered: {
      type: Boolean
    },
    escalatedToSupport: {
      type: Boolean,
      default: false
    },
    escalatedAt: {
      type: Date
    },
    supportTicketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupportTicket'
    }
  },
  sosAlertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SOSAlert'
  },
  resolvedAt: {
    type: Date
  },
  resolutionReason: {
    type: String,
    enum: ['vehicle_moved', 'passenger_confirmed_safe', 'sos_triggered', 'support_resolved', 'trip_ended']
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
StationaryEventSchema.index({ status: 1, createdAt: -1 });
StationaryEventSchema.index({ tripId: 1, status: 1 });
StationaryEventSchema.index({ 'location.coordinates.lat': 1, 'location.coordinates.lng': 1 });

/**
 * Get active stationary events for a trip
 * @param {ObjectId} tripId - Trip ID
 * @returns {Promise<Array>} Active stationary events
 */
StationaryEventSchema.statics.getActiveForTrip = function(tripId) {
  return this.find({
    tripId,
    status: { $in: ['monitoring', 'alert_sent'] }
  }).sort({ createdAt: -1 });
};

/**
 * Get events pending escalation (no response after alert)
 * @param {number} minutesSinceAlert - Minutes since alert was sent
 * @returns {Promise<Array>} Events pending escalation
 */
StationaryEventSchema.statics.getPendingEscalation = function(minutesSinceAlert = 5) {
  const cutoffTime = new Date(Date.now() - minutesSinceAlert * 60 * 1000);
  return this.find({
    status: 'alert_sent',
    alertSentAt: { $lte: cutoffTime },
    'passengerResponse.responded': false,
    'escalation.callAttempted': false
  }).populate('tripId').populate('passengerId', 'name phone');
};

/**
 * Mark alert as sent
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.markAlertSent = async function() {
  this.status = 'alert_sent';
  this.alertSentAt = new Date();
  return this.save();
};

/**
 * Record passenger response
 * @param {string} response - 'safe' or 'help'
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.recordResponse = async function(response) {
  this.passengerResponse = {
    responded: true,
    respondedAt: new Date(),
    response
  };
  
  if (response === 'safe') {
    this.status = 'safe_confirmed';
    this.resolvedAt = new Date();
    this.resolutionReason = 'passenger_confirmed_safe';
  } else if (response === 'help') {
    this.status = 'help_requested';
  }
  
  return this.save();
};

/**
 * Record call attempt
 * @param {boolean} answered - Whether the call was answered
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.recordCallAttempt = async function(answered) {
  this.escalation.callAttempted = true;
  this.escalation.callAttemptedAt = new Date();
  this.escalation.callAnswered = answered;
  
  if (answered) {
    // If call answered, wait for further response
    this.status = 'alert_sent';
  }
  
  return this.save();
};

/**
 * Escalate to customer support
 * @param {ObjectId} supportTicketId - Support ticket ID
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.escalateToSupport = async function(supportTicketId) {
  this.status = 'escalated';
  this.escalation.escalatedToSupport = true;
  this.escalation.escalatedAt = new Date();
  this.escalation.supportTicketId = supportTicketId;
  return this.save();
};

/**
 * Link SOS alert
 * @param {ObjectId} sosAlertId - SOS Alert ID
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.linkSOSAlert = async function(sosAlertId) {
  this.sosAlertId = sosAlertId;
  this.status = 'help_requested';
  this.resolvedAt = new Date();
  this.resolutionReason = 'sos_triggered';
  return this.save();
};

/**
 * Resolve due to vehicle movement
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.resolveVehicleMoved = async function() {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  this.resolutionReason = 'vehicle_moved';
  return this.save();
};

/**
 * Update duration
 * @param {number} durationSeconds - Duration in seconds
 * @returns {Promise<Object>} Updated event
 */
StationaryEventSchema.methods.updateDuration = async function(durationSeconds) {
  this.duration = durationSeconds;
  return this.save();
};

const StationaryEvent = mongoose.model('StationaryEvent', StationaryEventSchema);

module.exports = StationaryEvent;
