/**
 * Women-Only Ride Privacy Service
 * Implements gender-based ride filtering and booking restrictions
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

const { createLogger } = require('./loggerService');

const logger = createLogger('womenOnlyRideService');

/**
 * Error codes for women-only ride restrictions
 */
const WomenOnlyErrorCodes = {
  WOMEN_ONLY_RIDE: 'WOMEN_ONLY_RIDE',
  GENDER_NOT_SET: 'GENDER_NOT_SET',
  MALE_USER_RESTRICTED: 'MALE_USER_RESTRICTED',
  PASSENGER_GENDER_MISMATCH: 'PASSENGER_GENDER_MISMATCH'
};

/**
 * Messages for women-only ride restrictions
 * Requirements: 10.3, 10.5
 */
const WomenOnlyMessages = {
  WOMEN_ONLY_RIDE: 'This ride is exclusively for women passengers. Please search for other available rides.',
  GENDER_NOT_SET: 'Please complete your profile with gender information to book this ride.',
  MALE_USER_RESTRICTED: 'This is a women-only ride. Male passengers cannot book this ride.',
  PASSENGER_GENDER_MISMATCH: 'All passengers on women-only rides must be female.',
  WOMEN_ONLY_BADGE: 'Women-Only Safe Travel',
  WOMEN_ONLY_DESCRIPTION: 'This ride is exclusively for women passengers for safety and privacy.'
};

/**
 * Check if a user can book a women-only ride
 * 
 * Requirements: 10.2, 10.3
 * - Restrict bookings to female passengers only
 * - Prevent male users from booking with appropriate message
 * 
 * @param {Object} user - User object with gender field
 * @param {Object} ride - Ride/Trip object with isWomenOnly flag
 * @returns {Object} Booking eligibility result
 */
const canUserBookWomenOnlyRide = (user, ride) => {
  // If ride is not women-only, allow all users
  if (!ride.isWomenOnly && !ride.ladiesOnly) {
    return {
      canBook: true,
      reason: null,
      message: null
    };
  }

  // Check if user has gender set
  if (!user.gender) {
    return {
      canBook: false,
      reason: WomenOnlyErrorCodes.GENDER_NOT_SET,
      message: WomenOnlyMessages.GENDER_NOT_SET,
      redirectTo: '/profile/setup'
    };
  }

  // Check if user is female
  if (user.gender !== 'female') {
    logger.warn('Male user attempted to book women-only ride', {
      userId: user._id?.toString(),
      rideId: ride._id?.toString(),
      userGender: user.gender
    });

    return {
      canBook: false,
      reason: WomenOnlyErrorCodes.MALE_USER_RESTRICTED,
      message: WomenOnlyMessages.MALE_USER_RESTRICTED
    };
  }

  return {
    canBook: true,
    reason: null,
    message: null
  };
};

/**
 * Validate passenger details for women-only ride
 * Ensures all passengers are female
 * 
 * Requirements: 10.4
 * - Ensure all passengers are women and notify accordingly
 * 
 * @param {Array} passengerDetails - Array of passenger details with gender
 * @param {Object} ride - Ride/Trip object with isWomenOnly flag
 * @returns {Object} Validation result
 */
const validatePassengerGenders = (passengerDetails, ride) => {
  // If ride is not women-only, allow all passengers
  if (!ride.isWomenOnly && !ride.ladiesOnly) {
    return {
      isValid: true,
      invalidPassengers: [],
      message: null
    };
  }

  // Check each passenger's gender
  const invalidPassengers = [];
  
  if (passengerDetails && Array.isArray(passengerDetails)) {
    passengerDetails.forEach((passenger, index) => {
      if (passenger.gender && passenger.gender !== 'female') {
        invalidPassengers.push({
          index,
          name: passenger.name,
          gender: passenger.gender
        });
      }
    });
  }

  if (invalidPassengers.length > 0) {
    logger.warn('Non-female passengers in women-only ride booking', {
      rideId: ride._id?.toString(),
      invalidCount: invalidPassengers.length
    });

    return {
      isValid: false,
      invalidPassengers,
      message: WomenOnlyMessages.PASSENGER_GENDER_MISMATCH
    };
  }

  return {
    isValid: true,
    invalidPassengers: [],
    message: null
  };
};

/**
 * Filter rides based on user gender for women-only rides
 * 
 * Requirements: 10.1
 * - Display women-only rides prominently with special badges for female users
 * - Hide or mark women-only rides as unavailable for male users
 * 
 * @param {Array} rides - Array of ride objects
 * @param {Object} user - User object with gender field (optional)
 * @param {Object} options - Filter options
 * @returns {Array} Filtered rides with women-only indicators
 */
