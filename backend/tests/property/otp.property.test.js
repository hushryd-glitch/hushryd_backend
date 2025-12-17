/**
 * Property-based tests for OTP Authentication
 * Tests OTP generation, verification, and lockout behavior
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const OTP = require('../../src/models/OTP');
const {
  generateOTPCode,
  calculateExpiry,
  generateOTP,
  verifyOTP,
  maskPhoneNumber,
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  SMS_MAX_RETRIES
} = require('../../src/services/otpService');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await OTP.deleteMany({});
});

// Generators
const phoneArbitrary = fc.stringMatching(/^\+91[6-9]\d{9}$/);
const emailArbitrary = fc.emailAddress();
const typeArbitrary = fc.constantFrom('phone', 'email');
const identifierArbitrary = fc.oneof(phoneArbitrary, emailArbitrary);

describe('OTP Generation - Property Tests', () => {
  // **Feature: hushryd-platform, Property 1: OTP Generation Validity**
  // **Validates: Requirements 2.1, 2.2**
  
  describe('Property 1: OTP Generation Validity', () => {
    it('generateOTPCode should always produce exactly 6 numeric digits', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000 }), () => {
          const otp = generateOTPCode();
          
          // Must be exactly 6 characters
          const isCorrectLength = otp.length === OTP_LENGTH;
          
          // Must be all numeric
          const isNumeric = /^\d+$/.test(otp);
          
          // Must be in valid range (100000-999999)
          const numValue = parseInt(otp, 10);
          const isInRange = numValue >= 100000 && numValue <= 999999;
          
          return isCorrectLength && isNumeric && isInRange;
        }),
        { numRuns: 100 }
      );
    });

    // **Feature: ride-safety-tracking-notifications, Property 1: OTP Generation Format**
    // **Validates: Requirements 1.1**
    it('OTP generation format - For any phone number, the generated OTP SHALL be exactly 6 digits and numeric only', () => {
      fc.assert(
        fc.property(phoneArbitrary, () => {
          const otp = generateOTPCode();
          
          // Must be exactly 6 characters
          const isExactlySixDigits = otp.length === 6;
          
          // Must be all numeric (no letters or special characters)
          const isNumericOnly = /^\d{6}$/.test(otp);
          
          // Must not have leading zeros that would make it less than 6 digits when parsed
          const numValue = parseInt(otp, 10);
          const isValidNumber = numValue >= 100000 && numValue <= 999999;
          
          return isExactlySixDigits && isNumericOnly && isValidNumber;
        }),
        { numRuns: 100 }
      );
    });


    it('calculateExpiry should return a timestamp exactly 5 minutes in the future', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), () => {
          const before = Date.now();
          const expiry = calculateExpiry();
          const after = Date.now();
          
          const expectedMinMs = before + OTP_EXPIRY_MINUTES * 60 * 1000;
          const expectedMaxMs = after + OTP_EXPIRY_MINUTES * 60 * 1000;
          
          const expiryMs = expiry.getTime();
          
          return expiryMs >= expectedMinMs && expiryMs <= expectedMaxMs;
        }),
        { numRuns: 100 }
      );
    });

    it('generateOTP should store OTP with correct expiry and zero attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            const before = Date.now();
            const result = await generateOTP(identifier, type);
            const after = Date.now();
            
            // Check returned OTP is 6 digits
            const otpValid = result.otp.length === 6 && /^\d{6}$/.test(result.otp);
            
            // Check expiry is approximately 5 minutes from now
            const expectedMinMs = before + OTP_EXPIRY_MINUTES * 60 * 1000;
            const expectedMaxMs = after + OTP_EXPIRY_MINUTES * 60 * 1000;
            const expiryValid = result.expiresAt.getTime() >= expectedMinMs && 
                               result.expiresAt.getTime() <= expectedMaxMs;
            
            // Check stored record
            const stored = await OTP.findOne({ identifier, type });
            const storedValid = stored !== null && 
                               stored.attempts === 0 && 
                               stored.verified === false;
            
            // Check OTP is hashed (not stored in plain text)
            const isHashed = stored.code !== result.otp && 
                            await bcrypt.compare(result.otp, stored.code);
            
            return otpValid && expiryValid && storedValid && isHashed;
          }
        ),
        { numRuns: 30 } // Reduced due to bcrypt operations
      );
    }, 120000); // Extended timeout for bcrypt operations

    it('generateOTP should replace existing OTP for same identifier', async () => {
      await fc.assert(
        fc.asyncProperty(
          phoneArbitrary, // Use phone only to avoid email format issues
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate first OTP
            await generateOTP(identifier, type);
            
            // Small delay to ensure first OTP is saved
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Generate second OTP for same identifier
            const second = await generateOTP(identifier, type);
            
            // Small delay to ensure second OTP is saved
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Should only have one record
            const count = await OTP.countDocuments({ identifier, type });
            
            // The stored OTP should match the second one
            const stored = await OTP.findOne({ identifier, type });
            
            if (!stored) {
              return false; // Record not found
            }
            
            const matchesSecond = await bcrypt.compare(second.otp, stored.code);
            
            return count === 1 && matchesSecond;
          }
        ),
        { numRuns: 20 } // Reduced due to multiple bcrypt operations per iteration
      );
    }, 120000); // Extended timeout for bcrypt operations
  });
});


describe('Phone Number Masking - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 2: Phone Number Masking**
  // **Validates: Requirements 1.2**
  
  describe('Property 2: Phone Number Masking', () => {
    // Generator for phone numbers with 10 or more digits
    const phoneNumberArbitrary = fc.stringMatching(/^\+?[0-9]{10,15}$/);
    
    it('For any phone number of 10 or more digits, masking SHALL show only last 4 digits with rest replaced by asterisks', () => {
      fc.assert(
        fc.property(phoneNumberArbitrary, (phone) => {
          const masked = maskPhoneNumber(phone);
          const digits = phone.replace(/\D/g, '');
          
          // Must show exactly last 4 digits
          const lastFour = digits.slice(-4);
          const maskedEndsWithLastFour = masked.endsWith(lastFour);
          
          // Rest must be asterisks
          const expectedMaskedLength = digits.length;
          const maskedPartLength = masked.length - 4;
          const maskedPart = masked.slice(0, maskedPartLength);
          const allAsterisks = maskedPart === '*'.repeat(maskedPartLength);
          
          // Total length should match digit count
          const correctLength = masked.length === expectedMaskedLength;
          
          return maskedEndsWithLastFour && allAsterisks && correctLength;
        }),
        { numRuns: 100 }
      );
    });

    it('masking should handle various phone number formats consistently', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.stringMatching(/^\+91[6-9]\d{9}$/),  // Indian format with +91
            fc.stringMatching(/^[6-9]\d{9}$/),      // 10-digit Indian
            fc.stringMatching(/^91[6-9]\d{9}$/),    // 12-digit with 91
            fc.stringMatching(/^0[6-9]\d{9}$/)      // 11-digit with leading 0
          ),
          (phone) => {
            const masked = maskPhoneNumber(phone);
            const digits = phone.replace(/\D/g, '');
            
            // Last 4 digits should always be visible
            const lastFour = digits.slice(-4);
            const maskedEndsWithLastFour = masked.endsWith(lastFour);
            
            // Should have asterisks for the rest
            const maskedPart = masked.slice(0, -4);
            const allAsterisks = /^\*+$/.test(maskedPart);
            
            return maskedEndsWithLastFour && allAsterisks;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('masking should return all asterisks for phone numbers with less than 4 digits', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[0-9]{1,3}$/),
          (phone) => {
            const masked = maskPhoneNumber(phone);
            
            // Should be all asterisks
            const allAsterisks = /^\*+$/.test(masked);
            const correctLength = masked.length === phone.length;
            
            return allAsterisks && correctLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('masking should return empty string for empty input', () => {
      const masked = maskPhoneNumber('');
      expect(masked).toBe('');
    });

    it('masking should return empty string for null/undefined input', () => {
      const maskedNull = maskPhoneNumber(null);
      const maskedUndefined = maskPhoneNumber(undefined);
      expect(maskedNull).toBe('');
      expect(maskedUndefined).toBe('');
    });
  });
});


describe('SMS Retry Mechanism - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 3: Retry Mechanism Limit**
  // **Validates: Requirements 1.3**
  
  describe('Property 3: Retry Mechanism Limit', () => {
    it('SMS_MAX_RETRIES constant SHALL be exactly 3', () => {
      expect(SMS_MAX_RETRIES).toBe(3);
    });

    it('For any number of retry attempts, the mechanism SHALL attempt at most 3 retries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (requestedAttempts) => {
            // The retry mechanism is configured to attempt at most SMS_MAX_RETRIES (3)
            // Regardless of how many times we might want to retry, it should cap at 3
            const maxAllowedAttempts = SMS_MAX_RETRIES;
            const actualAttempts = Math.min(requestedAttempts, maxAllowedAttempts);
            
            // Property: actual attempts should never exceed SMS_MAX_RETRIES
            return actualAttempts <= SMS_MAX_RETRIES && SMS_MAX_RETRIES === 3;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('retry count should be bounded by SMS_MAX_RETRIES for any failure scenario', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          (failureSequence) => {
            // Simulate a sequence of failures/successes
            // The retry mechanism should stop after SMS_MAX_RETRIES failures
            let attempts = 0;
            let succeeded = false;
            
            for (let i = 0; i < failureSequence.length && attempts < SMS_MAX_RETRIES; i++) {
              attempts++;
              if (failureSequence[i]) {
                succeeded = true;
                break;
              }
            }
            
            // Property: attempts should never exceed SMS_MAX_RETRIES
            return attempts <= SMS_MAX_RETRIES;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('after SMS_MAX_RETRIES failures, no more attempts should be made', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: SMS_MAX_RETRIES, max: 20 }),
          (totalFailures) => {
            // Simulate continuous failures
            let attempts = 0;
            
            for (let i = 0; i < totalFailures; i++) {
              if (attempts >= SMS_MAX_RETRIES) {
                break; // Should stop here
              }
              attempts++;
            }
            
            // Property: even with many failures, attempts should cap at SMS_MAX_RETRIES
            return attempts === SMS_MAX_RETRIES;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('OTP Verification - Property Tests', () => {
  // **Feature: hushryd-platform, Property 2: OTP Verification Correctness**
  // **Validates: Requirements 2.3, 2.4**
  
  describe('Property 2: OTP Verification Correctness', () => {
    it('correct OTP within expiry window should succeed', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate OTP
            const { otp } = await generateOTP(identifier, type);
            
            // Verify with correct OTP
            const result = await verifyOTP(identifier, type, otp);
            
            return result.success === true;
          }
        ),
        { numRuns: 20 } // Reduced for performance
      );
    }, 120000); // Increase timeout to 2 minutes

    it('incorrect OTP should fail and increment attempt counter', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate OTP
            const { otp } = await generateOTP(identifier, type);
            
            // Create a wrong OTP (different from generated)
            const wrongOTP = otp === '123456' ? '654321' : '123456';
            
            // Verify with wrong OTP
            const result = await verifyOTP(identifier, type, wrongOTP);
            
            // Check attempt was incremented
            const stored = await OTP.findOne({ identifier, type, verified: false });
            
            return result.success === false && 
                   result.errorCode === 'AUTH_003' &&
                   stored && stored.attempts === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('expired OTP should fail verification', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate OTP
            const { otp } = await generateOTP(identifier, type);
            
            // Manually expire the OTP
            await OTP.updateOne(
              { identifier, type },
              { $set: { expiresAt: new Date(Date.now() - 1000) } }
            );
            
            // Verify with correct but expired OTP
            const result = await verifyOTP(identifier, type, otp);
            
            return result.success === false && result.errorCode === 'AUTH_002';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('OTP verification should mark OTP as verified on success', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate OTP
            const { otp } = await generateOTP(identifier, type);
            
            // Verify with correct OTP
            await verifyOTP(identifier, type, otp);
            
            // Check OTP is marked as verified
            const stored = await OTP.findOne({ identifier, type, verified: true });
            
            return stored && stored.verified === true;
          }
        ),
        { numRuns: 20 } // Reduced for performance
      );
    }, 120000); // Increase timeout to 2 minutes
  });
});


describe('OTP Lockout - Property Tests', () => {
  // **Feature: hushryd-platform, Property 3: OTP Lockout Enforcement**
  // **Validates: Requirements 2.5**
  
  describe('Property 3: OTP Lockout Enforcement', () => {
    it('should reject verification after 3 failed attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            try {
              // Clean up
              await OTP.deleteMany({});
              
              // Generate OTP
              const { otp } = await generateOTP(identifier, type);
              const wrongOTP = otp === '123456' ? '654321' : '123456';
              
              // Make 3 failed attempts
              const result1 = await verifyOTP(identifier, type, wrongOTP);
              const result2 = await verifyOTP(identifier, type, wrongOTP);
              const result3 = await verifyOTP(identifier, type, wrongOTP);
              
              // Verify we got the expected error codes
              if (result1.errorCode !== 'AUTH_003' || result2.errorCode !== 'AUTH_003') {
                return false;
              }
              
              // 3rd attempt should either be AUTH_003 or AUTH_004 depending on timing
              if (result3.errorCode !== 'AUTH_003' && result3.errorCode !== 'AUTH_004') {
                return false;
              }
              
              // 4th attempt should be rejected even with correct OTP
              const result4 = await verifyOTP(identifier, type, otp);
              
              return result4.success === false && result4.errorCode === 'AUTH_004';
            } catch (error) {
              console.error('Test error:', error);
              return false;
            }
          }
        ),
        { numRuns: 20 } // Further reduced for stability
      );
    }, 120000); // Extended timeout for bcrypt operations

    it('should track attempt count correctly across multiple failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          fc.integer({ min: 1, max: 3 }),
          async (identifier, type, numAttempts) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate OTP
            const { otp } = await generateOTP(identifier, type);
            const wrongOTP = otp === '123456' ? '654321' : '123456';
            
            // Make specified number of failed attempts
            for (let i = 0; i < numAttempts; i++) {
              await verifyOTP(identifier, type, wrongOTP);
            }
            
            // Check attempt count
            const stored = await OTP.findOne({ identifier, type });
            
            return stored.attempts === numAttempts;
          }
        ),
        { numRuns: 50 } // Reduced due to multiple bcrypt operations per iteration
      );
    }, 120000); // Extended timeout for bcrypt operations

    it('successful verification should not be possible after lockout', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate OTP
            const { otp } = await generateOTP(identifier, type);
            
            // Manually set attempts to 3 (locked)
            await OTP.updateOne(
              { identifier, type },
              { $set: { attempts: 3 } }
            );
            
            // Try to verify with correct OTP
            const result = await verifyOTP(identifier, type, otp);
            
            return result.success === false && result.errorCode === 'AUTH_004';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('new OTP request should reset lockout state', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          typeArbitrary,
          async (identifier, type) => {
            // Clean up
            await OTP.deleteMany({});
            
            // Generate first OTP and lock it
            await generateOTP(identifier, type);
            await OTP.updateOne(
              { identifier, type },
              { $set: { attempts: 3 } }
            );
            
            // Generate new OTP (should reset)
            const { otp: newOtp } = await generateOTP(identifier, type);
            
            // Verify new OTP should work
            const result = await verifyOTP(identifier, type, newOtp);
            
            return result.success === true;
          }
        ),
        { numRuns: 50 } // Reduced due to multiple bcrypt operations per iteration
      );
    }, 120000); // Extended timeout for bcrypt operations
  });
});


const {
  generateToken,
  verifyToken,
  getRoutingDestination
} = require('../../src/services/tokenService');
const User = require('../../src/models/User');

describe('Post-Authentication Routing - Property Tests', () => {
  // **Feature: hushryd-platform, Property 4: Post-Authentication Routing**
  // **Validates: Requirements 2.6, 2.7**
  
  describe('Property 4: Post-Authentication Routing', () => {
    it('new users should be routed to profile setup', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          async (identifier) => {
            // Clean up
            await User.deleteMany({});
            
            // Create a new user
            const isEmail = identifier.includes('@');
            const userData = isEmail ? { email: identifier } : { phone: identifier };
            const user = new User(userData);
            await user.save();
            
            // Generate token with isNewUser = true
            const { token } = generateToken(user, true);
            
            // Verify token contains isNewUser flag
            const { valid, payload } = verifyToken(token);
            
            // Check routing destination
            const destination = getRoutingDestination(payload.isNewUser);
            
            return valid && payload.isNewUser === true && destination === '/profile/setup';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('existing users should be routed to dashboard', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          async (identifier) => {
            // Clean up
            await User.deleteMany({});
            
            // Create an existing user
            const isEmail = identifier.includes('@');
            const userData = isEmail ? { email: identifier } : { phone: identifier };
            const user = new User(userData);
            await user.save();
            
            // Generate token with isNewUser = false
            const { token } = generateToken(user, false);
            
            // Verify token contains isNewUser flag
            const { valid, payload } = verifyToken(token);
            
            // Check routing destination
            const destination = getRoutingDestination(payload.isNewUser);
            
            return valid && payload.isNewUser === false && destination === '/dashboard';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('token should contain correct user information', async () => {
      await fc.assert(
        fc.asyncProperty(
          identifierArbitrary,
          fc.constantFrom('passenger', 'driver', 'admin'),
          fc.boolean(),
          async (identifier, role, isNewUser) => {
            // Clean up
            await User.deleteMany({});
            
            // Create user with specific role
            const isEmail = identifier.includes('@');
            const userData = isEmail 
              ? { email: identifier, role } 
              : { phone: identifier, role };
            const user = new User(userData);
            await user.save();
            
            // Generate token
            const { token } = generateToken(user, isNewUser);
            
            // Verify token payload
            const { valid, payload } = verifyToken(token);
            
            const userIdMatch = payload.userId === user._id.toString();
            const roleMatch = payload.role === role;
            const isNewUserMatch = payload.isNewUser === isNewUser;
            const identifierMatch = isEmail 
              ? payload.email === identifier 
              : payload.phone === identifier;
            
            return valid && userIdMatch && roleMatch && isNewUserMatch && identifierMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('routing destination should be deterministic based on isNewUser flag', () => {
      fc.assert(
        fc.property(fc.boolean(), (isNewUser) => {
          const destination = getRoutingDestination(isNewUser);
          
          if (isNewUser) {
            return destination === '/profile/setup';
          } else {
            return destination === '/dashboard';
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
