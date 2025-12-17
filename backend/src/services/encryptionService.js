/**
 * Encryption Service for Data at Rest
 * Design Decision: Field-level encryption for sensitive data in MongoDB
 * Rationale: Protects personal information and payment details even if database is compromised
 * 
 * Requirements: 10.3
 */

const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Get encryption key from environment
 * @returns {Buffer} 32-byte encryption key
 */
const getEncryptionKey = () => {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set for encryption');
  }
  return crypto.scryptSync(secret, 'hushryd-data-encryption', KEY_LENGTH);
};

/**
 * Encrypt a string value
 * @param {string} plaintext - Value to encrypt
 * @returns {string} Encrypted value with prefix
 */
const encryptField = (plaintext) => {
  if (!plaintext || typeof plaintext !== 'string') {
    return plaintext;
  }
  
  // Don't double-encrypt
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Format: enc:iv:authTag:ciphertext (all base64)
    return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
};


/**
 * Decrypt an encrypted string value
 * @param {string} encryptedData - Encrypted value with prefix
 * @returns {string} Decrypted plaintext
 */
const decryptField = (encryptedData) => {
  if (!encryptedData || typeof encryptedData !== 'string') {
    return encryptedData;
  }
  
  // Check if data is encrypted
  if (!encryptedData.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedData;
  }
  
  try {
    const data = encryptedData.slice(ENCRYPTED_PREFIX.length);
    const parts = data.split(':');
    
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
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Check if a value is encrypted
 * @param {string} value - Value to check
 * @returns {boolean} True if encrypted
 */
const isEncrypted = (value) => {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
};

/**
 * Mongoose plugin for field-level encryption
 * Automatically encrypts specified fields on save and decrypts on find
 * 
 * @param {mongoose.Schema} schema - Mongoose schema
 * @param {Object} options - Plugin options
 * @param {Array<string>} options.fields - Fields to encrypt
 */
const encryptionPlugin = (schema, options = {}) => {
  const { fields = [] } = options;
  
  if (fields.length === 0) {
    return;
  }
  
  // Encrypt fields before saving - using async pattern for Mongoose 5+
  schema.pre('save', async function() {
    // Skip encryption if document is not modified
    if (!this.isModified()) {
      return;
    }
    
    try {
      for (const field of fields) {
        // Only process if this specific field was modified
        if (!this.isModified(field)) {
          continue;
        }
        
        // Get value directly from the document
        const value = this.get(field);
        
        // Only encrypt if value exists, is a string, and is not already encrypted
        if (value && typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
          // Use Mongoose's set method to avoid triggering additional hooks
          this.set(field, encryptField(value), { strict: false });
        }
      }
    } catch (error) {
      // If encryption fails (e.g., no key), skip encryption silently in dev
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Encryption skipped:', error.message);
      } else {
        throw error;
      }
    }
  });
  
  // Decrypt fields after finding
  schema.post('find', function(docs) {
    if (!docs) return;
    const docsArray = Array.isArray(docs) ? docs : [docs];
    for (const doc of docsArray) {
      decryptDocumentFields(doc, fields);
    }
  });
  
  schema.post('findOne', function(doc) {
    if (!doc) return;
    decryptDocumentFields(doc, fields);
  });
  
  schema.post('findById', function(doc) {
    if (!doc) return;
    decryptDocumentFields(doc, fields);
  });
  
  // Add method to get decrypted value
  schema.methods.getDecryptedField = function(field) {
    const value = getNestedValue(this, field);
    return decryptField(value);
  };
  
  // Add method to set encrypted value
  schema.methods.setEncryptedField = function(field, value) {
    setNestedValue(this, field, encryptField(value));
  };
};


/**
 * Decrypt fields in a document
 * @param {Object} doc - Mongoose document
 * @param {Array<string>} fields - Fields to decrypt
 */
const decryptDocumentFields = (doc, fields) => {
  for (const field of fields) {
    const value = getNestedValue(doc, field);
    if (value && isEncrypted(value)) {
      setNestedValue(doc, field, decryptField(value));
    }
  }
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot-notation path
 * @returns {*} Value at path
 */
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

/**
 * Set nested value in object using dot notation
 * @param {Object} obj - Object to set value in
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 */
const setNestedValue = (obj, path, value) => {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (current[key] === undefined) {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
};

/**
 * Encrypt sensitive user data object
 * @param {Object} userData - User data to encrypt
 * @returns {Object} User data with encrypted fields
 */
const encryptUserData = (userData) => {
  const sensitiveFields = ['healthInfo'];
  const encrypted = { ...userData };
  
  for (const field of sensitiveFields) {
    if (encrypted[field]) {
      encrypted[field] = encryptField(encrypted[field]);
    }
  }
  
  return encrypted;
};

/**
 * Decrypt sensitive user data object
 * @param {Object} userData - User data to decrypt
 * @returns {Object} User data with decrypted fields
 */
const decryptUserData = (userData) => {
  const sensitiveFields = ['healthInfo'];
  const decrypted = { ...userData };
  
  for (const field of sensitiveFields) {
    if (decrypted[field] && isEncrypted(decrypted[field])) {
      decrypted[field] = decryptField(decrypted[field]);
    }
  }
  
  return decrypted;
};

/**
 * Encrypt bank details
 * @param {Object} bankDetails - Bank details to encrypt
 * @returns {Object} Encrypted bank details
 */
const encryptBankDetails = (bankDetails) => {
  if (!bankDetails) return bankDetails;
  
  return {
    ...bankDetails,
    accountNumber: encryptField(bankDetails.accountNumber)
  };
};

/**
 * Decrypt bank details
 * @param {Object} bankDetails - Bank details to decrypt
 * @returns {Object} Decrypted bank details
 */
const decryptBankDetails = (bankDetails) => {
  if (!bankDetails) return bankDetails;
  
  return {
    ...bankDetails,
    accountNumber: decryptField(bankDetails.accountNumber)
  };
};

module.exports = {
  encryptField,
  decryptField,
  isEncrypted,
  encryptionPlugin,
  encryptUserData,
  decryptUserData,
  encryptBankDetails,
  decryptBankDetails,
  getNestedValue,
  setNestedValue,
  ENCRYPTED_PREFIX
};
