/**
 * Property-based tests for Badge Computation Utility
 * Tests badge computation is consistent with trip flags
 * 
 * **Feature: passenger-ride-search-booking**
 */
const fc = require('fast-check');

// Import the badge utility from backend utils
const { computeBadges, getBadgeStyle, BADGE_TYPES } = require('../../src/utils/badgeUtils');

describe('Badge Computation - Property Tests', () => {
  /**
   * **Feature: passenger-ride-search-booking, Property 3: Badge computation is consistent with trip flags**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   * 
   * *For any* trip, if driver.verified is true then badges SHALL contain 'ID Verified',
   * if instantBooking is true then badges SHALL contain 'Instant Booking',
   * if ladiesOnly is true then badges SHALL contain 'Ladies Only'.
   */
  describe('Property 3: Badge computation is consistent with trip flags', () => {
    it('should include ID Verified badge if and only if driver.verified is true', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // driver.verified
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          (verified, instantBooking, ladiesOnly) => {
            const trip = {
              driver: { verified },
              instantBooking,
              ladiesOnly
            };
            
            const badges = computeBadges(trip);
            const hasIdVerified = badges.includes(BADGE_TYPES.ID_VERIFIED);
            
            // ID Verified badge should be present if and only if driver.verified is true
            return hasIdVerified === verified;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include Instant Booking badge if and only if instantBooking is true', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // driver.verified
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          (verified, instantBooking, ladiesOnly) => {
            const trip = {
              driver: { verified },
              instantBooking,
              ladiesOnly
            };
            
            const badges = computeBadges(trip);
            const hasInstantBooking = badges.includes(BADGE_TYPES.INSTANT_BOOKING);
            
            // Instant Booking badge should be present if and only if instantBooking is true
            return hasInstantBooking === instantBooking;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include Ladies Only badge if and only if ladiesOnly is true', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // driver.verified
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          (verified, instantBooking, ladiesOnly) => {
            const trip = {
              driver: { verified },
              instantBooking,
              ladiesOnly
            };
            
            const badges = computeBadges(trip);
            const hasLadiesOnly = badges.includes(BADGE_TYPES.LADIES_ONLY);
            
            // Ladies Only badge should be present if and only if ladiesOnly is true
            return hasLadiesOnly === ladiesOnly;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should compute correct number of badges based on all flags', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // driver.verified
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          (verified, instantBooking, ladiesOnly) => {
            const trip = {
              driver: { verified },
              instantBooking,
              ladiesOnly
            };
            
            const badges = computeBadges(trip);
            
            // Count expected badges
            let expectedCount = 0;
            if (verified) expectedCount++;
            if (instantBooking) expectedCount++;
            if (ladiesOnly) expectedCount++;
            
            return badges.length === expectedCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for null or undefined trip', () => {
      const nullBadges = computeBadges(null);
      const undefinedBadges = computeBadges(undefined);
      
      expect(nullBadges).toEqual([]);
      expect(undefinedBadges).toEqual([]);
    });

    it('should handle missing driver object gracefully', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          (instantBooking, ladiesOnly) => {
            const trip = {
              // No driver object
              instantBooking,
              ladiesOnly
            };
            
            const badges = computeBadges(trip);
            
            // Should not include ID Verified (no driver)
            const hasIdVerified = badges.includes(BADGE_TYPES.ID_VERIFIED);
            if (hasIdVerified) return false;
            
            // Should still include other badges based on flags
            const hasInstantBooking = badges.includes(BADGE_TYPES.INSTANT_BOOKING);
            const hasLadiesOnly = badges.includes(BADGE_TYPES.LADIES_ONLY);
            
            return hasInstantBooking === instantBooking && hasLadiesOnly === ladiesOnly;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle driver object with missing verified field', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          (instantBooking, ladiesOnly) => {
            const trip = {
              driver: { name: 'Test Driver' }, // No verified field
              instantBooking,
              ladiesOnly
            };
            
            const badges = computeBadges(trip);
            
            // Should not include ID Verified (verified is undefined/falsy)
            const hasIdVerified = badges.includes(BADGE_TYPES.ID_VERIFIED);
            if (hasIdVerified) return false;
            
            // Should still include other badges based on flags
            const hasInstantBooking = badges.includes(BADGE_TYPES.INSTANT_BOOKING);
            const hasLadiesOnly = badges.includes(BADGE_TYPES.LADIES_ONLY);
            
            return hasInstantBooking === instantBooking && hasLadiesOnly === ladiesOnly;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getBadgeStyle returns distinct colors', () => {
    it('should return distinct styles for each badge type', () => {
      const idVerifiedStyle = getBadgeStyle(BADGE_TYPES.ID_VERIFIED);
      const instantBookingStyle = getBadgeStyle(BADGE_TYPES.INSTANT_BOOKING);
      const ladiesOnlyStyle = getBadgeStyle(BADGE_TYPES.LADIES_ONLY);
      
      // All styles should be different
      expect(idVerifiedStyle).not.toBe(instantBookingStyle);
      expect(idVerifiedStyle).not.toBe(ladiesOnlyStyle);
      expect(instantBookingStyle).not.toBe(ladiesOnlyStyle);
    });

    it('should return default style for unknown badge', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => 
            s !== BADGE_TYPES.ID_VERIFIED && 
            s !== BADGE_TYPES.INSTANT_BOOKING && 
            s !== BADGE_TYPES.LADIES_ONLY
          ),
          (unknownBadge) => {
            const style = getBadgeStyle(unknownBadge);
            return style === 'bg-gray-100 text-gray-700';
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
