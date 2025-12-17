const Joi = require('joi');

/**
 * Middleware factory for request validation using Joi
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request property with validated value
    req[property] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // Phone number validation (Indian format with optional country code)
  phone: Joi.string()
    .pattern(/^(\+91)?[6-9]\d{9}$/)
    .messages({
      'string.pattern.base': 'Phone number must be a valid 10-digit Indian mobile number (with optional +91 prefix)'
    }),

  // Email validation
  email: Joi.string()
    .email()
    .lowercase()
    .trim(),

  // OTP validation
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .messages({
      'string.pattern.base': 'OTP must be a 6-digit number'
    }),

  // MongoDB ObjectId validation
  objectId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid ID format'
    }),

  // Pagination
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }
};

module.exports = { validate, schemas };
