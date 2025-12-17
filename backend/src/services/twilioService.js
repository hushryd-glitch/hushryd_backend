/**
 * Twilio SMS Service
 * Design Decision: Dedicated service for SMS notifications via Twilio
 * Rationale: Encapsulates Twilio API integration with error handling
 * 
 * Requirements: 3.2
 * Requirements: 8.2 - Circuit breaker protection for external service calls
 */

const https = require('https');
const { getCircuitBreaker, CircuitBreakers } = require('./circuitBreakerService');

/**
 * TwilioService class for sending SMS messages
 */
class TwilioService {
  constructor(config = {}) {
    this.accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
    this.authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = config.phoneNumber || process.env.TWILIO_PHONE_NUMBER;
    
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      console.warn('TwilioService: Missing configuration. SMS sending will fail.');
    }
  }
  
  /**
   * Send SMS message via Twilio API
   * Protected by circuit breaker for resilience
   * @param {string} recipient - Phone number to send to (E.164 format)
   * @param {Object} content - Message content with body
   * @param {Array} attachments - Not used for SMS
   * @returns {Promise<Object>} Send result with messageId
   */
  async send(recipient, content, attachments = []) {
    const circuitBreaker = getCircuitBreaker(CircuitBreakers.SMS, {
      failureThreshold: 50,
      resetTimeout: 30000
    });

    return circuitBreaker.execute(async () => {
      return this._sendInternal(recipient, content, attachments);
    });
  }

  /**
   * Internal send method (actual Twilio API call)
   * @private
   */
  async _sendInternal(recipient, content, attachments = []) {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio credentials not configured');
    }
    
    const formattedRecipient = this.formatPhoneNumber(recipient);
    const messageBody = content.body;
    
    if (!messageBody) {
      throw new Error('Message body is required');
    }
    
    // Twilio API request
    const postData = new URLSearchParams({
      To: formattedRecipient,
      From: this.fromNumber,
      Body: messageBody
    }).toString();
    
    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                messageId: response.sid,
                status: response.status,
                to: response.to
              });
            } else {
              reject(new Error(response.message || `Twilio API error: ${res.statusCode}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse Twilio response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Twilio request failed: ${error.message}`));
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  /**
   * Format phone number to E.164 format
   * @param {string} phone - Phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // If already has country code (starts with +), return as is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Indian numbers: add +91 prefix
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    
    // If 12 digits starting with 91, add +
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    
    // Default: add + prefix
    return `+${digits}`;
  }
  
  /**
   * Validate phone number format
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);
    // E.164 format: + followed by 10-15 digits
    return /^\+[1-9]\d{9,14}$/.test(formatted);
  }

  /**
   * Make a voice call via Twilio API
   * Protected by circuit breaker for resilience
   * Requirements: 8.6 - Attempt call after 5 minutes of no response
   * 
   * @param {string} recipient - Phone number to call (E.164 format)
   * @param {string} message - TwiML message to speak
   * @returns {Promise<Object>} Call result with callSid and answered status
   */
  async makeCall(recipient, message) {
    const circuitBreaker = getCircuitBreaker(CircuitBreakers.SMS, {
      failureThreshold: 50,
      resetTimeout: 30000
    });

    return circuitBreaker.execute(async () => {
      return this._makeCallInternal(recipient, message);
    });
  }

  /**
   * Internal makeCall method (actual Twilio API call)
   * @private
   */
  async _makeCallInternal(recipient, message) {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio credentials not configured');
    }
    
    const formattedRecipient = this.formatPhoneNumber(recipient);
    
    // Create TwiML for the call
    const twiml = `<Response><Say voice="alice">${message}</Say><Gather numDigits="1" action="/api/safety-response" method="POST"><Say>Press 1 if you are safe. Press 2 if you need help.</Say></Gather></Response>`;
    
    const postData = new URLSearchParams({
      To: formattedRecipient,
      From: this.fromNumber,
      Twiml: twiml,
      Timeout: 30 // Ring for 30 seconds
    }).toString();
    
    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              // Note: We can't know if call was answered synchronously
              // In production, you'd use webhooks to track call status
              resolve({
                success: true,
                callSid: response.sid,
                status: response.status,
                to: response.to,
                // Assume not answered for safety - webhook would update this
                answered: false
              });
            } else {
              reject(new Error(response.message || `Twilio API error: ${res.statusCode}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse Twilio response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Twilio call request failed: ${error.message}`));
      });
      
      req.write(postData);
      req.end();
    });
  }
}

// Singleton instance
let instance = null;

/**
 * Get TwilioService instance
 * @param {Object} config - Optional configuration
 * @returns {TwilioService} Service instance
 */
const getInstance = (config) => {
  if (!instance) {
    instance = new TwilioService(config);
  }
  return instance;
};

/**
 * Create new TwilioService instance (for testing)
 * @param {Object} config - Configuration
 * @returns {TwilioService} New service instance
 */
const createInstance = (config) => {
  return new TwilioService(config);
};

module.exports = {
  TwilioService,
  getInstance,
  createInstance
};
