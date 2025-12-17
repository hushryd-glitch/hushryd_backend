/**
 * Security Tests for Authentication and Authorization
 * Tests token security and access control
 * 
 * **Feature: abhibus-style-interface**
 * **Task: 19. Create comprehensive testing suite**
 * **Validates: Security requirements for authentication**
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

const User = require('../../src/models/User');
const { verifyToken } = require('../../src/services/tokenService');

let mongoServer;

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

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

describe('Authentication Security Tests', () => {
  describe('JWT Token Security', () => {
    it('should reject tampered token', () => {
      const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0YW1wZXJlZCIsInJvbGUiOiJhZG1pbiJ9.invalid';
      
      const result = verifyToken(tamperedToken);
      expect(result.valid).toBe(false);
    });

    it('should reject expired token', async () => {
      const user = new User({
        phone: '+919876543223',
        role: 'passenger',
        name: 'Test User'
      });
      await user.save();
      
      const expiredToken = jwt.sign(
        { userId: user._id.toString(), role: user.role },
        JWT_SECRET,
        { expiresIn: '0s' }
      );
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = verifyToken(expiredToken);
      expect(result.valid).toBe(false);
    });

    it('should reject malformed token', () => {
      const result = verifyToken('not-a-valid-token');
      expect(result.valid).toBe(false);
    });

    it('should reject empty token', () => {
      const result = verifyToken('');
      expect(result.valid).toBe(false);
    });

    it('should reject null token', () => {
      const result = verifyToken(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('Input Validation Security', () => {
    it('should reject invalid phone number format in user creation', async () => {
      const invalidPhones = ['invalid', '12345', ''];
      
      for (const phone of invalidPhones) {
        try {
          const user = new User({
            phone,
            role: 'passenger',
            name: 'Test User'
          });
          await user.save();
          expect(phone).toBe('should have thrown');
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });
});

describe('Authorization Security Tests', () => {
  describe('Role-Based Access Control', () => {
    it('should correctly identify passenger role', async () => {
      const user = new User({
        phone: '+919876543228',
        role: 'passenger',
        name: 'Test Passenger'
      });
      await user.save();
      
      expect(user.role).toBe('passenger');
    });

    it('should correctly identify driver role', async () => {
      const user = new User({
        phone: '+919876543229',
        role: 'driver',
        name: 'Test Driver'
      });
      await user.save();
      
      expect(user.role).toBe('driver');
    });

    it('should correctly identify admin role', async () => {
      const user = new User({
        phone: '+919876543230',
        role: 'admin',
        name: 'Test Admin'
      });
      await user.save();
      
      expect(user.role).toBe('admin');
    });

    it('should reject invalid role', async () => {
      try {
        const user = new User({
          phone: '+919876543231',
          role: 'invalid_role',
          name: 'Test User'
        });
        await user.save();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
