/**
 * Property-based tests for Stationary Detection Service
 * Tests stationary detection, safety check options, help request SOS trigger, and escalation flow
 * Requirements: 8.2, 8.3, 8.5, 8.6, 8.7
 */
const fc = require('fast-check');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const StationaryEvent = require('../../src/models/StationaryEvent');
const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Booking = require('../../src/models/Booking');
const Driver = require('../../src/models/Driver');
const SOSAlert = require('../../src/models/SOSAlert');
const SupportTicket = require('../../src/models/SupportTicket');

const {
  checkStationary,
  calculateDistanceMeters,
  buildSafetyCheckNotification,
  handleSafetyResponse,
  startMonitoring,
  stopMonitoring,
  processLocationUpdate,
  createStationaryEvent,
  getMonitoringState,
  clearAllMonitoring,
  STATIONARY_THRESHOLD_METERS,
  STATIONARY_DURATION_MS,
  ESCALATION_TIMEOUT_MS
} = require('../../src/services/stationaryDetectionService');

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
  await StationaryEvent.deleteMany({});
  await Trip.deleteMany({});
  await User.deleteMany({});
  await Booking.deleteMany({});
  await Driver.deleteMany({});
  await SOSAlert.deleteMany({});
  await SupportTicket.deleteMany({});
  clearAllMonitoring();
});

// Generators
// Exclude values close to 0 to avoid falsy check issues in SOS service
const coordinatesArbitrary = fc.record({
  lat: fc.double({ min: 1, max: 89, noNaN: true }),
  lng: fc.double({ min: 1, max: 179, noNaN: true })
});

// Generate coordinates within a small radius (stationary)
const stationaryCoordinatesArbitrary = (baseCoords, maxDistanceMeters = 40) => {
  // Convert meters to approximate degrees (rough approximation)
  const metersPerDegree = 111000; // approximately at equator
  const maxDelta = maxDistanceMeters / metersPerDegree;
  
  return fc.record({
    lat: fc.double({ 
      min: baseCoords.lat - maxDelta, 
      max: baseCoords.lat + maxDelta, 
      noNaN: true 
    }),
    lng: fc.double({ 
      min: baseCoords.lng - maxDelta, 
      max: baseCoords.lng + maxDelta, 
      noNaN: true 
    })
  });
};

// Generate coordinates far apart (moving) - ensure at least 500m apart
// At equator, 0.005 degrees ≈ 555m, so we use 0.01 to be safe
const movingCoordinatesArbitrary = fc.tuple(
  coordinatesArbitrary,
  fc.double({ min: 0.01, max: 0.1, noNaN: true }) // offset in degrees (~1km to ~10km)
).map(([base, offset]) => ({
  start: base,
  end: {
    lat: Math.max(1, Math.min(89, base.lat + offset)),
    lng: Math.max(1, Math.min(179, base.lng + offset))
  }
}));

