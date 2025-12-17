/**
 * Property-based tests for Seat Validation
 * Tests that seat validation prevents overbooking
 * 
 * **Feature: passenger-ride-search-booking**
 */
const fc = require('fast-check');
const { validateSeatAvailability } = require('../../src/services/bookingService');

// Generators for seat validation inputs
const validSeatsArbitrary = fc.integer({ min: 1, max: 6 }); // Valid seat range: 1-6
const availableSeatsArbitrary = fc.integer({ min: 0, max: 10 }); // Available seats: 0-10
const invalidLowSeatsArbitrary = fc.integer({ min: -100, max: 0 }); // Invalid: <= 0
const invalidHighSeatsArbitrary = fc.integer({ min: 7, max: 100 }); // Invalid: > 6

describe('Seat Validation - Property Tests', () => {
  /**
   * **Feature: passenger-ride-search-booking, Property 6: Seat validation prevents overbooking**
   * **Validates: Requirements 5.2, 5.5**
   * 
   * *For any* booking attempt where requested seats exceed available seats,
   * the system SHALL reject the booking with an appropriate error.
   */
  describe('Property 6: Seat validation prevents overbooking', () => {
    it('rejects booking when requested seats exceed available seats', async () => {
      await fc.assert(
        fc.asyncProperty(
          availableSeatsArbitrary,
          fc.integer({ min: 1, max: 6 }),
          async (availableSeats, requestedSeats) => {
            // Only test cases where requested > available
            fc.pre(requestedSeats > availableSeats);
            
            const result = validateSeatAvailability(requestedSeats, availableSeats);
            
            // Should be invalid with INSUFFICIENT_SEATS code
            return result.isValid === false && result.code === 'INSUFFICIENT_SEATS';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('accepts booking when requested seats are within available seats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // availableSeats
          fc.integer({ min: 1, max: 6 }),  // requestedSeats
          async (availableSeats, requestedSeats) => {
            // Only test cases where requested <= available
            fc.pre(requestedSeats <= availableSeats);

            const result = validateSeatAvailability(requestedSeats, availableSeats);
            
            // Should be valid
            return result.isValid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects booking when requested seats is zero or negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidLowSeatsArbitrary,
          availableSeatsArbitrary,
          async (requestedSeats, availableSeats) => {
            const result = validateSeatAvailability(requestedSeats, availableSeats);
            
            // Should be invalid with INVALID_SEAT_COUNT code
            return result.isValid === false && result.code === 'INVALID_SEAT_COUNT';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects booking when requested seats exceed maximum of 6', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidHighSeatsArbitrary,
          fc.integer({ min: 7, max: 100 }), // availableSeats >= requestedSeats to isolate max check
          async (requestedSeats, availableSeats) => {
            const result = validateSeatAvailability(requestedSeats, availableSeats);
            
            // Should be invalid with MAX_SEATS_EXCEEDED code
            return result.isValid === false && result.code === 'MAX_SEATS_EXCEEDED';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns appropriate error message when no seats available', async () => {
      await fc.assert(
        fc.asyncProperty(
          validSeatsArbitrary,
          async (requestedSeats) => {
            const result = validateSeatAvailability(requestedSeats, 0);
            
            // Should be invalid with message about no seats
            return result.isValid === false && 
                   result.code === 'INSUFFICIENT_SEATS' &&
                   result.message === 'No seats available for this trip';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns appropriate error message with available seat count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // availableSeats (1-5)
          fc.integer({ min: 2, max: 6 }), // requestedSeats (2-6)
          async (availableSeats, requestedSeats) => {
            // Only test cases where requested > available and available > 0
            fc.pre(requestedSeats > availableSeats);
            
            const result = validateSeatAvailability(requestedSeats, availableSeats);
            
            // Should include the available seat count in message
            const expectedMessage = availableSeats === 1 
              ? `Only 1 seat available`
              : `Only ${availableSeats} seats available`;
            
            return result.isValid === false && 
                   result.code === 'INSUFFICIENT_SEATS' &&
                   result.message === expectedMessage;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
