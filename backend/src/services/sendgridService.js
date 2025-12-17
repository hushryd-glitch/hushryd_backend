/**
 * SendGrid Email Service
 * Design Decision: Dedicated service for email notifications via SendGrid
 * Rationale: Encapsulates SendGrid API integration with attachment support
 * 
 * Requirements: 3.1
 * Requirements: 8.2 - Circuit breaker protection for external service calls
 */

const https = require('https');
const { getCircuitBreaker, CircuitBreakers } = require('./circuitBreakerService');

/**
 * SendGridService class for sending email messages
 */
class SendGridService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.SENDGRID_API_KEY;
    this.fromEmail = config.fromEmail || process.env.SENDGRID_FROM_EMAIL;
    this.fromName = config.fromName || 'HushRyd';
    
    if (!this.apiKey || !this.fromEmail) {
      console.warn('SendGridService: Missing configuration. Email sending will fail.');
    }
  }
  
  /**
   * Send email via SendGrid API
   * Protected by circuit breaker for resilience
   * @param {string} recipient - Email address to send to
   * @param {Object} content - Message content with subject and body
   * @param {Array} attachments - Array of attachment objects
   * @returns {Promise<Object>} Send result with messageId
   */
  async send(recipient, content, attachments = []) {
    const circuitBreaker = getCircuitBreaker(CircuitBreakers.EMAIL, {
      failureThreshold: 50,
      resetTimeout: 30000
    });

    return circuitBreaker.execute(async () => {
      return this._sendInternal(recipient, content, attachments);
    });
  }

  /**
   * Internal send method (actual SendGrid API call)
   * @private
   */
  async _sendInternal(recipient, content, attachments = []) {
    if (!this.apiKey) {
      throw new Error('SendGrid API key not configured');
    }
    
    if (!this.isValidEmail(recipient)) {
      throw new Error('Invalid recipient email address');
    }
    
    const subject = content.subject || 'HushRyd Notification';
    const body = content.body;
    
    if (!body) {
      throw new Error('Email body is required');
    }
    
    // Build SendGrid API payload
    const payload = {
      personalizations: [{
        to: [{ email: recipient }],
        subject: subject
      }],
      from: {
        email: this.fromEmail,
        name: this.fromName
      },
      content: [
        {
          type: 'text/plain',
          value: body
        },
        {
          type: 'text/html',
          value: this.convertToHtml(body)
        }
      ]
    };
    
    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        content: att.content, // Base64 encoded content
        filename: att.name || att.filename,
        type: att.type || this.getMimeType(att.name || att.filename),
        disposition: 'attachment'
      }));
    }
    
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: 'api.sendgrid.com',
      port: 443,
      path: '/v3/mail/send',
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
          // SendGrid returns 202 for successful send
          if (res.statusCode === 202 || res.statusCode === 200) {
            // Get message ID from headers
            const messageId = res.headers['x-message-id'] || `sg-${Date.now()}`;
            resolve({
              success: true,
              messageId: messageId,
              status: 'accepted',
              to: recipient
            });
          } else {
            try {
              const response = data ? JSON.parse(data) : {};
              const errorMessage = response.errors 
                ? response.errors.map(e => e.message).join(', ')
                : `SendGrid API error: ${res.statusCode}`;
              reject(new Error(errorMessage));
            } catch (parseError) {
              reject(new Error(`SendGrid API error: ${res.statusCode}`));
            }
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`SendGrid request failed: ${error.message}`));
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  /**
   * Convert plain text to simple HTML
   * @param {string} text - Plain text content
   * @returns {string} HTML content
   */
  convertToHtml(text) {
    // Escape HTML entities
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Convert line breaks to <br> and wrap in basic HTML
    const htmlBody = escaped.replace(/\n/g, '<br>');
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    ${htmlBody}
  </div>
</body>
</html>`;
  }
  
  /**
   * Get MIME type from filename
   * @param {string} filename - File name
   * @returns {string} MIME type
   */
  getMimeType(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'csv': 'text/csv',
      'txt': 'text/plain',
      'html': 'text/html'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
  
  /**
   * Validate email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} True if valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Singleton instance
let instance = null;

/**
 * Get SendGridService instance
 * @param {Object} config - Optional configuration
 * @returns {SendGridService} Service instance
 */
const getInstance = (config) => {
  if (!instance) {
    instance = new SendGridService(config);
  }
  return instance;
};

/**
 * Create new SendGridService instance (for testing)
 * @param {Object} config - Configuration
 * @returns {SendGridService} New service instance
 */
const createInstance = (config) => {
  return new SendGridService(config);
};

module.exports = {
  SendGridService,
  getInstance,
  createInstance
};
