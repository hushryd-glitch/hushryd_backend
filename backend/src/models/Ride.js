const mongoose = require('mongoose');

/**
 * Location Schema
 * Stores location information with Google Maps integration
 */
const LocationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: [true, 'Coordinates are required'],
    validate: {
      validator: function(coords) {
        return coords.length === 2 && 
               coords[0] >= -180 && coords[0] <= 180 && // longitude
               coords[1] >= -90 && coords[1] <= 90;     // latitude
      },
      message: 'Coordinates must be [longitude, latitude] with valid ranges'
    }
  },
  placeId: {
    type: String,
    required: [true, 'Google Maps Place ID is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  }
}, { _id: false });

/**
 * Boarding Point Schema
 * Stores boarding point information with timing
 */
const BoardingPointSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Boarding point ID is required']
  },
  name: {
    type: String,
    required: [true, 'Boarding point name is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Boarding point address is required'],
    trim: true
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: [true, 'Boarding point coordinates are required'],
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
    required: [true, 'Boarding time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format']
  },
  landmark: {
    type: String,
    trim: true
  }
}, { _id: true });

/**
 * Dropping Point Schema
 * Stores dropping point information with timing
 */
const DroppingPointSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Dropping point ID is required']
  },
  name: {
    type: String,
    required: [true, 'Dropping point name is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Dropping point address is required'],
    trim: true
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: [true, 'Dropping point coordinates are required'],
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
    required: [true, 'Dropping time is required'],
    match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format']
  },
  landmark: {
    type: String,
    trim: true
  }
}, { _id: true });

/**
 * Route Schema
 * Stores complete route information with Google Maps data
 */
const RouteSchema = new mongoose.Schema({
  from: {
    type: LocationSchema,
    required: [true, 'From location is required']
  },
  to: {
    type: LocationSchema,
    required: [true, 'To location is required']
  },
  distance: {
    type: Number, // in kilometers
    required: [true, 'Distance is required'],
    min: [0, 'Distance cannot be negative']
  },
  estimatedDuration: {
    type: Number, // in minutes
    required: [true, 'Estimated duration is required'],
    min: [0, 'Duration cannot be negative']
  },
  waypoints: [{
    type: LocationSchema
  }],
  polyline: {
    type: String, // encoded polyline for map display
    required: [true, 'Route polyline is required']
  }
}, { _id: false });

/**
 * Vehicle Schema
 * Stores vehicle information for the ride
 */
const VehicleSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['ac', 'non-ac', 'sleeper', 'seater', 'semi-sleeper', 'volvo', 'scania'],
    required: [true, 'Vehicle type is required']
  },
  model: {
    type: String,
    required: [true, 'Vehicle model is required'],
    trim: true
  },
  registrationNumber: {
    type: String,
    required: [true, 'Registration number is required'],
    trim: true,
    uppercase: true
  },
  amenities: [{
    type: String,
    enum: ['wifi', 'charging-point', 'blanket', 'pillow', 'water-bottle', 'snacks', 'reading-light', 'gps-tracking']
  }]
}, { _id: false });

/**
 * Operator Schema
 * Stores operator/driver information
 */
const OperatorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Operator name is required'],
    trim: true
  },
  logo: {
    type: String // URL to operator logo
  },
  rating: {
    type: Number,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot exceed 5'],
    default: 0
  },
  totalTrips: {
    type: Number,
    default: 0,
    min: [0, 'Total trips cannot be negative']
  }
}, { _id: false });

/**
 * Ride Schema
 * Enhanced ride model for AbhiBus-style interface
 * Separate from Trip model for better organization
 */
const RideSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: [true, 'Driver ID is required'],
    index: true
  },
  route: {
    type: RouteSchema,
    required: [true, 'Route information is required']
  },
  departureTime: {
    type: Date,
    required: [true, 'Departure time is required'],
    index: true
  },
  arrivalTime: {
    type: Date,
    required: [true, 'Arrival time is required']
  },
  vehicle: {
    type: VehicleSchema,
    required: [true, 'Vehicle information is required']
  },
  pricing: {
    baseFare: {
      type: Number,
      required: [true, 'Base fare is required'],
      min: [0, 'Base fare cannot be negative']
    },
    perKmRate: {
      type: Number,
      required: [true, 'Per km rate is required'],
      min: [0, 'Per km rate cannot be negative']
    },
    totalSeats: {
      type: Number,
      required: [true, 'Total seats is required'],
      min: [1, 'Must have at least 1 seat'],
      max: [50, 'Cannot exceed 50 seats']
    },
    availableSeats: {
      type: Number,
      required: [true, 'Available seats is required'],
      min: [0, 'Available seats cannot be negative']
    }
  },
  // Women-only ride flag for privacy
  isWomenOnly: {
    type: Boolean,
    default: false,
    index: true
  },
  boardingPoints: {
    type: [BoardingPointSchema],
    required: [true, 'At least one boarding point is required'],
    validate: {
      validator: function(points) {
        return points.length > 0;
      },
      message: 'At least one boarding point is required'
    }
  },
  droppingPoints: {
    type: [DroppingPointSchema],
    required: [true, 'At least one dropping point is required'],
    validate: {
      validator: function(points) {
        return points.length > 0;
      },
      message: 'At least one dropping point is required'
    }
  },
  operator: {
    type: OperatorSchema,
    required: [true, 'Operator information is required']
  },
  amenities: [{
    type: String,
    enum: ['wifi', 'charging-point', 'blanket', 'pillow', 'water-bottle', 'snacks', 'reading-light', 'gps-tracking']
  }],
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    index: true
  },
  // Ratings and reviews
  ratings: {
    averageRating: {
      type: Number,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5'],
      default: 0
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: [0, 'Total reviews cannot be negative']
    },
    ratingBreakdown: {
      5: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 }
    }
  },
  // Cancellation details
  cancellationReason: {
    type: String,
    trim: true
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
RideSchema.index({ driverId: 1, status: 1 });
RideSchema.index({ departureTime: 1, status: 1 });
RideSchema.index({ isWomenOnly: 1, status: 1 });
RideSchema.index({ 'route.from.coordinates': '2dsphere' });
RideSchema.index({ 'route.to.coordinates': '2dsphere' });
RideSchema.index({ 'pricing.availableSeats': 1, status: 1 });

// Compound indexes for search functionality
RideSchema.index({
  'route.from.placeId': 1,
  'route.to.placeId': 1,
  departureTime: 1,
  status: 1
});

/**
 * Check if ride is available for booking
 * 
 * @param {number} seatsRequired - Number of seats required
 * @returns {boolean} True if ride is available
 */
RideSchema.methods.isAvailableForBooking = function(seatsRequired = 1) {
  return this.status === 'active' && 
         this.pricing.availableSeats >= seatsRequired &&
         this.departureTime > new Date();
};

/**
 * Check if user can book this ride (gender restrictions)
 * 
 * @param {Object} user - User object
 * @returns {Object} Booking eligibility result
 */
RideSchema.methods.canUserBook = function(user) {
  // Check if ride is women-only and user is male
  if (this.isWomenOnly && user.gender !== 'female') {
    return {
      canBook: false,
      reason: 'WOMEN_ONLY_RIDE',
      message: 'This ride is exclusively for women passengers'
    };
  }

  // Check if ride is available
  if (!this.isAvailableForBooking()) {
    return {
      canBook: false,
      reason: 'RIDE_UNAVAILABLE',
      message: 'This ride is no longer available for booking'
    };
  }

  return {
    canBook: true,
    reason: null,
    message: 'User can book this ride'
  };
};

/**
 * Update available seats after booking
 * 
 * @param {number} seatsBooked - Number of seats booked
 * @returns {Promise<Object>} Updated ride
 */
RideSchema.methods.bookSeats = async function(seatsBooked) {
  if (seatsBooked <= 0) {
    throw new Error('Seats booked must be positive');
  }

  if (this.pricing.availableSeats < seatsBooked) {
    throw new Error('Insufficient seats available');
  }

  this.pricing.availableSeats -= seatsBooked;
  return await this.save();
};

/**
 * Release seats after cancellation
 * 
 * @param {number} seatsToRelease - Number of seats to release
 * @returns {Promise<Object>} Updated ride
 */
RideSchema.methods.releaseSeats = async function(seatsToRelease) {
  if (seatsToRelease <= 0) {
    throw new Error('Seats to release must be positive');
  }

  const maxSeats = this.pricing.totalSeats;
  const newAvailableSeats = this.pricing.availableSeats + seatsToRelease;

  if (newAvailableSeats > maxSeats) {
    throw new Error('Cannot release more seats than total capacity');
  }

  this.pricing.availableSeats = newAvailableSeats;
  return await this.save();
};

/**
 * Add rating to ride
 * 
 * @param {number} rating - Rating value (1-5)
 * @returns {Promise<Object>} Updated ride
 */
RideSchema.methods.addRating = async function(rating) {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  // Update rating breakdown
  this.ratings.ratingBreakdown[rating] += 1;
  this.ratings.totalReviews += 1;

  // Calculate new average rating
  let totalRatingPoints = 0;
  for (let i = 1; i <= 5; i++) {
    totalRatingPoints += i * this.ratings.ratingBreakdown[i];
  }

  this.ratings.averageRating = totalRatingPoints / this.ratings.totalReviews;

  return await this.save();
};

/**
 * Static method to search rides
 * 
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Array>} Array of matching rides
 */
RideSchema.statics.searchRides = async function(searchParams) {
  const {
    fromPlaceId,
    toPlaceId,
    departureDate,
    passengers = 1,
    isWomenOnly,
    vehicleType,
    maxFare,
    minRating
  } = searchParams;

  const query = {
    status: 'active',
    'pricing.availableSeats': { $gte: passengers }
  };

  // Location filters
  if (fromPlaceId) {
    query['route.from.placeId'] = fromPlaceId;
  }
  if (toPlaceId) {
    query['route.to.placeId'] = toPlaceId;
  }

  // Date filter
  if (departureDate) {
    const startOfDay = new Date(departureDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(departureDate);
    endOfDay.setHours(23, 59, 59, 999);

    query.departureTime = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }

  // Women-only filter
  if (isWomenOnly !== undefined) {
    query.isWomenOnly = isWomenOnly;
  }

  // Vehicle type filter
  if (vehicleType) {
    query['vehicle.type'] = vehicleType;
  }

  // Fare filter
  if (maxFare) {
    query['pricing.baseFare'] = { $lte: maxFare };
  }

  // Rating filter
  if (minRating) {
    query['ratings.averageRating'] = { $gte: minRating };
  }

  return await this.find(query)
    .populate('driverId', 'name phone rating')
    .sort({ departureTime: 1 })
    .lean();
};

const Ride = mongoose.model('Ride', RideSchema);

module.exports = Ride;