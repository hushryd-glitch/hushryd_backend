/**
 * Badge Utilities for Ride Cards
 * Computes and styles badges based on trip flags
 * Requirements: 2.1, 2.2, 2.3, 2.4
 * 
 * Note: This is the backend version of the badge utility.
 * The frontend version is at frontend/src/lib/badgeUtils.js
 * Both implementations must stay in sync.
 */

/**
 * Badge type constants
 */
const BADGE_TYPES = {
  ID_VERIFIED: 'ID Verified',
  INSTANT_BOOKING: 'Instant Booking',
  LADIES_ONLY: 'Ladies Only'
};

/**
 * Computes badges for a trip based on its flags
 * @param {Object} trip - Trip object with driver and trip flags
 * @param {Object} trip.driver - Driver object
 * @param {boolean} trip.driver.verified - Whether driver is verified
 * @param {boolean} trip.instantBooking - Whether instant booking is enabled
 * @param {boolean} trip.ladiesOnly - Whether ride is ladies only
 * @returns {string[]} Array of badge strings
 * 
 * Requirements:
 * - 2.1: WHEN a driver is verified THEN display "ID Verified" badge
 * - 2.2: WHEN a ride has instant booking enabled THEN display "Instant Booking" badge
 * - 2.3: WHEN a ride is marked as ladies only THEN display "Ladies Only" badge
 */
function computeBadges(trip) {
  const badges = [];
  
  if (!trip) {
    return badges;
  }
  
  // Check driver verification status (Requirement 2.1)
  if (trip.driver?.verified) {
    badges.push(BADGE_TYPES.ID_VERIFIED);
  }
  
  // Check instant booking flag (Requirement 2.2)
  if (trip.instantBooking) {
    badges.push(BADGE_TYPES.INSTANT_BOOKING);
  }
  
  // Check ladies only flag (Requirement 2.3)
  if (trip.ladiesOnly) {
    badges.push(BADGE_TYPES.LADIES_ONLY);
  }
  
  return badges;
}

/**
 * Returns distinct color styles for each badge type
 * @param {string} badge - Badge string
 * @returns {string} Tailwind CSS classes for badge styling
 * 
 * Requirement 2.4: Use distinct colors for each badge type
 */
function getBadgeStyle(badge) {
  const styles = {
    [BADGE_TYPES.ID_VERIFIED]: 'bg-green-100 text-green-700',
    [BADGE_TYPES.INSTANT_BOOKING]: 'bg-blue-100 text-blue-700',
    [BADGE_TYPES.LADIES_ONLY]: 'bg-pink-100 text-pink-700'
  };
  
  return Object.hasOwn(styles, badge) ? styles[badge] : 'bg-gray-100 text-gray-700';
}

module.exports = { computeBadges, getBadgeStyle, BADGE_TYPES };
