/**
 * Property-based tests for Admin Tracking Service
 * Tests admin dashboard trip visibility and filtering
 * Requirements: 4.1, 4.4
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Driver = require('../../src/models/Driver');
const SOSAlert = require('../../src/models/SOSAlert');
const {
  getActiveTrips,
  getTripDetails,
  filterTrips,
  getTripsWithSOSAlerts
} = require('../../src/services/adminTrackingService');

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
  await SOSAlert.deleteMany({});
});

// Generators
const coordinatesArbitrary = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true })
});

const tripStatusArbitrary = fc.constantFrom('scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled');
const activeStatusArbitrary = fc.constantFrom('scheduled', 'driver_assigned', 'in_progress');

// Helper to create a test driver
const createTestDriver = async () => {
  const user = new User({ 
    phone: `+9198765${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`, 
    role: 'driver',
    name: 'Test Driver'
  });
  await user.save();
  
  const driver = new Driver({
    userId: user._id,
    licenseNumber: `DL${Date.now()}${Math.floor(Math.random() * 1000)}`,
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    vehicles: [{
      registrationNumber: `KA01AB${Math.floor(Math.random() * 10000)}`,
      make: 'Toyota',
      model: 'Innova',
      year: 2022,
      color: 'White',
      type: 'suv',
      seats: 6,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }],
    verificationStatus: 'verified'
  });
  await driver.save();
  
  return { user, driver };
};

// Helper to create a test trip with specific status
const createTestTrip = async (status = 'in_progress', coordinates = null) => {
  const { driver } = await createTestDriver();
  
  const year = new Date().getFullYear();
  const randomSeq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
  const tripId = `HR-${year}-${randomSeq}`;
  
  const sourceCoords = coordinates || { lat: 12.9716, lng: 77.5946 };
  
  const trip = new Trip({
    tripId,
    driver: driver._id,
    vehicle: driver.vehicles[0]._id,
    source: {
      address: 'Test Source',
      coordinates: sourceCoords
    },
    destination: {
      address: 'Test Destination',
      coordinates: { lat: 13.0827, lng: 80.2707 }
    },
    scheduledAt: new Date(Date.now() + 3600000),
    startedAt: status === 'in_progress' ? new Date() : undefined,
    availableSeats: 3,
    farePerSeat: 500,
    fare: {
      baseFare: 100,
      distanceCharge: 300,
      tollCharges: 0,
      platformFee: 50,
      taxes: 50,
      total: 500
    },
    payment: {
      totalCollected: 0,
      platformCommission: 0,
      driverAdvance: 0,
      vaultAmount: 0,
      vaultStatus: 'locked'
    },
    status,
    tracking: coordinates ? [{
      coordinates,
      timestamp: new Date(),
      speed: 30
    }] : []
  });
  await trip.save();
  
  return { trip, driver };
};

describe('Admin Dashboard Trip Visibility - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 8: Admin Dashboard Trip Visibility**
  // **Validates: Requirements 4.1**
  
  describe('Property 8: Admin Dashboard Trip Visibility', () => {
    it('For any trip with status "in_progress", the trip SHALL appear in the admin active trips list', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (tripCount) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create multiple in_progress trips
            const createdTrips = [];
            for (let i = 0; i < tripCount; i++) {
              const { trip } = await createTestTrip('in_progress');
              createdTrips.push(trip);
            }
            
            // Get active trips from admin service
            const result = await getActiveTrips({ status: 'in_progress' });
            
            // Property: all in_progress trips should appear in the list
            const returnedTripIds = result.trips.map(t => t.tripId);
            const allTripsFound = createdTrips.every(t => 
              returnedTripIds.includes(t.tripId)
            );
            
            return allTripsFound && result.trips.length >= tripCount;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any trip with status "scheduled", the trip SHALL appear in the admin active trips list', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (tripCount) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create multiple scheduled trips
            const createdTrips = [];
            for (let i = 0; i < tripCount; i++) {
              const { trip } = await createTestTrip('scheduled');
              createdTrips.push(trip);
            }
            
            // Get active trips (default includes scheduled)
            const result = await getActiveTrips();
            
            // Property: all scheduled trips should appear in the list
            const returnedTripIds = result.trips.map(t => t.tripId);
            const allTripsFound = createdTrips.every(t => 
              returnedTripIds.includes(t.tripId)
            );
            
            return allTripsFound;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any trip with status "completed" or "cancelled", the trip SHALL NOT appear in active trips list', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('completed', 'cancelled'),
          async (status) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with completed/cancelled status
            const { trip } = await createTestTrip(status);
            
            // Get active trips
            const result = await getActiveTrips();
            
            // Property: completed/cancelled trips should NOT appear
            const returnedTripIds = result.trips.map(t => t.tripId);
            return !returnedTripIds.includes(trip.tripId);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any mix of trip statuses, only active trips SHALL appear in the active trips list', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(tripStatusArbitrary, { minLength: 3, maxLength: 10 }),
          async (statuses) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips with various statuses
            const createdTrips = [];
            for (const status of statuses) {
              const { trip } = await createTestTrip(status);
              createdTrips.push({ trip, status });
            }
            
            // Get active trips
            const result = await getActiveTrips();
            
            // Property: only active statuses should appear
            const activeStatuses = ['scheduled', 'driver_assigned', 'in_progress'];
            const expectedActiveTrips = createdTrips.filter(t => 
              activeStatuses.includes(t.status)
            );
            
            const returnedTripIds = result.trips.map(t => t.tripId);
            
            // All expected active trips should be present
            const allActiveFound = expectedActiveTrips.every(t => 
              returnedTripIds.includes(t.trip.tripId)
            );
            
            // No completed/cancelled trips should be present
            const noInactiveFound = createdTrips
              .filter(t => !activeStatuses.includes(t.status))
              .every(t => !returnedTripIds.includes(t.trip.tripId));
            
            return allActiveFound && noInactiveFound;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('getActiveTrips should return trips with required fields for dashboard display', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (tripCount) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips
            for (let i = 0; i < tripCount; i++) {
              await createTestTrip('in_progress');
            }
            
            // Get active trips
            const result = await getActiveTrips();
            
            // Property: each trip should have required fields
            return result.trips.every(trip => 
              trip._id !== undefined &&
              trip.tripId !== undefined &&
              trip.status !== undefined &&
              trip.source !== undefined &&
              trip.destination !== undefined &&
              'currentLocation' in trip &&
              'driver' in trip &&
              'hasActiveSOSAlert' in trip
            );
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});


describe('Trip Filtering Correctness - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 9: Trip Filtering Correctness**
  // **Validates: Requirements 4.4**
  
  describe('Property 9: Trip Filtering Correctness', () => {
    it('For any status filter, the filtered trip list SHALL contain only trips matching that status', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeStatusArbitrary,
          fc.array(tripStatusArbitrary, { minLength: 3, maxLength: 8 }),
          async (filterStatus, statuses) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips with various statuses
            const createdTrips = [];
            for (const status of statuses) {
              const { trip } = await createTestTrip(status);
              createdTrips.push({ trip, status });
            }
            
            // Filter by specific status
            const result = await filterTrips({ status: filterStatus });
            
            // Property: all returned trips should have the filtered status
            return result.trips.every(trip => trip.status === filterStatus);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('For any region filter, the filtered trip list SHALL contain only trips within that region', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            minLat: fc.double({ min: 10, max: 15, noNaN: true }),
            maxLat: fc.double({ min: 15, max: 20, noNaN: true }),
            minLng: fc.double({ min: 75, max: 78, noNaN: true }),
            maxLng: fc.double({ min: 78, max: 82, noNaN: true })
          }),
          async (region) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips inside the region
            const insideCoords = {
              lat: (region.minLat + region.maxLat) / 2,
              lng: (region.minLng + region.maxLng) / 2
            };
            const { trip: insideTrip } = await createTestTrip('in_progress', insideCoords);
            
            // Create trips outside the region
            const outsideCoords = {
              lat: region.maxLat + 10,
              lng: region.maxLng + 10
            };
            const { trip: outsideTrip } = await createTestTrip('in_progress', outsideCoords);
            
            // Filter by region
            const result = await filterTrips({ region });
            
            // Property: only trips within region should be returned
            const returnedTripIds = result.trips.map(t => t.tripId);
            
            // Inside trip should be found (if it has tracking data)
            // Outside trip should NOT be found
            const outsideNotFound = !returnedTripIds.includes(outsideTrip.tripId);
            
            return outsideNotFound;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any combination of region and status filters, results SHALL match ALL criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          activeStatusArbitrary,
          async (filterStatus) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const region = {
              minLat: 12,
              maxLat: 14,
              minLng: 77,
              maxLng: 79
            };
            
            // Create trip inside region with matching status
            const insideCoords = { lat: 13, lng: 78 };
            const { trip: matchingTrip } = await createTestTrip(filterStatus, insideCoords);
            
            // Create trip inside region with different status
            const differentStatus = filterStatus === 'in_progress' ? 'scheduled' : 'in_progress';
            const { trip: wrongStatusTrip } = await createTestTrip(differentStatus, insideCoords);
            
            // Create trip outside region with matching status
            const outsideCoords = { lat: 20, lng: 85 };
            const { trip: outsideTrip } = await createTestTrip(filterStatus, outsideCoords);
            
            // Filter by both region and status
            const result = await filterTrips({ region, status: filterStatus });
            
            // Property: results should match BOTH criteria
            const returnedTripIds = result.trips.map(t => t.tripId);
            
            // All returned trips should have correct status
            const allCorrectStatus = result.trips.every(t => t.status === filterStatus);
            
            // Outside trip should not be in results
            const outsideNotFound = !returnedTripIds.includes(outsideTrip.tripId);
            
            return allCorrectStatus && outsideNotFound;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any filter criteria, pagination SHALL work correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 5, max: 10 }),
          async (pageSize, tripCount) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create multiple trips
            for (let i = 0; i < tripCount; i++) {
              await createTestTrip('in_progress');
            }
            
            // Get first page
            const page1 = await filterTrips({ 
              status: 'in_progress', 
              page: 1, 
              limit: pageSize 
            });
            
            // Property: pagination should be correct
            const expectedPages = Math.ceil(tripCount / pageSize);
            
            return page1.pagination.page === 1 &&
                   page1.pagination.limit === pageSize &&
                   page1.trips.length <= pageSize;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('filterTrips with no filters should return all active trips', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(activeStatusArbitrary, { minLength: 2, maxLength: 5 }),
          async (statuses) => {
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips with active statuses
            const createdTrips = [];
            for (const status of statuses) {
              const { trip } = await createTestTrip(status);
              createdTrips.push(trip);
            }
            
            // Filter with no specific criteria
            const result = await filterTrips({});
            
            // Property: all active trips should be returned
            const returnedTripIds = result.trips.map(t => t.tripId);
            const allFound = createdTrips.every(t => 
              returnedTripIds.includes(t.tripId)
            );
            
            return allFound;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
