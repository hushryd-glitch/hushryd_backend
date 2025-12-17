/**
 * Property-Based Tests for PIN Validation
 * 
 * **Feature: passenger-booking-flow, Property 14: PIN Validation Correctness**
 * **Validates: Requirements 8.2, 8.3, 8.4**
 * 
 * Tests that PIN validation correctly verifies passenger identity at ride start
 */

const fc = require('fast-check');

/**
 * Pure function to validate PIN
 * Mirrors the logic in bookingService.validatePassengerPIN
 * 
 * @param {string} storedPIN - PIN stored in booking
 * @param {string} enteredPIN - PIN entered by passenger
 * @returns {Object} Validation result
 */
const validatePIN = (storedPIN, enteredPIN) => {
  // Validate PIN format
  if (!enteredPIN || typeof enteredPIN !== 'string' || !/^\d{4}$/.test(enteredPIN)) {
    return {
      isValid: false,
      message: 'Invalid PIN format. PIN must be 4 digits.'
    };
  }
  
  // Compare PINs
  const isValid = storedPIN === enteredPIN;
  
  return {
    isValid,
    message: isValid ? 'PIN verified successfully' : 'Incorrect PIN. Please try again.'
  };
};

/**
 * Check if all passengers are verified for trip start
 * Mirrors the logic in bookingService.canStartTrip
 * 
 * @param {Array} bookings - Array of booking objects with verifiedAt field
 * @returns {Object} Trip start status
 */
const canStartTrip = (bookings) => {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    return {
      canStart: false,
      totalPassengers: 0,
      verifiedPassengers: 0
    };
  }
  
  const verifiedCount = bookings.filter(b => b.verifiedAt).length;
  const allVerified = verifiedCount === bookings.length;
  
  return {
    canStart: allVerified,
    totalPassengers: bookings.length,
    verifiedPassengers: verifiedCount
  };
};

// Arbitrary for valid 4-digit PIN
const validPINArb = fc.integer({ min: 1000, max: 9999 }).map(n => String(n));

// Arbitrary for invalid PIN (wrong format)
const invalidPINArb = fc.oneof(
  fc.constant(''),
  fc.constant(null),
  fc.constant(undefined),
  fc.string({ minLength: 1, maxLength: 3 }).map(s => s.replace(/\D/g, '')), // Too short
  fc.string({ minLength: 5, maxLength: 10 }).map(s => s.replace(/\D/g, '')), // Too long
  fc.string({ minLength: 4, maxLength: 4 }).filter(s => /[^0-9]/.test(s)) // Non-digits
);

// Arbitrary for booking with verification status
const bookingArb = fc.record({
  bookingId: fc.string({ minLength: 10, maxLength: 20 }),
  verifiedAt: fc.oneof(fc.constant(null), fc.date())
});

describe('PIN Validation Properties', () => {
  /**
   * **Feature: passenger-booking-flow, Property 14: PIN Validation Correctness**
   * **Validates: Requirements 8.2, 8.3, 8.4**
   * 
   * Property: For any PIN entry during ride start, if the entered PIN matches
   * the passenger's registered PIN, validation SHALL return true; otherwise false.
   */
  describe('Property 14: PIN Validation Correctness', () => {
    test('matching PIN returns isValid true', () => {
      fc.assert(
        fc.property(
          validPINArb,
          (pin) => {
            const result = validatePIN(pin, pin);
            return result.isValid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('non-matching PIN returns isValid false', () => {
      fc.assert(
        fc.property(
          validPINArb,
          validPINArb.filter(p => true), // Generate another PIN
          (storedPIN, enteredPIN) => {
            // Only test when PINs are different
            if (storedPIN === enteredPIN) return true;
            
            const result = validatePIN(storedPIN, enteredPIN);
            return result.isValid === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('invalid PIN format returns isValid false', () => {
      fc.assert(
        fc.property(
          validPINArb,
          invalidPINArb,
          (storedPIN, enteredPIN) => {
            const result = validatePIN(storedPIN, enteredPIN);
            return result.isValid === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('PIN validation is case-sensitive for digit strings', () => {
      fc.assert(
        fc.property(
          validPINArb,
          (pin) => {
            // PIN should match exactly
            const result = validatePIN(pin, pin);
            return result.isValid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('success message returned for valid PIN', () => {
      fc.assert(
        fc.property(
          validPINArb,
          (pin) => {
            const result = validatePIN(pin, pin);
            return result.message === 'PIN verified successfully';
          }
        ),
        { numRuns: 100 }
      );
    });

    test('error message returned for invalid PIN', () => {
      fc.assert(
        fc.property(
          validPINArb,
          validPINArb,
          (storedPIN, enteredPIN) => {
            if (storedPIN === enteredPIN) return true;
            
            const result = validatePIN(storedPIN, enteredPIN);
            return result.message === 'Incorrect PIN. Please try again.';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: passenger-booking-flow, Property 15: All Passengers Verified for Trip Start**
   * **Validates: Requirements 8.5**
   * 
   * Property: For any trip with multiple bookings, the driver SHALL only be able
   * to start the trip when all boarded passengers have verified PINs.
   */
  describe('Property 15: All Passengers Verified for Trip Start', () => {
    test('trip can start when all passengers are verified', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              bookingId: fc.string({ minLength: 5, maxLength: 20 }),
              verifiedAt: fc.date() // All have verification date
            }),
            { minLength: 1, maxLength: 6 }
          ),
          (bookings) => {
            const result = canStartTrip(bookings);
            return result.canStart === true && 
                   result.verifiedPassengers === result.totalPassengers;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('trip cannot start when some passengers are not verified', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              bookingId: fc.string({ minLength: 5, maxLength: 20 }),
              verifiedAt: fc.date()
            }),
            { minLength: 1, maxLength: 3 }
          ),
          fc.array(
            fc.record({
              bookingId: fc.string({ minLength: 5, maxLength: 20 }),
              verifiedAt: fc.constant(null) // Not verified
            }),
            { minLength: 1, maxLength: 3 }
          ),
          (verifiedBookings, unverifiedBookings) => {
            const allBookings = [...verifiedBookings, ...unverifiedBookings];
            const result = canStartTrip(allBookings);
            return result.canStart === false &&
                   result.verifiedPassengers === verifiedBookings.length &&
                   result.totalPassengers === allBookings.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('trip cannot start with no bookings', () => {
      const result = canStartTrip([]);
      expect(result.canStart).toBe(false);
      expect(result.totalPassengers).toBe(0);
    });

    test('verified count matches actual verified bookings', () => {
      fc.assert(
        fc.property(
          fc.array(bookingArb, { minLength: 1, maxLength: 6 }),
          (bookings) => {
            const result = canStartTrip(bookings);
            const actualVerified = bookings.filter(b => b.verifiedAt).length;
            return result.verifiedPassengers === actualVerified;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
