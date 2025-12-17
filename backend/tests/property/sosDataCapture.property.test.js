/**
 * Property-based tests for SOS Data Capture
 * Tests that SOS alerts capture complete journey data
 * Requirements: 5.1, 5.2, 5.3
 * 
 * **Feature: ride-safety-tracking-notifications, Property 10: SOS Data Capture Completeness**
 * **Validates: Requirements 5.1**
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const SOSAlert = require('../../src/models/SOSAlert');
const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Driver = require('../../src/models/Driver');

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
  await SOSAlert.deleteMany({});
  await Trip.deleteMany({});
  await User.deleteMany({});
  await Driver.deleteMany({});
});

// Generators
const coordinatesArbitrary = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true })
});

const userTypeArbitrary = fc.constantFrom('passenger', 'driver');

// Helper to create a test trip with tracking history
const createTestTripWithTracking = async (trackingEntries = 5) => {
  const user = new User({ 
    phone: `+9198765${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, 
    role: 'driver',
    name: 'Test Driver'
  });
  await user.save();

  const driver = new Driver({
    userId: user._id,
    licenseNumber: `DL${Date.now()}`,
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    vehicles: [{
      registrationNumber: `KA01AB${Math.floor(Math.random() * 10000)}`,
      make: 'Toyota',
      model: 'Innova',
      year: 2022,
      color: 'White',
      type: 'suv',
      seats: 6,
      plateNumber: `KA01AB${Math.floor(Math.random() * 10000)}`,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }],
    verificationStatus: 'verified',
    rating: 4.5
  });
  await driver.save();

  // Generate tracking history
  const tracking = [];
  const baseTime = Date.now() - (trackingEntries * 10000);
  for (let i = 0; i < trackingEntries; i++) {
    tracking.push({
      coordinates: {
        lat: 12.9716 + (i * 0.001),
        lng: 77.5946 + (i * 0.001)
      },
      timestamp: new Date(baseTime + (i * 10000)),
      speed: 30 + (i * 2)
    });
  }

  const year = new Date().getFullYear();
  const randomSeq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
  const tripId = `HR-${year}-${randomSeq}`;
  
  const trip = new Trip({
    tripId,
    driver: driver._id,
    vehicle: driver.vehicles[0]._id,
    source: {
      address: 'Test Source',
      coordinates: { lat: 12.9716, lng: 77.5946 }
    },
    destination: {
      address: 'Test Destination',
      coordinates: { lat: 13.0827, lng: 80.2707 }
    },
    scheduledAt: new Date(Date.now() + 3600000),
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
    status: 'in_progress',
    tracking
  });
  await trip.save();
  
  return { trip, user, driver };
};

// Helper to create a passenger user
const createPassengerUser = async () => {
  const user = new User({ 
    phone: `+9187654${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, 
    role: 'passenger',
    name: 'Test Passenger'
  });
  await user.save();
  return user;
};

describe('SOS Data Capture Completeness - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 10: SOS Data Capture Completeness**
  // **Validates: Requirements 5.1**
  
  describe('Property 10: SOS Data Capture Completeness', () => {
    it('For any SOS trigger, the created alert SHALL contain GPS coordinates', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          userTypeArbitrary,
          async (coordinates, userType) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            const triggerUser = userType === 'driver' ? user : await createPassengerUser();
            
            // Create SOS alert with coordinates
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: triggerUser._id,
              userType,
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                },
                address: 'Test Location'
              },
              status: 'active',
              priority: 'critical'
            });
            await sosAlert.save();
            
            // Property: alert should contain GPS coordinates
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            return savedAlert.location !== null &&
                   savedAlert.location.coordinates !== null &&
                   typeof savedAlert.location.coordinates.lat === 'number' &&
                   typeof savedAlert.location.coordinates.lng === 'number';
          }
        ),
        { numRuns: 50 }
      );
    });

    it('For any SOS trigger, the created alert SHALL contain timestamp (createdAt)', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          userTypeArbitrary,
          async (coordinates, userType) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            const triggerUser = userType === 'driver' ? user : await createPassengerUser();
            
            const beforeCreate = new Date();
            
            // Create SOS alert
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: triggerUser._id,
              userType,
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical'
            });
            await sosAlert.save();
            
            const afterCreate = new Date();
            
            // Property: alert should contain timestamp
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            return savedAlert.createdAt !== null &&
                   savedAlert.createdAt instanceof Date &&
                   savedAlert.createdAt >= beforeCreate &&
                   savedAlert.createdAt <= afterCreate;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('For any SOS trigger, the created alert SHALL contain trip ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          userTypeArbitrary,
          async (coordinates, userType) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            const triggerUser = userType === 'driver' ? user : await createPassengerUser();
            
            // Create SOS alert
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: triggerUser._id,
              userType,
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical'
            });
            await sosAlert.save();
            
            // Property: alert should contain trip ID
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            return savedAlert.tripId !== null &&
                   savedAlert.tripId.toString() === trip._id.toString();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('For any SOS trigger, the created alert SHALL contain user ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          userTypeArbitrary,
          async (coordinates, userType) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            const triggerUser = userType === 'driver' ? user : await createPassengerUser();
            
            // Create SOS alert
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: triggerUser._id,
              userType,
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical'
            });
            await sosAlert.save();
            
            // Property: alert should contain user ID (triggeredBy)
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            return savedAlert.triggeredBy !== null &&
                   savedAlert.triggeredBy.toString() === triggerUser._id.toString();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('For any SOS trigger, the alert SHALL contain all four required fields: coordinates, timestamp, tripId, userId', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          userTypeArbitrary,
          async (coordinates, userType) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            const triggerUser = userType === 'driver' ? user : await createPassengerUser();
            
            // Create SOS alert
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: triggerUser._id,
              userType,
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical'
            });
            await sosAlert.save();
            
            // Property: alert should contain all four required fields
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            
            const hasCoordinates = savedAlert.location?.coordinates?.lat !== undefined &&
                                   savedAlert.location?.coordinates?.lng !== undefined;
            const hasTimestamp = savedAlert.createdAt instanceof Date;
            const hasTripId = savedAlert.tripId !== null;
            const hasUserId = savedAlert.triggeredBy !== null;
            
            return hasCoordinates && hasTimestamp && hasTripId && hasUserId;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('GPS coordinates SHALL be within valid ranges (-90 to 90 for lat, -180 to 180 for lng)', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coordinates) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            
            // Create SOS alert
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: user._id,
              userType: 'driver',
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical'
            });
            await sosAlert.save();
            
            // Property: coordinates should be within valid ranges
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            const lat = savedAlert.location.coordinates.lat;
            const lng = savedAlert.location.coordinates.lng;
            
            return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('SOS alert with journey details SHALL contain routeTaken array', async () => {
      // Use constrained coordinates to avoid boundary issues with increments
      const safeCoordinatesArbitrary = fc.record({
        lat: fc.double({ min: -85, max: 85, noNaN: true }),
        lng: fc.double({ min: -175, max: 175, noNaN: true })
      });
      
      await fc.assert(
        fc.asyncProperty(
          safeCoordinatesArbitrary,
          fc.integer({ min: 1, max: 10 }),
          async (coordinates, routeLength) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking(routeLength);
            
            // Generate route taken with clamped coordinates
            const routeTaken = Array.from({ length: routeLength }, (_, i) => ({
              lat: Math.max(-90, Math.min(90, coordinates.lat + (i * 0.001))),
              lng: Math.max(-180, Math.min(180, coordinates.lng + (i * 0.001))),
              timestamp: new Date(Date.now() - (routeLength - i) * 10000)
            }));
            
            // Create SOS alert with journey details
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: user._id,
              userType: 'driver',
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical',
              journeyDetails: {
                routeTaken
              }
            });
            await sosAlert.save();
            
            // Property: journey details should contain routeTaken array
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            return savedAlert.journeyDetails !== null &&
                   Array.isArray(savedAlert.journeyDetails.routeTaken) &&
                   savedAlert.journeyDetails.routeTaken.length === routeLength;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('SOS alert continuous tracking SHALL be initialized on creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coordinates) => {
            await SOSAlert.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Driver.deleteMany({});
            
            const { trip, user } = await createTestTripWithTracking();
            
            // Create SOS alert with continuous tracking
            const sosAlert = new SOSAlert({
              tripId: trip._id,
              triggeredBy: user._id,
              userType: 'driver',
              location: {
                coordinates: {
                  lat: coordinates.lat,
                  lng: coordinates.lng
                }
              },
              status: 'active',
              priority: 'critical',
              continuousTracking: {
                isActive: true,
                lastBroadcastAt: new Date(),
                trackingHistory: [{
                  coordinates: {
                    lat: coordinates.lat,
                    lng: coordinates.lng
                  },
                  timestamp: new Date()
                }]
              }
            });
            await sosAlert.save();
            
            // Property: continuous tracking should be initialized
            const savedAlert = await SOSAlert.findById(sosAlert._id);
            return savedAlert.continuousTracking !== null &&
                   savedAlert.continuousTracking.isActive === true &&
                   savedAlert.continuousTracking.trackingHistory.length >= 1;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
