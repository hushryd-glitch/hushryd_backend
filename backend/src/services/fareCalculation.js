/**
 * Fare Calculation Service
 * 
 * Handles platform fee calculations for passenger bookings and driver earnings.
 * Platform fee is ₹15 per seat for both passengers and drivers.
 */

const PLATFORM_FEE = {
  DRIVER_FEE_PER_SEAT: 15,    // ₹15 deducted from driver per seat
  PASSENGER_FEE_PER_SEAT: 15  // ₹15 charged to passenger per seat
};

/**
 * Calculate booking fare with platform fees
 * 
 * @param {number} farePerSeat - Base fare per seat set by driver
 * @param {number} seats - Number of seats being booked
 * @returns {Object} Fare breakdown with all components
 */
function calculateBookingFare(farePerSeat, seats) {
  const baseFare = farePerSeat * seats;
  const passengerPlatformFee = PLATFORM_FEE.PASSENGER_FEE_PER_SEAT * seats;
  const totalPassengerPays = baseFare + passengerPlatformFee;
  
  const driverPlatformFee = PLATFORM_FEE.DRIVER_FEE_PER_SEAT * seats;
  const driverNetEarnings = baseFare - driverPlatformFee;
  
  return {
    baseFare,
    passengerPlatformFee,
    totalPassengerPays,
    driverPlatformFee,
    driverNetEarnings
  };
}

module.exports = {
  PLATFORM_FEE,
  calculateBookingFare
};
