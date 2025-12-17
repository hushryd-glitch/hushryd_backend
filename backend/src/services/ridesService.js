/**
 * Rides Service
 * Implements paginated rides query with filters, trip detail retrieval, and search
 * 
 * Requirements: 4.1, 4.2, 4.3
 */

const Trip = require('../models/Trip');
const User = require('../models/User');
const Driver = require('../models/Driver');

/**
 * Default pagination settings
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Get paginated list of rides with filters
 * Design Decision: Support multiple filter types with efficient MongoDB queries
 * Rationale: Enables admin to quickly find and manage trips
 * 
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.limit - Items per page
 * @param {string} options.status - Filter by trip status
 * @param {Date} options.startDate - Filter trips scheduled after this date
 * @param {Date} options.endDate - Filter trips scheduled before this date
 * @param {string} options.search - Search by tripId, passenger name, or driver name
 * @returns {Promise<Object>} Paginated rides with metadata
 */
const getRides = async ({
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
  status,
  startDate,
  endDate,
  search
} = {}) => {
  // Validate and sanitize pagination
  const sanitizedPage = Math.max(1, parseInt(page, 10) || DEFAULT_PAGE);
  const sanitizedLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const skip = (sanitizedPage - 1) * sanitizedLimit;

  // Build query
  const query = {};

  // Status filter
  if (status) {
    const validStatuses = ['scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled'];
    if (validStatuses.includes(status)) {
      query.status = status;
    }
  }

  // Date range filter
  if (startDate || endDate) {
    query.scheduledAt = {};
    if (startDate) {
      query.scheduledAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.scheduledAt.$lte = new Date(endDate);
    }
  }


  // Search filter - requires aggregation for passenger/driver name search
  let rides;
  let total;

  if (search && search.trim()) {
    const searchTerm = search.trim();
    
    // First, try to find by tripId (exact or partial match)
    const tripIdQuery = { ...query, tripId: { $regex: searchTerm, $options: 'i' } };
    const tripIdMatches = await Trip.find(tripIdQuery)
      .populate('driver')
      .populate('passengers.userId', 'name phone email')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(sanitizedLimit)
      .lean();

    if (tripIdMatches.length > 0) {
      rides = tripIdMatches;
      total = await Trip.countDocuments(tripIdQuery);
    } else {
      // Search by passenger name
      const matchingUsers = await User.find({
        name: { $regex: searchTerm, $options: 'i' }
      }).select('_id').lean();
      
      const userIds = matchingUsers.map(u => u._id);
      
      // Search by driver name (through User linked to Driver)
      const matchingDriverUsers = await User.find({
        name: { $regex: searchTerm, $options: 'i' }
      }).select('_id').lean();
      
      const matchingDrivers = await Driver.find({
        userId: { $in: matchingDriverUsers.map(u => u._id) }
      }).select('_id').lean();
      
      const driverIds = matchingDrivers.map(d => d._id);

      // Build search query
      const searchQuery = {
        ...query,
        $or: [
          { 'passengers.userId': { $in: userIds } },
          { driver: { $in: driverIds } }
        ]
      };

      rides = await Trip.find(searchQuery)
        .populate('driver')
        .populate('passengers.userId', 'name phone email')
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(sanitizedLimit)
        .lean();

      total = await Trip.countDocuments(searchQuery);
    }
  } else {
    // No search - simple query
    rides = await Trip.find(query)
      .populate('driver')
      .populate('passengers.userId', 'name phone email')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(sanitizedLimit)
      .lean();

    total = await Trip.countDocuments(query);
  }

  // Populate driver user info and transform data for frontend
  for (const ride of rides) {
    if (ride.driver && ride.driver.userId) {
      const driverUserId = ride.driver.userId?._id?.toString() || ride.driver.userId?.toString();
      const driverUser = await User.findById(driverUserId)
        .select('name phone email')
        .lean();
      ride.driverInfo = driverUser;
      // Add flattened fields for frontend compatibility
      ride.driverName = driverUser?.name || null;
      ride.driverPhone = driverUser?.phone || null;
    }
    // Add vehicle number from driver's vehicles
    if (ride.driver?.vehicles?.length > 0 && ride.vehicle) {
      const vehicle = ride.driver.vehicles.find(v => v._id?.toString() === ride.vehicle?.toString());
      ride.vehicleNumber = vehicle?.registrationNumber || null;
    }
    // Transform passenger data for frontend
    if (ride.passengers?.length > 0) {
      ride.passengers = ride.passengers.map(p => ({
        ...p,
        name: p.userId?.name || null,
        phone: p.userId?.phone || null,
        email: p.userId?.email || null,
      }));
    }
  }

  return {
    rides,
    pagination: {
      page: sanitizedPage,
      limit: sanitizedLimit,
      total,
      totalPages: Math.ceil(total / sanitizedLimit),
      hasNextPage: sanitizedPage * sanitizedLimit < total,
      hasPrevPage: sanitizedPage > 1
    }
  };
};

