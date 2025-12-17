/**
 * Search Service
 * Implements ride search with geo-based matching, filtering, and sorting
 * 
 * Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 10.1, 10.5
 */

const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const { getPresignedUrl } = require('./s3Service');
const { getConfig } = require('../config/environment');
const { getWomenOnlyBadge, filterRidesForUser } = require('./womenOnlyRideService');

/**
 * Get the API base URL for constructing document URLs
 * @returns {string} API base URL
 */
const getApiBaseUrl = () => {
  const config = getConfig('server');
  return config?.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:5000';
};

/**
 * Resolve document URL from either S3 key or legacy URL
 * Handles three scenarios:
 * 1. S3 configured and s3Key exists -> generate presigned URL
 * 2. Legacy url field exists -> ensure it's absolute (preferred fallback)
 * 3. S3 not configured but s3Key exists -> return null (file not accessible locally)
 * 
 * @param {Object} doc - Document object with url and/or s3Key
 * @returns {Promise<string|null>} Resolved URL or null
 */
const resolveDocumentUrl = async (doc) => {
  if (!doc) return null;
  
  const apiBaseUrl = getApiBaseUrl();
  
  /**
   * Helper to resolve a URL string to absolute
   */
  const makeAbsolute = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/')) {
      return `${apiBaseUrl}${url}`;
    }
    return `${apiBaseUrl}/${url}`;
  };
  
  // If we have an S3 key, try to generate a presigned URL
  if (doc.s3Key) {
    try {
      const { url } = await getPresignedUrl(doc.s3Key);
      return url;
    } catch (error) {
      // S3 not configured or error - fall through to legacy URL
      console.warn('S3 presigned URL failed:', error.message);
    }
  }
  
  // If we have a legacy URL, use it (this is the local file path)
  if (doc.url) {
    return makeAbsolute(doc.url);
  }
  
  // No accessible URL available
  return null;
};

// Default search radius in kilometers
const DEFAULT_SEARCH_RADIUS_KM = 5;

