/**
 * Cashfree Payment Calculation Service
 * Implements payment breakdown, Free Cancellation fee, and total amount calculations
 * 
 * Requirements: 2.1, 2.2, 3.2
 * Design: Platform fee is fixed at ₹10, Free Cancellation fee starts at ₹10
 */

/**
 * Fixed platform fee charged to passengers (₹10)
 * Requirements: 2.1, 2.4
 */
const PLATFORM_FEE = 10;

/**
 * Minimum Free Cancellation fee (₹10)
 * Requirements: 3.2
 */
const MIN_FREE_CANCELLATION_FEE = 10;

/**
 * Free Cancellation fee percentage of fare (for fares above threshold)
 */
const FREE_CANCELLATION_PERCENTAGE = 0.05; // 5% of fare

/**
 * Fare threshold above which percentage-based Free Cancellation applies
 */
const FREE_CANCELLATION_THRESHOLD = 200;

/**
 * Calculate the Free Cancellation fee based on fare
 * Fee starts at ₹10 and scales with fare for higher amounts
 * 
 * @param {number} fare - Base fare amount in INR
 * @returns {number} Free Cancellation fee amount
 * 
 * Requirements: 3.2
 */
const calculateFreeCancellationFee = (fare) => {
  if (typeof fare !== 'number' || isNaN(fare)) {
    throw new Error('INVALID_FARE_AMOUNT');
  }
  
  if (fare < 0) {
    throw new Error('NEGATIVE_FARE_NOT_ALLOWED');
  }
  
  // For fares at or below threshold, use minimum fee
  if (fare <= FREE_CANCELLATION_THRESHOLD) {
    return MIN_FREE_CANCELLATION_FEE;
  }
  
  // For higher fares, calculate percentage-based fee with minimum floor
  const percentageFee = Math.ceil(fare * FREE_CANCELLATION_PERCENTAGE);
  return Math.max(percentageFee, MIN_FREE_CANCELLATION_FEE);
};

/**
 * Calculate complete payment breakdown for a booking
 * 
 * @param {number} fare - Base fare amount in INR
 * @param {Object} options - Payment options
 * @param {boolean} options.hasFreeCancellation - Whether Free Cancellation is selected
 * @param {number} options.appliedDiscount - Any discount amount applied (default: 0)
 * @param {string} options.source - Booking source ('web' or 'mobile')
 * @returns {Object} Payment breakdown with all components
 * 
 * Requirements: 2.1, 2.2, 3.2
 */
const calculatePaymentBreakdown = (fare, options = {}) => {
  if (typeof fare !== 'number' || isNaN(fare)) {
    throw new Error('INVALID_FARE_AMOUNT');
  }
  
  if (fare < 0) {
    throw new Error('NEGATIVE_FARE_NOT_ALLOWED');
  }
  
  const {
    hasFreeCancellation = false,
    appliedDiscount = 0,
    source = 'web'
  } = options;
  
  // Validate discount
  if (typeof appliedDiscount !== 'number' || appliedDiscount < 0) {
    throw new Error('INVALID_DISCOUNT_AMOUNT');
  }
  
  // Platform fee is always ₹10 regardless of source
  const platformFee = PLATFORM_FEE;
  
  // Calculate Free Cancellation fee if selected
  const freeCancellationFee = hasFreeCancellation 
    ? calculateFreeCancellationFee(fare) 
    : 0;
  
  // Apply discount to fare (discount cannot exceed fare)
  const effectiveDiscount = Math.min(appliedDiscount, fare);
  const discountedFare = fare - effectiveDiscount;
  
  // Total amount = discounted fare + platform fee + Free Cancellation fee
  const totalAmount = discountedFare + platformFee + freeCancellationFee;
  
  // Driver earnings = base fare (driver gets full fare, platform keeps fee)
  const driverEarnings = fare;
  
  return {
    baseFare: fare,
    platformFee,
    freeCancellationFee,
    appliedDiscount: effectiveDiscount,
    discountedFare,
    totalAmount,
    driverEarnings,
    source,
    hasFreeCancellation
  };
};

