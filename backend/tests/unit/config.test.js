/**
 * Unit tests for configuration modules
 */
const { validateEnvironment, requiredEnvVars } = require('../../src/config/environment');

describe('Environment Configuration', () => {
  // Store original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env after each test
    process.env = { ...originalEnv };
  });

  describe('validateEnvironment', () => {
    it('should return config object when all required vars are set', () => {
      const config = validateEnvironment();
      
      expect(config).toHaveProperty('twilio');
      expect(config).toHaveProperty('sendgrid');
      expect(config).toHaveProperty('whatsapp');
      expect(config).toHaveProperty('razorpay');
      expect(config).toHaveProperty('mongodb');
      expect(config).toHaveProperty('jwt');
    });

    it('should throw error when required env var is missing', () => {
      // Remove a required env var
      delete process.env.MONGODB_URI;
      
      expect(() => validateEnvironment()).toThrow('Missing required environment variables');
    });

    it('should apply default values for optional vars', () => {
      delete process.env.PORT;
      delete process.env.JWT_EXPIRY;
      
      const config = validateEnvironment();
      
      expect(config.port).toBe(5000);
      expect(config.jwt.expiry).toBe('7d');
    });
  });
});
