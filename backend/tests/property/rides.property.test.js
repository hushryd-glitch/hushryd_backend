/**
 * Property-based tests for Rides Service
 * Tests pagination consistency and filter behavior
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Driver = require('../../src/models/Driver');
const { getRides, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = require('../../src/services/ridesService');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Trip.deleteMany({});
  await User.deleteMany({});
  await Driver.deleteMany({});
});

// Generators
const statusArbitrary = fc.constantFrom('scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled');
const pageArbitrary = fc.integer({ min: 1, max: 100 });
const limitArbitrary = fc.integer({ min: 1, max: MAX_LIMIT });

/**
 * Helper to create a valid trip with all required fields
 */
const createTestTrip = async (overrides = {}) => {
  // Create a user for passenger
  const user = new User({
    phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
    role: 'passenger'
  });
  await user.save();

  // Create a driver user
  const driverUser = new User({
    phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
    role: 'driver',
    name: overrides.driverName || 'Test Driver'
  });
  await driverUser.save();

  // Create a driver
  const driver = new Driver({
    userId: driverUser._id,
    licenseNumber: `DL${Date.now()}`,
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    verificationStatus: 'verified'
  });
  await driver.save();

  const tripId = await Trip.generateTripId();
  const totalFare = 1000;
  const payment = Trip.calculatePaymentBreakdown(totalFare);

  const trip = new Trip({
    tripId,
    driver: driver._id,
    passengers: [{
      userId: user._id,
      seats: 1,
      pickupPoint: {
        address: '123 Test St',
        coordinates: { lat: 28.6139, lng: 77.2090 }
      },
      dropPoint: {
        address: '456 Test Ave',
        coordinates: { lat: 28.7041, lng: 77.1025 }
      },
      fare: totalFare,
      paymentStatus: 'paid'
    }],
    source: {
      address: '123 Test St',
      coordinates: { lat: 28.6139, lng: 77.2090 }
    },
    destination: {
      address: '456 Test Ave',
      coordinates: { lat: 28.7041, lng: 77.1025 }
    },
    scheduledAt: overrides.scheduledAt || new Date(),
    status: overrides.status || 'scheduled',
    availableSeats: overrides.availableSeats || 4,
    farePerSeat: overrides.farePerSeat || 250,
    // New required fields for AbhiBus-style interface
    vehicleInfo: {
      type: 'ac',
      model: 'Toyota Innova',
      registrationNumber: 'KA01AB1234'
    },
    operator: {
      name: 'Test Operator'
    },
    routeData: {
      distance: 50,
      estimatedDuration: 90
    },
    pricing: {
      baseFare: 500,
      perKmRate: 8,
      totalSeats: 6,
      availableSeats: overrides.availableSeats || 4
    },
    fare: {
      baseFare: 500,
      distanceCharge: 400,
      tollCharges: 0,
      platformFee: 100,
      taxes: 0,
      total: totalFare
    },
    payment
  });

  await trip.save();
  return trip;
};

/**
 * Helper to create multiple trips
 */
const createMultipleTrips = async (count, overrides = {}) => {
  const trips = [];
  for (let i = 0; i < count; i++) {
    const trip = await createTestTrip({
      ...overrides,
      scheduledAt: new Date(Date.now() - i * 60000) // Stagger by 1 minute
    });
    trips.push(trip);
  }
  return trips;
};

