const mongoose = require('mongoose');

/**
 * Location Schema
 * Stores location information with coordinates
 */
const LocationSchema = new mongoose.Schema({
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
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
  landmark: {
    type: String,
    trim: true
  }
}, { _id: false });

/**
 * Trip Passenger Schema
 * Stores passenger information for each trip
 */
const TripPassengerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  seats: {
    type: Number,
    required: [true, 'Number of seats is required'],
    min: 1,
    max: 6
  },
  pickupPoint: {
    type: LocationSchema,
    required: [true, 'Pickup point is required']
  },
  dropPoint: {
    type: LocationSchema,
    required: [true, 'Drop point is required']
  },
  fare: {
    type: Number,
    required: [true, 'Fare is required'],
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  boardedAt: {
    type: Date
  },
  droppedAt: {
    type: Date
  }
}, { _id: true });


/**
 * Route Info Schema
 * Stores route information
 */
const RouteInfoSchema = new mongoose.Schema({
  distance: {
    type: Number, // in kilometers
    required: true
  },
  duration: {
    type: Number, // in minutes
    required: true
  },
  polyline: {
    type: String // encoded polyline for map display
  }
}, { _id: false });

/**
 * Fare Breakdown Schema
 * Stores detailed fare breakdown
 */
const FareBreakdownSchema = new mongoose.Schema({
  baseFare: {
    type: Number,
    required: true,
    min: 0
  },
  distanceCharge: {
    type: Number,
    required: true,
    min: 0
  },
  tollCharges: {
    type: Number,
    default: 0,
    min: 0
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0
  },
  taxes: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

/**
 * Payment Transaction Schema
 * Stores individual payment transactions
 */
const PaymentTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['collection', 'advance', 'payout', 'refund']
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  gateway: {
    type: String,
    default: 'razorpay'
  },
  gatewayTransactionId: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * Payment Info Schema
 * Stores complete payment information for a trip
 */
const PaymentInfoSchema = new mongoose.Schema({
  totalCollected: {
    type: Number,
    required: true,
    min: 0
  },
  platformCommission: {
    type: Number,
    required: true,
    min: 0
  },
  driverAdvance: {
    type: Number,
    required: true,
    min: 0
  },
  vaultAmount: {
    type: Number,
    required: true,
    min: 0
  },
  vaultStatus: {
    type: String,
    enum: ['locked', 'released'],
    default: 'locked'
  },
  transactions: {
    type: [PaymentTransactionSchema],
    default: []
  }
}, { _id: false });

/**
 * Tracking Info Schema
 * Stores GPS tracking data points
 */
const TrackingInfoSchema = new mongoose.Schema({
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  speed: {
    type: Number, // in km/h
    min: 0
  }
}, { _id: false });


/**
 * Post ID format regex: HR-YYYY-NNNNNN
 * HR- prefix, 4-digit year, hyphen, 6-digit sequence number
 */
const TRIP_ID_REGEX = /^HR-\d{4}-\d{6}$/;

/**
 * Trip Schema
 * Main schema for ride trips
 */
const TripSchema = new mongoose.Schema({
  tripId: {
    type: String,
    required: [true, 'Trip ID is required'],
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        return TRIP_ID_REGEX.test(v);
      },
      message: props => `${props.value} is not a valid Trip ID. Format must be HR-YYYY-NNNNNN (e.g., HR-2024-001234)`
    }
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: [true, 'Driver is required'],
    index: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  passengers: {
    type: [TripPassengerSchema],
    default: [],
    validate: {
      validator: function(passengers) {
        // Allow empty array for newly created trips (passengers book later)
        // Maximum 6 passengers allowed
        return passengers.length <= 6;
      },
      message: 'Trip cannot have more than 6 passengers'
    }
  },
  source: {
    type: LocationSchema,
    required: [true, 'Source location is required']
  },
  destination: {
    type: LocationSchema,
    required: [true, 'Destination location is required']
  },
  route: {
    type: RouteInfoSchema
  },
  scheduledAt: {
    type: Date,
    required: [true, 'Scheduled time is required'],
    index: true
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  availableSeats: {
    type: Number,
    required: [true, 'Available seats is required'],
    min: 0,
    max: 6
  },
  farePerSeat: {
    type: Number,
    required: [true, 'Fare per seat is required'],
    min: 0
  },
  instantBooking: {
    type: Boolean,
    default: false
  },
  ladiesOnly: {
    type: Boolean,
    default: false
  },
  // Enhanced fields for AbhiBus-style interface
  isWomenOnly: {
    type: Boolean,
    default: false,
    index: true
  },
  // Privacy and safety features
  privacySettings: {
    hideDriverDetails: {
      type: Boolean,
      default: false
    },
    restrictMalePassengers: {
      type: Boolean,
      default: false
    },
    requireGenderVerification: {
      type: Boolean,
      default: false
    }
  },
  // Vehicle details for display
  vehicleInfo: {
    type: {
      type: String,
      enum: ['ac', 'non-ac', 'sleeper', 'seater', 'semi-sleeper', 'volvo', 'scania'],
      required: true
    },
    model: {
      type: String,
      required: true,
      trim: true
    },
    registrationNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    amenities: [{
      type: String,
      enum: ['wifi', 'charging-point', 'blanket', 'pillow', 'water-bottle', 'snacks', 'reading-light', 'gps-tracking']
    }]
  },
  // Operator information
  operator: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    logo: {
      type: String // URL to operator logo
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    totalTrips: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  // Boarding and dropping points
  boardingPoints: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && // longitude
                 coords[1] >= -90 && coords[1] <= 90;     // latitude
        },
        message: 'Coordinates must be [longitude, latitude] with valid ranges'
      }
    },
    time: {
      type: String,
      required: true,
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format']
    },
    landmark: {
      type: String,
      trim: true
    }
  }],
  droppingPoints: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && // longitude
                 coords[1] >= -90 && coords[1] <= 90;     // latitude
        },
        message: 'Coordinates must be [longitude, latitude] with valid ranges'
      }
    },
    time: {
      type: String,
      required: true,
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format']
    },
    landmark: {
      type: String,
      trim: true
    }
  }],
  // Route information with waypoints
  routeData: {
    from: {
      name: String,
      coordinates: [Number], // [longitude, latitude]
      placeId: String
    },
    to: {
      name: String,
      coordinates: [Number], // [longitude, latitude]
      placeId: String
    },
    distance: {
      type: Number, // in kilometers
      required: true,
      min: 0
    },
    estimatedDuration: {
      type: Number, // in minutes
      required: true,
      min: 0
    },
    waypoints: [{
      name: String,
      coordinates: [Number], // [longitude, latitude]
      placeId: String
    }],
    polyline: String // encoded polyline for map display
  },
  // Pricing details
  pricing: {
    baseFare: {
      type: Number,
      required: true,
      min: 0
    },
    perKmRate: {
      type: Number,
      required: true,
      min: 0
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
      max: 50
    },
    availableSeats: {
      type: Number,
      required: true,
      min: 0
    }
  },
  // Trip ratings and reviews
  ratings: {
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0
    },
    ratingBreakdown: {
      5: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 }
    }
  },
  fare: {
    type: FareBreakdownSchema,
    required: [true, 'Fare breakdown is required']
  },
  payment: {
    type: PaymentInfoSchema,
    required: [true, 'Payment info is required']
  },
  otp: {
    type: String
    // Hashed OTP for ride start validation
  },
  tracking: {
    type: [TrackingInfoSchema],
    default: []
  },
  cancellationReason: {
    type: String,
    trim: true
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
TripSchema.index({ status: 1, scheduledAt: -1 });
TripSchema.index({ 'passengers.userId': 1 });
TripSchema.index({ createdAt: -1 });

/**
 * Generate unique trip ID
 * @returns {string} Unique trip ID in format HR-YYYY-NNNNNN
 */
TripSchema.statics.generateTripId = async function() {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    tripId: { $regex: `^HR-${year}-` }
  });
  const sequence = String(count + 1).padStart(6, '0');
  return `HR-${year}-${sequence}`;
};

/**
 * Calculate payment breakdown
 * Design Decision: 70-30 split with platform commission
 * @param {number} totalFare - Total fare amount
 * @param {number} commissionRate - Platform commission rate (default 12%)
 * @returns {Object} Payment breakdown
 */
TripSchema.statics.calculatePaymentBreakdown = function(totalFare, commissionRate = 0.12) {
  const platformCommission = Math.round(totalFare * commissionRate);
  const driverTotal = totalFare - platformCommission;
  const driverAdvance = Math.round(driverTotal * 0.70);
  const vaultAmount = driverTotal - driverAdvance;
  
  return {
    totalCollected: totalFare,
    platformCommission,
    driverAdvance,
    vaultAmount,
    vaultStatus: 'locked'
  };
};

const Trip = mongoose.model('Trip', TripSchema);

module.exports = Trip;
module.exports.TRIP_ID_REGEX = TRIP_ID_REGEX;
