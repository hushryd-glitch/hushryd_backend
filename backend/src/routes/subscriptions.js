/**
 * Subscription Routes
 * API endpoints for subscription plan management
 * 
 * Requirements: 2.1, 3.1, 3.4, 11.1, 11.2
 */

const express = require('express');
const Joi = require('joi');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  getPlans,
  getUserSubscription,
  getRemainingBenefits,
  createSubscriptionOrder,
  getSubscriptionAnalytics,
  getUserSubscriptionDetails,
  extendUserSubscription,
  cancelUserSubscription,
  upgradeUserSubscription,
  exportSubscriptionData
} = require('../services/subscriptionService');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const purchaseSchema = Joi.object({
  planId: Joi.string().valid('silver', 'gold').required().messages({
    'any.only': 'Plan must be either silver or gold',
    'any.required': 'Plan ID is required'
  }),
  returnUrl: Joi.string().uri().optional(),
  source: Joi.string().valid('web', 'mobile').default('web')
});

const analyticsSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional()
});

const extendSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).required().messages({
    'number.min': 'Extension must be at least 1 day',
    'number.max': 'Extension cannot exceed 365 days',
    'any.required': 'Extension days is required'
  })
});

const cancelSchema = Joi.object({
  reason: Joi.string().max(500).optional().default('Admin cancellation')
});

const upgradeSchema = Joi.object({
  planId: Joi.string().valid('silver', 'gold').required().messages({
    'any.only': 'Plan must be either silver or gold',
    'any.required': 'Plan ID is required'
  })
});

const exportSchema = Joi.object({
  format: Joi.string().valid('csv', 'pdf').default('csv'),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  includeWallet: Joi.boolean().default(false)
});

/**
 * GET /api/subscriptions/plans
 * Get all available subscription plans
 * 
 * Requirements: 2.1 - Display three plans: Normal, Silver, Gold
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = getPlans();
    
    res.status(200).json({
      success: true,
      data: {
        plans
      }
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription plans',
      code: 'PLANS_FETCH_FAILED'
    });
  }
});

/**
 * GET /api/subscriptions/current
 * Get user's current subscription and remaining benefits
 * 
 * Requirements: 3.4 - Display subscription status, expiry date, and remaining benefits
 */
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const subscription = await getUserSubscription(userId);
    const benefits = await getRemainingBenefits(userId);
    
    res.status(200).json({
      success: true,
      data: {
        subscription: {
          planId: subscription.planId,
          planName: subscription.plan?.name || 'Normal',
          status: subscription.status,
          isDefault: subscription.isDefault || false,
          activatedAt: subscription.activatedAt,
          expiresAt: subscription.expiresAt
        },
        benefits,
        features: subscription.plan?.features || {}
      }
    });
  } catch (error) {
    console.error('Get current subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription details',
      code: 'SUBSCRIPTION_FETCH_FAILED'
    });
  }
});

/**
 * POST /api/subscriptions/purchase
 * Initiate subscription purchase with Cashfree
 * 
 * Requirements: 3.1 - Initiate payment flow for selected plan
 * Requirements: 11.1 - Create Cashfree order with subscription amount
 */
router.post('/purchase', authenticateToken, validate(purchaseSchema), async (req, res) => {
  try {
    const { planId, returnUrl, source } = req.body;
    const userId = req.user._id;
    
    const orderResult = await createSubscriptionOrder(userId, planId);
    
    res.status(200).json({
      success: true,
      message: 'Subscription order created successfully',
      data: {
        orderId: orderResult.orderId,
        paymentSessionId: orderResult.paymentSessionId,
        orderAmount: orderResult.orderAmount,
        orderCurrency: orderResult.orderCurrency,
        plan: {
          id: orderResult.planId,
          name: orderResult.planName,
          price: orderResult.planPrice
        }
      }
    });
  } catch (error) {
    console.error('Subscription purchase error:', error);
    
    // Handle specific error codes
    if (error.code === 'INVALID_PLAN') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_PLAN'
      });
    }
    
    if (error.code === 'FREE_PLAN') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'FREE_PLAN'
      });
    }
    
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'USER_NOT_FOUND'
      });
    }
    
    if (error.code === 'SUBSCRIPTION_EXISTS') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'SUBSCRIPTION_EXISTS',
        currentPlan: error.currentPlan,
        expiresAt: error.expiresAt
      });
    }
    
    // Handle Cashfree service errors
    if (error.message?.includes('Cashfree is not configured')) {
      return res.status(503).json({
        success: false,
        error: 'Payment service is not configured',
        code: 'PAYMENT_NOT_CONFIGURED'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to initiate subscription purchase',
      code: 'PURCHASE_FAILED'
    });
  }
});

