/**
 * Staff Service
 * Implements staff account management for admin panel RBAC
 * 
 * Requirements: 1.1, 1.4, 5.1, 5.2
 */

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Driver = require('../models/Driver');
const SupportTicket = require('../models/SupportTicket');
const AuditLog = require('../models/AuditLog');
const { ROLE_PERMISSIONS, VALID_ROLES } = require('./permissionService');

const BCRYPT_SALT_ROUNDS = 10;


/**
 * Validate required fields for staff account creation
 * @param {Object} data - Staff account data
 * @returns {Object} Validation result with errors array
 */
const validateStaffData = (data) => {
  const errors = [];
  
  if (!data.email || typeof data.email !== 'string' || !data.email.trim()) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }
  
  if (!data.password || typeof data.password !== 'string' || !data.password.trim()) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (data.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }
  
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  }
  
  if (!data.role || !VALID_ROLES.includes(data.role)) {
    errors.push({ field: 'role', message: 'Valid role is required (operations, customer_support, finance, admin, super_admin)' });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Create a new staff account with email/password authentication
 * 
 * @param {Object} staffData - Staff account data
 * @param {string} staffData.email - Staff email address
 * @param {string} staffData.password - Staff password (will be hashed)
 * @param {string} staffData.name - Staff display name
 * @param {string} staffData.role - Staff role (operations, customer_support, finance, admin, super_admin)
 * @param {string} createdById - ID of the super admin creating this account
 * @returns {Promise<Object>} Created staff account (without password)
 * 
 * Requirements: 1.1, 1.4
 */
const createStaffAccount = async (staffData, createdById) => {
  // Validate required fields
  const validation = validateStaffData(staffData);
  if (!validation.isValid) {
    const error = new Error('Missing required fields');
    error.code = 'MISSING_REQUIRED_FIELDS';
    error.details = validation.errors;
    throw error;
  }
  
  const { email, password, name, role } = staffData;
  
  // Check for duplicate email
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    const error = new Error('Email already exists');
    error.code = 'DUPLICATE_EMAIL';
    throw error;
  }
  
  // Hash password with bcrypt (10 salt rounds per Requirements 1.4)
  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  
  // Get permissions for the role
  const permissions = ROLE_PERMISSIONS[role] || [];
  
  // Create staff account
  const staff = new User({
    email: email.toLowerCase(),
    password: hashedPassword,
    name: name.trim(),
    role,
    isStaff: true,
    isActive: true,
    permissions,
    createdBy: createdById
  });
  
  await staff.save();
  
  // Return staff without password
  const staffObj = staff.toObject();
  delete staffObj.password;
  
  return {
    success: true,
    staff: staffObj
  };
};


/**
 * Update an existing staff account
 * 
 * @param {string} staffId - Staff account ID
 * @param {Object} updates - Fields to update
 * @param {string} performedById - ID of the admin performing the update
 * @returns {Promise<Object>} Updated staff account
 * 
 * Requirements: 5.1, 5.3
 */
