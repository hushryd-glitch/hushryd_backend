/**
 * Admin Service
 * Implements super admin dashboard metrics, user management, and analytics
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

const User = require('../models/User');
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const Booking = require('../models/Booking');
const SupportTicket = require('../models/SupportTicket');
const AuditLog = require('../models/AuditLog');

/**
 * Get dashboard metrics for super admin
 * Aggregates total users, active drivers, ongoing trips, daily revenue
 * 
 * @returns {Promise<Object>} Dashboard metrics
 * Requirements: 1.2
 */
const getDashboardMetrics = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalUsers,
    activeDrivers,
    ongoingTrips,
    dailyTrips,
    pendingDocuments,
    activeSOSAlerts
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Driver.countDocuments({ verificationStatus: 'verified' }),
    Trip.countDocuments({ status: 'in_progress' }),
    Trip.find({
      status: 'completed',
      completedAt: { $gte: today, $lt: tomorrow }
    }).select('payment.totalCollected').lean(),
    Driver.aggregate([
      { $unwind: '$documents' },
      { $match: { 'documents.status': 'pending' } },
      { $count: 'total' }
    ]),
    require('../models/SOSAlert').countDocuments({ status: { $in: ['active', 'acknowledged'] } })
  ]);

  // Calculate daily revenue
  const dailyRevenue = dailyTrips.reduce((sum, trip) => {
    return sum + (trip.payment?.totalCollected || 0);
  }, 0);

  // Get user breakdown by role
  const usersByRole = await User.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);

  const roleBreakdown = {};
  usersByRole.forEach(r => { roleBreakdown[r._id] = r.count; });

  return {
    totalUsers,
    activeDrivers,
    ongoingTrips,
    dailyRevenue,
    dailyCompletedTrips: dailyTrips.length,
    pendingDocuments: pendingDocuments[0]?.total || 0,
    activeSOSAlerts,
    usersByRole: roleBreakdown,
    lastUpdated: new Date()
  };
};


/**
 * Get paginated user list with filters
 * 
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated users
 * Requirements: 1.3
 */
const getUsers = async (filters = {}) => {
  const {
    role,
    status,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 20
  } = filters;

  const query = {};

  // Role filter
  if (role) {
    query.role = role;
  }

  // Status filter (active/inactive)
  if (status !== undefined) {
    query.isActive = status === 'active';
  }

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Search by name, phone, or email
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
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query)
  ]);

  return {
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

/**
 * Get user by ID with full details
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User details
 */
const getUserById = async (userId) => {
  const user = await User.findById(userId).select('-__v').lean();
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Get additional stats based on role
  let additionalInfo = {};
  
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ userId }).lean();
    if (driver) {
      additionalInfo.driverInfo = {
        verificationStatus: driver.verificationStatus,
        totalTrips: driver.totalTrips,
        rating: driver.rating,
        earnings: driver.earnings
      };
    }
  }

  // Get booking count for passengers
  if (user.role === 'passenger') {
    const bookingCount = await Booking.countDocuments({ passengerId: userId });
    additionalInfo.bookingCount = bookingCount;
  }

  return { ...user, ...additionalInfo };
};

/**
 * Update user details
 * 
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user
 */
const updateUser = async (userId, updates) => {
  const allowedUpdates = ['name', 'email', 'isActive', 'role', 'kycStatus'];
  const filteredUpdates = {};
  
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: filteredUpdates },
    { new: true, runValidators: true }
  ).select('-__v').lean();

  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  return user;
};

/**
 * Get transaction history with filters (legacy)
 * 
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated transactions
 * Requirements: 1.4
 */