/**
 * Calculate total amount from a payment breakdown object
 * Validates and sums all components
 * 
 * @param {Object} breakdown - Payment breakdown object
 * @returns {number} Total amount
 * 
 * Requirements: 2.2, 3.3
 */
const calculateTotalAmount = (breakdown) => {
  if (!breakdown || typeof breakdown !== 'object') {
    throw new Error('INVALID_BREAKDOWN');
  }
  
  const { 
    baseFare, 
    platformFee, 
    freeCancellationFee = 0,
    appliedDiscount = 0 
  } = breakdown;
  
  // Validate required fields
  if (typeof baseFare !== 'number' || isNaN(baseFare)) {
    throw new Error('INVALID_BASE_FARE');
  }
  
  if (typeof platformFee !== 'number' || isNaN(platformFee)) {
    throw new Error('INVALID_PLATFORM_FEE');
  }
  
  if (typeof freeCancellationFee !== 'number' || isNaN(freeCancellationFee)) {
    throw new Error('INVALID_FREE_CANCELLATION_FEE');
  }
  
  if (typeof appliedDiscount !== 'number' || isNaN(appliedDiscount)) {
    throw new Error('INVALID_DISCOUNT');
  }
  
  // Calculate total: (baseFare - discount) + platformFee + freeCancellationFee
  const discountedFare = Math.max(0, baseFare - appliedDiscount);
  return discountedFare + platformFee + freeCancellationFee;
};

/**
 * Validate payment breakdown integrity
 * Ensures totalAmount equals sum of all components
 * 
 * @param {Object} breakdown - Payment breakdown object
 * @returns {boolean} True if breakdown is valid
 */
const validatePaymentBreakdown = (breakdown) => {
  if (!breakdown || typeof breakdown !== 'object') {
    return false;
  }
  
  const { 
    baseFare, 
    platformFee, 
    freeCancellationFee = 0,
    appliedDiscount = 0,
    totalAmount 
  } = breakdown;
  
  // Check all values are valid numbers
  const values = [baseFare, platformFee, freeCancellationFee, appliedDiscount, totalAmount];
  if (values.some(v => typeof v !== 'number' || isNaN(v))) {
    return false;
  }
  
  // Check non-negative values
  if (baseFare < 0 || platformFee < 0 || freeCancellationFee < 0 || appliedDiscount < 0) {
    return false;
  }
  
  // Verify total calculation
  const expectedTotal = calculateTotalAmount(breakdown);
  return totalAmount === expectedTotal;
};

/**
 * Cancellation Policy Tiers
 * Time-based cancellation charge percentages
 * 
 * Requirements: 4.1, 4.3
 * Design: Cancellation charges increase as departure approaches
 */
const CANCELLATION_TIERS = {
  // > 24 hours before departure: 90% refund (10% charge)
  TIER_1: { minHours: 24, refundPercent: 90, chargePercent: 10, name: 'more_than_24h' },
  // 12-24 hours before departure: 75% refund (25% charge)
  TIER_2: { minHours: 12, refundPercent: 75, chargePercent: 25, name: '12_to_24h' },
  // 2-12 hours before departure: 50% refund (50% charge)
  TIER_3: { minHours: 2, refundPercent: 50, chargePercent: 50, name: '2_to_12h' },
  // < 2 hours before departure: 25% refund (75% charge)
  TIER_4: { minHours: 0, refundPercent: 25, chargePercent: 75, name: 'less_than_2h' }
};

/**
 * Free Cancellation window in hours before departure
 * Requirements: 3.4
 */
const FREE_CANCELLATION_WINDOW_HOURS = 2;

/**
 * Get the applicable cancellation tier based on hours until departure
 * 
 * @param {number} hoursUntilDeparture - Hours remaining until trip departure
 * @returns {Object} Applicable cancellation tier
 * 
 * Requirements: 4.1, 4.3
 */
