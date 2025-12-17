/**
 * Property-based tests for User model
 * Tests phone/email uniqueness enforcement
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const { validateUniqueIdentifier, createUser } = require('../../src/services/userService');

// MongoDB Memory Server for isolated testing
const { MongoMemoryServer } = require('mongodb-memory-server');

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
  await User.deleteMany({});
});

// Generators for valid phone numbers and emails
const phoneArbitrary = fc.stringMatching(/^\+91[6-9]\d{9}$/);
const emailArbitrary = fc.emailAddress();

describe('User Model - Phone/Email Uniqueness', () => {
  // **Feature: hushryd-platform, Property 31: Phone/Email Uniqueness Enforcement**
  // **Validates: Requirements 2.1, 2.2**
  
  describe('Property 31: Phone/Email Uniqueness Enforcement', () => {
    it('should reject duplicate phone numbers across different users', async () => {
      await fc.assert(
        fc.asyncProperty(phoneArbitrary, async (phone) => {
          // Clean up before each iteration
          await User.deleteMany({});
          
          // Create first user with phone
          const user1 = new User({ phone, role: 'passenger' });
          await user1.save();
          
          // Attempt to create second user with same phone should fail
          try {
            await validateUniqueIdentifier(phone, null);
            return false; // Should have thrown
          } catch (error) {
            return error.code === 'PHONE_ALREADY_REGISTERED';
          }
        }),
        { numRuns: 100 }
      );
    });


    it('should reject duplicate email addresses across different users', async () => {
      await fc.assert(
        fc.asyncProperty(emailArbitrary, async (email) => {
          // Clean up before each iteration
          await User.deleteMany({});
          
          // Create first user with email
          const user1 = new User({ email, role: 'passenger' });
          await user1.save();
          
          // Attempt to create second user with same email should fail
          try {
            await validateUniqueIdentifier(null, email);
            return false; // Should have thrown
          } catch (error) {
            return error.code === 'EMAIL_ALREADY_REGISTERED';
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should allow same user to update with their own phone/email', async () => {
      await fc.assert(
        fc.asyncProperty(
          phoneArbitrary,
          emailArbitrary,
          async (phone, email) => {
            // Clean up before each iteration
            await User.deleteMany({});
            
            // Create user with phone and email
            const user = new User({ phone, email, role: 'passenger' });
            await user.save();
            
            // Validating with excludeUserId should pass
            const result = await validateUniqueIdentifier(phone, email, user._id);
            return result === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow different users with different phone/email combinations', async () => {
      await fc.assert(
        fc.asyncProperty(
          phoneArbitrary,
          phoneArbitrary,
          emailArbitrary,
          emailArbitrary,
          async (phone1, phone2, email1, email2) => {
            // Skip if generated values are the same
            if (phone1 === phone2 || email1 === email2) {
              return true;
            }
            
            // Clean up before each iteration
            await User.deleteMany({});
            
            // Create first user
            const user1 = new User({ phone: phone1, email: email1, role: 'passenger' });
            await user1.save();
            
            // Validate second user with different phone/email should pass
            const result = await validateUniqueIdentifier(phone2, email2);
            return result === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
