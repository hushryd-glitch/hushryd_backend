/**
 * Security Service
 * Design Decision: Centralized security utilities for API key management and data protection
 * Rationale: Ensures consistent security practices across the application
 * 
 * Requirements: 9.2, 9.4, 10.3
 */

const crypto = require('crypto');

// Encryption algorithm and key derivation
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * List of sensitive field names that should never be exposed in responses
 */
const SENSITIVE_FIELDS = [
  'password',
  'apiKey',
  'authToken',
  'secretKey',
  'accessToken',
  'refreshToken',
  'accountSid',
  'keySecret',
  'privateKey',
  'encryptionKey'
];

/**
 * List of environment variable patterns that contain API keys
 */
const API_KEY_PATTERNS = [
  /API_KEY/i,
  /AUTH_TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE_KEY/i,
  /ACCOUNT_SID/i
];

/**
 * Get encryption key from environment or derive from secret
 * @returns {Buffer} 32-byte encryption key
 */
const getEncryptionKey = () => {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set for encryption');
  }
  // Derive a consistent 32-byte key from the secret
  return crypto.scryptSync(secret, 'hushryd-salt', KEY_LENGTH);
};


/**
 * Encrypt sensitive data
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data as base64 string (iv:authTag:ciphertext)
 */
const encrypt = (plaintext) => {
  if (!plaintext) return plaintext;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
};

/**
 * Decrypt sensitive data
 * @param {string} encryptedData - Encrypted data (iv:authTag:ciphertext format)
 * @returns {string} Decrypted plaintext
 */
const decrypt = (encryptedData) => {
  if (!encryptedData) return encryptedData;
  
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

/**
 * Check if a string looks like an encrypted value
 * @param {string} value - Value to check
 * @returns {boolean} True if value appears to be encrypted
 */
const isEncrypted = (value) => {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  
  // Check if parts look like base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every(part => base64Regex.test(part));
};

/**
 * Mask sensitive value for logging (show only last 4 chars)
 * @param {string} value - Value to mask
 * @returns {string} Masked value
 */
const maskSensitiveValue = (value) => {
  if (!value || typeof value !== 'string') return '***';
  if (value.length <= 4) return '***';
  return `***${value.slice(-4)}`;
};


/**
 * Check if a field name is sensitive
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if field is sensitive
 */
const isSensitiveField = (fieldName) => {
  const lowerField = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some(sensitive => 
    lowerField.includes(sensitive.toLowerCase())
  );
};

/**
 * Check if an environment variable contains an API key
 * @param {string} envVarName - Environment variable name
 * @returns {boolean} True if it's an API key variable
 */
const isApiKeyEnvVar = (envVarName) => {
  return API_KEY_PATTERNS.some(pattern => pattern.test(envVarName));
};

/**
 * Sanitize object by removing sensitive fields
 * Used to ensure API keys are not exposed in responses
 * @param {Object} obj - Object to sanitize
 * @param {Array<string>} additionalFields - Additional fields to remove
 * @returns {Object} Sanitized object
 */
const sanitizeResponse = (obj, additionalFields = []) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const fieldsToRemove = [...SENSITIVE_FIELDS, ...additionalFields];
  
  const sanitize = (item) => {
    if (Array.isArray(item)) {
      return item.map(sanitize);
    }
    
    if (item && typeof item === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(item)) {
        // Skip sensitive fields
        if (fieldsToRemove.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
          continue;
        }
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return item;
  };
  
  return sanitize(obj);
};

/**
 * Verify that API keys are loaded from environment only
 * @returns {Object} Verification result
 */
const verifyApiKeysSecurity = () => {
  const issues = [];
  
  // Check that required API keys are set
  const requiredKeys = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'SENDGRID_API_KEY',
    'WHATSAPP_API_KEY',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'JWT_SECRET'
  ];
  
  for (const key of requiredKeys) {
    if (!process.env[key]) {
      issues.push(`Missing required API key: ${key}`);
    }
  }
  
  return {
    secure: issues.length === 0,
    issues
  };
};

/**
 * Create a safe config object that doesn't expose actual key values
 * @param {Object} config - Configuration object
 * @returns {Object} Safe config with masked values
 */
const createSafeConfig = (config) => {
  const safeConfig = {};
  
  const processValue = (key, value) => {
    if (typeof value === 'object' && value !== null) {
      const nested = {};
      for (const [k, v] of Object.entries(value)) {
        nested[k] = processValue(k, v);
      }
      return nested;
    }
    
    // Mask API keys and secrets
    if (isApiKeyEnvVar(key) || isSensitiveField(key)) {
      return maskSensitiveValue(value);
    }
    
    return value;
  };
  
  for (const [key, value] of Object.entries(config)) {
    safeConfig[key] = processValue(key, value);
  }
  
  return safeConfig;
};


/**
 * Middleware to sanitize response data
 * Ensures no sensitive data is leaked in API responses
 */
const sanitizeResponseMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = (data) => {
    const sanitized = sanitizeResponse(data);
    return originalJson(sanitized);
  };
  
  next();
};

/**
 * Hash a value using SHA-256 (for non-reversible storage)
 * @param {string} value - Value to hash
 * @returns {string} Hashed value
 */
const hashValue = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * Generate a secure random token
 * @param {number} length - Token length in bytes
 * @returns {string} Random token as hex string
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

module.exports = {
  // Encryption
  encrypt,
  decrypt,
  isEncrypted,
  
  // Masking and sanitization
  maskSensitiveValue,
  sanitizeResponse,
  sanitizeResponseMiddleware,
  
  // Validation
  isSensitiveField,
  isApiKeyEnvVar,
  verifyApiKeysSecurity,
  
  // Utilities
  createSafeConfig,
  hashValue,
  generateSecureToken,
  
  // Constants
  SENSITIVE_FIELDS,
  API_KEY_PATTERNS
};