const getCancellationTier = (hoursUntilDeparture) => {
  if (typeof hoursUntilDeparture !== 'number' || isNaN(hoursUntilDeparture)) {
    throw new Error('INVALID_HOURS_VALUE');
  }
  
  // Negative hours means departure has passed
  if (hoursUntilDeparture < 0) {
    return { ...CANCELLATION_TIERS.TIER_4, hoursUntilDeparture: 0 };
  }
  
  if (hoursUntilDeparture >= CANCELLATION_TIERS.TIER_1.minHours) {
    return { ...CANCELLATION_TIERS.TIER_1, hoursUntilDeparture };
  } else if (hoursUntilDeparture >= CANCELLATION_TIERS.TIER_2.minHours) {
    return { ...CANCELLATION_TIERS.TIER_2, hoursUntilDeparture };
  } else if (hoursUntilDeparture >= CANCELLATION_TIERS.TIER_3.minHours) {
    return { ...CANCELLATION_TIERS.TIER_3, hoursUntilDeparture };
  } else {
    return { ...CANCELLATION_TIERS.TIER_4, hoursUntilDeparture };
  }
};

/**
 * Calculate hours until departure from booking and cancellation time
 * 
 * @param {Object} booking - Booking object with departureTime
 * @param {Date} cancellationTime - Time of cancellation
 * @returns {number} Hours until departure (can be negative if past)
 */
const calculateHoursUntilDeparture = (booking, cancellationTime) => {
  if (!booking || !booking.departureTime) {
    throw new Error('INVALID_BOOKING_DATA');
  }
  
  const departureDate = new Date(booking.departureTime);
  const cancelDate = cancellationTime instanceof Date ? cancellationTime : new Date(cancellationTime);
  
  if (isNaN(departureDate.getTime()) || isNaN(cancelDate.getTime())) {
    throw new Error('INVALID_DATE_VALUE');
  }
  
  const diffMs = departureDate.getTime() - cancelDate.getTime();
  return diffMs / (1000 * 60 * 60); // Convert to hours
};

/**
 * Calculate cancellation charges for a booking
 * 
 * @param {Object} booking - Booking object with payment details
 * @param {number} booking.baseFare - Original base fare
 * @param {number} booking.platformFee - Platform fee (always ₹10)
 * @param {number} booking.freeCancellationFee - Free Cancellation fee if opted
 * @param {boolean} booking.hasFreeCancellation - Whether Free Cancellation was purchased
 * @param {number} booking.appliedDiscount - Any discount applied to original booking
 * @param {Date|string} booking.departureTime - Scheduled departure time
 * @param {Date} cancellationTime - Time of cancellation (defaults to now)
 * @returns {Object} Cancellation charges breakdown
 * 
 * Requirements: 4.1, 4.3, 4.5
 */