const updateStaffAccount = async (staffId, updates, performedById) => {
  const staff = await User.findOne({ _id: staffId, isStaff: true });
  
  if (!staff) {
    const error = new Error('Staff account not found');
    error.code = 'STAFF_NOT_FOUND';
    throw error;
  }
  
  const allowedUpdates = ['name', 'email', 'role', 'permissions'];
  const previousValues = {};
  const newValues = {};
  
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      previousValues[key] = staff[key];
      newValues[key] = updates[key];
      
      // If role is updated, also update permissions
      if (key === 'role' && ROLE_PERMISSIONS[updates[key]]) {
        staff.permissions = ROLE_PERMISSIONS[updates[key]];
        newValues.permissions = ROLE_PERMISSIONS[updates[key]];
      }
      
      staff[key] = updates[key];
    }
  }
  
  // Check for duplicate email if email is being updated
  if (updates.email && updates.email.toLowerCase() !== staff.email) {
    const existingUser = await User.findOne({ 
      email: updates.email.toLowerCase(),
      _id: { $ne: staffId }
    });
    if (existingUser) {
      const error = new Error('Email already exists');
      error.code = 'DUPLICATE_EMAIL';
      throw error;
    }
    staff.email = updates.email.toLowerCase();
  }
  
  await staff.save();
  
  // Log permission/role changes to audit trail (Requirements 5.3)
  if (newValues.role) {
    await AuditLog.logAction({
      userId: performedById,
      action: 'role_update',
      targetType: 'user',
      targetId: staffId,
      previousValue: { role: previousValues.role },
      newValue: { role: newValues.role },
      details: {
        staffEmail: staff.email,
        staffName: staff.name
      }
    });
  }
  
  if (newValues.permissions && !newValues.role) {
    // Only log permission_update if permissions changed without role change
    // (role change already implies permission change)
    await AuditLog.logAction({
      userId: performedById,
      action: 'permission_update',
      targetType: 'user',
      targetId: staffId,
      previousValue: { permissions: previousValues.permissions },
      newValue: { permissions: newValues.permissions },
      details: {
        staffEmail: staff.email,
        staffName: staff.name
      }
    });
  }
  
  const staffObj = staff.toObject();
  delete staffObj.password;
  
  return {
    success: true,
    staff: staffObj
  };
};

/**
 * Deactivate a staff account (prevents login)
 * 
 * @param {string} staffId - Staff account ID
 * @param {string} performedById - ID of the admin performing the deactivation
 * @returns {Promise<Object>} Result of deactivation
 * 
 * Requirements: 5.2
 */
const deactivateStaffAccount = async (staffId, performedById) => {
  const staff = await User.findOne({ _id: staffId, isStaff: true });
  
  if (!staff) {
    const error = new Error('Staff account not found');
    error.code = 'STAFF_NOT_FOUND';
    throw error;
  }
  
  staff.isActive = false;
  await staff.save();
  
  // Log deactivation to audit trail
  await AuditLog.logAction({
    userId: performedById,
    action: 'user_suspend',
    targetType: 'user',
    targetId: staffId,
    previousValue: { isActive: true },
    newValue: { isActive: false },
    details: {
      staffEmail: staff.email,
      staffName: staff.name
    }
  });
  
  return {
    success: true
  };
};


/**
 * Get paginated list of staff accounts
 * 
 * @param {Object} filters - Query filters
 * @param {string} [filters.role] - Filter by role
 * @param {boolean} [filters.isActive] - Filter by active status
 * @param {string} [filters.search] - Search by name or email
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<Object>} Paginated staff accounts
 * 
 * Requirements: 5.1
 */