describe('Rides Service - Property Tests', () => {
  // **Feature: hushryd-platform, Property 8: Rides List Pagination Consistency**
  // **Validates: Requirements 4.1**
  
  describe('Property 8: Rides List Pagination Consistency', () => {
    it('should return at most limit items for any valid pagination parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }), // numTrips to create
          limitArbitrary,
          pageArbitrary,
          async (numTrips, limit, page) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips
            await createMultipleTrips(numTrips);
            
            // Query with pagination
            const result = await getRides({ page, limit });
            
            // Result should contain at most limit items
            const hasAtMostLimit = result.rides.length <= limit;
            
            // Result should contain at most the total available
            const hasAtMostTotal = result.rides.length <= numTrips;
            
            return hasAtMostLimit && hasAtMostTotal;
          }
        ),
        { numRuns: 50 } // Reduced due to DB operations
      );
    }, 120000);

    it('should correctly reflect status filter in results', async () => {
      await fc.assert(
        fc.asyncProperty(
          statusArbitrary,
          fc.integer({ min: 1, max: 10 }),
          async (filterStatus, numTrips) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips with various statuses
            const statuses = ['scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled'];
            for (let i = 0; i < numTrips; i++) {
              await createTestTrip({ status: statuses[i % statuses.length] });
            }
            
            // Query with status filter
            const result = await getRides({ status: filterStatus });
            
            // All returned trips should have the filtered status
            const allMatchStatus = result.rides.every(ride => ride.status === filterStatus);
            
            return allMatchStatus;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should return correct pagination metadata', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 5 }),
          async (numTrips, limit, page) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips
            await createMultipleTrips(numTrips);
            
            // Query with pagination
            const result = await getRides({ page, limit });
            
            // Verify pagination metadata
            const expectedTotalPages = Math.ceil(numTrips / limit);
            const expectedHasNextPage = page * limit < numTrips;
            const expectedHasPrevPage = page > 1;
            
            const totalPagesCorrect = result.pagination.totalPages === expectedTotalPages;
            const totalCorrect = result.pagination.total === numTrips;
            const hasNextPageCorrect = result.pagination.hasNextPage === expectedHasNextPage;
            const hasPrevPageCorrect = result.pagination.hasPrevPage === expectedHasPrevPage;
            const pageCorrect = result.pagination.page === page;
            const limitCorrect = result.pagination.limit === Math.min(limit, MAX_LIMIT);
            
            return totalPagesCorrect && totalCorrect && hasNextPageCorrect && 
                   hasPrevPageCorrect && pageCorrect && limitCorrect;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should correctly filter by date range', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }),
          async (numTrips) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const now = new Date();
            const dayInMs = 24 * 60 * 60 * 1000;
            
            // Create trips spread across different dates
            for (let i = 0; i < numTrips; i++) {
              await createTestTrip({
                scheduledAt: new Date(now.getTime() - i * dayInMs)
              });
            }
            
            // Filter for trips in the last 3 days
            const startDate = new Date(now.getTime() - 3 * dayInMs);
            const endDate = now;
            
            const result = await getRides({ startDate, endDate });
            
            // All returned trips should be within the date range
            const allWithinRange = result.rides.every(ride => {
              const scheduledAt = new Date(ride.scheduledAt);
              return scheduledAt >= startDate && scheduledAt <= endDate;
            });
            
            return allWithinRange;
          }
        ),
        { numRuns: 30 }
      );
    }, 120000);

    it('should enforce maximum limit constraint', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: MAX_LIMIT + 1, max: MAX_LIMIT + 100 }),
          async (requestedLimit) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create more trips than MAX_LIMIT
            await createMultipleTrips(MAX_LIMIT + 10);
            
            // Query with limit exceeding MAX_LIMIT
            const result = await getRides({ limit: requestedLimit });
            
            // Should be capped at MAX_LIMIT
            return result.rides.length <= MAX_LIMIT && 
                   result.pagination.limit === MAX_LIMIT;
          }
        ),
        { numRuns: 10 } // Reduced due to large number of DB operations
      );
    }, 180000);

    it('should handle empty results gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          pageArbitrary,
          limitArbitrary,
          async (page, limit) => {
            // Clean up - ensure no trips exist
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Query empty database
            const result = await getRides({ page, limit });
            
            // Should return empty array with correct metadata
            const emptyRides = result.rides.length === 0;
            const zeroTotal = result.pagination.total === 0;
            const zeroPages = result.pagination.totalPages === 0;
            const noNextPage = result.pagination.hasNextPage === false;
            
            return emptyRides && zeroTotal && zeroPages && noNextPage;
          }
        ),
        { numRuns: 20 }
      );
    }, 60000);

    it('should return correct number of items for each page', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 25 }),
          fc.integer({ min: 3, max: 10 }),
          async (numTrips, limit) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips
            await createMultipleTrips(numTrips);
            
            const totalPages = Math.ceil(numTrips / limit);
            
            // Check each page
            for (let page = 1; page <= totalPages; page++) {
              const result = await getRides({ page, limit });
              
              const isLastPage = page === totalPages;
              const expectedCount = isLastPage 
                ? numTrips - (page - 1) * limit 
                : limit;
              
              if (result.rides.length !== expectedCount) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    }, 180000);
  });
});
