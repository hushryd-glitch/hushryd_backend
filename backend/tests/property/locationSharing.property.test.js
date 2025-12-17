/**
 * Property-based tests for Location Sharing Service
 * Tests contact limits, broadcast completeness, and trip end cleanup
 * Requirements: 2.2, 2.3, 2.5, 3.3, 3.4
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const LocationShare = require('../../src/models/LocationShare');
const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const {
  startSharing,
  updateLocation,
  stopSharing,
  stopAllSharingForTrip,
  addContact,
  validateContacts,
  MAX_CONTACTS
} = require('../../src/services/locationSharingService');

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
  await LocationShare.deleteMany({});
  await Trip.deleteMany({});
  await User.deleteMany({});
});

// Generators
const phoneArbitrary = fc.stringMatching(/^\+91[6-9]\d{9}$/);
const nameArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

const contactArbitrary = fc.record({
  name: nameArbitrary,
  phone: phoneArbitrary
});

const contactsArrayArbitrary = (maxLen = MAX_CONTACTS) => 
  fc.array(contactArbitrary, { minLength: 0, maxLength: maxLen });

const coordinatesArbitrary = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true })
});

// Helper to create a test trip with all required fields
const createTestTrip = async () => {
  const user = new User({ phone: '+919876543210', role: 'driver' });
  await user.save();
  
  // Generate a unique trip ID
  const year = new Date().getFullYear();
  const randomSeq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
  const tripId = `HR-${year}-${randomSeq}`;
  
  const trip = new Trip({
    tripId,
    driver: user._id,
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
    status: 'scheduled'
  });
  await trip.save();
  
  return { trip, user };
};

describe('Location Sharing Contact Limit - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 4: Location Sharing Contact Limit**
  // **Validates: Requirements 2.2**
  
  describe('Property 4: Location Sharing Contact Limit', () => {
    it('MAX_CONTACTS constant SHALL be exactly 5', () => {
      expect(MAX_CONTACTS).toBe(5);
    });

    it('For any location sharing session, the system SHALL accept at most 5 contacts', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactsArrayArbitrary(5),
          async (contacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip, user } = await createTestTrip();
            
            // Start sharing with contacts (up to 5)
            const session = await startSharing(
              trip._id.toString(),
              user._id.toString(),
              'driver',
              contacts
            );
            
            // Property: session should accept all contacts (up to 5)
            return session.contacts.length === contacts.length && 
                   session.contacts.length <= MAX_CONTACTS;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('For any attempt to add more than 5 contacts, the system SHALL reject the request', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(contactArbitrary, { minLength: 6, maxLength: 10 }),
          async (contacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip, user } = await createTestTrip();
            
            // Attempt to start sharing with more than 5 contacts
            try {
              await startSharing(
                trip._id.toString(),
                user._id.toString(),
                'driver',
                contacts
              );
              // Should not reach here
              return false;
            } catch (error) {
              // Property: should reject with MAX_CONTACTS_EXCEEDED error
              return error.code === 'MAX_CONTACTS_EXCEEDED';
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('validateContacts should reject arrays with more than 5 contacts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 6, max: 20 }),
          (contactCount) => {
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i % 10}${i % 10}`
            }));
            
            const result = validateContacts(contacts);
            
            // Property: validation should fail for more than 5 contacts
            return result.valid === false && result.code === 'MAX_CONTACTS_EXCEEDED';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validateContacts should accept arrays with 5 or fewer contacts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          (contactCount) => {
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i % 10}${i % 10}`
            }));
            
            const result = validateContacts(contacts);
            
            // Property: validation should pass for 5 or fewer contacts
            return result.valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('addContact should reject when session already has 5 contacts', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactArbitrary,
          async (newContact) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip, user } = await createTestTrip();
            
            // Create session with exactly 5 contacts
            const initialContacts = Array.from({ length: 5 }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            const session = await startSharing(
              trip._id.toString(),
              user._id.toString(),
              'driver',
              initialContacts
            );
            
            // Attempt to add 6th contact
            try {
              await addContact(session.sessionId.toString(), newContact);
              // Should not reach here
              return false;
            } catch (error) {
              // Property: should reject with MAX_CONTACTS_EXCEEDED error
              return error.code === 'MAX_CONTACTS_EXCEEDED';
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('contact count should never exceed MAX_CONTACTS after any sequence of operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactsArrayArbitrary(3),
          contactsArrayArbitrary(3),
          async (initialContacts, additionalContacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip, user } = await createTestTrip();
            
            // Start with initial contacts
            const session = await startSharing(
              trip._id.toString(),
              user._id.toString(),
              'driver',
              initialContacts
            );
            
            // Try to add additional contacts one by one
            let currentCount = session.contacts.length;
            
            for (const contact of additionalContacts) {
              if (currentCount < MAX_CONTACTS) {
                try {
                  const result = await addContact(session.sessionId.toString(), contact);
                  currentCount = result.contactCount;
                } catch (error) {
                  if (error.code === 'MAX_CONTACTS_EXCEEDED') {
                    // Expected when limit reached
                    break;
                  }
                  throw error;
                }
              }
            }
            
            // Verify final count
            const finalSession = await LocationShare.findById(session.sessionId);
            
            // Property: contact count should never exceed MAX_CONTACTS
            return finalSession.contacts.length <= MAX_CONTACTS;
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});


describe('Location Broadcast Completeness - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 5: Location Broadcast Completeness**
  // **Validates: Requirements 2.3, 3.3**
  
  describe('Property 5: Location Broadcast Completeness', () => {
    const {
      createContactTrackingRoom,
      getContactTrackingRoom,
      cleanupContactTrackingRooms,
      getContactTrackingStats
    } = require('../../src/services/socketService');

    // Note: broadcastToContacts requires Socket.io to be initialized.
    // These tests verify the contact tracking room management which is the foundation
    // for broadcast completeness. The actual broadcast is tested via integration tests.

    it('For any active location sharing session with N contacts, N tracking rooms SHALL be created', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (contactCount) => {
            // Generate N contacts
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            
            // Create tracking rooms for each contact
            for (const contact of contacts) {
              createContactTrackingRoom(tripId, contact.phone);
            }
            
            // Verify rooms were created
            const stats = getContactTrackingStats(tripId);
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            // Property: room count should equal contactCount (N rooms for N contacts)
            return stats.roomCount === contactCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any N contacts, all N contacts SHALL have tracking rooms created', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          coordinatesArbitrary,
          (contactCount, coordinates) => {
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            
            // Create tracking rooms for each contact
            for (const contact of contacts) {
              createContactTrackingRoom(tripId, contact.phone);
            }
            
            // Verify all contacts have rooms
            let allHaveRooms = true;
            for (const contact of contacts) {
              const room = getContactTrackingRoom(tripId, contact.phone);
              if (!room) {
                allHaveRooms = false;
                break;
              }
            }
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            // Property: all N contacts should have tracking rooms
            return allHaveRooms;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('contact tracking rooms should be created for each contact', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (contactCount) => {
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            // Create rooms for each contact
            for (const contact of contacts) {
              createContactTrackingRoom(tripId, contact.phone);
            }
            
            // Verify rooms were created
            const stats = getContactTrackingStats(tripId);
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            // Property: room count should equal contact count
            return stats.roomCount === contactCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('each contact should have a unique tracking room', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }),
          (contactCount) => {
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            // Create rooms
            const roomNames = contacts.map(contact => 
              createContactTrackingRoom(tripId, contact.phone)
            );
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            // Property: all room names should be unique
            const uniqueRooms = new Set(roomNames);
            return uniqueRooms.size === contactCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getContactTrackingRoom should return correct room for each contact', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (contactCount) => {
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            // Create rooms and store expected names
            const expectedRooms = {};
            for (const contact of contacts) {
              expectedRooms[contact.phone] = createContactTrackingRoom(tripId, contact.phone);
            }
            
            // Verify each contact's room can be retrieved
            let allMatch = true;
            for (const contact of contacts) {
              const retrievedRoom = getContactTrackingRoom(tripId, contact.phone);
              if (retrievedRoom !== expectedRooms[contact.phone]) {
                allMatch = false;
                break;
              }
            }
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            return allMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('room name format should include tripId and contact phone', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (contactCount) => {
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            // Create rooms and verify format
            let allCorrectFormat = true;
            for (const contact of contacts) {
              const roomName = createContactTrackingRoom(tripId, contact.phone);
              // Room name should contain both tripId and phone
              if (!roomName.includes(tripId) || !roomName.includes(contact.phone)) {
                allCorrectFormat = false;
                break;
              }
            }
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            return allCorrectFormat;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cleanup should remove all tracking rooms for a trip', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (contactCount) => {
            const tripId = `test-trip-${Date.now()}-${Math.random()}`;
            const contacts = Array.from({ length: contactCount }, (_, i) => ({
              name: `Contact ${i}`,
              phone: `+9198765432${i}${i}`
            }));
            
            // Create rooms
            for (const contact of contacts) {
              createContactTrackingRoom(tripId, contact.phone);
            }
            
            // Verify rooms exist
            const beforeCleanup = getContactTrackingStats(tripId);
            
            // Clean up
            cleanupContactTrackingRooms(tripId);
            
            // Verify rooms are gone
            const afterCleanup = getContactTrackingStats(tripId);
            
            // Property: rooms should exist before cleanup and be gone after
            return beforeCleanup.roomCount === contactCount && afterCleanup.roomCount === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Tracking Data Completeness - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 6: Tracking Data Completeness**
  // **Validates: Requirements 3.5**
  
  describe('Property 6: Tracking Data Completeness', () => {
    const {
      startPassengerSharing,
      getPassengerTrackingData
    } = require('../../src/services/locationSharingService');
    const ShareLink = require('../../src/models/ShareLink');
    const Booking = require('../../src/models/Booking');
    const Driver = require('../../src/models/Driver');

    // Helper to create a complete test setup with booking, trip, driver
    const createCompleteTestSetup = async () => {
      // Create driver user
      const driverUser = new User({ 
        phone: `+9198765${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, 
        role: 'driver',
        name: 'Test Driver'
      });
      await driverUser.save();

      // Create driver with vehicle
      const driver = new Driver({
        userId: driverUser._id,
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
          insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }],
        verificationStatus: 'verified',
        rating: 4.5
      });
      await driver.save();

      // Create trip
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
        tracking: [{
          coordinates: { lat: 12.9716, lng: 77.5946 },
          timestamp: new Date(),
          speed: 30
        }]
      });
      await trip.save();

      // Create passenger user
      const passengerUser = new User({ 
        phone: `+9187654${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, 
        role: 'passenger',
        name: 'Test Passenger'
      });
      await passengerUser.save();

      // Create booking
      const bookingYear = new Date().getFullYear();
      const bookingSeq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
      const booking = new Booking({
        bookingId: `BK-${bookingYear}-${bookingSeq}`,
        tripId: trip._id,
        passengerId: passengerUser._id,
        seats: 1,
        pickupPoint: {
          address: 'Pickup Point',
          coordinates: { lat: 12.9716, lng: 77.5946 }
        },
        dropPoint: {
          address: 'Drop Point',
          coordinates: { lat: 13.0827, lng: 80.2707 }
        },
        fare: 500,
        status: 'confirmed'
      });
      await booking.save();

      return { driverUser, driver, trip, passengerUser, booking };
    };

    it('For any shared tracking link access, the response SHALL contain passenger location field', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coordinates) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await ShareLink.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            
            const { passengerUser, booking } = await createCompleteTestSetup();
            
            // Start passenger sharing
            const shareResult = await startPassengerSharing(
              booking._id.toString(),
              passengerUser._id.toString(),
              [{ name: 'Emergency Contact', phone: '+919876543210' }]
            );
            
            // Get tracking data
            const trackingData = await getPassengerTrackingData(shareResult.trackingToken);
            
            // Property: response should contain passengerLocation field (can be null if not updated)
            return 'passengerLocation' in trackingData;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any shared tracking link access, the response SHALL contain driver name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No random input needed
          async () => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await ShareLink.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            
            const { passengerUser, booking } = await createCompleteTestSetup();
            
            // Start passenger sharing
            const shareResult = await startPassengerSharing(
              booking._id.toString(),
              passengerUser._id.toString(),
              []
            );
            
            // Get tracking data
            const trackingData = await getPassengerTrackingData(shareResult.trackingToken);
            
            // Property: response should contain driver with name
            return trackingData.driver !== null && 
                   typeof trackingData.driver.name === 'string' &&
                   trackingData.driver.name.length > 0;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any shared tracking link access, the response SHALL contain vehicle information', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await ShareLink.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            
            const { passengerUser, booking } = await createCompleteTestSetup();
            
            // Start passenger sharing
            const shareResult = await startPassengerSharing(
              booking._id.toString(),
              passengerUser._id.toString(),
              []
            );
            
            // Get tracking data
            const trackingData = await getPassengerTrackingData(shareResult.trackingToken);
            
            // Property: response should contain vehicle info with required fields
            return trackingData.vehicle !== null &&
                   typeof trackingData.vehicle.make === 'string' &&
                   typeof trackingData.vehicle.model === 'string' &&
                   typeof trackingData.vehicle.color === 'string' &&
                   typeof trackingData.vehicle.plateNumber === 'string';
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any shared tracking link, response SHALL contain all three required fields: passengerLocation, driver, vehicle', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactsArrayArbitrary(3),
          async (contacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await ShareLink.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            
            const { passengerUser, booking } = await createCompleteTestSetup();
            
            // Start passenger sharing with random contacts
            const shareResult = await startPassengerSharing(
              booking._id.toString(),
              passengerUser._id.toString(),
              contacts
            );
            
            // Get tracking data
            const trackingData = await getPassengerTrackingData(shareResult.trackingToken);
            
            // Property: response should contain all three required fields
            const hasPassengerLocation = 'passengerLocation' in trackingData;
            const hasDriver = 'driver' in trackingData && trackingData.driver !== null;
            const hasVehicle = 'vehicle' in trackingData && trackingData.vehicle !== null;
            
            return hasPassengerLocation && hasDriver && hasVehicle;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any completed trip, tracking data SHALL indicate completed status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await ShareLink.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            
            const { passengerUser, booking, trip } = await createCompleteTestSetup();
            
            // Start passenger sharing
            const shareResult = await startPassengerSharing(
              booking._id.toString(),
              passengerUser._id.toString(),
              []
            );
            
            // Mark trip as completed
            trip.status = 'completed';
            trip.completedAt = new Date();
            await trip.save();
            
            // Get tracking data
            const trackingData = await getPassengerTrackingData(shareResult.trackingToken);
            
            // Property: completed trips should return completed status
            return trackingData.status === 'completed';
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});


describe('Trip End Cleanup - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 7: Trip End Cleanup**
  // **Validates: Requirements 2.5, 3.4**
  
  describe('Property 7: Trip End Cleanup', () => {
    it('For any trip that ends, all associated location sharing sessions SHALL be marked inactive', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactsArrayArbitrary(5).filter(arr => arr.length > 0),
          async (contacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip, user } = await createTestTrip();
            
            // Start a sharing session
            const session = await startSharing(
              trip._id.toString(),
              user._id.toString(),
              'driver',
              contacts
            );
            
            // Verify session is active
            const beforeCleanup = await LocationShare.findById(session.sessionId);
            const wasActive = beforeCleanup.isActive === true;
            
            // Stop all sharing for the trip (simulating trip end)
            await stopAllSharingForTrip(trip._id.toString());
            
            // Verify session is now inactive
            const afterCleanup = await LocationShare.findById(session.sessionId);
            const isNowInactive = afterCleanup.isActive === false;
            const hasEndedAt = afterCleanup.endedAt !== null;
            
            // Property: session should be active before cleanup and inactive after
            return wasActive && isNowInactive && hasEndedAt;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('For any trip with multiple sharing sessions, all sessions SHALL be deactivated on trip end', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (sessionCount) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip } = await createTestTrip();
            
            // Create multiple users and sharing sessions
            const sessions = [];
            for (let i = 0; i < sessionCount; i++) {
              const user = new User({ phone: `+9198765432${i}${i}`, role: i === 0 ? 'driver' : 'passenger' });
              await user.save();
              
              const session = await startSharing(
                trip._id.toString(),
                user._id.toString(),
                i === 0 ? 'driver' : 'passenger',
                [{ name: `Contact ${i}`, phone: `+9187654321${i}${i}` }]
              );
              sessions.push(session);
            }
            
            // Verify all sessions are active
            const activeBefore = await LocationShare.countDocuments({ 
              tripId: trip._id, 
              isActive: true 
            });
            
            // Stop all sharing for the trip
            const result = await stopAllSharingForTrip(trip._id.toString());
            
            // Verify all sessions are now inactive
            const activeAfter = await LocationShare.countDocuments({ 
              tripId: trip._id, 
              isActive: true 
            });
            
            // Property: all sessions should be deactivated
            return activeBefore === sessionCount && 
                   activeAfter === 0 && 
                   result.deactivatedCount === sessionCount;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('Trip end cleanup SHALL return all contacts that need to be notified', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactsArrayArbitrary(5).filter(arr => arr.length > 0),
          async (contacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip, user } = await createTestTrip();
            
            // Start sharing with contacts
            await startSharing(
              trip._id.toString(),
              user._id.toString(),
              'driver',
              contacts
            );
            
            // Stop all sharing and get contacts to notify
            const result = await stopAllSharingForTrip(trip._id.toString());
            
            // Property: contactsToNotify should contain all contacts from the session
            return result.contactsToNotify.length === contacts.length;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('stopSharing for individual session SHALL mark only that session as inactive', async () => {
      await fc.assert(
        fc.asyncProperty(
          contactsArrayArbitrary(3).filter(arr => arr.length > 0),
          async (contacts) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip } = await createTestTrip();
            
            // Create two users with unique phone numbers (valid Indian format)
            const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const user1 = new User({ phone: `+9198765${randomNum}0`, role: 'driver' });
            await user1.save();
            const user2 = new User({ phone: `+9198765${randomNum}1`, role: 'passenger' });
            await user2.save();
            
            const session1 = await startSharing(
              trip._id.toString(),
              user1._id.toString(),
              'driver',
              contacts
            );
            
            const session2 = await startSharing(
              trip._id.toString(),
              user2._id.toString(),
              'passenger',
              [{ name: 'Contact', phone: `+9198765${randomNum}9` }]
            );
            
            // Stop only session1
            await stopSharing(trip._id.toString(), user1._id.toString());
            
            // Verify session1 is inactive but session2 is still active
            const s1 = await LocationShare.findById(session1.sessionId);
            const s2 = await LocationShare.findById(session2.sessionId);
            
            // Property: only the stopped session should be inactive
            return s1.isActive === false && s2.isActive === true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('Cleanup result SHALL include correct deactivated count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (sessionCount) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip } = await createTestTrip();
            
            // Create multiple sharing sessions
            for (let i = 0; i < sessionCount; i++) {
              const user = new User({ phone: `+9198765432${i}${i}`, role: 'driver' });
              await user.save();
              
              await startSharing(
                trip._id.toString(),
                user._id.toString(),
                'driver',
                [{ name: `Contact ${i}`, phone: `+9187654321${i}${i}` }]
              );
            }
            
            // Stop all sharing
            const result = await stopAllSharingForTrip(trip._id.toString());
            
            // Property: deactivatedCount should match the number of sessions
            return result.deactivatedCount === sessionCount;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('After cleanup, no active sessions SHALL exist for the trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (sessionCount) => {
            await LocationShare.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            
            const { trip } = await createTestTrip();
            
            // Create multiple sharing sessions
            for (let i = 0; i < sessionCount; i++) {
              const user = new User({ phone: `+9198765432${i}${i}`, role: 'driver' });
              await user.save();
              
              await startSharing(
                trip._id.toString(),
                user._id.toString(),
                'driver',
                [{ name: `Contact ${i}`, phone: `+9187654321${i}${i}` }]
              );
            }
            
            // Stop all sharing
            await stopAllSharingForTrip(trip._id.toString());
            
            // Check for any remaining active sessions
            const activeSessions = await LocationShare.findActiveSessionsByTrip(trip._id.toString());
            
            // Property: no active sessions should remain
            return activeSessions.length === 0;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