const getStaffAccounts = async (filters = {}) => {
  const {
    role,
    isActive,
    search,
    page = 1,
    limit = 20
  } = filters;
  
  const query = { isStaff: true };
  
  if (role) {
    query.role = role;
  }
  
  if (isActive !== undefined) {
    query.isActive = isActive;
  }
  
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { name: searchRegex },
      { email: searchRegex }
    ];
  }
  
  const skip = (page - 1) * limit;
  
  const [staff, total] = await Promise.all([
    User.find(query)
      .select('-password -__v')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query)
  ]);
  
  return {
    success: true,
    staff,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Get a single staff account by ID
 * 
 * @param {string} staffId - Staff account ID
 * @returns {Promise<Object>} Staff account details
 */
const getStaffById = async (staffId) => {
  const staff = await User.findOne({ _id: staffId, isStaff: true })
    .select('-password -__v')
    .populate('createdBy', 'name email')
    .lean();
  
  if (!staff) {
    const error = new Error('Staff account not found');
    error.code = 'STAFF_NOT_FOUND';
    throw error;
  }
  
  return {
    success: true,
    staff
  };
};

/**
 * Reset staff password
 * 
 * @param {string} staffId - Staff account ID
 * @param {string} newPassword - New password
 * @param {string} performedById - ID of the admin performing the reset
 * @returns {Promise<Object>} Result of password reset
 * 
 * Requirements: 5.4
 */
const resetStaffPassword = async (staffId, newPassword, performedById) => {
  const staff = await User.findOne({ _id: staffId, isStaff: true }).select('+password');
  
  if (!staff) {
    const error = new Error('Staff account not found');
    error.code = 'STAFF_NOT_FOUND';
    throw error;
  }
  
  if (!newPassword || newPassword.length < 8) {
    const error = new Error('Password must be at least 8 characters');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }
  
  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  staff.password = hashedPassword;
  await staff.save();
  
  // Log password reset to audit trail
  await AuditLog.logAction({
    userId: performedById,
    action: 'settings_update',
    targetType: 'user',
    targetId: staffId,
    details: {
      type: 'password_reset'
    }
  });
  
  return {
    success: true
  };
};

/**
 * Activate a previously deactivated staff account
 * 
 * @param {string} staffId - Staff account ID
 * @param {string} performedById - ID of the admin performing the activation
 * @returns {Promise<Object>} Result of activation
 */
const activateStaffAccount = async (staffId, performedById) => {
  const staff = await User.findOne({ _id: staffId, isStaff: true });
  
  if (!staff) {
    const error = new Error('Staff account not found');
    error.code = 'STAFF_NOT_FOUND';
    throw error;
  }
  
  staff.isActive = true;
  await staff.save();
  
  // Log activation to audit trail
  await AuditLog.logAction({
    userId: performedById,
    action: 'user_activate',
    targetType: 'user',
    targetId: staffId,
    previousValue: { isActive: false },
    newValue: { isActive: true },
    details: {
      staffEmail: staff.email,
      staffName: staff.name
    }
  });
  
  return {
    success: true
  };
};

/**
 * Authenticate staff member with email and password
 * 
 * @param {string} email - Staff email address
 * @param {string} password - Staff password
 * @returns {Promise<Object>} Authentication result with staff data
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
const authenticateStaff = async (email, password) => {
  // Generic error message for both wrong email and wrong password (Requirements 6.2)
  const GENERIC_AUTH_ERROR = 'Invalid credentials';
  const AUTH_ERROR_CODE = 'INVALID_CREDENTIALS';
  
  // Validate inputs
  if (!email || !password) {
    const error = new Error(GENERIC_AUTH_ERROR);
    error.code = AUTH_ERROR_CODE;
    throw error;
  }
  
  // Find staff account by email (include password field for verification)
  const staff = await User.findOne({ 
    email: email.toLowerCase(),
    isStaff: true 
  }).select('+password');
  
  // Return same error for non-existent email (Requirements 6.2)
  if (!staff) {
    const error = new Error(GENERIC_AUTH_ERROR);
    error.code = AUTH_ERROR_CODE;
    throw error;
  }
  
  // Check if account is active (Requirements 5.2, 6.3)
  if (!staff.isActive) {
    const error = new Error('Account is deactivated');
    error.code = 'ACCOUNT_DEACTIVATED';
    throw error;
  }
  
  // Verify password against bcrypt hash
  const isPasswordValid = await bcrypt.compare(password, staff.password);
  
  // Return same error for wrong password (Requirements 6.2)
  if (!isPasswordValid) {
    const error = new Error(GENERIC_AUTH_ERROR);
    error.code = AUTH_ERROR_CODE;
    throw error;
  }
  
  // Update last login timestamp
  staff.lastLogin = new Date();
  await staff.save();
  
  // Return staff without password
  const staffObj = staff.toObject();
  delete staffObj.password;
  
  return {
    success: true,
    staff: staffObj
  };
};

/**
 * Sensitive fields to exclude from user lookup for customer support
 * These fields contain financial/payment information that support staff should not see
 * 
 * Requirements: 4.2
 */
const SENSITIVE_USER_FIELDS = [
  'password',
  '__v'
];

const SENSITIVE_DRIVER_FIELDS = [
  'bankDetails',
  'earnings'
];

/**
 * Get filtered user details for customer support lookup
 * Excludes sensitive financial information (bank details, payment info)
 * 
 * @param {string} identifier - User ID, phone, or email to search
 * @returns {Promise<Object>} Filtered user details without sensitive data
 * 
 * Requirements: 4.2
 */
const getFilteredUserLookup = async (identifier) => {
  if (!identifier || typeof identifier !== 'string') {
    const error = new Error('Search identifier is required');
    error.code = 'INVALID_IDENTIFIER';
    throw error;
  }

  let user = null;
  
  // Try to find by MongoDB ObjectId first
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    user = await User.findById(identifier)
      .select(SENSITIVE_USER_FIELDS.map(f => `-${f}`).join(' '))
      .lean();
  }
  
  // If not found by ID, search by phone or email
  if (!user) {
    user = await User.findOne({
      $or: [
        { phone: identifier },
        { email: identifier.toLowerCase() }
      ]
    })
      .select(SENSITIVE_USER_FIELDS.map(f => `-${f}`).join(' '))
      .lean();
  }

  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // If user is a driver, get driver details but exclude sensitive fields
  let driverDetails = null;
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ userId: user._id })
      .select(SENSITIVE_DRIVER_FIELDS.map(f => `-${f}`).join(' '))
      .lean();
    
    if (driver) {
      driverDetails = driver;
    }
  }

  return {
    success: true,
    user: {
      ...user,
      driverDetails
    }
  };
};