/**
 * Get complete trip details by ID
 * Design Decision: Return all related data in single response
 * Rationale: Admin needs complete picture for decision making
 * 
 * @param {string} tripId - Trip ID (MongoDB ObjectId or human-readable tripId)
 * @returns {Promise<Object>} Complete trip details
 */
const getTripById = async (tripId) => {
  // Try to find by MongoDB _id first, then by human-readable tripId
  let trip;
  
  if (tripId.match(/^[0-9a-fA-F]{24}$/)) {
    trip = await Trip.findById(tripId)
      .populate('driver')
      .populate('passengers.userId', 'name phone email gender emergencyContacts')
      .populate('cancelledBy', 'name phone email role')
      .lean();
  }
  
  if (!trip) {
    trip = await Trip.findOne({ tripId: tripId })
      .populate('driver')
      .populate('passengers.userId', 'name phone email gender emergencyContacts')
      .populate('cancelledBy', 'name phone email role')
      .lean();
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Get driver user info
  let driverInfo = null;
  if (trip.driver && trip.driver.userId) {
    const driverUserId = trip.driver.userId?._id?.toString() || trip.driver.userId?.toString();
    driverInfo = await User.findById(driverUserId)
      .select('name phone email gender')
      .lean();
  }

  // Get vehicle info from driver
  let vehicleInfo = null;
  if (trip.driver && trip.vehicle) {
    const vehicle = trip.driver.vehicles?.find(
      v => v._id.toString() === trip.vehicle.toString()
    );
    vehicleInfo = vehicle || null;
  }

  // Build status history from timestamps
  const statusHistory = [];
  if (trip.createdAt) {
    statusHistory.push({ status: 'created', timestamp: trip.createdAt });
  }
  if (trip.scheduledAt) {
    statusHistory.push({ status: 'scheduled', timestamp: trip.scheduledAt });
  }
  if (trip.startedAt) {
    statusHistory.push({ status: 'in_progress', timestamp: trip.startedAt });
  }
  if (trip.completedAt) {
    statusHistory.push({ status: 'completed', timestamp: trip.completedAt });
  }
  if (trip.status === 'cancelled' && trip.updatedAt) {
    statusHistory.push({ 
      status: 'cancelled', 
      timestamp: trip.updatedAt,
      reason: trip.cancellationReason,
      cancelledBy: trip.cancelledBy
    });
  }

  return {
    ...trip,
    driverInfo,
    vehicleInfo,
    statusHistory: statusHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  };
};

/**
 * Search trips by tripId, passenger name, or driver name
 * Design Decision: Unified search across multiple fields
 * Rationale: Admin should find trips quickly regardless of what info they have
 * 
 * @param {string} searchQuery - Search term
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Search results with pagination
 */
const searchTrips = async (searchQuery, options = {}) => {
  if (!searchQuery || !searchQuery.trim()) {
    return getRides(options);
  }

  return getRides({
    ...options,
    search: searchQuery
  });
};

module.exports = {
  getRides,
  getTripById,
  searchTrips,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