/**
 * GET /api/subscriptions/analytics
 * Get subscription analytics for admin dashboard
 * 
 * Requirements: 9.1 - Display total subscribers by plan, revenue metrics, churn rate
 */
router.get('/analytics', authenticateToken, requireRole(['admin', 'super_admin']), validate(analyticsSchema, 'query'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const analytics = await getSubscriptionAnalytics({
      startDate,
      endDate
    });
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Subscription analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription analytics',
      code: 'ANALYTICS_FETCH_FAILED'
    });
  }
});

/**
 * GET /api/subscriptions/admin/user/:userId
 * Get user subscription details for admin management
 * 
 * Requirements: 9.2 - View user subscription history and wallet transactions
 */
router.get('/admin/user/:userId', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userDetails = await getUserSubscriptionDetails(userId);
    
    res.status(200).json({
      success: true,
      data: userDetails
    });
  } catch (error) {
    console.error('Get user subscription details error:', error);
    
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'USER_NOT_FOUND'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user subscription details',
      code: 'FETCH_FAILED'
    });
  }
});

/**
 * POST /api/subscriptions/admin/user/:userId/extend
 * Extend user subscription (admin only)
 * 
 * Requirements: 9.3 - Options to extend subscriptions
 */
router.post('/admin/user/:userId/extend', authenticateToken, requireRole(['admin', 'super_admin']), validate(extendSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { days } = req.body;
    const adminId = req.user._id;
    
    const result = await extendUserSubscription(userId, days, adminId);
    
    res.status(200).json({
      success: true,
      message: `Subscription extended by ${days} days`,
      data: result
    });
  } catch (error) {
    console.error('Extend subscription error:', error);
    
    if (error.code === 'NO_ACTIVE_SUBSCRIPTION') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'NO_ACTIVE_SUBSCRIPTION'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to extend subscription',
      code: 'EXTEND_FAILED'
    });
  }
});

/**
 * POST /api/subscriptions/admin/user/:userId/cancel
 * Cancel user subscription (admin only)
 * 
 * Requirements: 9.3 - Options to cancel subscriptions
 */
router.post('/admin/user/:userId/cancel', authenticateToken, requireRole(['admin', 'super_admin']), validate(cancelSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;
    
    const result = await cancelUserSubscription(userId, adminId, reason);
    
    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: result
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    
    if (error.code === 'NO_ACTIVE_SUBSCRIPTION') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'NO_ACTIVE_SUBSCRIPTION'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
      code: 'CANCEL_FAILED'
    });
  }
});

/**
 * POST /api/subscriptions/admin/user/:userId/upgrade
 * Upgrade user subscription (admin only)
 * 
 * Requirements: 9.3 - Options to upgrade subscriptions
 */
router.post('/admin/user/:userId/upgrade', authenticateToken, requireRole(['admin', 'super_admin']), validate(upgradeSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId } = req.body;
    const adminId = req.user._id;
    
    const result = await upgradeUserSubscription(userId, planId, adminId);
    
    res.status(200).json({
      success: true,
      message: `Subscription upgraded to ${planId}`,
      data: result
    });
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    
    if (error.code === 'INVALID_PLAN') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_PLAN'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to upgrade subscription',
      code: 'UPGRADE_FAILED'
    });
  }
});

/**
 * GET /api/subscriptions/admin/export
 * Export subscription data (CSV or PDF)
 * 
 * Requirements: 9.4 - Export subscriber list with details and revenue breakdown
 */
router.get('/admin/export', authenticateToken, requireRole(['admin', 'super_admin']), validate(exportSchema, 'query'), async (req, res) => {
  try {
    const { format, startDate, endDate, includeWallet } = req.query;
    
    const exportData = await exportSubscriptionData({
      format,
      startDate,
      endDate,
      includeWallet: includeWallet === 'true'
    });
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'csv') {
      // Return CSV data as JSON for frontend to handle
      res.status(200).json({
        success: true,
        data: {
          subscriptions: exportData.subscriptions,
          revenue: exportData.revenue,
          wallet: exportData.wallet,
          filename: `hushryd-subscriptions-${timestamp}.csv`
        }
      });
    } else {
      // Return PDF as buffer
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="hushryd-subscriptions-${timestamp}.pdf"`);
      res.send(exportData.subscriptions);
    }
  } catch (error) {
    console.error('Export subscription data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export subscription data',
      code: 'EXPORT_FAILED'
    });
  }
});

module.exports = router;