/**
 * Search users for customer support with filtering
 * Excludes sensitive financial information from results
 * 
 * @param {Object} filters - Search filters
 * @param {string} [filters.search] - Search by name, phone, or email
 * @param {string} [filters.role] - Filter by role (passenger, driver)
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<Object>} Paginated filtered user list
 * 
 * Requirements: 4.2
 */
const searchUsersFiltered = async (filters = {}) => {
  const {
    search,
    role,
    page = 1,
    limit = 20
  } = filters;

  const query = { isStaff: { $ne: true } }; // Exclude staff accounts

  if (role && ['passenger', 'driver'].includes(role)) {
    query.role = role;
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { name: searchRegex },
      { phone: searchRegex },
      { email: searchRegex }
    ];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(query)
      .select(SENSITIVE_USER_FIELDS.map(f => `-${f}`).join(' '))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query)
  ]);

  return {
    success: true,
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};

// ============================================
// Support Ticket Functions for Customer Support
// Requirements: 4.1, 4.3
// ============================================

/**
 * Get paginated list of support tickets
 * 
 * @param {Object} filters - Query filters
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.priority] - Filter by priority
 * @param {string} [filters.category] - Filter by category
 * @param {string} [filters.assignedTo] - Filter by assigned staff
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=20] - Items per page
 * @returns {Promise<Object>} Paginated support tickets
 * 
 * Requirements: 4.1
 */