const calculateCancellationCharges = (booking, cancellationTime = new Date()) => {
  // Validate booking object
  if (!booking || typeof booking !== 'object') {
    throw new Error('INVALID_BOOKING');
  }
  
  const {
    baseFare,
    platformFee = PLATFORM_FEE,
    freeCancellationFee = 0,
    hasFreeCancellation = false,
    appliedDiscount = 0,
    departureTime
  } = booking;
  
  // Validate required fields
  if (typeof baseFare !== 'number' || isNaN(baseFare) || baseFare < 0) {
    throw new Error('INVALID_BASE_FARE');
  }
  
  if (!departureTime) {
    throw new Error('MISSING_DEPARTURE_TIME');
  }
  
  // Calculate hours until departure
  const hoursUntilDeparture = calculateHoursUntilDeparture(
    { departureTime },
    cancellationTime
  );
  
  // Check if within Free Cancellation window
  const isWithinFreeCancellationWindow = hoursUntilDeparture >= FREE_CANCELLATION_WINDOW_HOURS;
  
  // Get applicable cancellation tier
  const tier = getCancellationTier(hoursUntilDeparture);
  
  // Calculate charges based on Free Cancellation status and window
  let refundableAmount;
  let cancellationCharge;
  let policyApplied;
  
  if (hasFreeCancellation && isWithinFreeCancellationWindow) {
    // Free Cancellation: Full fare refund (excluding platform fee and FC fee)
    refundableAmount = baseFare;
    cancellationCharge = 0;
    policyApplied = 'free_cancellation';
  } else {
    // Standard cancellation policy applies
    refundableAmount = Math.round(baseFare * (tier.refundPercent / 100));
    cancellationCharge = baseFare - refundableAmount;
    policyApplied = tier.name;
  }
  
  // Platform fee is NEVER refunded (Requirements: 2.5)
  const nonRefundablePlatformFee = platformFee;
  
  // Free Cancellation fee is NEVER refunded
  const nonRefundableFreeCancellationFee = freeCancellationFee;
  
  // Deduct any applied discounts from refund (Requirements: 4.5)
  const discountDeduction = Math.min(appliedDiscount, refundableAmount);
  
  // Calculate net refund
  const netRefund = Math.max(0, refundableAmount - discountDeduction);
  
  return {
    // Original booking details
    baseFare,
    platformFee: nonRefundablePlatformFee,
    freeCancellationFee: nonRefundableFreeCancellationFee,
    appliedDiscount,
    
    // Cancellation timing
    hoursUntilDeparture: Math.max(0, hoursUntilDeparture),
    isWithinFreeCancellationWindow,
    
    // Charges breakdown
    refundableAmount,
    cancellationCharge,
    discountDeduction,
    
    // Non-refundable fees (always deducted)
    nonRefundableFees: nonRefundablePlatformFee + nonRefundableFreeCancellationFee,
    
    // Final refund amount
    netRefund,
    
    // Policy details
    policyApplied,
    tier: tier.name,
    refundPercent: hasFreeCancellation && isWithinFreeCancellationWindow ? 100 : tier.refundPercent,
    
    // Flags
    hasFreeCancellation
  };
};

/**
 * Calculate refund amount for a booking cancellation
 * Wrapper function that returns just the refund details
 * 
 * @param {Object} booking - Booking object with payment details
 * @param {Date} cancellationTime - Time of cancellation
 * @returns {Object} Refund breakdown
 * 
 * Requirements: 4.1, 4.3, 4.5
 */
const calculateRefundAmount = (booking, cancellationTime = new Date()) => {
  const charges = calculateCancellationCharges(booking, cancellationTime);
  
  return {
    // Original payment
    originalPayment: charges.baseFare + charges.platformFee + charges.freeCancellationFee - charges.appliedDiscount,
    
    // Refund breakdown
    fareRefund: charges.refundableAmount,
    cancellationCharge: charges.cancellationCharge,
    discountDeduction: charges.discountDeduction,
    
    // Non-refundable amounts
    platformFeeRetained: charges.platformFee,
    freeCancellationFeeRetained: charges.freeCancellationFee,
    totalNonRefundable: charges.nonRefundableFees,
    
    // Final refund
    netRefund: charges.netRefund,
    
    // Policy info
    policyApplied: charges.policyApplied,
    refundPercent: charges.refundPercent,
    hoursUntilDeparture: charges.hoursUntilDeparture,
    
    // Flags
    hasFreeCancellation: charges.hasFreeCancellation,
    isWithinFreeCancellationWindow: charges.isWithinFreeCancellationWindow
  };
};

module.exports = {
  // Core calculation functions
  calculatePaymentBreakdown,
  calculateFreeCancellationFee,
  calculateTotalAmount,
  validatePaymentBreakdown,
  
  // Cancellation calculation functions
  calculateCancellationCharges,
  calculateRefundAmount,
  getCancellationTier,
  calculateHoursUntilDeparture,
  
  // Constants (exported for testing)
  PLATFORM_FEE,
  MIN_FREE_CANCELLATION_FEE,
  FREE_CANCELLATION_PERCENTAGE,
  FREE_CANCELLATION_THRESHOLD,
  CANCELLATION_TIERS,
  FREE_CANCELLATION_WINDOW_HOURS
};
