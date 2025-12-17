/**
 * Property-based tests for Trip Details
 * Tests that trip details contain complete information
 * 
 * **Feature: passenger-ride-search-booking**
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Driver = require('../../src/models/Driver');
const { getPublicTripDetails } = require('../../src/services/searchService');

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
const verificationStatusArbitrary = fc.constantFrom('pending', 'verified', 'suspended');
const ratingArbitrary = fc.double({ min: 0, max: 5, noNaN: true });
const totalTripsArbitrary = fc.integer({ min: 0, max: 1000 });
// Use alphanumeric strings to avoid special character issues
const driverNameArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,49}$/).filter(s => s.trim().length > 0);
const addressArbitrary = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9, ]{4,99}$/).filter(s => s.trim().length >= 5);

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
    rating: overrides.driverRating !== undefined ? overrides.driverRating : 4.5,
    totalTrips: overrides.driverTotalTrips !== undefined ? overrides.driverTotalTrips : 10,
    vehicles: [{
      type: overrides.vehicleType || 'sedan',
      make: overrides.vehicleMake || 'Toyota',
      model: overrides.vehicleModel || 'Camry',
      color: overrides.vehicleColor || 'White',
      registrationNumber: `MH01AB${Math.floor(1000 + Math.random() * 9000)}`,
      seats: overrides.vehicleSeats || 4,
      year: overrides.vehicleYear || 2022,
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
    scheduledAt: overrides.scheduledAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
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

describe('Trip Details - Property Tests', () => {
  /**
   * **Feature: passenger-ride-search-booking, Property 4: Trip details contain complete information**
   * **Validates: Requirements 3.2, 3.3, 3.5**
   * 
   * *For any* trip detail request, the response SHALL contain source.address, destination.address, 
   * driver profile (name, rating, totalTrips, verified), and scheduledAt in a valid date format.
   */
  describe('Property 4: Trip details contain complete information', () => {
    it('should contain source and destination addresses for any trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          addressArbitrary, // sourceAddress
          addressArbitrary, // destAddress
          async (sourceAddress, destAddress) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with specific addresses
            const { trip } = await createTestTrip({
              sourceAddress,
              destAddress
            });
            
            // Get trip details
            const result = await getPublicTripDetails(trip._id.toString());
            
            // Verify source and destination addresses exist and are non-empty strings
            // Requirements 3.2: Show complete route information with pickup and drop addresses
            if (!result.trip.source?.address) return false;
            if (typeof result.trip.source.address !== 'string') return false;
            if (result.trip.source.address.length === 0) return false;
            
            if (!result.trip.destination?.address) return false;
            if (typeof result.trip.destination.address !== 'string') return false;
            if (result.trip.destination.address.length === 0) return false;
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should contain complete driver profile for any trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          driverNameArbitrary,
          ratingArbitrary,
          totalTripsArbitrary,
          verificationStatusArbitrary,
          async (driverName, driverRating, driverTotalTrips, verificationStatus) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with specific driver info
            const { trip } = await createTestTrip({
              driverName,
              driverRating,
              driverTotalTrips,
              verificationStatus
            });
            
            // Get trip details
            const result = await getPublicTripDetails(trip._id.toString());
            
            // Requirements 3.3: Show driver profile with photo, name, rating, total trips, and verification status
            // Verify driver profile fields exist and have correct types
            if (result.trip.driver.name === undefined) return false;
            if (typeof result.trip.driver.name !== 'string') return false;
            if (result.trip.driver.name.length === 0) return false;
            
            if (result.trip.driver.rating === undefined) return false;
            if (typeof result.trip.driver.rating !== 'number') return false;
            // Verify rating is within valid range
            if (result.trip.driver.rating < 0 || result.trip.driver.rating > 5) return false;
            
            if (result.trip.driver.totalTrips === undefined) return false;
            if (typeof result.trip.driver.totalTrips !== 'number') return false;
            // Verify totalTrips is non-negative
            if (result.trip.driver.totalTrips < 0) return false;
            
            if (result.trip.driver.verified === undefined) return false;
            // Verify verified flag is boolean and matches verification status
            if (typeof result.trip.driver.verified !== 'boolean') return false;
            const expectedVerified = verificationStatus === 'verified';
            if (result.trip.driver.verified !== expectedVerified) return false;
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should contain scheduledAt in valid date format for any trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid future dates by adding days to current date
          fc.integer({ min: 1, max: 365 }).map(days => new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
          async (scheduledAt) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with specific scheduled date
            const { trip } = await createTestTrip({
              scheduledAt
            });
            
            // Get trip details
            const result = await getPublicTripDetails(trip._id.toString());
            
            // Verify scheduledAt exists
            if (!result.trip.scheduledAt) return false;
            
            // Verify it's a valid date
            const parsedDate = new Date(result.trip.scheduledAt);
            if (isNaN(parsedDate.getTime())) return false;
            
            // Verify the date matches (within 1 second tolerance for serialization)
            const timeDiff = Math.abs(parsedDate.getTime() - scheduledAt.getTime());
            if (timeDiff > 1000) return false;
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    it('should contain all required fields together for any trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          addressArbitrary,
          addressArbitrary,
          driverNameArbitrary,
          ratingArbitrary,
          totalTripsArbitrary,
          verificationStatusArbitrary,
          fc.integer({ min: 1, max: 365 }).map(days => new Date(Date.now() + days * 24 * 60 * 60 * 1000)),
          async (sourceAddress, destAddress, driverName, driverRating, driverTotalTrips, verificationStatus, scheduledAt) => {
            // Clean up
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            // Create a trip with all specified fields
            const { trip } = await createTestTrip({
              sourceAddress,
              destAddress,
              driverName,
              driverRating,
              driverTotalTrips,
              verificationStatus,
              scheduledAt
            });
            
            // Get trip details
            const result = await getPublicTripDetails(trip._id.toString());
            
            // Verify all required fields exist (Requirements 3.2, 3.3, 3.5)
            // Requirement 3.2: source.address and destination.address
            if (!result.trip.source?.address) return false;
            if (!result.trip.destination?.address) return false;
            
            // Requirement 3.3: driver profile (name, rating, totalTrips, verified)
            if (result.trip.driver.name === undefined) return false;
            if (result.trip.driver.rating === undefined) return false;
            if (result.trip.driver.totalTrips === undefined) return false;
            if (result.trip.driver.verified === undefined) return false;
            
            // Requirement 3.5: scheduledAt in valid date format
            if (!result.trip.scheduledAt) return false;
            const parsedDate = new Date(result.trip.scheduledAt);
            if (isNaN(parsedDate.getTime())) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    }, 180000);
  });
});