// Earth radius in kilometers for Haversine formula
const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} coord1 - First coordinate {lat, lng}
 * @param {Object} coord2 - Second coordinate {lat, lng}
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (coord1, coord2) => {
  const lat1 = coord1.lat * Math.PI / 180;
  const lat2 = coord2.lat * Math.PI / 180;
  const deltaLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const deltaLng = (coord2.lng - coord1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
};

/**
 * Check if a trip matches the geo-search criteria
 * @param {Object} trip - Trip object
 * @param {Object} sourceCoords - Search source coordinates
 * @param {Object} destCoords - Search destination coordinates
 * @param {number} radiusKm - Search radius in km
 * @returns {Object} Match result with distances
 */
const matchesGeoSearch = (trip, sourceCoords, destCoords, radiusKm = DEFAULT_SEARCH_RADIUS_KM) => {
  const sourceDistance = calculateDistance(
    trip.source.coordinates,
    sourceCoords
  );
  const destDistance = calculateDistance(
    trip.destination.coordinates,
    destCoords
  );

  return {
    matches: sourceDistance <= radiusKm && destDistance <= radiusKm,
    sourceDistance,
    destDistance
  };
};


/**
 * Sort search results by specified criteria
 * Design Decision: Support multiple sort options for user preference
 * 
 * @param {Array} trips - Array of trips to sort
 * @param {string} sortBy - Sort criteria: 'departure', 'fare', 'rating', 'departureTime', 'farePerSeat', 'duration'
 * @param {string} sortOrder - Sort order: 'asc' or 'desc'
 * @returns {Array} Sorted trips
 * 
 * Requirements: 4.2
 */
const sortSearchResults = (trips, sortBy = 'departure', sortOrder = 'asc') => {
  const sortedTrips = [...trips];
  
  sortedTrips.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'departure':
      case 'departureTime':
        comparison = new Date(a.scheduledAt) - new Date(b.scheduledAt);
        break;
      case 'fare':
      case 'farePerSeat':
        comparison = (a.farePerSeat || 0) - (b.farePerSeat || 0);
        break;
      case 'rating':
        comparison = (a.driverRating || 0) - (b.driverRating || 0);
        break;
      case 'duration':
        // Sort by estimated duration if available, otherwise by departure
        comparison = (a.estimatedDuration || 0) - (b.estimatedDuration || 0);
        break;
      default:
        comparison = new Date(a.scheduledAt) - new Date(b.scheduledAt);
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  return sortedTrips;
};

/**
 * Get hour ranges for departure time filters
 * @param {string} timeFilter - Time filter value (before_06, 06_12, 12_18, after_18)
 * @returns {Object} Object with startHour and endHour
 * 
 * Requirements: 5.2
 */
const getTimeRange = (timeFilter) => {
  switch (timeFilter) {
    case 'before_06':
      return { startHour: 0, endHour: 6 };
    case '06_12':
      return { startHour: 6, endHour: 12 };
    case '12_18':
      return { startHour: 12, endHour: 18 };
    case 'after_18':
      return { startHour: 18, endHour: 24 };
    default:
      return null;
  }
};

/**
 * Check if a trip's departure time falls within any of the selected time ranges
 * @param {Date} scheduledAt - Trip's scheduled departure time
 * @param {Array} departureTimeFilters - Array of time filter values
 * @returns {boolean} True if trip matches any of the time ranges
 * 
 * Requirements: 5.2
 */
const matchesDepartureTimeFilter = (scheduledAt, departureTimeFilters) => {
  if (!departureTimeFilters || departureTimeFilters.length === 0) {
    return true; // No filter applied, include all
  }
  
  const tripDate = new Date(scheduledAt);
  const tripHour = tripDate.getHours();
  
  // Check if trip hour falls within any of the selected time ranges
  return departureTimeFilters.some(filter => {
    const range = getTimeRange(filter);
    if (!range) return false;
    // For before_06: 0 <= hour < 6
    // For 06_12: 6 <= hour < 12
    // For 12_18: 12 <= hour < 18
    // For after_18: 18 <= hour < 24
    return tripHour >= range.startHour && tripHour < range.endHour;
  });
};

/**
 * Check if a trip has all the required amenities (AND logic)
 * @param {Object} trip - Trip object
 * @param {Array} amenityFilters - Array of required amenities
 * @returns {boolean} True if trip has ALL required amenities
 * 
 * Requirements: 5.3, 5.5, 10.1
 */
const matchesAmenityFilter = (trip, amenityFilters) => {
  if (!amenityFilters || amenityFilters.length === 0) {
    return true; // No filter applied, include all
  }
  
  // Check each required amenity - ALL must match (AND logic)
  return amenityFilters.every(amenity => {
    switch (amenity) {
      case 'max_2_back':
        // Check if vehicle has max 2 in back seat setting or available seats <= 2
        return trip.maxBackSeats === 2 || trip.availableSeats <= 2;
      case 'instant_approval':
        return trip.instantBooking === true;
      case 'pets_allowed':
        return trip.petsAllowed === true;
      case 'smoking_allowed':
        return trip.smokingAllowed === true;
      case 'women_only':
        // Filter for women-only rides (Requirements 10.1)
        return trip.isWomenOnly === true || trip.ladiesOnly === true;
      default:
        return true;
    }
  });
};

/**
 * Filter trips by additional criteria
 * @param {Array} trips - Array of trips to filter
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered trips
 * 
 * Requirements: 4.3, 5.1, 5.2, 5.3, 5.5
 */
const filterTrips = (trips, filters = {}) => {
  let filteredTrips = [...trips];
  
  // Filter by vehicle type
  if (filters.vehicleType) {
    filteredTrips = filteredTrips.filter(trip => 
      trip.vehicleType === filters.vehicleType
    );
  }
  
  // Filter by max fare
  if (filters.maxFare !== undefined && filters.maxFare !== null) {
    filteredTrips = filteredTrips.filter(trip => 
      (trip.farePerSeat || 0) <= filters.maxFare
    );
  }
  
  // Filter by min rating
  if (filters.minRating !== undefined && filters.minRating !== null) {
    filteredTrips = filteredTrips.filter(trip => 
      (trip.driverRating || 0) >= filters.minRating
    );
  }
  
  // Filter by minimum available seats
  if (filters.seats !== undefined && filters.seats !== null) {
    filteredTrips = filteredTrips.filter(trip => 
      (trip.availableSeats || 0) >= filters.seats
    );
  }
  
  // Filter by departure time ranges - Requirements: 5.2
  if (filters.departureTime && filters.departureTime.length > 0) {
    filteredTrips = filteredTrips.filter(trip => 
      matchesDepartureTimeFilter(trip.scheduledAt, filters.departureTime)
    );
  }
  
  // Filter by amenities with AND logic - Requirements: 5.3, 5.5
  if (filters.amenities && filters.amenities.length > 0) {
    filteredTrips = filteredTrips.filter(trip => 
      matchesAmenityFilter(trip, filters.amenities)
    );
  }
  
  return filteredTrips;
};


/**
 * Search for available rides
 * Design Decision: Support both geo-based and text-based search
 * Rationale: Allows flexible search options for users
 * 
 * SECURITY: This function excludes sensitive driver information from results:
 * - Driver phone number, email (from User model)
 * - Driver documents, bank details, license info (from Driver model)
 * - Vehicle registration number, insurance expiry (from Vehicle schema)
 * 
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} Search results with trips
 * 
 * Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3
 */
const searchRides = async (searchParams) => {
  const {
    sourceCoords,
    destCoords,
    from,
    to,
    date,
    seats = 1,
    vehicleType,
    maxFare,
    minRating,
    sortBy = 'departure',
    sortOrder = 'asc',
    page = 1,
    limit = 20,
    radiusKm = DEFAULT_SEARCH_RADIUS_KM,
    departureTime,
    amenities
  } = searchParams;

  // Determine search mode: geo-based or text-based
  const hasGeoSearch = sourceCoords?.lat && sourceCoords?.lng && destCoords?.lat && destCoords?.lng;
  const hasTextSearch = from || to;

  // Build base query for scheduled trips
  const query = {
    status: 'scheduled'
  };

  // Date filter - search for trips on the specified date
  if (date) {
    const searchDate = new Date(date);
    const startOfDay = new Date(searchDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(searchDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.scheduledAt = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  } else {
    // Default: search for all future trips (from start of today)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    query.scheduledAt = { $gte: startOfToday };
  }

  // Text-based search on source/destination addresses
  if (hasTextSearch) {
    if (from) {
      query['source.address'] = { $regex: from, $options: 'i' };
    }
    if (to) {
      query['destination.address'] = { $regex: to, $options: 'i' };
    }
  }

  // SECURITY: Only select safe fields from Driver model
  // Excludes: documents, bankDetails, licenseNumber, licenseExpiry, earnings
  const driverSafeFields = 'userId rating totalTrips vehicles verificationStatus';
  
  // SECURITY: Only select safe fields from User model
  // Excludes: phone, email, healthInfo, emergencyContacts, kycDocuments
  const userSafeFields = 'name profilePhoto';

  // Fetch trips with driver info
  const trips = await Trip.find(query)
    .populate({
      path: 'driver',
      select: driverSafeFields,
      populate: {
        path: 'userId',
        select: userSafeFields
      }
    })
    .lean();

  // Calculate available seats and fare per seat for each trip
  const tripsWithDetails = await Promise.all(trips.map(async (trip) => {
    const bookedSeats = trip.passengers?.reduce((sum, p) => sum + p.seats, 0) || 0;
    // Use availableSeats from trip if set, otherwise default to 4 seats minus booked
    // This ensures trips without explicit availableSeats still show up in search
    const defaultTotalSeats = 4;
    const totalSeats = trip.availableSeats !== undefined 
      ? trip.availableSeats + bookedSeats 
      : defaultTotalSeats;
    const availableSeats = trip.availableSeats !== undefined 
      ? trip.availableSeats 
      : Math.max(0, defaultTotalSeats - bookedSeats);
    const farePerSeat = trip.farePerSeat || (trip.fare?.total ? Math.round(trip.fare.total / Math.max(1, totalSeats)) : 0);

    // Get vehicle details - SECURITY: Only extract safe fields
    let safeVehicleDetails = null;
    let vehicleType = null;
    if (trip.driver?.vehicles && trip.vehicle) {
      const vehicle = trip.driver.vehicles.find(v => 
        v._id.toString() === trip.vehicle.toString()
      );
      if (vehicle) {
        // SECURITY: Exclude registrationNumber, insuranceExpiry, photos
        safeVehicleDetails = {
          type: vehicle.type,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color
        };
        vehicleType = vehicle.type;
      }
    }

    return {
      ...trip,
      availableSeats,
      farePerSeat,
      vehicleType,
      vehicleDetails: safeVehicleDetails,
      driverRating: trip.driver?.rating || 0,
      driverName: trip.driver?.userId?.name || 'Unknown',
      driverPhoto: trip.driver?.userId?.profilePhoto || null,
      driverTotalTrips: trip.driver?.totalTrips || 0,
      driverVerified: trip.driver?.verificationStatus === 'verified',
      instantBooking: trip.instantBooking || false,
      ladiesOnly: trip.ladiesOnly || false,
      // Amenity fields for filtering - Requirements: 5.3
      petsAllowed: trip.petsAllowed || false,
      smokingAllowed: trip.smokingAllowed || false,
      maxBackSeats: trip.maxBackSeats || null
    };
  }));

  // Apply geo-search filter only if coordinates are provided
  let geoFilteredTrips;
  if (hasGeoSearch) {
    geoFilteredTrips = tripsWithDetails.filter(trip => {
      // Skip trips without coordinates
      if (!trip.source?.coordinates?.lat || !trip.source?.coordinates?.lng ||
          !trip.destination?.coordinates?.lat || !trip.destination?.coordinates?.lng) {
        // Include trips without coordinates but mark distance as unknown
        trip.sourceDistance = null;
        trip.destDistance = null;
        return true; // Include in results but without distance filtering
      }
      const geoMatch = matchesGeoSearch(trip, sourceCoords, destCoords, radiusKm);
      if (geoMatch.matches) {
        trip.sourceDistance = geoMatch.sourceDistance;
        trip.destDistance = geoMatch.destDistance;
        return true;
      }
      return false;
    });
  } else {
    // No geo filter - use all trips (already filtered by text search in query)
    geoFilteredTrips = tripsWithDetails.map(trip => ({
      ...trip,
      sourceDistance: 0,
      destDistance: 0
    }));
  }

  // Filter out trips with zero available seats (Requirement 2.1)
  // This ensures only trips with availableSeats > 0 are returned
  const tripsWithAvailableSeats = geoFilteredTrips.filter(trip => 
    trip.availableSeats > 0
  );

  // Parse departure time filter (comma-separated string to array)
  const departureTimeFilters = departureTime 
    ? (typeof departureTime === 'string' ? departureTime.split(',') : departureTime)
    : [];
  
  // Parse amenities filter (comma-separated string to array)
  const amenityFilters = amenities 
    ? (typeof amenities === 'string' ? amenities.split(',') : amenities)
    : [];

  // Apply additional filters - Requirements: 5.1, 5.2, 5.3, 5.5
  const filteredTrips = filterTrips(tripsWithAvailableSeats, {
    vehicleType,
    maxFare,
    minRating,
    seats,
    departureTime: departureTimeFilters,
    amenities: amenityFilters
  });

  // Sort results
  const sortedTrips = sortSearchResults(filteredTrips, sortBy, sortOrder);

  // Paginate
  const total = sortedTrips.length;
  const skip = (page - 1) * limit;
  const paginatedTrips = sortedTrips.slice(skip, skip + limit);

  // Format response - SECURITY: Explicitly construct safe response objects
  // This ensures no sensitive data leaks through even if internal objects change
  const formattedTrips = paginatedTrips.map(trip => {
    // Get women-only badge information (Requirements 10.1, 10.5)
    const womenOnlyBadge = getWomenOnlyBadge(trip);
    const isWomenOnly = trip.isWomenOnly || trip.ladiesOnly;
    
    return {
      _id: trip._id?.toString?.() || String(trip._id),
      tripId: trip.tripId,
      source: trip.source,
      destination: trip.destination,
      scheduledAt: trip.scheduledAt,
      availableSeats: trip.availableSeats,
      farePerSeat: trip.farePerSeat,
      fare: {
        baseFare: trip.fare?.baseFare || 0,
        distanceCharge: trip.fare?.distanceCharge || 0,
        tollCharges: trip.fare?.tollCharges || 0,
        platformFee: trip.fare?.platformFee || 0,
        taxes: trip.fare?.taxes || 0,
        total: trip.fare?.total || 0
      },
      // SECURITY: Only include safe driver fields per Requirement 3.4
      driver: {
        name: trip.driverName,
        photo: trip.driverPhoto,
        rating: trip.driverRating,
        totalTrips: trip.driverTotalTrips,
        verified: trip.driverVerified
      },
      // SECURITY: Only include safe vehicle fields, excludes registrationNumber, insuranceExpiry
      vehicle: trip.vehicleDetails,
      // Trip flags for badges - Requirements 2.1, 2.2, 2.3, 10.1, 10.5
      instantBooking: trip.instantBooking,
      ladiesOnly: trip.ladiesOnly,
      // Women-only ride privacy indicators (Requirements 10.1, 10.5)
      isWomenOnly,
      womenOnlyBadge: womenOnlyBadge ? womenOnlyBadge.text : null,
      womenOnlyDescription: womenOnlyBadge ? womenOnlyBadge.description : null,
      privacyIndicators: isWomenOnly ? {
        badge: 'Women-Only',
        icon: 'shield-check',
        color: 'pink',
        tooltip: 'This ride is exclusively for women passengers for safety and privacy.'
      } : null,
      sourceDistance: Math.round(trip.sourceDistance * 100) / 100,
      destDistance: Math.round(trip.destDistance * 100) / 100
    };
  });

  return {
    success: true,
    trips: formattedTrips,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    },
    searchParams: {
      radiusKm,
      sortBy,
      sortOrder
    }
  };
};


/**
 * Regex patterns for valid trip ID formats
 * MongoDB ObjectId: 24 hexadecimal characters
 * Human-readable Trip ID: HR-YYYY-NNNNNN format
 * 
 * Requirements: 4.1, 4.2, 4.3
 */
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const TRIP_ID_REGEX = /^HR-\d{4}-\d{6}$/;

/**
 * Validate if the provided ID is a valid trip identifier format
 * @param {string} id - The trip ID to validate
 * @returns {Object} Validation result with isValid flag and idType
 * 
 * Requirements: 4.3
 */
const validateTripIdFormat = (id) => {
  // Check for null, undefined, or empty values
  if (!id || id === 'undefined' || id === 'null') {
    return { isValid: false, error: 'Trip ID is required' };
  }

  // Ensure it's a string
  const tripId = String(id).trim();
  
  if (tripId.length === 0) {
    return { isValid: false, error: 'Trip ID cannot be empty' };
  }

  // Check if it matches either valid format
  const isValidObjectId = OBJECT_ID_REGEX.test(tripId);
  const isValidTripId = TRIP_ID_REGEX.test(tripId);

  if (!isValidObjectId && !isValidTripId) {
    return { 
      isValid: false, 
      error: 'Invalid trip ID format',
      idType: null
    };
  }

  return { 
    isValid: true, 
    tripId,
    idType: isValidObjectId ? 'objectId' : 'tripId'
  };
};

/**
 * Get public trip details for passengers
 * Design Decision: Return trip info with driver profile, selfie, and vehicle photos
 * 
 * SECURITY: This function explicitly excludes sensitive driver information:
 * - Driver phone number (from User model)
 * - Driver email (from User model)
 * - Driver bank details (from Driver model)
 * - Driver license number (from Driver model)
 * 
 * But INCLUDES public-facing information:
 * - Driver profile photo
 * - Driver selfie with car (for verification display)
 * - Vehicle photos
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object>} Public trip details
 * 
 * Requirements: 3.1, 3.2, 3.4, 4.3
 */
const getPublicTripDetails = async (tripId) => {
  // Validate trip ID format first - Requirements: 4.3
  const validation = validateTripIdFormat(tripId);
  if (!validation.isValid) {
    const error = new Error(validation.error);
    error.code = 'INVALID_TRIP_ID';
    error.statusCode = 400;
    throw error;
  }

  let trip;

  // Define fields to select from Driver model
  // Include documents for selfie_with_car and vehicle_photo extraction
  const driverFields = 'userId rating totalTrips vehicles verificationStatus documents';
  
  // Define safe fields to select from User model
  // SECURITY: Explicitly exclude sensitive fields: phone, email, healthInfo, emergencyContacts, kycDocuments
  const userSafeFields = 'name profilePhoto';

  // Try to find by MongoDB ObjectId first - Requirements: 4.1
  if (validation.idType === 'objectId') {
    trip = await Trip.findById(validation.tripId)
      .populate({
        path: 'driver',
        select: driverFields,
        populate: {
          path: 'userId',
          select: userSafeFields
        }
      })
      .lean();
  }

  // Fallback to human-readable tripId - Requirements: 4.2
  if (!trip) {
    trip = await Trip.findOne({ tripId: validation.tripId })
      .populate({
        path: 'driver',
        select: driverFields,
        populate: {
          path: 'userId',
          select: userSafeFields
        }
      })
      .lean();
  }

  // Return 404 if trip not found by either method - Requirements: 4.3
  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Calculate available seats - use trip's availableSeats if set, default to 4
  const bookedSeats = trip.passengers?.reduce((sum, p) => sum + p.seats, 0) || 0;
  const defaultTotalSeats = 4;
  const totalSeats = trip.availableSeats !== undefined 
    ? trip.availableSeats + bookedSeats 
    : defaultTotalSeats;
  const availableSeats = trip.availableSeats !== undefined 
    ? trip.availableSeats 
    : Math.max(0, defaultTotalSeats - bookedSeats);
  const farePerSeat = trip.farePerSeat || (trip.fare?.total ? Math.round(trip.fare.total / Math.max(1, totalSeats)) : 0);

  // Get vehicle details including photos
  let vehicleDetails = null;
  if (trip.driver?.vehicles && trip.vehicle) {
    const vehicle = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
    if (vehicle) {
      // Include vehicle photos for passenger view
      vehicleDetails = {
        type: vehicle.type,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        seats: vehicle.seats,
        year: vehicle.year,
        photos: vehicle.photos || []
      };
    }
  }

  // Extract driver selfie with car from documents (only approved ones)
  let driverSelfie = null;
  let vehiclePhotos = [];
  if (trip.driver?.documents) {
    const selfieDoc = trip.driver.documents.find(
      doc => doc.type === 'selfie_with_car' && doc.status === 'approved'
    );
    if (selfieDoc) {
      // Resolve the document URL properly (handles S3 keys and legacy URLs)
      driverSelfie = await resolveDocumentUrl(selfieDoc);
    }
    
    // Get vehicle photos from documents
    const vehiclePhotoDoc = trip.driver.documents.find(
      doc => doc.type === 'vehicle_photo' && doc.status === 'approved'
    );
    if (vehiclePhotoDoc) {
      // Resolve the document URL properly (handles S3 keys and legacy URLs)
      const vehiclePhotoUrl = await resolveDocumentUrl(vehiclePhotoDoc);
      if (vehiclePhotoUrl) {
        vehiclePhotos.push(vehiclePhotoUrl);
      }
    }
  }

  // Build driver object with profile and selfie
  const safeDriver = {
    name: trip.driver?.userId?.name || 'Unknown',
    photo: trip.driver?.userId?.profilePhoto || null,
    selfie: driverSelfie,
    rating: trip.driver?.rating || 0,
    totalTrips: trip.driver?.totalTrips || 0,
    verified: trip.driver?.verificationStatus === 'verified'
  };

  // Build route information - Requirements 3.1, 3.2
  const routeInfo = trip.route ? {
    distance: trip.route.distance,
    duration: trip.route.duration,
    polyline: trip.route.polyline
  } : null;

  // Build fare breakdown - Requirements 3.1, 3.2
  const fareBreakdown = {
    baseFare: trip.fare?.baseFare || 0,
    distanceCharge: trip.fare?.distanceCharge || 0,
    tollCharges: trip.fare?.tollCharges || 0,
    platformFee: trip.fare?.platformFee || 0,
    taxes: trip.fare?.taxes || 0,
    total: trip.fare?.total || 0
  };

  return {
    success: true,
    trip: {
      _id: trip._id,
      tripId: trip.tripId,
      source: trip.source,
      destination: trip.destination,
      route: routeInfo,
      scheduledAt: trip.scheduledAt,
      status: trip.status,
      availableSeats,
      farePerSeat,
      fare: fareBreakdown,
      driver: safeDriver,
      vehicle: vehicleDetails
    }
  };
};

module.exports = {
  calculateDistance,
  matchesGeoSearch,
  sortSearchResults,
  filterTrips,
  searchRides,
  getPublicTripDetails,
  DEFAULT_SEARCH_RADIUS_KM,
  // Export for testing - Requirements: 5.1, 5.2, 5.3
  getTimeRange,
  matchesDepartureTimeFilter,
  matchesAmenityFilter
};
