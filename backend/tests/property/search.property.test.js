/**
 * Property-based tests for Search Service
 * Tests search results contain required fields and only bookable trips
 * 
 * **Feature: passenger-ride-search-booking**
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Driver = require('../../src/models/Driver');
const { searchRides } = require('../../src/services/searchService');

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

// Generators - using valid enum values from Driver model
const verificationStatusArbitrary = fc.constantFrom('pending', 'verified', 'suspended');
const tripStatusArbitrary = fc.constantFrom('scheduled', 'driver_assigned', 'in_progress', 'completed', 'cancelled');
const availableSeatsArbitrary = fc.integer({ min: 0, max: 6 });
const farePerSeatArbitrary = fc.integer({ min: 50, max: 2000 });

/**
 * Helper to create a valid trip with all required fields
 */
const createTestTrip = async (overrides = {}) => {
  // Create a driver user
  const driverUser = new User({
    phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
    role: 'driver',
    name: overrides.driverName || 'Test Driver',
    profilePhoto: overrides.driverPhoto || null
  });
  await driverUser.save();

  // Create a driver with verification status
  const driver = new Driver({
    userId: driverUser._id,
    licenseNumber: `DL${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    verificationStatus: overrides.verificationStatus || 'verified',
    rating: overrides.driverRating || 4.5,
    totalTrips: overrides.driverTotalTrips || 10,
    vehicles: [{
      type: 'sedan',
      make: 'Toyota',
      model: 'Camry',
      color: 'White',
      registrationNumber: `MH01AB${Math.floor(1000 + Math.random() * 9000)}`,
      seats: 4,
      year: 2022,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }]
  });
  await driver.save();


  const tripId = await Trip.generateTripId();
  const farePerSeat = overrides.farePerSeat || 250;
  const totalFare = farePerSeat * 4;
  const payment = Trip.calculatePaymentBreakdown(totalFare);

  const trip = new Trip({
    tripId,
    driver: driver._id,
    vehicle: driver.vehicles[0]._id,
    passengers: [],
    source: {
      address: overrides.sourceAddress || '123 Test St, Delhi',
      coordinates: { lat: 28.6139, lng: 77.2090 }
    },
    destination: {
      address: overrides.destAddress || '456 Test Ave, Gurgaon',
      coordinates: { lat: 28.4595, lng: 77.0266 }
    },
    scheduledAt: overrides.scheduledAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    status: overrides.status || 'scheduled',
    availableSeats: overrides.availableSeats !== undefined ? overrides.availableSeats : 4,
    farePerSeat: farePerSeat,
    instantBooking: overrides.instantBooking || false,
    ladiesOnly: overrides.ladiesOnly || false,
    fare: {
      baseFare: Math.round(totalFare * 0.5),
      distanceCharge: Math.round(totalFare * 0.4),
      tollCharges: 0,
      platformFee: Math.round(totalFare * 0.1),
      taxes: 0,
      total: totalFare
    },
    payment
  });

  await trip.save();
  return { trip, driver, driverUser };
};

describe('Search Service - Property Tests', () => {
  /**
   * **Feature: passenger-ride-search-booking, Property 2: Search results contain required driver and trip fields**
   * **Validates: Requirements 1.2, 1.4, 1.5**
   * 
   * *For any* trip in search results, the response SHALL contain: driver.name, driver.rating, 
   * driver.totalTrips, farePerSeat, scheduledAt, source.address, destination.address, and availableSeats.
   */
  describe('Property 2: Search results contain required driver and trip fields', () => {
    it('should contain all required driver and trip fields for any search result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // numTrips to create
          verificationStatusArbitrary,
          farePerSeatArbitrary,
          async (numTrips, verificationStatus, farePerSeat) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create trips with various configurations
            for (let i = 0; i < numTrips; i++) {
              await createTestTrip({
                verificationStatus,
                farePerSeat,
                availableSeats: 4, // Ensure bookable
                status: 'scheduled'
              });
            }
            
            // Search for rides
            const result = await searchRides({
              from: 'Delhi',
              to: 'Gurgaon'
            });
            
            // Verify all trips have required fields
            for (const trip of result.trips) {
              // Required driver fields
              if (trip.driver.name === undefined) return false;
              if (trip.driver.rating === undefined) return false;
              if (trip.driver.totalTrips === undefined) return false;
              
              // Required trip fields
              if (trip.farePerSeat === undefined) return false;
              if (trip.scheduledAt === undefined) return false;
              if (trip.source?.address === undefined) return false;
              if (trip.destination?.address === undefined) return false;
              if (trip.availableSeats === undefined) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should include driver verified status in search results', async () => {
      await fc.assert(
        fc.asyncProperty(
          verificationStatusArbitrary,
          async (verificationStatus) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with specific verification status
            await createTestTrip({
              verificationStatus,
              availableSeats: 4,
              status: 'scheduled'
            });
            
            // Search for rides
            const result = await searchRides({
              from: 'Delhi',
              to: 'Gurgaon'
            });
            
            // Verify driver.verified field exists and is boolean
            for (const trip of result.trips) {
              if (typeof trip.driver.verified !== 'boolean') return false;
              
              // Verify the verified flag matches the verification status
              const expectedVerified = verificationStatus === 'verified';
              if (trip.driver.verified !== expectedVerified) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    }, 60000);

    it('should include instantBooking and ladiesOnly flags in search results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // instantBooking
          fc.boolean(), // ladiesOnly
          async (instantBooking, ladiesOnly) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with specific flags
            await createTestTrip({
              instantBooking,
              ladiesOnly,
              availableSeats: 4,
              status: 'scheduled'
            });
            
            // Search for rides
            const result = await searchRides({
              from: 'Delhi',
              to: 'Gurgaon'
            });
            
            // Verify flags exist and match
            for (const trip of result.trips) {
              if (typeof trip.instantBooking !== 'boolean') return false;
              if (typeof trip.ladiesOnly !== 'boolean') return false;
              if (trip.instantBooking !== instantBooking) return false;
              if (trip.ladiesOnly !== ladiesOnly) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    }, 60000);
  });


  /**
   * **Feature: passenger-ride-search-booking, Property 1: Search results only contain bookable trips**
   * **Validates: Requirements 1.1**
   * 
   * *For any* search query, all returned trips SHALL have status 'scheduled' AND availableSeats greater than zero.
   */
  describe('Property 1: Search results only contain bookable trips', () => {
    it('should only return trips with status scheduled and availableSeats > 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripStatusArbitrary,
          availableSeatsArbitrary,
          async (status, availableSeats) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with the generated status and seats
            await createTestTrip({
              status,
              availableSeats
            });
            
            // Search for rides
            const result = await searchRides({
              from: 'Delhi',
              to: 'Gurgaon'
            });
            
            // All returned trips must be bookable
            for (const trip of result.trips) {
              // Must have status 'scheduled'
              // Note: We can't check status directly in response, but we verify availableSeats > 0
              if (trip.availableSeats <= 0) return false;
            }
            
            // If the created trip was not bookable, it should not appear in results
            const isBookable = status === 'scheduled' && availableSeats > 0;
            if (!isBookable && result.trips.length > 0) {
              return false;
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should exclude trips with zero available seats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // numBookableTrips
          fc.integer({ min: 1, max: 3 }), // numFullTrips
          async (numBookableTrips, numFullTrips) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create bookable trips (availableSeats > 0)
            for (let i = 0; i < numBookableTrips; i++) {
              await createTestTrip({
                availableSeats: 4,
                status: 'scheduled'
              });
            }
            
            // Create full trips (availableSeats = 0)
            for (let i = 0; i < numFullTrips; i++) {
              await createTestTrip({
                availableSeats: 0,
                status: 'scheduled'
              });
            }
            
            // Search for rides
            const result = await searchRides({
              from: 'Delhi',
              to: 'Gurgaon'
            });
            
            // Should only return bookable trips
            if (result.trips.length !== numBookableTrips) return false;
            
            // All returned trips should have availableSeats > 0
            for (const trip of result.trips) {
              if (trip.availableSeats <= 0) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    }, 120000);

    it('should exclude trips with non-scheduled status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // numScheduledTrips
          fc.constantFrom('driver_assigned', 'in_progress', 'completed', 'cancelled'),
          async (numScheduledTrips, nonScheduledStatus) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create scheduled trips
            for (let i = 0; i < numScheduledTrips; i++) {
              await createTestTrip({
                availableSeats: 4,
                status: 'scheduled'
              });
            }
            
            // Create a non-scheduled trip
            await createTestTrip({
              availableSeats: 4,
              status: nonScheduledStatus
            });
            
            // Search for rides
            const result = await searchRides({
              from: 'Delhi',
              to: 'Gurgaon'
            });
            
            // Should only return scheduled trips
            if (result.trips.length !== numScheduledTrips) return false;
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    }, 120000);
  });
});
