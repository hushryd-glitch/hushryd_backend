/**
 * Super Admin Routes
 * API endpoints for super admin dashboard, user management, and analytics
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validate } = require('../middleware/validate');
const { authenticate, isSuperAdmin } = require('../middleware/auth');
const { auditMiddlewares } = require('../middleware/auditLog');
const adminService = require('../services/adminService');

// Apply authentication and super admin check to all routes
router.use(authenticate);
router.use(isSuperAdmin);

/**
 * Validation schemas
 */
const getUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  role: Joi.string().valid('passenger', 'driver', 'admin', 'operations', 'super_admin'),
  status: Joi.string().valid('active', 'inactive'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  search: Joi.string().max(100).trim()
});

const updateUserSchema = Joi.object({
  name: Joi.string().max(100).trim(),
  email: Joi.string().email(),
  isActive: Joi.boolean(),
  role: Joi.string().valid('passenger', 'driver', 'admin', 'operations', 'super_admin'),
  kycStatus: Joi.string().valid('pending', 'verified', 'rejected')
});

const getTransactionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  type: Joi.string().valid('collection', 'capture', 'payout', 'refund', 'platform_fee'),
  status: Joi.string().valid('pending', 'authorized', 'captured', 'completed', 'failed', 'refunded'),
  paymentMethod: Joi.string().valid('upi', 'card', 'netbanking', 'wallet'),
  driverId: Joi.string().hex().length(24),
  passengerId: Joi.string().hex().length(24),
  sortBy: Joi.string().valid('createdAt', 'amount', 'type', 'status').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  minAmount: Joi.number().min(0),
  maxAmount: Joi.number().min(0)
});

const exportTransactionsSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  type: Joi.string().valid('collection', 'capture', 'payout', 'refund', 'platform_fee'),
  status: Joi.string().valid('pending', 'authorized', 'captured', 'completed', 'failed', 'refunded'),
  format: Joi.string().valid('csv', 'pdf').default('csv')
});

const getTicketsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed'),
  category: Joi.string().valid('booking', 'payment', 'driver', 'safety', 'account', 'technical', 'other'),
  assignedTo: Joi.string().hex().length(24)
});


const updateTicketSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  assignedTo: Joi.string().hex().length(24).allow(null)
});

const getAnalyticsSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  period: Joi.string().valid('daily', 'weekly', 'monthly').default('daily')
});

const getAuditLogsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  userId: Joi.string().hex().length(24),
  action: Joi.string(),
  targetType: Joi.string().valid('user', 'driver', 'trip', 'booking', 'transaction', 'document', 'sos', 'ticket', 'system'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate'))
});

/**
 * GET /api/super-admin/dashboard
 * Get dashboard metrics
 * Requirements: 1.2
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const metrics = await adminService.getDashboardMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/super-admin/users
 * List users with filters
 * Requirements: 1.3
 */
router.get('/users', validate(getUsersSchema, 'query'), auditMiddlewares.userView, async (req, res, next) => {
  try {
    const result = await adminService.getUsers(req.query);
    res.json({ success: true, data: result.users, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/super-admin/users/:id
 * Get user details
 * Requirements: 1.3
 */
router.get('/users/:id', auditMiddlewares.userView, async (req, res, next) => {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.json({ success: true, data: user });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    next(error);
  }
});

/**
 * PUT /api/super-admin/users/:id
 * Update user
 * Requirements: 1.3
 */
router.put('/users/:id', validate(updateUserSchema), auditMiddlewares.userUpdate, async (req, res, next) => {
  try {
    const user = await adminService.updateUser(req.params.id, req.body);
    res.json({ success: true, data: user, message: 'User updated successfully' });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    next(error);
  }
});

/**
 * GET /api/super-admin/transactions
 * List transactions with filters
 * Requirements: 9.1, 9.2, 9.3
 */
router.get('/transactions', validate(getTransactionsSchema, 'query'), auditMiddlewares.transactionView, async (req, res, next) => {
  try {
    const result = await adminService.getTransactionsWithRideDetails(req.query);
    res.json({ success: true, data: result.transactions, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/super-admin/transactions/export
 * Export transactions as CSV or PDF
 * Requirements: 9.5
 */
router.get('/transactions/export', validate(exportTransactionsSchema, 'query'), auditMiddlewares.transactionView, async (req, res, next) => {
  try {
    const result = await adminService.exportTransactions(req.query);
    
    if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions-report.pdf');
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    }
    
    res.send(result.data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/super-admin/transactions/:id
 * Get transaction details with ride information
 * Requirements: 9.4
 */
router.get('/transactions/:id', auditMiddlewares.transactionView, async (req, res, next) => {
  try {
    const transaction = await adminService.getTransactionById(req.params.id);
    res.json({ success: true, data: transaction });
  } catch (error) {
    if (error.code === 'TRANSACTION_NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: error.code, message: error.message } });
    }
    next(error);
  }
});

/**
 * GET /api/super-admin/tickets
 * List support tickets
 * Requirements: 1.5
 */
router.get('/tickets', validate(getTicketsSchema, 'query'), async (req, res, next) => {
  try {
    const result = await adminService.getSupportTickets(req.query);
    res.json({ success: true, data: result.tickets, stats: result.stats, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/super-admin/tickets/:id
 * Update ticket
 * Requirements: 1.5
 */
router.put('/tickets/:id', validate(updateTicketSchema), auditMiddlewares.ticketUpdate, async (req, res, next) => {
  try {
    const SupportTicket = require('../models/SupportTicket');
    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('userId', 'name phone email').populate('assignedTo', 'name email');

    if (!ticket) {
      return res.status(404).json({ success: false, error: { code: 'TICKET_NOT_FOUND', message: 'Ticket not found' } });
    }

    res.json({ success: true, data: ticket, message: 'Ticket updated successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/super-admin/analytics
 * Get analytics data
 * Requirements: 1.6
 */
router.get('/analytics', validate(getAnalyticsSchema, 'query'), auditMiddlewares.analyticsView, async (req, res, next) => {
  try {
    const analytics = await adminService.getAnalytics(req.query);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/super-admin/audit-logs
 * Get audit trail
 * Requirements: 1.7
 */
router.get('/audit-logs', validate(getAuditLogsSchema, 'query'), async (req, res, next) => {
  try {
    const result = await adminService.getAuditLogs(req.query);
    res.json({ success: true, data: result.logs, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