const filterRidesForUser = (rides, user = null, options = {}) => {
  const { showWomenOnlyOnly = false, hideWomenOnly = false } = options;

  return rides.map(ride => {
    const isWomenOnly = ride.isWomenOnly || ride.ladiesOnly;
    
    // Determine if user can book this ride
    let canBook = true;
    let restrictionMessage = null;
    
    if (isWomenOnly) {
      if (!user) {
        // Not logged in - show ride but indicate login required
        canBook = false;
        restrictionMessage = 'Login required to book women-only rides';
      } else if (!user.gender) {
        canBook = false;
        restrictionMessage = WomenOnlyMessages.GENDER_NOT_SET;
      } else if (user.gender !== 'female') {
        canBook = false;
        restrictionMessage = WomenOnlyMessages.MALE_USER_RESTRICTED;
      }
    }

    return {
      ...ride,
      isWomenOnly,
      womenOnlyBadge: isWomenOnly ? WomenOnlyMessages.WOMEN_ONLY_BADGE : null,
      womenOnlyDescription: isWomenOnly ? WomenOnlyMessages.WOMEN_ONLY_DESCRIPTION : null,
      canBook,
      restrictionMessage,
      privacyIndicators: isWomenOnly ? {
        badge: 'Women-Only',
        icon: 'shield',
        color: 'pink',
        tooltip: WomenOnlyMessages.WOMEN_ONLY_DESCRIPTION
      } : null
    };
  }).filter(ride => {
    // Apply additional filters
    if (showWomenOnlyOnly && !ride.isWomenOnly) {
      return false;
    }
    if (hideWomenOnly && ride.isWomenOnly) {
      return false;
    }
    return true;
  });
};

/**
 * Get women-only ride badge information
 * 
 * Requirements: 10.1, 10.5
 * - Display women-only rides prominently with special badges
 * - Clearly mark women-only rides with privacy indicators
 * 
 * @param {Object} ride - Ride object
 * @returns {Object|null} Badge information or null if not women-only
 */
const getWomenOnlyBadge = (ride) => {
  if (!ride.isWomenOnly && !ride.ladiesOnly) {
    return null;
  }

  return {
    text: 'Women-Only',
    fullText: WomenOnlyMessages.WOMEN_ONLY_BADGE,
    description: WomenOnlyMessages.WOMEN_ONLY_DESCRIPTION,
    style: {
      backgroundColor: '#FDF2F8', // pink-50
      textColor: '#BE185D', // pink-700
      borderColor: '#FBCFE8', // pink-200
      iconColor: '#EC4899' // pink-500
    },
    icon: 'shield-check'
  };
};

/**
 * Create booking restriction error for women-only rides
 * 
 * Requirements: 10.3
 * - Prevent booking and display appropriate message
 * 
 * @param {string} reason - Restriction reason code
 * @returns {Error} Error object with code and message
 */
const createWomenOnlyRestrictionError = (reason) => {
  const error = new Error(WomenOnlyMessages[reason] || WomenOnlyMessages.WOMEN_ONLY_RIDE);
  error.code = reason;
  error.statusCode = 403;
  return error;
};

/**
 * Validate booking request for women-only ride
 * Comprehensive validation including user and passenger genders
 * 
 * Requirements: 10.2, 10.3, 10.4
 * 
 * @param {Object} user - User making the booking
 * @param {Object} ride - Ride being booked
 * @param {Array} passengerDetails - Optional passenger details
 * @returns {Object} Validation result
 */
const validateWomenOnlyBooking = (user, ride, passengerDetails = []) => {
  // Check if ride is women-only
  if (!ride.isWomenOnly && !ride.ladiesOnly) {
    return { isValid: true, errors: [] };
  }

  const errors = [];

  // Validate user can book
  const userCheck = canUserBookWomenOnlyRide(user, ride);
  if (!userCheck.canBook) {
    errors.push({
      field: 'user',
      code: userCheck.reason,
      message: userCheck.message
    });
  }

  // Validate passenger genders if provided
  if (passengerDetails.length > 0) {
    const passengerCheck = validatePassengerGenders(passengerDetails, ride);
    if (!passengerCheck.isValid) {
      errors.push({
        field: 'passengers',
        code: WomenOnlyErrorCodes.PASSENGER_GENDER_MISMATCH,
        message: passengerCheck.message,
        invalidPassengers: passengerCheck.invalidPassengers
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  WomenOnlyErrorCodes,
  WomenOnlyMessages,
  canUserBookWomenOnlyRide,
  validatePassengerGenders,
  filterRidesForUser,
  getWomenOnlyBadge,
  createWomenOnlyRestrictionError,
  validateWomenOnlyBooking
};
