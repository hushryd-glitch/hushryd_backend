/**
 * Notification API Routes
 * Design Decision: RESTful endpoints for notification management
 * Rationale: Provides unified interface for sending and tracking notifications
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validate, schemas } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { TwilioService } = require('../services/twilioService');
const { SendGridService } = require('../services/sendgridService');
const { WhatsAppService } = require('../services/whatsappService');
const { retryNotification, getRetryStats } = require('../services/notificationRetryService');

// Initialize channel services and register them
const initializeChannels = () => {
  const twilioService = new TwilioService();
  const sendgridService = new SendGridService();
  const whatsappService = new WhatsAppService();
  
  notificationService.registerChannel('sms', twilioService);
  notificationService.registerChannel('email', sendgridService);
  notificationService.registerChannel('whatsapp', whatsappService);
  
  return { twilioService, sendgridService, whatsappService };
};

// Initialize channels on module load
const channelServices = initializeChannels();

// Validation schemas
const sendNotificationSchema = Joi.object({
  userId: schemas.objectId.required(),
  channels: Joi.array()
    .items(Joi.string().valid('sms', 'email', 'whatsapp'))
    .min(1)
    .required(),
  template: Joi.string().required(),
  data: Joi.object().default({}),
  recipients: Joi.object({
    sms: Joi.string(),
    email: Joi.string().email(),
    whatsapp: Joi.string()
  }).required(),
  attachments: Joi.array().items(
    Joi.object({
      type: Joi.string().valid('pdf', 'image'),
      name: Joi.string().required(),
      content: Joi.string(), // Base64 encoded
      url: Joi.string().uri()
    })
  ).default([]),
  relatedEntity: Joi.object({
    type: Joi.string().valid('trip', 'booking', 'sos', 'document'),
    id: schemas.objectId
  }),
  metadata: Joi.object().default({})
});

const getNotificationsSchema = Joi.object({
  status: Joi.string().valid('pending', 'sent', 'delivered', 'failed'),
  channel: Joi.string().valid('sms', 'email', 'whatsapp'),
  ...schemas.pagination
});

/**
 * POST /api/notifications/send
 * Send notification through specified channels
 */
router.post('/send', authenticate, validate(sendNotificationSchema), async (req, res, next) => {
  try {
    const {
      userId,
      channels,
      template,
      data,
      recipients,
      attachments,
      relatedEntity,
      metadata
    } = req.body;
    
    // Send to multiple channels
    const results = await notificationService.sendMultiChannel({
      userId,
      channels,
      template,
      recipients,
      data,
      attachments,
      relatedEntity,
      metadata
    });
    
    // Determine overall success
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.status(successCount > 0 ? 200 : 500).json({
      success: successCount > 0,
      message: `Sent ${successCount}/${results.length} notifications`,
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failCount
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 */
router.get('/', authenticate, validate(getNotificationsSchema, 'query'), async (req, res, next) => {
  try {
    const { status, channel, page, limit } = req.query;
    const skip = (page - 1) * limit;
    
    const notifications = await notificationService.getUserNotifications(
      req.user._id,
      { status, channel, limit, skip }
    );
    
    res.json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        count: notifications.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/:id
 * Get notification status by ID
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const notification = await notificationService.getNotificationStatus(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    // Verify ownership
    if (notification.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/:id/retry
 * Manually retry a failed notification (admin only)
 */
router.post('/:id/retry', authenticate, async (req, res, next) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin' && req.user.role !== 'operations') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const notification = await notificationService.getNotificationStatus(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    // Get the appropriate channel handler
    const channelHandler = notificationService.getChannel(notification.channel);
    if (!channelHandler) {
      return res.status(400).json({
        success: false,
        error: `Channel '${notification.channel}' not available`
      });
    }
    
    const result = await retryNotification(req.params.id, channelHandler);
    
    res.json({
      success: result.success,
      message: result.success ? 'Notification sent successfully' : 'Retry failed',
      attempts: result.attempts,
      error: result.error
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/stats
 * Get notification statistics (admin only)
 */
router.get('/admin/stats', authenticate, async (req, res, next) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin' && req.user.role !== 'operations') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const stats = await getRetryStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/templates
 * Get available notification templates
 */
router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const templateNames = Object.keys(notificationService.templates);
    
    res.json({
      success: true,
      data: templateNames.map(name => ({
        name,
        hasSubject: !!notificationService.templates[name].subject
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/notifications/test-email
 * Test email functionality (development only)
 */
router.post('/test-email', async (req, res, next) => {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Test endpoint not available in production'
      });
    }
    
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }
    
    // Test email content
    const testContent = {
      subject: 'HushRyd Email Test',
      body: `Hello from HushRyd!

This is a test email to verify that the SendGrid integration is working correctly.

Test Details:
- Timestamp: ${new Date().toISOString()}
- Environment: ${process.env.NODE_ENV || 'development'}
- Server: HushRyd Backend API

If you received this email, the SendGrid service is configured and working properly.

Best regards,
HushRyd Team`
    };
    
    // Get SendGrid service and send test email
    const sendgridService = channelServices.sendgridService;
    const result = await sendgridService.send(email, testContent);
    
    res.json({
      success: true,
      message: 'Test email sent successfully',
      recipient: email,
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
