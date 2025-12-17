/**
 * WhatsApp Business API Service
 * Design Decision: Dedicated service for WhatsApp notifications via Meta Business API
 * Rationale: Encapsulates WhatsApp API integration with PDF attachment support
 * 
 * Requirements: 3.3
 * Requirements: 8.2 - Circuit breaker protection for external service calls
 */

const https = require('https');
const { getCircuitBreaker, CircuitBreakers } = require('./circuitBreakerService');

/**
 * WhatsAppService class for sending WhatsApp messages
 */
class WhatsAppService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.WHATSAPP_API_KEY;
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiVersion = config.apiVersion || 'v18.0';
    
    if (!this.apiKey || !this.phoneNumberId) {
      console.warn('WhatsAppService: Missing configuration. WhatsApp sending will fail.');
    }
  }
  
  /**
   * Send WhatsApp message via Meta Business API
   * Protected by circuit breaker for resilience
   * @param {string} recipient - Phone number to send to
   * @param {Object} content - Message content with body
   * @param {Array} attachments - Array of attachment objects (PDF support)
   * @returns {Promise<Object>} Send result with messageId
   */
  async send(recipient, content, attachments = []) {
    const circuitBreaker = getCircuitBreaker(CircuitBreakers.WHATSAPP, {
      failureThreshold: 50,
      resetTimeout: 30000
    });

    return circuitBreaker.execute(async () => {
      return this._sendInternal(recipient, content, attachments);
    });
  }

  /**
   * Internal send method (actual WhatsApp API call)
   * @private
   */
  async _sendInternal(recipient, content, attachments = []) {
    if (!this.apiKey || !this.phoneNumberId) {
      throw new Error('WhatsApp API credentials not configured');
    }
    
    const formattedRecipient = this.formatPhoneNumber(recipient);
    const messageBody = content.body;
    
    if (!messageBody) {
      throw new Error('Message body is required');
    }
    
    // If there are PDF attachments, send document message
    if (attachments && attachments.length > 0) {
      const pdfAttachment = attachments.find(att => 
        att.type === 'pdf' || 
        (att.name && att.name.toLowerCase().endsWith('.pdf'))
      );
      
      if (pdfAttachment) {
        return this.sendDocumentMessage(formattedRecipient, messageBody, pdfAttachment);
      }
    }
    
    // Send text message
    return this.sendTextMessage(formattedRecipient, messageBody);
  }
  
  /**
   * Send text message
   * @param {string} recipient - Formatted phone number
   * @param {string} body - Message body
   * @returns {Promise<Object>} Send result
   */
  async sendTextMessage(recipient, body) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: body
      }
    };
    
    return this.makeApiRequest(payload);
  }
  
  /**
   * Send document message with PDF attachment
   * @param {string} recipient - Formatted phone number
   * @param {string} caption - Message caption
   * @param {Object} document - Document attachment
   * @returns {Promise<Object>} Send result
   */
  async sendDocumentMessage(recipient, caption, document) {
    // If document has a URL, use link
    if (document.url) {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'document',
        document: {
          link: document.url,
          caption: caption,
          filename: document.name || 'document.pdf'
        }
      };
      return this.makeApiRequest(payload);
    }
    
    // If document has base64 content, upload first then send
    if (document.content) {
      const mediaId = await this.uploadMedia(document.content, document.name || 'document.pdf');
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'document',
        document: {
          id: mediaId,
          caption: caption,
          filename: document.name || 'document.pdf'
        }
      };
      return this.makeApiRequest(payload);
    }
    
    // Fallback to text message if no valid document
    return this.sendTextMessage(recipient, caption);
  }
  
  /**
   * Upload media to WhatsApp
   * @param {string} base64Content - Base64 encoded content
   * @param {string} filename - File name
   * @returns {Promise<string>} Media ID
   */
  async uploadMedia(base64Content, filename) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const buffer = Buffer.from(base64Content, 'base64');
    
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      'Content-Type: application/pdf',
      '',
      buffer.toString('binary'),
      `--${boundary}`,
      'Content-Disposition: form-data; name="messaging_product"',
      '',
      'whatsapp',
      `--${boundary}`,
      'Content-Disposition: form-data; name="type"',
      '',
      'application/pdf',
      `--${boundary}--`
    ].join('\r\n');
    
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/${this.apiVersion}/${this.phoneNumberId}/media`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${this.apiKey}`
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
            if (response.id) {
              resolve(response.id);
            } else {
              reject(new Error(response.error?.message || 'Failed to upload media'));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse upload response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Media upload failed: ${error.message}`));
      });
      
      req.write(body, 'binary');
      req.end();
    });
  }
  
  /**
   * Make API request to WhatsApp Business API
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} API response
   */
  async makeApiRequest(payload) {
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/${this.apiVersion}/${this.phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${this.apiKey}`
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
            
            if (res.statusCode >= 200 && res.statusCode < 300 && response.messages) {
              resolve({
                success: true,
                messageId: response.messages[0]?.id,
                status: response.messages[0]?.message_status || 'sent',
                to: payload.to
              });
            } else {
              const errorMessage = response.error?.message || `WhatsApp API error: ${res.statusCode}`;
              reject(new Error(errorMessage));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse WhatsApp response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`WhatsApp request failed: ${error.message}`));
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  /**
   * Format phone number for WhatsApp (remove + and spaces)
   * @param {string} phone - Phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Indian numbers: add 91 prefix if 10 digits
    if (digits.length === 10) {
      return `91${digits}`;
    }
    
    return digits;
  }
  
  /**
   * Validate phone number for WhatsApp
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone);
    // WhatsApp requires country code + number (10-15 digits total)
    return /^[1-9]\d{9,14}$/.test(formatted);
  }
}

// Singleton instance
let instance = null;

/**
 * Get WhatsAppService instance
 * @param {Object} config - Optional configuration
 * @returns {WhatsAppService} Service instance
 */
const getInstance = (config) => {
  if (!instance) {
    instance = new WhatsAppService(config);
  }
  return instance;
};

/**
 * Create new WhatsAppService instance (for testing)
 * @param {Object} config - Configuration
 * @returns {WhatsAppService} New service instance
 */
const createInstance = (config) => {
  return new WhatsAppService(config);
};

module.exports = {
  WhatsAppService,
  getInstance,
  createInstance
};
