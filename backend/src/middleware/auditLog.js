/**
 * Audit Logging Middleware
 * Intercepts admin actions and creates audit trail entries
 * 
 * Requirements: 1.7
 */

const AuditLog = require('../models/AuditLog');
const { createLogger } = require('../services/loggerService');

const logger = createLogger('audit');

/**
 * Extract client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
};

/**
 * Create audit log middleware for specific action
 * @param {string} action - Action type to log
 * @param {string} targetType - Target entity type
 * @param {Function} getTargetId - Function to extract target ID from request
 * @param {Function} getDetails - Function to extract additional details
 * @returns {Function} Express middleware
 */
const auditAction = (action, targetType, getTargetId = null, getDetails = null) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json to capture response and log after success
    res.json = async function(data) {
      // Only log on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const targetId = getTargetId ? getTargetId(req, data) : req.params.id;
          const details = getDetails ? getDetails(req, data) : {};
          
          await AuditLog.logAction({
            userId: req.user?._id,
            action,
            targetType,
            targetId,
            details: {
              ...details,
              method: req.method,
              path: req.path,
              statusCode: res.statusCode
            },
            ipAddress: getClientIP(req),
            userAgent: req.headers['user-agent']
          });
        } catch (error) {
          // Log error but don't fail the request
          logger.error('Failed to create audit log', { error: error.message, action });
        }
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * Middleware to log admin login
 */
const auditLogin = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = async function(data) {
    if (res.statusCode >= 200 && res.statusCode < 300 && data.user) {
      try {
        await AuditLog.logAction({
          userId: data.user._id || data.user.id,
          action: 'login',
          targetType: 'system',
          details: {
            role: data.user.role,
            method: 'otp'
          },
          ipAddress: getClientIP(req),
          userAgent: req.headers['user-agent']
        });
      } catch (error) {
        logger.error('Failed to log login audit', { error: error.message });
      }
    }
    return originalJson(data);
  };
  
  next();
};

/**
 * Pre-configured audit middlewares for common admin actions
 */
const auditMiddlewares = {
  // User management
  userView: auditAction('user_view', 'user'),
  userUpdate: auditAction('user_update', 'user', 
    (req) => req.params.id,
    (req) => ({ updates: Object.keys(req.body) })
  ),
  userSuspend: auditAction('user_suspend', 'user'),
  userActivate: auditAction('user_activate', 'user'),
  
  // Transaction management
  transactionView: auditAction('transaction_view', 'transaction'),
  transactionRefund: auditAction('transaction_refund', 'transaction',
    (req) => req.params.id,
    (req) => ({ amount: req.body.amount, reason: req.body.reason })
  ),
  
  // Document verification
  documentView: auditAction('document_view', 'document'),
  documentApprove: auditAction('document_approve', 'document'),
  documentReject: auditAction('document_reject', 'document',
    (req) => req.params.id,
    (req) => ({ reason: req.body.reason })
  ),
  
  // Trip management
  tripView: auditAction('trip_view', 'trip'),
  tripCancel: auditAction('trip_cancel', 'trip',
    (req) => req.params.id,
    (req) => ({ reason: req.body.reason })
  ),
  
  // SOS management
  sosView: auditAction('sos_view', 'sos'),
  sosAcknowledge: auditAction('sos_acknowledge', 'sos'),
  sosResolve: auditAction('sos_resolve', 'sos',
    (req) => req.params.id,
    (req) => ({ resolution: req.body.resolution })
  ),
  
  // Ticket management
  ticketUpdate: auditAction('ticket_update', 'ticket'),
  ticketAssign: auditAction('ticket_assign', 'ticket',
    (req) => req.params.id,
    (req) => ({ assignedTo: req.body.assignedTo })
  ),
  
  // Analytics and reports
  analyticsView: auditAction('analytics_view', 'system',
    () => null,
    (req) => ({ dateRange: req.query })
  ),
  reportExport: auditAction('report_export', 'system',
    () => null,
    (req) => ({ format: req.query.format, reportType: req.query.reportType })
  )
};

module.exports = {
  auditAction,
  auditLogin,
  auditMiddlewares,
  getClientIP
};
