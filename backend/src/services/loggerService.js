/**
 * Secure Logger Service
 * Design Decision: Centralized logging with automatic sensitive data redaction
 * Rationale: Ensures authentication errors and other logs don't expose API keys or secrets
 * 
 * Requirements: 9.4
 */

const { maskSensitiveValue, isSensitiveField, API_KEY_PATTERNS } = require('./securityService');

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

/**
 * Patterns to detect and redact sensitive values in log messages
 */
const SENSITIVE_PATTERNS = [
  // API keys (various formats)
  /([a-zA-Z_]+(?:key|token|secret|password|auth)[a-zA-Z_]*)\s*[=:]\s*['"]?([^'"\s,}]+)['"]?/gi,
  // Bearer tokens
  /Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/gi,
  // Basic auth
  /Basic\s+([A-Za-z0-9+/=]+)/gi,
  // JWT tokens
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
  // Credit card numbers (basic pattern)
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  // Account numbers (10+ digits)
  /\b\d{10,18}\b/g
];

/**
 * Redact sensitive values from a string
 * @param {string} message - Message to redact
 * @returns {string} Redacted message
 */
const redactSensitiveData = (message) => {
  if (typeof message !== 'string') {
    return message;
  }
  
  let redacted = message;
  
  // Redact patterns
  SENSITIVE_PATTERNS.forEach(pattern => {
    redacted = redacted.replace(pattern, (match, group1, group2) => {
      if (group2) {
        // Key-value pattern: keep key, mask value
        return `${group1}=[REDACTED]`;
      }
      // Other patterns: fully redact
      return '[REDACTED]';
    });
  });
  
  return redacted;
};


/**
 * Redact sensitive fields from an object
 * @param {Object} obj - Object to redact
 * @returns {Object} Redacted object
 */
const redactObject = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }
  
  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactObject(value);
    } else if (typeof value === 'string') {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
};

/**
 * Format log entry with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Formatted log entry
 */
const formatLogEntry = (level, message, metadata = {}) => {
  return {
    timestamp: new Date().toISOString(),
    level,
    message: redactSensitiveData(message),
    ...redactObject(metadata)
  };
};

/**
 * SecureLogger class
 * Provides logging methods that automatically redact sensitive data
 */
class SecureLogger {
  constructor(context = 'app') {
    this.context = context;
  }
  
  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Object} metadata - Additional metadata
   */
  error(message, metadata = {}) {
    const entry = formatLogEntry(LOG_LEVELS.ERROR, message, {
      context: this.context,
      ...metadata
    });
    console.error(JSON.stringify(entry));
  }
  
  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    const entry = formatLogEntry(LOG_LEVELS.WARN, message, {
      context: this.context,
      ...metadata
    });
    console.warn(JSON.stringify(entry));
  }
  
  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    const entry = formatLogEntry(LOG_LEVELS.INFO, message, {
      context: this.context,
      ...metadata
    });
    console.log(JSON.stringify(entry));
  }
  
  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    if (process.env.NODE_ENV === 'development') {
      const entry = formatLogEntry(LOG_LEVELS.DEBUG, message, {
        context: this.context,
        ...metadata
      });
      console.log(JSON.stringify(entry));
    }
  }
  
  /**
   * Log an authentication error securely
   * @param {string} errorType - Type of auth error (e.g., 'INVALID_TOKEN', 'EXPIRED_TOKEN')
   * @param {Object} details - Error details (will be redacted)
   */
  authError(errorType, details = {}) {
    this.error(`Authentication error: ${errorType}`, {
      errorType,
      errorCode: this.getAuthErrorCode(errorType),
      ...details
    });
  }
  
  /**
   * Get error code for auth error type
   * @param {string} errorType - Error type
   * @returns {string} Error code
   */
  getAuthErrorCode(errorType) {
    const errorCodes = {
      'INVALID_TOKEN': 'AUTH_001',
      'EXPIRED_TOKEN': 'AUTH_002',
      'INVALID_OTP': 'AUTH_003',
      'MAX_ATTEMPTS': 'AUTH_004',
      'SESSION_EXPIRED': 'AUTH_005',
      'INVALID_CREDENTIALS': 'AUTH_006',
      'API_KEY_INVALID': 'AUTH_007',
      'API_KEY_EXPIRED': 'AUTH_008'
    };
    return errorCodes[errorType] || 'AUTH_000';
  }
  
  /**
   * Log an API call error securely
   * @param {string} service - Service name (e.g., 'twilio', 'sendgrid')
   * @param {string} operation - Operation attempted
   * @param {Error} error - Error object
   */
  apiError(service, operation, error) {
    this.error(`API call failed: ${service}.${operation}`, {
      service,
      operation,
      errorMessage: redactSensitiveData(error.message),
      errorCode: error.code || 'UNKNOWN'
    });
  }
  
  /**
   * Log a database error securely
   * @param {string} operation - Database operation
   * @param {Error} error - Error object
   */
  dbError(operation, error) {
    this.error(`Database error: ${operation}`, {
      operation,
      errorMessage: redactSensitiveData(error.message),
      errorCode: error.code || 'DB_000'
    });
  }
}


/**
 * Create a logger instance for a specific context
 * @param {string} context - Logger context (e.g., 'auth', 'notification')
 * @returns {SecureLogger} Logger instance
 */
const createLogger = (context) => {
  return new SecureLogger(context);
};

/**
 * Default logger instance
 */
const defaultLogger = new SecureLogger('app');

module.exports = {
  SecureLogger,
  createLogger,
  defaultLogger,
  redactSensitiveData,
  redactObject,
  formatLogEntry,
  LOG_LEVELS
};