const getSupportTickets = async (filters = {}) => {
  const {
    status,
    priority,
    category,
    assignedTo,
    search,
    page = 1,
    limit = 20
  } = filters;

  const query = {};

  if (status) {
    query.status = status;
  }

  if (priority) {
    query.priority = priority;
  }

  if (category) {
    query.category = category;
  }

  if (assignedTo) {
    query.assignedTo = assignedTo;
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { ticketId: searchRegex },
      { subject: searchRegex }
    ];
  }

  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .populate('userId', 'name phone email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(query)
  ]);

  // Get ticket stats
  const stats = await SupportTicket.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const ticketStats = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0
  };

  stats.forEach(s => {
    ticketStats[s._id] = s.count;
  });

  return {
    success: true,
    tickets,
    stats: ticketStats,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Get a single support ticket by ID
 * 
 * @param {string} ticketId - Ticket ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Support ticket details
 * 
 * Requirements: 4.3
 */
const getSupportTicketById = async (ticketId) => {
  const ticket = await SupportTicket.findByTicketId(ticketId);

  if (!ticket) {
    const error = new Error('Support ticket not found');
    error.code = 'TICKET_NOT_FOUND';
    throw error;
  }

  // Populate user and assignee details
  await ticket.populate('userId', 'name phone email');
  await ticket.populate('assignedTo', 'name email');
  await ticket.populate('messages.senderId', 'name email');

  return {
    success: true,
    ticket: ticket.toObject()
  };
};

/**
 * Update support ticket status
 * 
 * @param {string} ticketId - Ticket ID
 * @param {string} status - New status
 * @param {string} staffId - Staff member making the update
 * @returns {Promise<Object>} Updated ticket
 * 
 * Requirements: 4.3
 */
const updateTicketStatus = async (ticketId, status, staffId) => {
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  
  if (!validStatuses.includes(status)) {
    const error = new Error('Invalid status');
    error.code = 'INVALID_STATUS';
    throw error;
  }

  const ticket = await SupportTicket.findByTicketId(ticketId);

  if (!ticket) {
    const error = new Error('Support ticket not found');
    error.code = 'TICKET_NOT_FOUND';
    throw error;
  }

  const previousStatus = ticket.status;
  ticket.status = status;

  if (status === 'resolved') {
    ticket.resolvedAt = new Date();
  }

  await ticket.save();

  // Log status change
  await AuditLog.logAction({
    userId: staffId,
    action: 'settings_update',
    targetType: 'support_ticket',
    targetId: ticket._id,
    previousValue: { status: previousStatus },
    newValue: { status },
    details: {
      ticketId: ticket.ticketId
    }
  });

  return {
    success: true,
    ticket: ticket.toObject()
  };
};

/**
 * Add a message to a support ticket
 * 
 * @param {string} ticketId - Ticket ID
 * @param {string} message - Message content
 * @param {string} senderId - Staff member sending the message
 * @returns {Promise<Object>} Updated ticket
 * 
 * Requirements: 4.3
 */
const addTicketMessage = async (ticketId, message, senderId) => {
  if (!message || typeof message !== 'string' || !message.trim()) {
    const error = new Error('Message is required');
    error.code = 'MESSAGE_REQUIRED';
    throw error;
  }

  const ticket = await SupportTicket.findByTicketId(ticketId);

  if (!ticket) {
    const error = new Error('Support ticket not found');
    error.code = 'TICKET_NOT_FOUND';
    throw error;
  }

  await ticket.addMessage(senderId, message.trim());

  return {
    success: true,
    ticket: ticket.toObject()
  };
};

/**
 * Assign a support ticket to a staff member
 * 
 * @param {string} ticketId - Ticket ID
 * @param {string} assigneeId - Staff member to assign to
 * @param {string} performedById - Staff member making the assignment
 * @returns {Promise<Object>} Updated ticket
 * 
 * Requirements: 4.3
 */
const assignTicket = async (ticketId, assigneeId, performedById) => {
  const ticket = await SupportTicket.findByTicketId(ticketId);

  if (!ticket) {
    const error = new Error('Support ticket not found');
    error.code = 'TICKET_NOT_FOUND';
    throw error;
  }

  // Verify assignee is a valid staff member
  const assignee = await User.findOne({ _id: assigneeId, isStaff: true });
  if (!assignee) {
    const error = new Error('Invalid assignee');
    error.code = 'INVALID_ASSIGNEE';
    throw error;
  }

  const previousAssignee = ticket.assignedTo;
  await ticket.assign(assigneeId);

  // Log assignment
  await AuditLog.logAction({
    userId: performedById,
    action: 'settings_update',
    targetType: 'support_ticket',
    targetId: ticket._id,
    previousValue: { assignedTo: previousAssignee },
    newValue: { assignedTo: assigneeId },
    details: {
      ticketId: ticket.ticketId,
      assigneeName: assignee.name
    }
  });

  return {
    success: true,
    ticket: ticket.toObject()
  };
};

module.exports = {
  ROLE_PERMISSIONS,
  BCRYPT_SALT_ROUNDS,
  SENSITIVE_USER_FIELDS,
  SENSITIVE_DRIVER_FIELDS,
  validateStaffData,
  createStaffAccount,
  updateStaffAccount,
  deactivateStaffAccount,
  getStaffAccounts,
  getStaffById,
  resetStaffPassword,
  activateStaffAccount,
  authenticateStaff,
  // Filtered user lookup for customer support (Requirements: 4.2)
  getFilteredUserLookup,
  searchUsersFiltered,
  // Support ticket functions (Requirements: 4.1, 4.3)
  getSupportTickets,
  getSupportTicketById,
  updateTicketStatus,
  addTicketMessage,
  assignTicket
};
