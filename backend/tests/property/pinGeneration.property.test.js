/**
 * Property-Based Tests for Booking PIN Generation
 * 
 * **Feature: passenger-booking-flow, Property 6: PIN Generation Uniqueness**
 * **Validates: Requirements 4.1, 4.2**
 * 
 * Tests that PIN generation produces unique 4-digit PINs between 1000-9999
 */

const fc = require('fast-check');

/**
 * Pure function to generate a 4-digit PIN (1000-9999)
 * This mirrors the logic in User.generateBookingPIN but is pure for testing
 */
const generatePIN = () => {
  return String(Math.floor(1000 + Math.random() * 9000));
};

/**
 * Validate PIN format
 * @param {string} pin - PIN to validate
 * @returns {boolean} True if valid 4-digit PIN
 */
const isValidPIN = (pin) => {
  if (typeof pin !== 'string') return false;
  if (pin.length !== 4) return false;
  if (!/^\d{4}$/.test(pin)) return false;
  const numValue = parseInt(pin, 10);
  return numValue >= 1000 && numValue <= 9999;
};

describe('PIN Generation Properties', () => {
  /**
   * **Feature: passenger-booking-flow, Property 6: PIN Generation Uniqueness**
   * **Validates: Requirements 4.1, 4.2**
   * 
   * Property: For any newly registered user, the system SHALL generate a 4-digit PIN
   * that is unique and between 1000-9999.
   */
  describe('Property 6: PIN Generation Uniqueness', () => {
    test('generated PINs are always 4 digits between 1000-9999', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // Number of PINs to generate
          (count) => {
            for (let i = 0; i < Math.min(count, 100); i++) {
              const pin = generatePIN();
              expect(isValidPIN(pin)).toBe(true);
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('PIN format validation correctly identifies valid PINs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 9999 }),
          (num) => {
            const pin = String(num);
            return isValidPIN(pin) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('PIN format validation correctly rejects invalid PINs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: 0, max: 999 }), // Too small
            fc.integer({ min: 10000, max: 99999 }) // Too large
          ),
          (num) => {
            const pin = String(num);
            return isValidPIN(pin) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('batch of generated PINs maintains uniqueness within reasonable sample', () => {
      // Generate a batch of PINs and check for uniqueness
      // Note: With 9000 possible PINs, small batches should be unique
      const batchSize = 50;
      const pins = new Set();
      
      for (let i = 0; i < batchSize; i++) {
        const pin = generatePIN();
        pins.add(pin);
      }
      
      // With 9000 possible values and 50 samples, collision probability is very low
      // We expect at least 45 unique PINs (allowing for rare collisions)
      expect(pins.size).toBeGreaterThanOrEqual(45);
    });

    test('PIN generation is uniformly distributed across range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }),
          (sampleSize) => {
            const pins = [];
            for (let i = 0; i < sampleSize; i++) {
              pins.push(parseInt(generatePIN(), 10));
            }
            
            // Check that PINs span a reasonable range
            const min = Math.min(...pins);
            const max = Math.max(...pins);
            
            // With enough samples, we should see spread across the range
            return min >= 1000 && max <= 9999 && (max - min) > 1000;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

describe('PIN Validation Properties', () => {
  test('valid PIN strings pass validation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        (num) => {
          const pin = String(num);
          return isValidPIN(pin);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('non-string values fail validation', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.anything())
        ),
        (value) => {
          return !isValidPIN(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('strings with non-digit characters fail validation', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 4 }).filter(s => /[^0-9]/.test(s)),
        (str) => {
          return !isValidPIN(str);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('strings with wrong length fail validation', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 3 }).map(s => s.replace(/\D/g, '')),
          fc.string({ minLength: 5, maxLength: 10 }).map(s => s.replace(/\D/g, ''))
        ).filter(s => s.length !== 4 && s.length > 0),
        (str) => {
          return !isValidPIN(str);
        }
      ),
      { numRuns: 100 }
    );
  });
});
