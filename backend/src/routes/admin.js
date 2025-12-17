const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole, requirePermission } = require('../middleware/auth');
const ridesService = require('../services/ridesService');
const tripInterventionService = require('../services/tripInterventionService');
const { PaymentStateMachine } = require('../services/paymentService');
const reportService = require('../services/reportService');
const documentService = require('../services/documentService');
const tripTrackingService = require('../services/tripTrackingService');
const staffService = require('../services/staffService');
const adminTrackingService = require('../services/adminTrackingService');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');

// ============================================
// Stats Endpoints for Dashboards
// ============================================

/**
 * GET /api/admin/stats/operations
 * Get statistics for operations dashboard
 */
router.get('/stats/operations', authenticate, async (req, res, next) => {
  try {
    // Count pending documents
    const docStats = await Driver.aggregate([
      { $unwind: { path: '$documents', preserveNullAndEmptyArrays: true } },
      { $match: { 'documents.status': 'pending' } },
      { $count: 'pending' }
    ]);
    const pendingDocuments = docStats[0]?.pending || 0;

    // Count drivers
    const totalDrivers = await Driver.countDocuments();
    const verifiedDrivers = await Driver.countDocuments({ verificationStatus: 'verified' });

    // Count passengers
    const totalPassengers = await User.countDocuments({ role: 'passenger', isStaff: { $ne: true } });

    res.json({
      success: true,
      data: {
        pendingDocuments,
        totalDrivers,
        verifiedDrivers,
        totalPassengers
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/stats/support
 * Get statistics for support dashboard
 */
router.get('/stats/support', authenticate, async (req, res, next) => {
  try {
    // Count tickets by status
    const openTickets = await SupportTicket.countDocuments({ status: 'open' });
    const inProgressTickets = await SupportTicket.countDocuments({ status: 'in_progress' });
    
    // Count resolved today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = await SupportTicket.countDocuments({
      status: 'resolved',
      resolvedAt: { $gte: today }
    });

    res.json({
      success: true,
      data: {
        openTickets,
        inProgressTickets,
        resolvedToday,
        avgResponseTime: '2h' // Placeholder - would calculate from actual data
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/drivers/list
 * Get all drivers with their document status for operations dashboard
 */
router.get('/drivers/list', authenticate, requirePermission('drivers:read'), async (req, res, next) => {
  try {
    const drivers = await Driver.find()
      .populate('userId', 'name phone email')
      .lean();

    const driversWithStats = drivers.map(driver => {
      const pendingDocs = driver.documents?.filter(d => d.status === 'pending').length || 0;
      const approvedDocs = driver.documents?.filter(d => d.status === 'approved').length || 0;
      const rejectedDocs = driver.documents?.filter(d => d.status === 'rejected').length || 0;
      
      return {
        _id: driver._id?.toString ? driver._id.toString() : driver._id,
        driverName: driver.userId?.name || 'Unknown',
        driverPhone: driver.userId?.phone || null,
        driverEmail: driver.userId?.email || null,
        verificationStatus: driver.verificationStatus,
        licenseNumber: driver.licenseNumber,
        totalDocuments: driver.documents?.length || 0,
        pendingDocuments: pendingDocs,
        approvedDocuments: approvedDocs,
        rejectedDocuments: rejectedDocs,
        vehicles: driver.vehicles?.length || 0
      };
    });

    res.json({
      success: true,
      data: driversWithStats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/users/search
 * Search users (drivers or passengers)
 * If query is empty, returns all users of the specified type
 */
router.get('/users/search', authenticate, async (req, res, next) => {
  try {
    const { type, query } = req.query;
    
    if (type === 'driver') {
      // Search or list drivers
      let driverQuery = {};
      if (query && query.trim().length >= 2) {
        const searchRegex = new RegExp(query, 'i');
        driverQuery = {
          $or: [
            { name: searchRegex },
            { phone: searchRegex },
            { email: searchRegex }
          ]
        };
      }
      
      const drivers = await Driver.find()
        .populate({
          path: 'userId',
          match: query && query.trim().length >= 2 ? driverQuery : {},
          select: 'name phone email'
        })
        .lean();

      // Filter out drivers where userId didn't match (only if searching)
      const results = drivers
        .filter(d => d.userId)
        .map(d => ({
          _id: d._id,
          name: d.userId.name,
          phone: d.userId.phone,
          email: d.userId.email,
          verificationStatus: d.verificationStatus,
          vehicleDetails: d.vehicles?.[0] || null
        }));

      return res.json({ success: true, data: results });
    } else {
      // Search or list passengers
      let userQuery = {
        role: 'passenger',
        isStaff: { $ne: true }
      };
      
      if (query && query.trim().length >= 2) {
        const searchRegex = new RegExp(query, 'i');
        userQuery.$or = [
          { name: searchRegex },
          { phone: searchRegex },
          { email: searchRegex }
        ];
      }
      
      const users = await User.find(userQuery)
        .select('name phone email isActive')
        .limit(50)
        .lean();

      return res.json({ success: true, data: users });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Validation schemas for admin rides endpoints
 */
const getRidesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  search: Joi.string().max(100).trim()
});

const cancelTripSchema = Joi.object({
  reason: Joi.string().required().max(500).trim(),
  initiateRefund: Joi.boolean().default(false),
  refundAmount: Joi.number().positive().when('initiateRefund', {
    is: true,
    then: Joi.number().positive(),
    otherwise: Joi.forbidden()
  })
});

const contactPartiesSchema = Joi.object({
  targetUsers: Joi.array().items(
    Joi.string().valid('driver', 'passenger', 'all')
  ).min(1).default(['all']),
  message: Joi.string().required().max(1000).trim(),
  channels: Joi.array().items(
    Joi.string().valid('sms', 'email', 'whatsapp')
  ).min(1).default(['sms'])
});

// ============================================
// Staff Management Validation Schemas
// Requirements: 1.1, 5.1, 5.2, 5.4
// ============================================

const createStaffSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required().trim().max(100),
  role: Joi.string().valid('operations', 'customer_support', 'finance', 'admin', 'super_admin').required()
});

const updateStaffSchema = Joi.object({
  email: Joi.string().email().trim().lowercase(),
  name: Joi.string().trim().max(100),
  role: Joi.string().valid('operations', 'customer_support', 'finance', 'admin', 'super_admin'),
  permissions: Joi.array().items(Joi.string())
}).min(1);

const getStaffSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  role: Joi.string().valid('operations', 'customer_support', 'finance', 'admin', 'super_admin'),
  isActive: Joi.boolean(),
  search: Joi.string().max(100).trim()
});

const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).required()
});

// ============================================
// Staff Management API Routes
// Requirements: 1.1, 5.1, 5.2, 5.4
// ============================================

/**
 * POST /api/admin/staff
 * Create a new staff account (super_admin only)
 * Requirements: 1.1
 */
router.post('/staff', authenticate, requireRole('super_admin'), validate(createStaffSchema), async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body;
    const createdById = req.user._id;
    
    const result = await staffService.createStaffAccount(
      { email, password, name, role },
      createdById
    );
    
    res.status(201).json({
      success: true,
      data: result.staff,
      message: 'Staff account created successfully'
    });
  } catch (error) {
    if (error.code === 'MISSING_REQUIRED_FIELDS') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }
    if (error.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/admin/staff
 * List staff accounts with filters
 * Requirements: 5.1
 */
router.get('/staff', authenticate, requirePermission('staff:read'), validate(getStaffSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, role, isActive, search } = req.query;
    
    const result = await staffService.getStaffAccounts({
      page,
      limit,
      role,
      isActive,
      search
    });
    
    res.json({
      success: true,
      data: result.staff,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/staff/:id
 * Get a single staff account by ID
 * Requirements: 5.1
 */
router.get('/staff/:id', authenticate, requirePermission('staff:read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await staffService.getStaffById(id);
    
    res.json({
      success: true,
      data: result.staff
    });
  } catch (error) {
    if (error.code === 'STAFF_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * PUT /api/admin/staff/:id
 * Update a staff account
 * Requirements: 5.1, 5.3
 */
router.put('/staff/:id', authenticate, requirePermission('staff:write'), validate(updateStaffSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const performedById = req.user._id;
    
    const result = await staffService.updateStaffAccount(id, req.body, performedById);
    
    res.json({
      success: true,
      data: result.staff,
      message: 'Staff account updated successfully'
    });
  } catch (error) {
    if (error.code === 'STAFF_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/admin/staff/:id
 * Deactivate a staff account (soft delete)
 * Requirements: 5.2
 */
router.delete('/staff/:id', authenticate, requirePermission('staff:delete'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const performedById = req.user._id;
    
    await staffService.deactivateStaffAccount(id, performedById);
    
    res.json({
      success: true,
      message: 'Staff account deactivated successfully'
    });
  } catch (error) {
    if (error.code === 'STAFF_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/staff/:id/reset-password
 * Reset a staff member's password
 * Requirements: 5.4
 */
router.post('/staff/:id/reset-password', authenticate, requireRole('super_admin'), validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const performedById = req.user._id;
    
    await staffService.resetStaffPassword(id, newPassword, performedById);
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    if (error.code === 'STAFF_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_PASSWORD') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/staff/:id/activate
 * Reactivate a deactivated staff account
 * Requirements: 5.2
 */
router.post('/staff/:id/activate', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const performedById = req.user._id;
    
    await staffService.activateStaffAccount(id, performedById);
    
    res.json({
      success: true,
      message: 'Staff account activated successfully'
    });
  } catch (error) {
    if (error.code === 'STAFF_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Support Ticket Validation Schemas
// Requirements: 4.1, 4.2, 4.3
// ============================================

const getTicketsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  category: Joi.string().valid('booking', 'payment', 'driver', 'safety', 'account', 'technical', 'other'),
  assignedTo: Joi.string().hex().length(24),
  search: Joi.string().max(100).trim()
});

const updateTicketStatusSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').required()
});

const addTicketMessageSchema = Joi.object({
  message: Joi.string().required().max(2000).trim()
});

const assignTicketSchema = Joi.object({
  assigneeId: Joi.string().hex().length(24).required()
});

const searchUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  role: Joi.string().valid('passenger', 'driver'),
  search: Joi.string().max(100).trim()
});

// ============================================
// Support Ticket API Routes
// Requirements: 4.1, 4.3
// ============================================

/**
 * GET /api/admin/support/tickets
 * Get paginated list of support tickets
 * Requirements: 4.1
 */
router.get('/support/tickets', authenticate, requirePermission('tickets:read'), validate(getTicketsSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status, priority, category, assignedTo, search } = req.query;
    
    const result = await staffService.getSupportTickets({
      page,
      limit,
      status,
      priority,
      category,
      assignedTo,
      search
    });
    
    res.json({
      success: true,
      data: {
        tickets: result.tickets,
        stats: result.stats
      },
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/support/tickets/:id
 * Get a single support ticket by ID
 * Requirements: 4.3
 */
router.get('/support/tickets/:id', authenticate, requirePermission('tickets:read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await staffService.getSupportTicketById(id);
    
    res.json({
      success: true,
      data: result.ticket
    });
  } catch (error) {
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * PUT /api/admin/support/tickets/:id/status
 * Update support ticket status
 * Requirements: 4.3
 */
router.put('/support/tickets/:id/status', authenticate, requirePermission('tickets:write'), validate(updateTicketStatusSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const staffId = req.user._id;
    
    const result = await staffService.updateTicketStatus(id, status, staffId);
    
    res.json({
      success: true,
      data: result.ticket,
      message: 'Ticket status updated successfully'
    });
  } catch (error) {
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/support/tickets/:id/messages
 * Add a message to a support ticket
 * Requirements: 4.3
 */
router.post('/support/tickets/:id/messages', authenticate, requirePermission('tickets:write'), validate(addTicketMessageSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const senderId = req.user._id;
    
    const result = await staffService.addTicketMessage(id, message, senderId);
    
    res.json({
      success: true,
      data: result.ticket,
      message: 'Message added successfully'
    });
  } catch (error) {
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'MESSAGE_REQUIRED') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * PUT /api/admin/support/tickets/:id/assign
 * Assign a support ticket to a staff member
 * Requirements: 4.3
 */
router.put('/support/tickets/:id/assign', authenticate, requirePermission('tickets:write'), validate(assignTicketSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assigneeId } = req.body;
    const performedById = req.user._id;
    
    const result = await staffService.assignTicket(id, assigneeId, performedById);
    
    res.json({
      success: true,
      data: result.ticket,
      message: 'Ticket assigned successfully'
    });
  } catch (error) {
    if (error.code === 'TICKET_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_ASSIGNEE') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Filtered User Lookup API Routes (Customer Support)
// Requirements: 4.2
// ============================================

/**
 * GET /api/admin/support/users
 * Search users with filtered results (excludes sensitive financial data)
 * Requirements: 4.2
 */
router.get('/support/users', authenticate, requirePermission('passengers:read'), validate(searchUsersSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, role, search } = req.query;
    
    const result = await staffService.searchUsersFiltered({
      page,
      limit,
      role,
      search
    });
    
    res.json({
      success: true,
      data: result.users,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/support/users/:identifier
 * Get filtered user details by ID, phone, or email (excludes sensitive financial data)
 * Requirements: 4.2
 */
router.get('/support/users/:identifier', authenticate, requirePermission('passengers:read'), async (req, res, next) => {
  try {
    const { identifier } = req.params;
    
    const result = await staffService.getFilteredUserLookup(identifier);
    
    res.json({
      success: true,
      data: result.user
    });
  } catch (error) {
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_IDENTIFIER') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Rides Management Endpoints
// ============================================

/**
 * GET /api/admin/rides
 * Get paginated list of rides with filters
 * Requirements: 4.1, 4.3
 */
router.get('/rides', authenticate, validate(getRidesSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status, startDate, endDate, search } = req.query;
    
    const result = await ridesService.getRides({
      page,
      limit,
      status,
      startDate,
      endDate,
      search
    });

    res.json({
      success: true,
      data: result.rides,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/rides/:id
 * Get complete trip details by ID
 * Requirements: 4.2
 */
router.get('/rides/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const trip = await ridesService.getTripById(id);
    
    res.json({
      success: true,
      data: trip
    });
  } catch (error) {
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/trips/:id/cancel
 * Cancel a trip with optional refund
 * Requirements: 4.5
 */
router.post('/trips/:id/cancel', authenticate, validate(cancelTripSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, initiateRefund, refundAmount } = req.body;
    
    // Get admin user ID from auth middleware (assuming it's set)
    const cancelledBy = req.user?._id || req.user?.id;
    
    const result = await tripInterventionService.cancelTrip(id, {
      reason,
      cancelledBy,
      initiateRefund,
      refundAmount
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'TRIP_ALREADY_CANCELLED' || error.code === 'TRIP_ALREADY_COMPLETED') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/trips/:id/contact
 * Contact parties involved in a trip
 * Requirements: 4.5
 */
router.post('/trips/:id/contact', authenticate, validate(contactPartiesSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetUsers, message, channels } = req.body;
    
    const result = await tripInterventionService.contactParties(id, {
      targetUsers,
      message,
      channels
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'MESSAGE_REQUIRED') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Real-time Trip Tracking Endpoints
// Requirements: 4.4
// ============================================

/**
 * GET /api/admin/trips/:id/tracking
 * Get current location and tracking history for a trip
 * Requirements: 4.4
 */
router.get('/trips/:id/tracking', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const trackingData = await tripTrackingService.getTrackingHistory(id, limit);
    
    res.json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRIP_NOT_FOUND',
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/admin/trips/:id/location
 * Get current location for a trip
 * Requirements: 4.4
 */
router.get('/trips/:id/location', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const locationData = await tripTrackingService.getCurrentLocation(id);
    
    res.json({
      success: true,
      data: locationData
    });
  } catch (error) {
    if (error.message === 'Trip not found') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRIP_NOT_FOUND',
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Payment Endpoints
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
// ============================================

/**
 * Validation schemas for payment endpoints
 */
const getPaymentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  status: Joi.string().valid('pending', 'completed', 'failed')
});

const refundSchema = Joi.object({
  amount: Joi.number().positive().required(),
  reason: Joi.string().required().max(500).trim(),
  passengerId: Joi.string().hex().length(24)
});

const exportReportSchema = Joi.object({
  format: Joi.string().valid('csv', 'pdf').required(),
  reportType: Joi.string().valid('transactions', 'revenue', 'payouts').default('transactions'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate'))
});

/**
 * GET /api/admin/payments
 * Get paginated list of payments with dashboard metrics
 * Requirements: 5.1
 */
router.get('/payments', authenticate, validate(getPaymentsSchema, 'query'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, status } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query for trips with payment data
    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get trips with payment info
    const trips = await Trip.find(query)
      .select('tripId payment createdAt status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Trip.countDocuments(query);

    // Calculate dashboard metrics
    const allTrips = await Trip.find(query)
      .select('payment status')
      .lean();

    let totalRevenue = 0;
    let pendingPayouts = 0;
    const transactions = [];

    for (const trip of allTrips) {
      if (trip.payment) {
        // Sum up collections
        const collections = trip.payment.transactions?.filter(t => t.type === 'collection' && t.status === 'completed') || [];
        totalRevenue += collections.reduce((sum, t) => sum + t.amount, 0);
        
        // Calculate pending payouts (vault amounts not yet released)
        if (trip.payment.vaultStatus === 'locked') {
          pendingPayouts += trip.payment.vaultAmount || 0;
        }
      }
    }

    // Format payment data for response
    const payments = trips.map(trip => ({
      tripId: trip.tripId,
      _id: trip._id,
      totalCollected: trip.payment?.totalCollected || 0,
      platformCommission: trip.payment?.platformCommission || 0,
      driverAdvance: trip.payment?.driverAdvance || 0,
      vaultAmount: trip.payment?.vaultAmount || 0,
      vaultStatus: trip.payment?.vaultStatus || 'locked',
      transactions: trip.payment?.transactions || [],
      tripStatus: trip.status,
      createdAt: trip.createdAt
    }));

    res.json({
      success: true,
      data: {
        dashboard: {
          totalRevenue,
          pendingPayouts,
          transactionCount: allTrips.reduce((sum, t) => sum + (t.payment?.transactions?.length || 0), 0)
        },
        payments
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/payments/:id
 * Get complete payment details for a specific trip
 * Requirements: 5.3
 */
router.get('/payments/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Try to find by MongoDB _id first, then by human-readable tripId
    let trip;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      trip = await Trip.findById(id)
        .select('tripId payment fare createdAt status passengers')
        .populate('passengers.userId', 'name phone email')
        .lean();
    }
    
    if (!trip) {
      trip = await Trip.findOne({ tripId: id })
        .select('tripId payment fare createdAt status passengers')
        .populate('passengers.userId', 'name phone email')
        .lean();
    }

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRIP_NOT_FOUND',
          message: 'Trip not found'
        }
      });
    }

    // Calculate commission percentage
    const commissionPercentage = trip.payment?.totalCollected > 0
      ? ((trip.payment.platformCommission / trip.payment.totalCollected) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        tripId: trip.tripId,
        _id: trip._id,
        fare: trip.fare,
        payment: {
          ...trip.payment,
          commissionPercentage: parseFloat(commissionPercentage)
        },
        passengers: trip.passengers?.map(p => ({
          userId: p.userId?._id || p.userId,
          name: p.userId?.name,
          phone: p.userId?.phone,
          email: p.userId?.email,
          seats: p.seats,
          fare: p.fare,
          paymentStatus: p.paymentStatus
        })),
        tripStatus: trip.status,
        createdAt: trip.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/payments/:id/refund
 * Process a refund for a trip
 * Requirements: 5.4
 */
router.post('/payments/:id/refund', authenticate, validate(refundSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, reason, passengerId } = req.body;
    
    const result = await PaymentStateMachine.onRefund(id, amount, reason, passengerId);
    
    res.json({
      success: true,
      data: {
        tripId: result.tripId,
        _id: result._id,
        refundAmount: amount,
        reason,
        payment: result.payment,
        message: 'Refund processed successfully'
      }
    });
  } catch (error) {
    if (error.code === 'TRIP_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_REFUND_AMOUNT' || error.code === 'REFUND_EXCEEDS_TOTAL') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Cashfree Refund Endpoints
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
// ============================================

const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const cashfreeService = require('../services/cashfreeService');
const { calculateCancellationCharges, PLATFORM_FEE } = require('../services/cashfreePaymentCalculation');

/**
 * Validation schema for Cashfree refund
 */
const cashfreeRefundSchema = Joi.object({
  bookingId: Joi.string().required(),
  amount: Joi.number().positive(),
  reason: Joi.string().required().max(500).trim(),
  useCalculatedAmount: Joi.boolean().default(true)
});

/**
 * POST /api/admin/refunds
 * Process a refund for a booking via Cashfree
 * Calculates refund amount based on cancellation policy
 * Updates booking and transaction records
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
router.post('/refunds', authenticate, requirePermission('payments:write'), validate(cashfreeRefundSchema), async (req, res, next) => {
  try {
    const { bookingId, amount, reason, useCalculatedAmount } = req.body;
    const adminId = req.user?._id || req.user?.id;
    
    // Find the booking
    const booking = await Booking.findByBookingId(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found'
        }
      });
    }
    
    // Check if booking has a payment
    if (!booking.paymentId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PAYMENT_FOUND',
          message: 'No payment found for this booking'
        }
      });
    }
    
    // Check if already refunded
    if (booking.paymentStatus === 'refunded') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_REFUNDED',
          message: 'This booking has already been refunded'
        }
      });
    }
    
    // Find the original transaction
    const originalTransaction = await Transaction.findOne({
      bookingId: booking._id,
      type: 'collection',
      status: { $in: ['captured', 'completed', 'authorized'] }
    });
    
    if (!originalTransaction) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_TRANSACTION_FOUND',
          message: 'No completed payment transaction found for this booking'
        }
      });
    }
    
    // Get trip for departure time
    const Trip = require('../models/Trip');
    const trip = await Trip.findById(booking.tripId);
    
    // Calculate refund amount based on cancellation policy if not specified
    let refundAmount = amount;
    let cancellationDetails = null;
    
    if (useCalculatedAmount || !amount) {
      // Build booking data for cancellation calculation
      const bookingData = {
        baseFare: originalTransaction.breakdown?.baseFare || booking.fare,
        platformFee: originalTransaction.breakdown?.platformFee || PLATFORM_FEE,
        freeCancellationFee: originalTransaction.breakdown?.freeCancellationFee || 0,
        hasFreeCancellation: originalTransaction.metadata?.hasFreeCancellation || false,
        appliedDiscount: originalTransaction.breakdown?.discountApplied || 0,
        departureTime: trip?.scheduledAt || trip?.departureTime || new Date()
      };
      
      // Calculate cancellation charges
      cancellationDetails = calculateCancellationCharges(bookingData, new Date());
      refundAmount = cancellationDetails.netRefund;
    }
    
    // Validate refund amount
    const validation = cashfreeService.validateRefundAmount(
      refundAmount,
      originalTransaction.amount,
      {
        platformFee: originalTransaction.breakdown?.platformFee || PLATFORM_FEE,
        freeCancellationFee: originalTransaction.breakdown?.freeCancellationFee || 0
      }
    );
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: validation.error,
          message: validation.message,
          details: validation
        }
      });
    }
    
    // Check if refund amount is zero
    if (refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ZERO_REFUND_AMOUNT',
          message: 'Calculated refund amount is zero. No refund can be processed.',
          details: cancellationDetails
        }
      });
    }
    
    // Generate refund ID
    const refundId = `REF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    let refundResponse;
    let refundStatus = 'pending';
    
    try {
      // Process refund via Cashfree API
      // Requirements: 8.1 - Process refund through Cashfree Refunds API
      refundResponse = await cashfreeService.createRefund({
        orderId: originalTransaction.orderId,
        refundId,
        amount: refundAmount,
        reason,
        originalPayment: originalTransaction.amount,
        breakdown: originalTransaction.breakdown,
        refundType: validation.isFullRefund ? 'full' : 'partial'
      });
      
      refundStatus = refundResponse.refundStatus === 'SUCCESS' ? 'completed' : 'pending';
    } catch (refundError) {
      console.error('Cashfree refund API error:', refundError);
      
      // Log the failure but allow admin to retry
      // Requirements: 8.5 - Log failure reason and allow admin to retry
      return res.status(500).json({
        success: false,
        error: {
          code: 'REFUND_API_FAILED',
          message: 'Failed to process refund via Cashfree. Please try again.',
          details: refundError.message
        },
        canRetry: true
      });
    }
    
    // Create refund transaction record
    // Requirements: 8.4 - Create refund transaction record
    const refundTransactionId = await Transaction.generateTransactionId();
    const refundTransaction = new Transaction({
      transactionId: refundTransactionId,
      orderId: originalTransaction.orderId,
      bookingId: booking._id,
      tripId: booking.tripId,
      userId: booking.passengerId,
      type: 'refund',
      status: refundStatus,
      amount: refundAmount,
      currency: 'INR',
      breakdown: {
        baseFare: cancellationDetails?.refundableAmount || refundAmount,
        platformFee: originalTransaction.breakdown?.platformFee || PLATFORM_FEE,
        freeCancellationFee: originalTransaction.breakdown?.freeCancellationFee || 0,
        discountApplied: cancellationDetails?.discountDeduction || 0
      },
      cashfreeData: {
        orderId: originalTransaction.orderId,
        refundId: refundResponse?.refundId || refundId,
        referenceId: refundResponse?.cfRefundId
      },
      rideDetails: originalTransaction.rideDetails,
      metadata: {
        reason,
        adminId,
        originalTransactionId: originalTransaction.transactionId,
        cancellationDetails,
        refundType: validation.isFullRefund ? 'full' : 'partial',
        processedAt: new Date()
      }
    });
    
    await refundTransaction.save();
    
    // Update booking payment status
    // Requirements: 8.4 - Update booking payment status
    booking.paymentStatus = 'refunded';
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason;
    await booking.save();
    
    // Update original transaction status
    originalTransaction.status = 'refunded';
    originalTransaction.metadata = {
      ...originalTransaction.metadata,
      refundedAt: new Date(),
      refundTransactionId: refundTransactionId,
      refundAmount
    };
    await originalTransaction.save();
    
    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundTransactionId,
        refundId: refundResponse?.refundId || refundId,
        refundAmount,
        refundStatus,
        refundType: validation.isFullRefund ? 'full' : 'partial',
        booking: {
          bookingId: booking.bookingId,
          status: booking.status,
          paymentStatus: booking.paymentStatus
        },
        breakdown: {
          originalPayment: originalTransaction.amount,
          refundAmount,
          platformFeeRetained: originalTransaction.breakdown?.platformFee || PLATFORM_FEE,
          freeCancellationFeeRetained: originalTransaction.breakdown?.freeCancellationFee || 0,
          cancellationCharge: cancellationDetails?.cancellationCharge || 0,
          discountDeduction: cancellationDetails?.discountDeduction || 0
        },
        cancellationPolicy: cancellationDetails ? {
          policyApplied: cancellationDetails.policyApplied,
          hoursUntilDeparture: cancellationDetails.hoursUntilDeparture,
          refundPercent: cancellationDetails.refundPercent
        } : null
      }
    });
    
  } catch (error) {
    console.error('Admin refund error:', error);
    
    if (error.code) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }
    
    next(error);
  }
});

/**
 * GET /api/admin/refunds/:bookingId
 * Get refund details for a booking
 * Requirements: 8.4
 */
router.get('/refunds/:bookingId', authenticate, requirePermission('payments:read'), async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    
    // Find the booking
    const booking = await Booking.findByBookingId(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found'
        }
      });
    }
    
    // Find refund transactions for this booking
    const refundTransactions = await Transaction.find({
      bookingId: booking._id,
      type: 'refund'
    }).sort({ createdAt: -1 });
    
    // Find original transaction
    const originalTransaction = await Transaction.findOne({
      bookingId: booking._id,
      type: 'collection'
    });
    
    res.status(200).json({
      success: true,
      data: {
        booking: {
          bookingId: booking.bookingId,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          fare: booking.fare
        },
        originalPayment: originalTransaction ? {
          transactionId: originalTransaction.transactionId,
          amount: originalTransaction.amount,
          status: originalTransaction.status,
          breakdown: originalTransaction.breakdown
        } : null,
        refunds: refundTransactions.map(t => ({
          transactionId: t.transactionId,
          refundId: t.cashfreeData?.refundId,
          amount: t.amount,
          status: t.status,
          reason: t.metadata?.reason,
          refundType: t.metadata?.refundType,
          processedAt: t.metadata?.processedAt,
          createdAt: t.createdAt
        })),
        totalRefunded: refundTransactions.reduce((sum, t) => sum + t.amount, 0)
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/refunds/:bookingId/retry
 * Retry a failed refund
 * Requirements: 8.5 - Allow admin to retry failed refunds
 */
router.post('/refunds/:bookingId/retry', authenticate, requirePermission('payments:write'), async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const adminId = req.user?._id || req.user?.id;
    
    // Find the booking
    const booking = await Booking.findByBookingId(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking not found'
        }
      });
    }
    
    // Find the failed refund transaction
    const failedRefund = await Transaction.findOne({
      bookingId: booking._id,
      type: 'refund',
      status: { $in: ['pending', 'failed'] }
    }).sort({ createdAt: -1 });
    
    if (!failedRefund) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FAILED_REFUND',
          message: 'No pending or failed refund found for this booking'
        }
      });
    }
    
    // Retry the refund via Cashfree
    try {
      const refundResponse = await cashfreeService.createRefund({
        orderId: failedRefund.orderId,
        refundId: `${failedRefund.cashfreeData?.refundId}-RETRY-${Date.now()}`,
        amount: failedRefund.amount,
        reason: failedRefund.metadata?.reason || 'Refund retry'
      });
      
      // Update transaction status
      failedRefund.status = refundResponse.refundStatus === 'SUCCESS' ? 'completed' : 'pending';
      failedRefund.cashfreeData.refundId = refundResponse.refundId;
      failedRefund.cashfreeData.referenceId = refundResponse.cfRefundId;
      failedRefund.metadata = {
        ...failedRefund.metadata,
        retryAttempt: (failedRefund.metadata?.retryAttempt || 0) + 1,
        lastRetryAt: new Date(),
        lastRetryBy: adminId
      };
      await failedRefund.save();
      
      // Update booking if successful
      if (failedRefund.status === 'completed') {
        booking.paymentStatus = 'refunded';
        await booking.save();
      }
      
      res.status(200).json({
        success: true,
        message: 'Refund retry processed',
        data: {
          transactionId: failedRefund.transactionId,
          refundId: refundResponse.refundId,
          status: failedRefund.status,
          amount: failedRefund.amount
        }
      });
      
    } catch (retryError) {
      // Log retry failure
      failedRefund.status = 'failed';
      failedRefund.metadata = {
        ...failedRefund.metadata,
        retryAttempt: (failedRefund.metadata?.retryAttempt || 0) + 1,
        lastRetryAt: new Date(),
        lastRetryError: retryError.message
      };
      await failedRefund.save();
      
      return res.status(500).json({
        success: false,
        error: {
          code: 'REFUND_RETRY_FAILED',
          message: 'Failed to retry refund. Please try again later.',
          details: retryError.message
        },
        canRetry: true
      });
    }
    
  } catch (error) {
    next(error);
  }
});

// ============================================
// Document Verification Endpoints
// Requirements: 6.1, 6.2, 6.3, 6.4
// ============================================

/**
 * Validation schemas for document endpoints
 */
const getDocumentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'approved', 'rejected'),
  type: Joi.string().valid('license', 'registration', 'insurance', 'kyc', 'selfie_with_car', 'vehicle_photo'),
  driverId: Joi.string().hex().length(24)
});

const verifyDocumentSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  reason: Joi.string().max(500).trim().when('status', {
    is: 'rejected',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })
});

/**
 * GET /api/admin/documents
 * Get paginated list of documents for review with presigned URLs
 * Requirements: 3.1, 5.2, 6.1, 6.2
 */
router.get('/documents', authenticate, requirePermission('documents:read'), validate(getDocumentsSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status, type, driverId } = req.query;
    
    const result = await documentService.getDocumentsForReview({
      page,
      limit,
      status,
      type,
      driverId
    });

    // Get document stats for dashboard
    const stats = await documentService.getDocumentStats();

    // Generate presigned URLs for each document
    const s3Service = require('../services/s3Service');
    const documentsWithUrls = await Promise.all(
      result.documents.map(async (doc) => {
        let url = doc.url;
        let urlExpiresAt = null;

        // Generate presigned URL if s3Key exists
        if (doc.s3Key) {
          try {
            const presigned = await s3Service.getPresignedUrl(doc.s3Key);
            url = presigned.url;
            urlExpiresAt = presigned.expiresAt;
          } catch (err) {
            console.error(`Failed to generate presigned URL for document ${doc._id}:`, err.message);
          }
        }

        return {
          ...doc,
          url,
          urlExpiresAt
        };
      })
    );

    res.json({
      success: true,
      data: {
        documents: documentsWithUrls,
        stats
      },
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/documents/driver/:driverId
 * Get all documents for a specific driver with presigned URLs
 * Requirements: 3.1, 5.1, 5.2, 6.2
 * NOTE: This route MUST be defined BEFORE /documents/:id to avoid route conflicts
 */
router.get('/documents/driver/:driverId', authenticate, requirePermission('documents:read'), async (req, res, next) => {
  try {
    const { driverId } = req.params;
    
    // Get driver profile info
    const driverProfile = await documentService.getDriverDocuments(driverId);
    
    // Get documents with presigned URLs
    const documentsWithUrls = await documentService.getDriverDocumentsWithUrls(driverId);
    
    res.json({
      success: true,
      data: {
        ...driverProfile,
        documents: documentsWithUrls
      }
    });
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_DRIVER_ID') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/admin/documents/:id/url
 * Get fresh presigned URL for a document (for URL refresh)
 * Requirements: 3.1, 5.3
 * NOTE: This route MUST be defined BEFORE /documents/:id to avoid route conflicts
 */
router.get('/documents/:id/url', authenticate, requirePermission('documents:read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get document with fresh presigned URL
    const document = await documentService.getDocumentWithUrl(id);
    
    res.json({
      success: true,
      data: {
        url: document.url,
        expiresAt: document.urlExpiresAt
      }
    });
  } catch (error) {
    if (error.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/admin/documents/:id
 * Get a single document by ID with full details and presigned URL
 * Requirements: 3.1, 5.2, 5.3, 6.2
 * NOTE: This route MUST be defined AFTER more specific routes like /documents/driver/:driverId
 */
router.get('/documents/:id', authenticate, requirePermission('documents:read'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Use getDocumentWithUrl to get document with fresh presigned URL
    const document = await documentService.getDocumentWithUrl(id);
    
    res.json({
      success: true,
      data: document
    });
  } catch (error) {
    if (error.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * Validation schema for missing documents
 */
const missingDocumentsSchema = Joi.object({
  documentTypes: Joi.array().items(
    Joi.string().valid('license', 'registration', 'insurance', 'kyc', 'selfie_with_car', 'vehicle_photo')
  ).min(1).required(),
  message: Joi.string().max(500).trim().default('')
});

/**
 * POST /api/admin/drivers/:id/missing-documents
 * Mark documents as missing and notify driver
 * Requirements: 2.4, 3.1
 */
router.post('/drivers/:id/missing-documents', authenticate, requirePermission('documents:write'), validate(missingDocumentsSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { documentTypes, message } = req.body;
    
    const result = await documentService.markDocumentsMissing(id, documentTypes, message);
    
    res.json({
      success: true,
      data: result,
      message: 'Driver notified about missing documents'
    });
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND' || error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'INVALID_DOCUMENT_TYPE' || error.code === 'INVALID_DRIVER_ID') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/documents/:id/verify
 * Approve or reject a document
 * Requirements: 3.2, 3.3, 3.4, 3.5, 6.3, 6.4
 */
router.post('/documents/:id/verify', authenticate, requirePermission('documents:verify'), validate(verifyDocumentSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    // Validate document ID parameter
    const mongoose = require('mongoose');
    const docIdStr = String(id || '').trim();
    
    if (!docIdStr || !mongoose.Types.ObjectId.isValid(docIdStr)) {
      console.error('Invalid document ID in URL parameter:', id);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCUMENT_ID',
          message: 'Invalid document ID format. Please refresh and try again.'
        }
      });
    }
    
    // Get reviewer ID from auth middleware
    const reviewerId = req.user?._id || req.user?.id;
    
    const result = await documentService.verifyDocument(docIdStr, {
      status,
      reviewerId,
      reason
    });
    
    res.json({
      success: true,
      data: result,
      message: `Document ${status} successfully`
    });
  } catch (error) {
    if (error.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'DOCUMENT_ALREADY_PROCESSED' || 
        error.code === 'REASON_REQUIRED' || 
        error.code === 'INVALID_STATUS' ||
        error.code === 'INVALID_DOCUMENT_ID') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// SOS Alert Endpoints
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
// ============================================

const sosService = require('../services/sosService');

/**
 * Validation schemas for SOS endpoints
 */
const getSOSAlertsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('active', 'acknowledged', 'resolved')
});

const resolveSOSSchema = Joi.object({
  resolution: Joi.string().required().max(1000).trim(),
  actionsTaken: Joi.array().items(Joi.string().max(500).trim()).default([])
});

/**
 * GET /api/admin/sos
 * Get paginated list of SOS alerts
 * Requirements: 7.4
 */
router.get('/sos', authenticate, validate(getSOSAlertsSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    
    const result = await sosService.getAlerts({ page, limit, status });
    
    // Get active alerts count for dashboard badge
    const activeCount = await sosService.getActiveAlertsCount();

    res.json({
      success: true,
      data: {
        alerts: result.alerts,
        activeCount
      },
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/sos/:id
 * Get complete SOS alert details
 * Requirements: 7.4
 */
router.get('/sos/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const alert = await sosService.getAlertDetails(id);

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    if (error.code === 'ALERT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/sos/:id/acknowledge
 * Acknowledge an SOS alert
 */
router.post('/sos/:id/acknowledge', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user?._id || req.user?.id;
    
    const result = await sosService.acknowledgeAlert(id, adminId);

    res.json({
      success: true,
      data: result,
      message: 'SOS alert acknowledged'
    });
  } catch (error) {
    if (error.code === 'ALERT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'ALERT_ALREADY_RESOLVED') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * POST /api/admin/sos/:id/resolve
 * Resolve an SOS alert
 * Requirements: 7.5
 */
router.post('/sos/:id/resolve', authenticate, validate(resolveSOSSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resolution, actionsTaken } = req.body;
    const adminId = req.user?._id || req.user?.id;
    
    const result = await sosService.resolveAlert(id, {
      adminId,
      resolution,
      actionsTaken
    });

    res.json({
      success: true,
      data: result,
      message: 'SOS alert resolved successfully'
    });
  } catch (error) {
    if (error.code === 'ALERT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    if (error.code === 'ALERT_ALREADY_RESOLVED' || error.code === 'RESOLUTION_REQUIRED') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/admin/reports/export
 * Export financial reports in CSV or PDF format
 * Requirements: 5.5
 */
router.get('/reports/export', authenticate, validate(exportReportSchema, 'query'), async (req, res, next) => {
  try {
    const { format, reportType, startDate, endDate } = req.query;
    
    const result = await reportService.exportReport({
      format,
      reportType,
      startDate,
      endDate
    });

    // For CSV, send as downloadable file
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.content);
    }

    // For PDF, return JSON data (in production, would generate actual PDF)
    res.json({
      success: true,
      data: result.content,
      metadata: {
        filename: result.filename,
        recordCount: result.recordCount,
        summary: result.summary,
        generatedAt: result.generatedAt
      }
    });
  } catch (error) {
    if (error.code === 'INVALID_FORMAT' || error.code === 'INVALID_REPORT_TYPE') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

// ============================================
// Live Tracking Dashboard Endpoints
// Requirements: 4.1, 4.3, 4.4, 4.5
// ============================================

/**
 * Validation schemas for tracking endpoints
 */
const getActiveTripsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(100),
  status: Joi.string().valid('scheduled', 'driver_assigned', 'in_progress'),
  minLat: Joi.number().min(-90).max(90),
  maxLat: Joi.number().min(-90).max(90),
  minLng: Joi.number().min(-180).max(180),
  maxLng: Joi.number().min(-180).max(180)
}).and('minLat', 'maxLat', 'minLng', 'maxLng');

/**
 * GET /api/admin/tracking/trips/active
 * Get all active trips with their current locations for live tracking dashboard
 * Requirements: 4.1 - Display a map with all active trip locations
 */
router.get('/tracking/trips/active', authenticate, requireRole('super_admin', 'admin', 'operations'), validate(getActiveTripsSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status, minLat, maxLat, minLng, maxLng } = req.query;
    
    // Build region filter if coordinates provided
    let region = null;
    if (minLat !== undefined) {
      region = { minLat, maxLat, minLng, maxLng };
    }
    
    const result = await adminTrackingService.getActiveTrips({
      page,
      limit,
      status,
      region
    });
    
    res.json({
      success: true,
      data: result.trips,
      pagination: result.pagination,
      stats: result.stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/tracking/trips/:id/details
 * Get complete trip details for admin dashboard
 * Requirements: 4.3 - Display trip details including driver, passengers, route, and ETA
 */
router.get('/tracking/trips/:id/details', authenticate, requireRole('super_admin', 'admin', 'operations'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const tripDetails = await adminTrackingService.getTripDetails(id);
    
    res.json({
      success: true,
      data: tripDetails
    });
  } catch (error) {
    if (error.code === 'TRIP_NOT_FOUND' || error.code === 'TRIP_ID_REQUIRED') {
      return res.status(404).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    next(error);
  }
});

/**
 * GET /api/admin/tracking/trips/filter
 * Filter trips by region and/or status
 * Requirements: 4.4 - Filter by region or status
 */
router.get('/tracking/trips/filter', authenticate, requireRole('super_admin', 'admin', 'operations'), validate(getActiveTripsSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, status, minLat, maxLat, minLng, maxLng } = req.query;
    
    // Build region filter if coordinates provided
    let region = null;
    if (minLat !== undefined) {
      region = { minLat, maxLat, minLng, maxLng };
    }
    
    const result = await adminTrackingService.filterTrips({
      page,
      limit,
      status,
      region
    });
    
    res.json({
      success: true,
      data: result.trips,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/tracking/trips/sos
 * Get trips with active SOS alerts (highlighted)
 * Requirements: 4.5 - Highlight affected trip with distinct visual indicator
 */
router.get('/tracking/trips/sos', authenticate, requireRole('super_admin', 'admin', 'operations'), async (req, res, next) => {
  try {
    const result = await adminTrackingService.getTripsWithSOSAlerts();
    
    res.json({
      success: true,
      data: result.alerts,
      count: result.count
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Queue Monitoring Endpoints
// Requirements: 9.4 - Return queue depth, processing rate, failed jobs
// ============================================

const { getQueueStatus, getFailedJobs, retryFailedJob } = require('../queues/documentQueue');

/**
 * GET /api/admin/queues/status
 * Get document processing queue status
 * Requirements: 9.4 - Return queue depth, processing rate, failed jobs
 */
router.get('/queues/status', authenticate, requireRole('super_admin', 'admin', 'operations'), async (req, res, next) => {
  try {
    const queueStatus = await getQueueStatus();
    
    res.json({
      success: true,
      data: {
        queueName: 'document-processing',
        waiting: queueStatus.waiting,
        active: queueStatus.active,
        completed: queueStatus.completed,
        failed: queueStatus.failed,
        delayed: queueStatus.delayed,
        paused: queueStatus.paused,
        processingRate: queueStatus.processingRate,
        estimatedWaitMinutes: queueStatus.estimatedWaitMinutes,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/queues/failed
 * Get failed jobs from the document processing queue
 * Requirements: 9.4 - Return failed jobs for review
 */
router.get('/queues/failed', authenticate, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const start = parseInt(req.query.start) || 0;
    const end = parseInt(req.query.end) || 20;
    
    const failedJobs = await getFailedJobs(start, end);
    
    res.json({
      success: true,
      data: failedJobs,
      count: failedJobs.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/queues/retry/:jobId
 * Retry a failed job
 * Requirements: 1.5 - Retry failed uploads
 */
router.post('/queues/retry/:jobId', authenticate, requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const { jobId } = req.params;
    
    const success = await retryFailedJob(jobId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Failed job not found'
        }
      });
    }
    
    res.json({
      success: true,
      message: 'Job queued for retry'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Circuit Breaker Status Endpoints
// Requirements: 4.2, 8.2 - Circuit breaker monitoring
// ============================================

const { getCircuitBreakerStatus, resetCircuitBreaker, resetAllCircuitBreakers } = require('../services/circuitBreakerService');

/**
 * GET /api/admin/circuit-breakers/status
 * Get status of all circuit breakers
 * Requirements: 4.2
 */
router.get('/circuit-breakers/status', authenticate, requirePermission('system:read'), async (req, res, next) => {
  try {
    const status = getCircuitBreakerStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/circuit-breakers/:name/reset
 * Reset a specific circuit breaker
 * Requirements: 4.2
 */
router.post('/circuit-breakers/:name/reset', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { name } = req.params;
    
    resetCircuitBreaker(name);
    
    res.json({
      success: true,
      message: `Circuit breaker '${name}' has been reset`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/circuit-breakers/reset-all
 * Reset all circuit breakers
 * Requirements: 4.2
 */
router.post('/circuit-breakers/reset-all', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    resetAllCircuitBreakers();
    
    res.json({
      success: true,
      message: 'All circuit breakers have been reset'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Cron Jobs Management Endpoints
// ============================================

/**
 * GET /api/admin/cron-jobs/status
 * Get status of all cron jobs
 */
router.get('/cron-jobs/status', authenticate, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const { getCronJobsStatus } = require('../jobs');
    const status = getCronJobsStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/cron-jobs/trigger/:jobName
 * Manually trigger a specific cron job
 */
const triggerJobSchema = Joi.object({
  jobName: Joi.string().valid('subscriptionExpiry', 'cashbackExpiry', 'benefitsReset').required()
});

router.post('/cron-jobs/trigger/:jobName', 
  authenticate, 
  requireRole(['super_admin']), // Only super admin can trigger jobs
  validate({ params: triggerJobSchema }),
  async (req, res, next) => {
    try {
      const { jobName } = req.params;
      const { triggerJob } = require('../jobs');
      
      await triggerJob(jobName);
      
      res.json({
        success: true,
        message: `Successfully triggered ${jobName} job`
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
