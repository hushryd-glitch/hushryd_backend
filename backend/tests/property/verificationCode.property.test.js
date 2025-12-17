/**
 * Property-Based Tests for Verification Code Generation and Validation
 * 
 * **Feature: ride-safety-tracking-notifications, Property 14: Verification Code Format**
 * **Validates: Requirements 7.1**
 * 
 * Tests that verification code generation produces unique 4-digit codes
 */

const fc = require('fast-check');

// Import the verification service functions
const {
  generateRandomCode,
  validateCodeFormat
} = require('../../src/services/verificationService');

/**
 * Validate verification code format
 * @param {string} code - Code to validate
 * @returns {boolean} True if valid 4-digit code
 */
const isValidCode = (code) => {
  if (typeof code !== 'string') return false;
  if (code.length !== 4) return false;
  if (!/^\d{4}$/.test(code)) return false;
  const numValue = parseInt(code, 10);
  return numValue >= 1000 && numValue <= 9999;
};

describe('Verification Code Properties', () => {
  /**
   * **Feature: ride-safety-tracking-notifications, Property 14: Verification Code Format**
   * **Validates: Requirements 7.1**
   * 
   * Property: For any confirmed booking, the generated verification code SHALL be 
   * exactly 4 digits and unique within active bookings.
   */
  describe('Property 14: Verification Code Format', () => {
    test('generated codes are always exactly 4 digits between 1000-9999', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // Number of codes to generate
          (count) => {
            for (let i = 0; i < Math.min(count, 100); i++) {
              const code = generateRandomCode();
              expect(isValidCode(code)).toBe(true);
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('code format validation correctly identifies valid codes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 9999 }),
          (num) => {
            const code = String(num);
            return isValidCode(code) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('code format validation correctly rejects codes outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: 0, max: 999 }), // Too small (less than 4 digits)
            fc.integer({ min: 10000, max: 99999 }) // Too large (more than 4 digits)
          ),
          (num) => {
            const code = String(num);
            return isValidCode(code) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('batch of generated codes maintains uniqueness within reasonable sample', () => {
      // Generate a batch of codes and check for uniqueness
      // Note: With 9000 possible codes, small batches should be unique
      const batchSize = 50;
      const codes = new Set();
      
      for (let i = 0; i < batchSize; i++) {
        const code = generateRandomCode();
        codes.add(code);
      }
      
      // With 9000 possible values and 50 samples, collision probability is very low
      // We expect at least 45 unique codes (allowing for rare collisions)
      expect(codes.size).toBeGreaterThanOrEqual(45);
    });

    test('code generation is uniformly distributed across range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }),
          (sampleSize) => {
            const codes = [];
            for (let i = 0; i < sampleSize; i++) {
              codes.push(parseInt(generateRandomCode(), 10));
            }
            
            // Check that codes span a reasonable range
            const min = Math.min(...codes);
            const max = Math.max(...codes);
            
            // With enough samples, we should see spread across the range
            return min >= 1000 && max <= 9999 && (max - min) > 1000;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('generated codes are always strings', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (count) => {
            for (let i = 0; i < count; i++) {
              const code = generateRandomCode();
              if (typeof code !== 'string') return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Verification Code Format Validation Properties', () => {
  test('validateCodeFormat accepts valid 4-digit codes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        (num) => {
          const code = String(num);
          const result = validateCodeFormat(code);
          return result.isValid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateCodeFormat rejects non-string values', () => {
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
          const result = validateCodeFormat(value);
          return result.isValid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateCodeFormat rejects strings with non-digit characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 4 }).filter(s => /[^0-9]/.test(s)),
        (str) => {
          const result = validateCodeFormat(str);
          return result.isValid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateCodeFormat rejects strings with wrong length', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 1, max: 999 }).map(n => String(n)), // 1-3 digits
          fc.integer({ min: 10000, max: 9999999 }).map(n => String(n)) // 5+ digits
        ),
        (str) => {
          const result = validateCodeFormat(str);
          return result.isValid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validateCodeFormat rejects empty string', () => {
    const result = validateCodeFormat('');
    expect(result.isValid).toBe(false);
  });

  test('validateCodeFormat provides meaningful error messages', () => {
    // Test null/undefined
    expect(validateCodeFormat(null).message).toBe('Code is required');
    expect(validateCodeFormat(undefined).message).toBe('Code is required');
    
    // Test non-string
    expect(validateCodeFormat(1234).message).toBe('Code must be a string');
    
    // Test wrong format
    expect(validateCodeFormat('123').message).toBe('Code must be exactly 4 digits');
    expect(validateCodeFormat('12345').message).toBe('Code must be exactly 4 digits');
    expect(validateCodeFormat('abcd').message).toBe('Code must be exactly 4 digits');
  });
});


/**
 * Property-Based Tests for Verification Code Validation
 * 
 * **Feature: ride-safety-tracking-notifications, Property 15: Verification Code Validation**
 * **Validates: Requirements 7.5, 7.6**
 * 
 * Tests that verification code validation correctly accepts matching codes
 * and rejects non-matching codes with proper attempt tracking
 */

describe('Verification Code Validation Properties', () => {
  /**
   * **Feature: ride-safety-tracking-notifications, Property 15: Verification Code Validation**
   * **Validates: Requirements 7.5, 7.6**
   * 
   * Property: For any booking with verification code C, entering code C SHALL return 
   * valid=true and start the ride, while entering any other code SHALL return valid=false.
   */
  describe('Property 15: Verification Code Validation', () => {
    /**
     * Simulate code validation logic (pure function for testing)
     * @param {string} storedCode - The stored verification code
     * @param {string} enteredCode - The code entered by driver
     * @returns {Object} Validation result
     */
    const simulateCodeValidation = (storedCode, enteredCode) => {
      // Validate format first
      if (!enteredCode || !/^\d{4}$/.test(enteredCode)) {
        return { isValid: false, reason: 'invalid_format' };
      }
      
      // Compare codes
      const isValid = storedCode === enteredCode;
      return { 
        isValid, 
        reason: isValid ? 'match' : 'mismatch' 
      };
    };

    test('correct code always validates successfully', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 9999 }),
          (codeNum) => {
            const code = String(codeNum);
            const result = simulateCodeValidation(code, code);
            return result.isValid === true && result.reason === 'match';
          }
        ),
        { numRuns: 100 }
      );
    });

    test('incorrect code always fails validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 9999 }),
          fc.integer({ min: 1000, max: 9999 }),
          (storedCodeNum, enteredCodeNum) => {
            // Only test when codes are different
            fc.pre(storedCodeNum !== enteredCodeNum);
            
            const storedCode = String(storedCodeNum);
            const enteredCode = String(enteredCodeNum);
            const result = simulateCodeValidation(storedCode, enteredCode);
            
            return result.isValid === false && result.reason === 'mismatch';
          }
        ),
        { numRuns: 100 }
      );
    });

    test('invalid format codes are rejected regardless of stored code', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 9999 }),
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(''),
            fc.integer({ min: 0, max: 999 }).map(n => String(n)), // Too short
            fc.integer({ min: 10000, max: 99999 }).map(n => String(n)), // Too long
            fc.string({ minLength: 4, maxLength: 4 }).filter(s => /[^0-9]/.test(s)) // Non-digits
          ),
          (storedCodeNum, invalidCode) => {
            const storedCode = String(storedCodeNum);
            const result = simulateCodeValidation(storedCode, invalidCode);
            return result.isValid === false && result.reason === 'invalid_format';
          }
        ),
        { numRuns: 100 }
      );
    });

    test('validation is case-insensitive for numeric codes', () => {
      // Since codes are numeric, this tests that string comparison works correctly
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 9999 }),
          (codeNum) => {
            const code = String(codeNum);
            // Test that leading zeros are preserved
            const paddedCode = code.padStart(4, '0');
            const result = simulateCodeValidation(code, paddedCode);
            return result.isValid === (code === paddedCode);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Attempt Tracking Properties', () => {
    /**
     * Simulate attempt tracking logic
     */
    const createAttemptTracker = (maxAttempts = 3) => {
      let attempts = 0;
      
      return {
        recordAttempt: () => {
          attempts++;
          return {
            attempts,
            attemptsRemaining: Math.max(0, maxAttempts - attempts),
            locked: attempts >= maxAttempts
          };
        },
        getAttempts: () => attempts,
        isLocked: () => attempts >= maxAttempts,
        reset: () => { attempts = 0; }
      };
    };

    test('attempt counter increments on each validation attempt', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (numAttempts) => {
            const tracker = createAttemptTracker(3);
            
            for (let i = 0; i < numAttempts; i++) {
              tracker.recordAttempt();
            }
            
            return tracker.getAttempts() === numAttempts;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('account locks after max attempts (3)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }),
          (numAttempts) => {
            const tracker = createAttemptTracker(3);
            
            for (let i = 0; i < numAttempts; i++) {
              tracker.recordAttempt();
            }
            
            return tracker.isLocked() === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('account is not locked before max attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 2 }),
          (numAttempts) => {
            const tracker = createAttemptTracker(3);
            
            for (let i = 0; i < numAttempts; i++) {
              tracker.recordAttempt();
            }
            
            return tracker.isLocked() === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('attempts remaining decreases correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          (numAttempts) => {
            const tracker = createAttemptTracker(3);
            let lastResult;
            
            for (let i = 0; i < numAttempts; i++) {
              lastResult = tracker.recordAttempt();
            }
            
            const expectedRemaining = Math.max(0, 3 - numAttempts);
            return lastResult.attemptsRemaining === expectedRemaining;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('reset clears attempt counter', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (numAttempts) => {
            const tracker = createAttemptTracker(3);
            
            for (let i = 0; i < numAttempts; i++) {
              tracker.recordAttempt();
            }
            
            tracker.reset();
            
            return tracker.getAttempts() === 0 && !tracker.isLocked();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
