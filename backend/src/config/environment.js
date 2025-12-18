/**
 * Environment Configuration Module
 * Design Decision: All API keys and sensitive configuration loaded from environment variables at startup
 * Rationale: Follows 12-factor app principles, enables secure key management and rotation without code changes
 */

// Core production requirements (auth must work)
const productionRequiredEnvVars = [
  // SMS Provider (Twilio) - Required for OTP
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER'
];

// Optional services - app will work without these (features disabled)
const optionalServiceEnvVars = [
  // Email Provider (SendGrid)
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  
  // WhatsApp Business API
  'WHATSAPP_API_KEY',
  'WHATSAPP_PHONE_NUMBER_ID',
  
  // Payment Gateway (Razorpay)
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  
  // Payment Gateway (Cashfree)
  'CASHFREE_APP_ID',
  'CASHFREE_SECRET_KEY',
  'CASHFREE_WEBHOOK_SECRET',
  
  // AWS S3 Storage
  'AWS_S3_BUCKET',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY'
];

// Always required
const requiredEnvVars = [
  // Database
  'MONGODB_URI',
  
  // JWT
  'JWT_SECRET'
];

// Optional environment variables with defaults
const optionalEnvVars = {
  PORT: '5000',
  NODE_ENV: 'development',
  JWT_EXPIRY: '7d',
  CORS_ORIGIN: 'http://localhost:3000',
  OTP_EXPIRY_MINUTES: '5',
  OTP_MAX_ATTEMPTS: '3',
  AWS_S3_PRESIGNED_URL_EXPIRY: '3600', // 1 hour default
  
  // Redis configuration
  REDIS_URL: 'redis://localhost:6379',
  REDIS_CACHE_TTL_USER_PROFILE: '300', // 5 minutes
  REDIS_CACHE_TTL_TRIP_SEARCH: '30',   // 30 seconds
  REDIS_CACHE_TTL_DRIVER_LOCATION: '300', // 5 minutes
  
  // Cashfree configuration
  CASHFREE_ENVIRONMENT: 'sandbox',
  CASHFREE_API_VERSION: '2023-08-01'
};

/**
 * Validate environment variables at startup with fail-fast behavior
 * @returns {Object} Configuration object with all environment values
 * @throws {Error} If required environment variables are missing
 */
const validateEnvironment = () => {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Check production-required vars only in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const missingProd = productionRequiredEnvVars.filter(key => !process.env[key]);
    if (missingProd.length > 0) {
      throw new Error(`Missing required environment variables for production: ${missingProd.join(', ')}`);
    }
    
    // Warn about optional services that are not configured
    const missingOptional = optionalServiceEnvVars.filter(key => !process.env[key]);
    if (missingOptional.length > 0) {
      console.warn(`⚠ Optional services not configured (features will be disabled): ${missingOptional.join(', ')}`);
    }
  } else {
    // In development, warn about missing external service keys but don't fail
    const missingExternal = [...productionRequiredEnvVars, ...optionalServiceEnvVars].filter(key => 
      !process.env[key] || process.env[key].startsWith('your-')
    );
    if (missingExternal.length > 0) {
      console.warn(`⚠ Development mode: External services will use mock mode for: ${missingExternal.join(', ')}`);
    }
  }
  
  // Apply defaults for optional variables
  Object.entries(optionalEnvVars).forEach(([key, defaultValue]) => {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
    }
  });
  
  return {
    // Server config
    port: parseInt(process.env.PORT, 10),
    nodeEnv: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN,
    
    // Twilio SMS
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    
    // SendGrid Email
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL
    },
    
    // WhatsApp Business API
    whatsapp: {
      apiKey: process.env.WHATSAPP_API_KEY,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
    },
    
    // Razorpay Payment Gateway
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET
    },
    
    // MongoDB
    mongodb: {
      uri: process.env.MONGODB_URI
    },
    
    // JWT Authentication
    jwt: {
      secret: process.env.JWT_SECRET,
      expiry: process.env.JWT_EXPIRY
    },
    
    // OTP Settings
    otp: {
      expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10),
      maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10)
    },
    
    // AWS S3 Storage
    s3: {
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      presignedUrlExpiry: parseInt(process.env.AWS_S3_PRESIGNED_URL_EXPIRY, 10)
    },
    
    // Redis configuration
    redis: {
      url: process.env.REDIS_URL,
      cacheTtl: {
        userProfile: parseInt(process.env.REDIS_CACHE_TTL_USER_PROFILE, 10),
        tripSearch: parseInt(process.env.REDIS_CACHE_TTL_TRIP_SEARCH, 10),
        driverLocation: parseInt(process.env.REDIS_CACHE_TTL_DRIVER_LOCATION, 10)
      }
    },
    
    // Cashfree Payment Gateway
    cashfree: {
      appId: process.env.CASHFREE_APP_ID,
      secretKey: process.env.CASHFREE_SECRET_KEY,
      apiVersion: process.env.CASHFREE_API_VERSION,
      environment: process.env.CASHFREE_ENVIRONMENT,
      webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET
    }
  };
};

/**
 * Get a specific config value
 * @param {string} key - Dot-notation key (e.g., 'twilio.accountSid')
 * @returns {*} Configuration value
 */
const getConfig = (key) => {
  const config = validateEnvironment();
  return key.split('.').reduce((obj, k) => obj?.[k], config);
};

module.exports = { 
  validateEnvironment, 
  getConfig,
  requiredEnvVars,
  optionalEnvVars
};
