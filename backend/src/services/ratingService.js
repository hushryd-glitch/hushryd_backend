/**
 * Rating Service
 * Implements rating submission and average rating calculation
 * 
 * Requirements: 6.4
 */

const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const User = require('../models/User');

/**
 * Rating constraints
 */
const RATING_CONSTRAINTS = {
  MIN_RATING: 1,
  MAX_RATING: 5,
  MAX_FEEDBACK_LENGTH: 1000
};

/**
 * Validate rating data
 * @param {Object} ratingData - Rating data to validate
 * @returns {Object} Validation result with isValid and errors
 */
const validateRatingData = (ratingData) => {
  const errors = [];

  if (ratingData.rating === undefined || ratingData.rating === null) {
    errors.push('Rating is required');
  } else if (typeof ratingData.rating !== 'number') {
    errors.push('Rating must be a number');
  } else if (ratingData.rating < RATING_CONSTRAINTS.MIN_RATING || ratingData.rating > RATING_CONSTRAINTS.MAX_RATING) {
    errors.push(`Rating must be between ${RATING_CONSTRAINTS.MIN_RATING} and ${RATING_CONSTRAINTS.MAX_RATING}`);
  } else if (!Number.isInteger(ratingData.rating)) {
    errors.push('Rating must be a whole number');
  }

  if (ratingData.feedback && typeof ratingData.feedback !== 'string') {
    errors.push('Feedback must be a string');
  } else if (ratingData.feedback && ratingData.feedback.length > RATING_CONSTRAINTS.MAX_FEEDBACK_LENGTH) {
    errors.push(`Feedback cannot exceed ${RATING_CONSTRAINTS.MAX_FEEDBACK_LENGTH} characters`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Submit a rating for a completed booking
 * Design Decision: Only completed bookings can be rated
 * 
 * @param {string} bookingId - Booking ID
 * @param {string} passengerId - Passenger user ID
 * @param {Object} ratingData - Rating data (rating, feedback)
 * @returns {Promise<Object>} Updated booking with rating
 * 
 * Requirements: 6.4
 */
const submitRating = async (bookingId, passengerId, ratingData) => {
  // Validate rating data
  const validation = validateRatingData(ratingData);
  if (!validation.isValid) {
    const error = new Error(validation.errors.join(', '));
    error.code = 'INVALID_RATING_DATA';
    error.statusCode = 400;
    throw error;
  }

  // Find booking
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Verify passenger owns this booking
  if (booking.passengerId.toString() !== passengerId) {
    const error = new Error('Unauthorized to rate this booking');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 403;
    throw error;
  }

  // Check if booking is completed
  if (booking.status !== 'completed') {
    const error = new Error('Can only rate completed trips');
    error.code = 'BOOKING_NOT_COMPLETED';
    error.statusCode = 400;
    throw error;
  }

  // Check if already rated
  if (booking.rating !== undefined && booking.rating !== null) {
    const error = new Error('Booking has already been rated');
    error.code = 'ALREADY_RATED';
    error.statusCode = 400;
    throw error;
  }

  // Update booking with rating
  booking.rating = ratingData.rating;
  booking.feedback = ratingData.feedback ? ratingData.feedback.trim() : undefined;
  await booking.save();

  // Update driver's average rating
  const trip = await Trip.findById(booking.tripId);
  if (trip && trip.driver) {
    await updateDriverRating(trip.driver);
  }

  return {
    success: true,
    booking: {
      _id: booking._id,
      bookingId: booking.bookingId,
      rating: booking.rating,
      feedback: booking.feedback
    },
    message: 'Rating submitted successfully'
  };
};

/**
 * Update driver's average rating based on all completed bookings
 * Design Decision: Recalculate average from all ratings for accuracy
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Updated driver with new average rating
 */
const updateDriverRating = async (driverId) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Get all trips for this driver
  const trips = await Trip.find({ driver: driverIdStr, status: 'completed' }).select('_id');
  const tripIds = trips.map(t => t._id);

  // Get all rated bookings for these trips
  const ratingAggregation = await Booking.aggregate([
    {
      $match: {
        tripId: { $in: tripIds },
        status: 'completed',
        rating: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 }
      }
    }
  ]);

  const result = ratingAggregation[0] || { averageRating: 0, totalRatings: 0 };
  const newRating = result.totalRatings > 0 ? Math.round(result.averageRating * 10) / 10 : 0;

  // Update driver rating
  const updatedDriver = await Driver.findByIdAndUpdate(
    driverIdStr,
    { rating: newRating },
    { new: true }
  );

  return {
    driverId: driverIdStr,
    rating: newRating,
    totalRatings: result.totalRatings
  };
};

/**
 * Get driver's rating details
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Driver rating details
 */
const getDriverRating = async (driverId) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Get rating distribution
  const trips = await Trip.find({ driver: driverIdStr, status: 'completed' }).select('_id');
  const tripIds = trips.map(t => t._id);

  const ratingDistribution = await Booking.aggregate([
    {
      $match: {
        tripId: { $in: tripIds },
        status: 'completed',
        rating: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: -1 }
    }
  ]);

  // Build distribution object
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRatings = 0;
  ratingDistribution.forEach(r => {
    distribution[r._id] = r.count;
    totalRatings += r.count;
  });

  return {
    success: true,
    rating: {
      average: driver.rating,
      totalRatings,
      distribution
    }
  };
};

/**
 * Get recent reviews for a driver
 * @param {string} driverId - Driver ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Recent reviews
 */
const getDriverReviews = async (driverId, options = {}) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const { page = 1, limit = 10 } = options;

  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Get all trips for this driver
  const trips = await Trip.find({ driver: driverIdStr, status: 'completed' }).select('_id tripId');
  const tripIds = trips.map(t => t._id);

  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Booking.find({
      tripId: { $in: tripIds },
      status: 'completed',
      rating: { $exists: true, $ne: null }
    })
      .populate('passengerId', 'name')
      .populate('tripId', 'tripId source destination scheduledAt')
      .select('bookingId rating feedback createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments({
      tripId: { $in: tripIds },
      status: 'completed',
      rating: { $exists: true, $ne: null }
    })
  ]);

  return {
    success: true,
    reviews,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};

module.exports = {
  RATING_CONSTRAINTS,
  validateRatingData,
  submitRating,
  updateDriverRating,
  getDriverRating,
  getDriverReviews
};
