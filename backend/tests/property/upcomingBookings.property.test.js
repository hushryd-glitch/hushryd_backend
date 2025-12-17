/**
 * Property-Based Tests for Upcoming Bookings
 * 
 * **Feature: passenger-booking-flow, Property 12: Upcoming Rides Chronological Order**
 * **Feature: passenger-booking-flow, Property 13: Upcoming Soon Highlight**
 * **Validates: Requirements 7.2, 7.4**
 * 
 * Tests that upcoming bookings are sorted chronologically and marked as "Upcoming Soon"
 */

const fc = require('fast-check');

/**
 * Pure function to sort bookings by departure time
 * Mirrors the logic in bookingService.getUpcomingBookings
 * 
 * @param {Array} bookings - Array of booking objects with departureTime
 * @returns {Array} Sorted bookings
 */
const sortByDepartureTime = (bookings) => {
  return [...bookings].sort((a, b) => 
    new Date(a.departureTime) - new Date(b.departureTime)
  );
};

/**
 * Check if a booking is "Upcoming Soon" (within 24 hours)
 * Mirrors the logic in bookingService.getUpcomingBookings
 * 
 * @param {Date} departureTime - Departure time of the trip
 * @param {Date} now - Current time
 * @returns {boolean} True if within 24 hours
 */
const isUpcomingSoon = (departureTime, now) => {
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return new Date(departureTime) <= twentyFourHoursFromNow;
};

/**
 * Process bookings to add isUpcomingSoon flag
 * 
 * @param {Array} bookings - Array of booking objects
 * @param {Date} now - Current time
 * @returns {Array} Bookings with isUpcomingSoon flag
 */
const processUpcomingBookings = (bookings, now) => {
  return bookings.map(b => ({
    ...b,
    isUpcomingSoon: isUpcomingSoon(b.departureTime, now)
  }));
};

// Arbitrary for future departure time (1 hour to 7 days from now)
const futureDepartureArb = fc.integer({ min: 1, max: 168 }).map(hours => {
  const now = new Date();
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
});

// Arbitrary for booking with departure time
const bookingWithDepartureArb = fc.record({
  bookingId: fc.string({ minLength: 10, maxLength: 20 }),
  departureTime: futureDepartureArb
});

describe('Upcoming Bookings Properties', () => {
  /**
   * **Feature: passenger-booking-flow, Property 12: Upcoming Rides Chronological Order**
   * **Validates: Requirements 7.2**
   * 
   * Property: For any user with multiple upcoming bookings, the bookings SHALL be
   * displayed sorted by departure time in ascending order.
   */
  describe('Property 12: Upcoming Rides Chronological Order', () => {
    test('bookings are sorted by departure time ascending', () => {
      fc.assert(
        fc.property(
          fc.array(bookingWithDepartureArb, { minLength: 2, maxLength: 10 }),
          (bookings) => {
            const sorted = sortByDepartureTime(bookings);
            
            // Verify ascending order
            for (let i = 1; i < sorted.length; i++) {
              const prev = new Date(sorted[i - 1].departureTime);
              const curr = new Date(sorted[i].departureTime);
              if (prev > curr) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('sorting preserves all bookings', () => {
      fc.assert(
        fc.property(
          fc.array(bookingWithDepartureArb, { minLength: 1, maxLength: 10 }),
          (bookings) => {
            const sorted = sortByDepartureTime(bookings);
            return sorted.length === bookings.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('sorting preserves booking data', () => {
      fc.assert(
        fc.property(
          fc.array(bookingWithDepartureArb, { minLength: 1, maxLength: 10 }),
          (bookings) => {
            const sorted = sortByDepartureTime(bookings);
            const originalIds = new Set(bookings.map(b => b.bookingId));
            const sortedIds = new Set(sorted.map(b => b.bookingId));
            
            // All original IDs should be in sorted result
            for (const id of originalIds) {
              if (!sortedIds.has(id)) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('single booking remains unchanged', () => {
      fc.assert(
        fc.property(
          bookingWithDepartureArb,
          (booking) => {
            const sorted = sortByDepartureTime([booking]);
            return sorted.length === 1 && 
                   sorted[0].bookingId === booking.bookingId;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: passenger-booking-flow, Property 13: Upcoming Soon Highlight**
   * **Validates: Requirements 7.4**
   * 
   * Property: For any booking with departure time within 24 hours of current time,
   * the booking SHALL be marked as "Upcoming Soon".
   */
  describe('Property 13: Upcoming Soon Highlight', () => {
    test('bookings within 24 hours are marked as Upcoming Soon', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 23 }), // Hours from now (within 24)
          (hoursFromNow) => {
            const now = new Date();
            const departureTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
            
            return isUpcomingSoon(departureTime, now) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('bookings more than 24 hours away are not marked as Upcoming Soon', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 25, max: 168 }), // Hours from now (more than 24)
          (hoursFromNow) => {
            const now = new Date();
            const departureTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
            
            return isUpcomingSoon(departureTime, now) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('booking exactly at 24 hours is marked as Upcoming Soon', () => {
      const now = new Date();
      const departureTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      expect(isUpcomingSoon(departureTime, now)).toBe(true);
    });

    test('processUpcomingBookings adds correct isUpcomingSoon flag', () => {
      fc.assert(
        fc.property(
          fc.array(bookingWithDepartureArb, { minLength: 1, maxLength: 10 }),
          (bookings) => {
            const now = new Date();
            const processed = processUpcomingBookings(bookings, now);
            
            // Verify each booking has correct flag
            for (let i = 0; i < processed.length; i++) {
              const expected = isUpcomingSoon(bookings[i].departureTime, now);
              if (processed[i].isUpcomingSoon !== expected) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('mixed bookings have correct flags', () => {
      const now = new Date();
      
      // Create bookings with known times
      const bookings = [
        { bookingId: 'soon1', departureTime: new Date(now.getTime() + 2 * 60 * 60 * 1000) }, // 2 hours
        { bookingId: 'soon2', departureTime: new Date(now.getTime() + 12 * 60 * 60 * 1000) }, // 12 hours
        { bookingId: 'later1', departureTime: new Date(now.getTime() + 48 * 60 * 60 * 1000) }, // 48 hours
        { bookingId: 'later2', departureTime: new Date(now.getTime() + 72 * 60 * 60 * 1000) } // 72 hours
      ];
      
      const processed = processUpcomingBookings(bookings, now);
      
      expect(processed[0].isUpcomingSoon).toBe(true);
      expect(processed[1].isUpcomingSoon).toBe(true);
      expect(processed[2].isUpcomingSoon).toBe(false);
      expect(processed[3].isUpcomingSoon).toBe(false);
    });
  });
});