const getTransactions = async (filters = {}) => {
  const {
    startDate,
    endDate,
    type,
    status,
    minAmount,
    maxAmount,
    page = 1,
    limit = 20
  } = filters;

  const matchStage = {};

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const pipeline = [
    { $match: matchStage },
    { $unwind: { path: '$payment.transactions', preserveNullAndEmptyArrays: false } },
  ];

  // Filter by transaction type
  if (type) {
    pipeline.push({ $match: { 'payment.transactions.type': type } });
  }

  // Filter by transaction status
  if (status) {
    pipeline.push({ $match: { 'payment.transactions.status': status } });
  }

  // Filter by amount range
  if (minAmount !== undefined || maxAmount !== undefined) {
    const amountMatch = {};
    if (minAmount !== undefined) amountMatch.$gte = minAmount;
    if (maxAmount !== undefined) amountMatch.$lte = maxAmount;
    pipeline.push({ $match: { 'payment.transactions.amount': amountMatch } });
  }

  // Sort by transaction date
  pipeline.push({ $sort: { 'payment.transactions.timestamp': -1 } });

  // Get total count
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await Trip.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Add pagination
  const skip = (page - 1) * limit;
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Project final shape
  pipeline.push({
    $project: {
      tripId: '$tripId',
      tripObjectId: '$_id',
      transaction: '$payment.transactions',
      tripStatus: '$status',
      createdAt: '$createdAt'
    }
  });

  const transactions = await Trip.aggregate(pipeline);

  return {
    transactions,
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
 * Get transactions with ride details from Transaction model
 * Supports filtering by date range, type, status, payment method, driver, passenger
 * 
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated transactions with ride details
 * Requirements: 9.1, 9.2, 9.3
 */
const getTransactionsWithRideDetails = async (filters = {}) => {
  const Transaction = require('../models/Transaction');
  
  const {
    startDate,
    endDate,
    type,
    status,
    paymentMethod,
    driverId,
    passengerId,
    minAmount,
    maxAmount,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 20
  } = filters;

  const query = {};

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Type filter
  if (type) {
    query.type = type;
  }

  // Status filter
  if (status) {
    query.status = status;
  }

  // Payment method filter
  if (paymentMethod) {
    query['paymentMethod.type'] = paymentMethod;
  }

  // Driver filter
  if (driverId) {
    query.driverId = driverId;
  }

  // Passenger filter
  if (passengerId) {
    query.userId = passengerId;
  }

  // Amount range filter
  if (minAmount !== undefined || maxAmount !== undefined) {
    query.amount = {};
    if (minAmount !== undefined) query.amount.$gte = minAmount;
    if (maxAmount !== undefined) query.amount.$lte = maxAmount;
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sortOptions = { [sortBy]: sortDirection };

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate('userId', 'name phone email')
      .populate('driverId', 'userId')
      .populate('bookingId', 'status seats')
      .populate('tripId', 'source destination departureTime status')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query)
  ]);

  // Enrich transactions with driver user info
  const enrichedTransactions = await Promise.all(
    transactions.map(async (txn) => {
      let driverInfo = null;
      if (txn.driverId?.userId) {
        const driverUser = await User.findById(txn.driverId.userId).select('name phone email').lean();
        driverInfo = driverUser;
      }
      return {
        ...txn,
        driverUser: driverInfo
      };
    })
  );

  return {
    transactions: enrichedTransactions,
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
 * Get transaction by ID with complete details
 * Returns Cashfree reference, payment method, fare breakdown, and ride details
 * 
 * @param {string} transactionId - Transaction ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Complete transaction details
 * Requirements: 9.4
 */
const getTransactionById = async (transactionId) => {
  const Transaction = require('../models/Transaction');
  
  let transaction;
  
  // Try to find by MongoDB ObjectId first
  if (transactionId.match(/^[0-9a-fA-F]{24}$/)) {
    transaction = await Transaction.findById(transactionId)
      .populate('userId', 'name phone email')
      .populate('driverId', 'userId verificationStatus rating')
      .populate('bookingId', 'status seats pickupPoint dropPoint')
      .populate('tripId', 'source destination departureTime status tripId')
      .lean();
  }
  
  // If not found, try by human-readable transactionId
  if (!transaction) {
    transaction = await Transaction.findOne({ transactionId })
      .populate('userId', 'name phone email')
      .populate('driverId', 'userId verificationStatus rating')
      .populate('bookingId', 'status seats pickupPoint dropPoint')
      .populate('tripId', 'source destination departureTime status tripId')
      .lean();
  }

  if (!transaction) {
    const error = new Error('Transaction not found');
    error.code = 'TRANSACTION_NOT_FOUND';
    throw error;
  }

  // Get driver user info
  let driverUser = null;
  if (transaction.driverId?.userId) {
    driverUser = await User.findById(transaction.driverId.userId).select('name phone email').lean();
  }

  return {
    ...transaction,
    driverUser
  };
};

/**
 * Export transactions as CSV or PDF
 * 
 * @param {Object} filters - Query filters including format
 * @returns {Promise<Object>} Export data
 * Requirements: 9.5
 */
const exportTransactions = async (filters = {}) => {
  const Transaction = require('../models/Transaction');
  
  const { startDate, endDate, type, status, format = 'csv' } = filters;

  const query = {};

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (type) query.type = type;
  if (status) query.status = status;

  const transactions = await Transaction.find(query)
    .populate('userId', 'name phone email')
    .populate('driverId', 'userId')
    .populate('tripId', 'source destination departureTime')
    .sort({ createdAt: -1 })
    .lean();

  // Enrich with driver user info
  const enrichedTransactions = await Promise.all(
    transactions.map(async (txn) => {
      let driverName = txn.rideDetails?.driverName || 'N/A';
      if (txn.driverId?.userId) {
        const driverUser = await User.findById(txn.driverId.userId).select('name').lean();
        if (driverUser) driverName = driverUser.name;
      }
      return { ...txn, driverName };
    })
  );

  if (format === 'csv') {
    return { data: generateTransactionCSV(enrichedTransactions) };
  } else {
    return { data: generateTransactionPDF(enrichedTransactions) };
  }
};

/**
 * Generate CSV content from transactions
 * @param {Array} transactions - Transaction records
 * @returns {string} CSV content
 */
const generateTransactionCSV = (transactions) => {
  const headers = [
    'Transaction ID',
    'Order ID',
    'Type',
    'Status',
    'Amount (INR)',
    'Base Fare',
    'Platform Fee',
    'Free Cancellation Fee',
    'Payment Method',
    'Passenger Name',
    'Passenger Phone',
    'Driver Name',
    'Origin',
    'Destination',
    'Departure Time',
    'Cashfree Reference',
    'Created At'
  ];

  const rows = transactions.map(txn => [
    txn.transactionId || '',
    txn.orderId || '',
    txn.type || '',
    txn.status || '',
    txn.amount || 0,
    txn.breakdown?.baseFare || 0,
    txn.breakdown?.platformFee || 0,
    txn.breakdown?.freeCancellationFee || 0,
    txn.paymentMethod?.type || 'N/A',
    txn.userId?.name || txn.rideDetails?.passengerName || 'N/A',
    txn.userId?.phone || 'N/A',
    txn.driverName || 'N/A',
    txn.rideDetails?.origin || txn.tripId?.source?.address || 'N/A',
    txn.rideDetails?.destination || txn.tripId?.destination?.address || 'N/A',
    txn.rideDetails?.departureTime || txn.tripId?.departureTime || 'N/A',
    txn.cashfreeData?.referenceId || txn.cashfreeData?.paymentId || 'N/A',
    txn.createdAt ? new Date(txn.createdAt).toISOString() : ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Generate PDF content from transactions
 * Returns a simple text-based PDF representation
 * @param {Array} transactions - Transaction records
 * @returns {Buffer} PDF buffer
 */
const generateTransactionPDF = (transactions) => {
  // Simple PDF generation - in production, use a library like pdfkit or puppeteer
  const summary = {
    totalTransactions: transactions.length,
    totalAmount: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
    byType: {},
    byStatus: {}
  };

  transactions.forEach(txn => {
    summary.byType[txn.type] = (summary.byType[txn.type] || 0) + 1;
    summary.byStatus[txn.status] = (summary.byStatus[txn.status] || 0) + 1;
  });

  // Generate a simple text report (in production, use proper PDF library)
  const reportContent = `
HUSHRYD TRANSACTION REPORT
Generated: ${new Date().toISOString()}
=====================================

SUMMARY
-------
Total Transactions: ${summary.totalTransactions}
Total Amount: ₹${summary.totalAmount.toFixed(2)}

By Type:
${Object.entries(summary.byType).map(([type, count]) => `  ${type}: ${count}`).join('\n')}

By Status:
${Object.entries(summary.byStatus).map(([status, count]) => `  ${status}: ${count}`).join('\n')}

TRANSACTION DETAILS
-------------------
${transactions.map((txn, i) => `
${i + 1}. ${txn.transactionId}
   Type: ${txn.type} | Status: ${txn.status} | Amount: ₹${txn.amount}
   Passenger: ${txn.userId?.name || txn.rideDetails?.passengerName || 'N/A'}
   Driver: ${txn.driverName || 'N/A'}
   Route: ${txn.rideDetails?.origin || 'N/A'} → ${txn.rideDetails?.destination || 'N/A'}
   Date: ${txn.createdAt ? new Date(txn.createdAt).toLocaleString() : 'N/A'}
`).join('\n')}
`;

  return Buffer.from(reportContent, 'utf-8');
};

/**
 * Get support tickets with filters
 * 
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated tickets
 * Requirements: 1.5
 */
const getSupportTickets = async (filters = {}) => {
  const {
    priority,
    status,
    category,
    assignedTo,
    page = 1,
    limit = 20
  } = filters;

  const query = {};

  if (priority) query.priority = priority;
  if (status) query.status = status;
  if (category) query.category = category;
  if (assignedTo) query.assignedTo = assignedTo;

  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .populate('userId', 'name phone email')
      .populate('assignedTo', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(query)
  ]);

  // Get ticket stats
  const stats = await SupportTicket.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const ticketStats = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  stats.forEach(s => { ticketStats[s._id] = s.count; });

  return {
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
 * Get analytics data for dashboard
 * 
 * @param {Object} options - Date range options
 * @returns {Promise<Object>} Analytics data
 * Requirements: 1.6
 */
const getAnalytics = async (options = {}) => {
  const { startDate, endDate, period = 'daily' } = options;
  
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Revenue trends
  const revenueTrends = await Trip.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
        },
        revenue: { $sum: '$payment.totalCollected' },
        trips: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // User growth
  const userGrowth = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        newUsers: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Trip analytics by status
  const tripsByStatus = await Trip.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Top routes
  const topRoutes = await Trip.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          source: '$source.address',
          destination: '$destination.address'
        },
        tripCount: { $sum: 1 },
        totalRevenue: { $sum: '$payment.totalCollected' }
      }
    },
    { $sort: { tripCount: -1 } },
    { $limit: 10 }
  ]);

  return {
    revenueTrends,
    userGrowth,
    tripsByStatus,
    topRoutes,
    period: { start, end }
  };
};

/**
 * Log admin action to audit trail
 * 
 * @param {Object} params - Action parameters
 * @returns {Promise<Object>} Created audit log
 * Requirements: 1.7
 */
const logAdminAction = async (params) => {
  return AuditLog.logAction(params);
};

/**
 * Get audit logs with filters
 * 
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Paginated audit logs
 * Requirements: 1.7
 */
const getAuditLogs = async (filters = {}) => {
  return AuditLog.getAuditLogs(filters);
};

module.exports = {
  getDashboardMetrics,
  getUsers,
  getUserById,
  updateUser,
  getTransactions,
  getTransactionsWithRideDetails,
  getTransactionById,
  exportTransactions,
  getSupportTickets,
  getAnalytics,
  logAdminAction,
  getAuditLogs
};