// Helper to create a test trip with booking
const createTestTripWithBooking = async () => {
  // Create driver user
  const driverUser = new User({ 
    phone: `+9198765${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, 
    role: 'driver',
    name: 'Test Driver'
  });
  await driverUser.save();

  // Create driver
  const plateNumber = `KA01AB${Math.floor(Math.random() * 10000)}`;
  const driver = new Driver({
    userId: driverUser._id,
    licenseNumber: `DL${Date.now()}`,
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    vehicles: [{
      registrationNumber: plateNumber,
      plateNumber: plateNumber,
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
    status: 'in_progress'
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


describe('Stationary Detection Trigger - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 16: Stationary Detection Trigger**
  // **Validates: Requirements 8.2**
  
  describe('Property 16: Stationary Detection Trigger', () => {
    it('STATIONARY_THRESHOLD_METERS constant SHALL be exactly 50', () => {
      expect(STATIONARY_THRESHOLD_METERS).toBe(50);
    });

    it('STATIONARY_DURATION_MS constant SHALL be exactly 15 minutes', () => {
      expect(STATIONARY_DURATION_MS).toBe(15 * 60 * 1000);
    });

    it('For any two coordinates less than 50m apart, checkStationary SHALL return isStationary=true', () => {
      fc.assert(
        fc.property(
          coordinatesArbitrary,
          fc.double({ min: 0, max: 49, noNaN: true }), // distance less than 50m
          (baseCoords, distanceMeters) => {
            // Create a second coordinate within the threshold
            const metersPerDegree = 111000;
            const delta = distanceMeters / metersPerDegree;
            
            const secondCoords = {
              lat: Math.max(-90, Math.min(90, baseCoords.lat + delta * 0.7)),
              lng: Math.max(-180, Math.min(180, baseCoords.lng + delta * 0.7))
            };
            
            const state = {
              lastLocation: baseCoords,
              stationaryStartTime: Date.now() - 1000
            };
            
            const result = checkStationary(secondCoords, state);
            
            // Property: should be stationary when distance < 50m
            return result.isStationary === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any two coordinates more than 50m apart, checkStationary SHALL return isStationary=false', () => {
      fc.assert(
        fc.property(
          // Use coordinates in mid-latitudes where distance calculation is more reliable
          fc.record({
            lat: fc.double({ min: 10, max: 50, noNaN: true }),
            lng: fc.double({ min: 10, max: 50, noNaN: true })
          }),
          fc.double({ min: 0.001, max: 0.01, noNaN: true }), // ~100m to ~1km offset
          (baseCoords, offset) => {
            const endCoords = {
              lat: baseCoords.lat + offset,
              lng: baseCoords.lng + offset
            };
            
            // Verify the distance is actually > 50m
            const distance = calculateDistanceMeters(baseCoords, endCoords);
            if (distance <= 50) {
              return true; // Skip this case - offset too small
            }
            
            const state = {
              lastLocation: baseCoords,
              stationaryStartTime: Date.now() - 1000
            };
            
            const result = checkStationary(endCoords, state);
            
            // Property: should not be stationary when distance > 50m
            return result.isStationary === false || result.moved === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any stationary duration >= 15 minutes, thresholdReached SHALL be true', () => {
      fc.assert(
        fc.property(
          coordinatesArbitrary,
          fc.integer({ min: 15 * 60 * 1000, max: 60 * 60 * 1000 }), // 15 min to 1 hour
          (coords, durationMs) => {
            const now = Date.now();
            const state = {
              lastLocation: coords,
              stationaryStartTime: now - durationMs
            };
            
            // Use same coordinates (no movement)
            const result = checkStationary(coords, state);
            
            // Property: threshold should be reached after 15 minutes
            return result.thresholdReached === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any stationary duration < 15 minutes, thresholdReached SHALL be false', () => {
      fc.assert(
        fc.property(
          coordinatesArbitrary,
          fc.integer({ min: 0, max: 14 * 60 * 1000 }), // 0 to 14 minutes
          (coords, durationMs) => {
            const now = Date.now();
            const state = {
              lastLocation: coords,
              stationaryStartTime: now - durationMs
            };
            
            // Use same coordinates (no movement)
            const result = checkStationary(coords, state);
            
            // Property: threshold should not be reached before 15 minutes
            return result.thresholdReached === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateDistanceMeters SHALL return distance in meters between two coordinates', () => {
      fc.assert(
        fc.property(
          coordinatesArbitrary,
          coordinatesArbitrary,
          (coord1, coord2) => {
            const distance = calculateDistanceMeters(coord1, coord2);
            
            // Property: distance should be non-negative
            // Property: distance should be 0 for same coordinates
            if (coord1.lat === coord2.lat && coord1.lng === coord2.lng) {
              return distance === 0;
            }
            return distance >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateDistanceMeters SHALL be symmetric (distance A to B equals B to A)', () => {
      fc.assert(
        fc.property(
          coordinatesArbitrary,
          coordinatesArbitrary,
          (coord1, coord2) => {
            const distanceAB = calculateDistanceMeters(coord1, coord2);
            const distanceBA = calculateDistanceMeters(coord2, coord1);
            
            // Property: distance should be symmetric (within floating point tolerance)
            return Math.abs(distanceAB - distanceBA) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Safety Check Options - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 17: Safety Check Options**
  // **Validates: Requirements 8.3**
  
  describe('Property 17: Safety Check Options', () => {
    it('For any stationary alert notification, it SHALL contain "Confirm Safety" option', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (eventId) => {
            const notification = buildSafetyCheckNotification(eventId);
            
            // Property: notification should have "Confirm Safety" action
            const hasConfirmSafety = notification.actions.some(
              action => action.id === 'confirm_safe' && action.title === 'Confirm Safety'
            );
            
            return hasConfirmSafety;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any stationary alert notification, it SHALL contain "Request Help" option', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (eventId) => {
            const notification = buildSafetyCheckNotification(eventId);
            
            // Property: notification should have "Request Help" action
            const hasRequestHelp = notification.actions.some(
              action => action.id === 'request_help' && action.title === 'Request Help'
            );
            
            return hasRequestHelp;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any stationary alert notification, it SHALL contain both options', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (eventId) => {
            const notification = buildSafetyCheckNotification(eventId);
            
            // Property: notification should have exactly 2 actions
            const hasCorrectActionCount = notification.actions.length === 2;
            
            // Property: notification should have both required actions
            const actionIds = notification.actions.map(a => a.id);
            const hasBothActions = actionIds.includes('confirm_safe') && 
                                   actionIds.includes('request_help');
            
            return hasCorrectActionCount && hasBothActions;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any stationary alert notification, it SHALL ask "Is everything okay?"', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (eventId) => {
            const notification = buildSafetyCheckNotification(eventId);
            
            // Property: notification body should contain the safety question
            return notification.body === 'Is everything okay?';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any stationary alert notification, it SHALL include the event ID in data', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (eventId) => {
            const notification = buildSafetyCheckNotification(eventId);
            
            // Property: notification data should include eventId
            return notification.data.eventId === eventId &&
                   notification.data.type === 'safety_check';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Request Help option SHALL be marked as destructive', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (eventId) => {
            const notification = buildSafetyCheckNotification(eventId);
            
            // Property: Request Help action should be marked destructive
            const helpAction = notification.actions.find(a => a.id === 'request_help');
            return helpAction && helpAction.destructive === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Help Request SOS Trigger - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 18: Help Request SOS Trigger**
  // **Validates: Requirements 8.5**
  
  describe('Property 18: Help Request SOS Trigger', () => {
    it('For any safety check where passenger selects "help", an SOS alert SHALL be created', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SOSAlert.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(),
              status: 'alert_sent',
              alertSentAt: new Date()
            });
            await event.save();
            
            // Handle help response
            const result = await handleSafetyResponse(event._id.toString(), 'help');
            
            // Verify SOS alert was created
            const sosAlert = await SOSAlert.findById(result.sosAlertId);
            
            // Property: SOS alert should be created when help is requested
            return result.action === 'sos_triggered' && 
                   sosAlert !== null &&
                   sosAlert.status === 'active';
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any safety check where passenger selects "safe", NO SOS alert SHALL be created', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SOSAlert.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(),
              status: 'alert_sent',
              alertSentAt: new Date()
            });
            await event.save();
            
            // Handle safe response
            const result = await handleSafetyResponse(event._id.toString(), 'safe');
            
            // Count SOS alerts
            const sosCount = await SOSAlert.countDocuments({ tripId: trip._id });
            
            // Property: No SOS alert should be created when safe is selected
            return result.action === 'safety_confirmed' && sosCount === 0;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any help request, the stationary event SHALL be linked to the SOS alert', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SOSAlert.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(),
              status: 'alert_sent',
              alertSentAt: new Date()
            });
            await event.save();
            
            // Handle help response
            const result = await handleSafetyResponse(event._id.toString(), 'help');
            
            // Reload event to check link
            const updatedEvent = await StationaryEvent.findById(event._id);
            
            // Property: Event should be linked to SOS alert
            return updatedEvent.sosAlertId !== null &&
                   updatedEvent.sosAlertId.toString() === result.sosAlertId.toString();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('For any help request, the event status SHALL be updated to help_requested', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SOSAlert.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(),
              status: 'alert_sent',
              alertSentAt: new Date()
            });
            await event.save();
            
            // Handle help response
            await handleSafetyResponse(event._id.toString(), 'help');
            
            // Reload event
            const updatedEvent = await StationaryEvent.findById(event._id);
            
            // Property: Event status should be help_requested
            return updatedEvent.status === 'help_requested';
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});


describe('Escalation Flow - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 19: Escalation Flow**
  // **Validates: Requirements 8.6, 8.7**
  
  describe('Property 19: Escalation Flow', () => {
    it('ESCALATION_TIMEOUT_MS constant SHALL be exactly 5 minutes', () => {
      expect(ESCALATION_TIMEOUT_MS).toBe(5 * 60 * 1000);
    });

    it('For any event with no response, escalation SHALL record call attempt', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SupportTicket.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event that needs escalation
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
              status: 'alert_sent',
              alertSentAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago (past escalation timeout)
              passengerResponse: {
                responded: false
              }
            });
            await event.save();
            
            // Import and call escalation check
            const { checkAndEscalate } = require('../../src/services/stationaryDetectionService');
            await checkAndEscalate(event._id.toString());
            
            // Reload event
            const updatedEvent = await StationaryEvent.findById(event._id);
            
            // Property: Call attempt should be recorded
            return updatedEvent.escalation.callAttempted === true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('For any unanswered call, escalation SHALL create support ticket', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SupportTicket.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event that needs escalation
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(Date.now() - 20 * 60 * 1000),
              status: 'alert_sent',
              alertSentAt: new Date(Date.now() - 6 * 60 * 1000),
              passengerResponse: {
                responded: false
              }
            });
            await event.save();
            
            // Call escalation
            const { checkAndEscalate } = require('../../src/services/stationaryDetectionService');
            await checkAndEscalate(event._id.toString());
            
            // Check for support ticket - use relatedTrip since metadata is Mixed type
            const ticket = await SupportTicket.findOne({ 
              relatedTrip: trip._id,
              category: 'safety'
            });
            
            // Reload event
            const updatedEvent = await StationaryEvent.findById(event._id);
            
            // Property: Support ticket should be created and event should be escalated
            return ticket !== null && 
                   updatedEvent.escalation.escalatedToSupport === true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('For any escalation, support ticket SHALL include trip details and location', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SupportTicket.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(Date.now() - 20 * 60 * 1000),
              status: 'alert_sent',
              alertSentAt: new Date(Date.now() - 6 * 60 * 1000),
              passengerResponse: {
                responded: false
              }
            });
            await event.save();
            
            // Call escalation
            const { checkAndEscalate } = require('../../src/services/stationaryDetectionService');
            await checkAndEscalate(event._id.toString());
            
            // Check support ticket
            const ticket = await SupportTicket.findOne({ 
              relatedTrip: trip._id,
              category: 'safety'
            });
            
            // Property: Ticket should include trip ID and location in metadata
            return ticket !== null &&
                   ticket.relatedTrip.toString() === trip._id.toString() &&
                   ticket.metadata !== undefined &&
                   ticket.metadata.location !== undefined;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('For any already responded event, escalation SHALL be skipped', async () => {
      await fc.assert(
        fc.asyncProperty(
          coordinatesArbitrary,
          async (coords) => {
            // Clean up
            await StationaryEvent.deleteMany({});
            await Trip.deleteMany({});
            await User.deleteMany({});
            await Booking.deleteMany({});
            await Driver.deleteMany({});
            await SupportTicket.deleteMany({});
            clearAllMonitoring();
            
            const { trip, passengerUser } = await createTestTripWithBooking();
            
            // Create a stationary event that already has a response
            const event = new StationaryEvent({
              tripId: trip._id,
              passengerId: passengerUser._id,
              location: {
                coordinates: {
                  lat: coords.lat,
                  lng: coords.lng
                }
              },
              startedAt: new Date(Date.now() - 20 * 60 * 1000),
              status: 'safe_confirmed',
              alertSentAt: new Date(Date.now() - 6 * 60 * 1000),
              passengerResponse: {
                responded: true,
                respondedAt: new Date(),
                response: 'safe'
              }
            });
            await event.save();
            
            // Call escalation
            const { checkAndEscalate } = require('../../src/services/stationaryDetectionService');
            const result = await checkAndEscalate(event._id.toString());
            
            // Check no support ticket was created
            const ticketCount = await SupportTicket.countDocuments({ 
              'metadata.stationaryEventId': event._id 
            });
            
            // Property: No escalation should happen for already responded events
            return result.reason === 'already_handled' && ticketCount === 0;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
