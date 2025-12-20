/**
 * Cashfree Payment Gateway Configuration
 * Supports sandbox/production toggle via environment variables
 * Requirements: 12.1, 12.3
 * 
 * NOTE: When CASHFREE_ENABLED=false, the payment service operates in stub mode
 */

const CASHFREE_ENVIRONMENTS = {
  sandbox: {
    baseUrl: 'https://sandbox.cashfree.com/pg',
    name: 'sandbox'
  },
  production: {
    baseUrl: 'https://api.cashfree.com/pg',
    name: 'production'
  }
};

// Check if Cashfree is explicitly enabled
const CASHFREE_ENABLED = process.env.CASHFREE_ENABLED !== 'false';

/**
 * Get Cashfree configuration from environment
 * @returns {Object} Cashfree configuration object
 */
const getCashfreeConfig = () => {
  const environment = process.env.CASHFREE_ENVIRONMENT || 'sandbox';
  const envConfig = CASHFREE_ENVIRONMENTS[environment];
  
  if (!envConfig) {
    throw new Error(`Invalid CASHFREE_ENVIRONMENT: ${environment}. Must be 'sandbox' or 'production'`);
  }
  
  return {
    appId: process.env.CASHFREE_APP_ID,
    secretKey: process.env.CASHFREE_SECRET_KEY,
    apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
    environment: envConfig.name,
    baseUrl: envConfig.baseUrl,
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET,
    enabled: CASHFREE_ENABLED,
    
    // Platform fee configuration
    platformFee: 10, // Fixed ₹10 platform fee
    
    // Free cancellation configuration
    freeCancellation: {
      baseFee: 10, // Starting at ₹10
      windowHours: 2 // 2 hours before departure
    },
    
    // Cancellation policy tiers (percentage refund)
    cancellationTiers: [
      { hoursBeforeDeparture: 24, refundPercentage: 90 },
      { hoursBeforeDeparture: 12, refundPercentage: 75 },
      { hoursBeforeDeparture: 2, refundPercentage: 50 },
      { hoursBeforeDeparture: 0, refundPercentage: 25 }
    ]
  };
};

/**
 * Validate Cashfree configuration
 * @returns {boolean} True if configuration is valid
 * @throws {Error} If required configuration is missing
 */
const validateCashfreeConfig = () => {
  // Skip validation if Cashfree is disabled
  if (!CASHFREE_ENABLED) {
    console.log('[Cashfree] Running in STUB mode - payment operations will be simulated');
    return true;
  }
  
  const config = getCashfreeConfig();
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    if (!config.appId || config.appId.startsWith('your-')) {
      throw new Error('CASHFREE_APP_ID is required in production');
    }
    if (!config.secretKey || config.secretKey.startsWith('your-')) {
      throw new Error('CASHFREE_SECRET_KEY is required in production');
    }
    if (!config.webhookSecret || config.webhookSecret.startsWith('your-')) {
      throw new Error('CASHFREE_WEBHOOK_SECRET is required in production');
    }
    if (config.environment !== 'production') {
      console.warn('⚠ Warning: Running in production mode but CASHFREE_ENVIRONMENT is not set to production');
    }
  }
  
  return true;
};

/**
 * Check if Cashfree is configured (has valid credentials)
 * @returns {boolean} True if Cashfree credentials are configured
 */
const isCashfreeConfigured = () => {
  // If explicitly disabled, return false
  if (!CASHFREE_ENABLED) {
    return false;
  }
  
  const config = getCashfreeConfig();
  return config.appId && 
         !config.appId.startsWith('your-') && 
         config.secretKey && 
         !config.secretKey.startsWith('your-');
};

/**
 * Check if Cashfree is in stub mode
 * @returns {boolean} True if running in stub mode
 */
const isStubMode = () => {
  return !CASHFREE_ENABLED || !isCashfreeConfigured();
};

module.exports = {
  getCashfreeConfig,
  validateCashfreeConfig,
  isCashfreeConfigured,
  isStubMode,
  CASHFREE_ENVIRONMENTS,
  CASHFREE_ENABLED
};
