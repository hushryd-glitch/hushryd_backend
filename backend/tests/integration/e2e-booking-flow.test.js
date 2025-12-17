/**
 * End-to-End Integration Tests for Passenger Ride Search & Booking Flow
 * 
 * Tests the complete flow: search → view details → book → payment
 * Verifies fare calculations at each step and driver earnings deductions
 * 
 * **Feature: passenger-ride-search-booking**
 * **Task: 13.1 End-to-end flow verification**
 * **Validates: All Requirements**
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Trip = require('../../src/models/Trip');
const User = require('../../src/models/User');
const Driver = require('../../src/models/Driver');
const Booking = require('../../src/models/Booking');
const { searchRides, getPublicTripDetails } = require('../../src/services/searchService');
const { createBooking, confirmBooking, validateSeatAvailability } = require('../../src/services/bookingService');
const { calculateBookingFare, PLATFORM_FEE } = require('../../src/services/fareCalculation');
const { computeBadges, BADGE_TYPES } = require('../../src/utils/badgeUtils');

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
  await Booking.deleteMany({});
});

/**
 * Helper to create a complete test setup with driver, trip, and passenger
 */
const createTestSetup = async (overrides = {}) => {
  // Create driver user
  const driverUser = new User({
    phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
    role: 'driver',
    name: overrides.driverName || 'Test Driver',
    profilePhoto: overrides.driverPhoto || null
  });
  await driverUser.save();

  // Create driver with verification status
  const driver = new Driver({
    userId: driverUser._id,
    licenseNumber: `DL${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    verificationStatus: overrides.verificationStatus || 'verified',
    rating: overrides.driverRating || 4.5,
    totalTrips: overrides.driverTotalTrips || 50,
    vehicles: [{
      type: overrides.vehicleType || 'sedan',
      make: overrides.vehicleMake || 'Toyota',
      model: overrides.vehicleModel || 'Camry',
      color: overrides.vehicleColor || 'White',
      registrationNumber: `MH01AB${Math.floor(1000 + Math.random() * 9000)}`,
      seats: 4,
      year: 2022,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }]
  });
  await driver.save();

  // Create trip
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
      address: overrides.sourceAddress || 'Connaught Place, Delhi',
      coordinates: { lat: 28.6315, lng: 77.2167 }
    },
    destination: {
      address: overrides.destAddress || 'Cyber Hub, Gurgaon',
      coordinates: { lat: 28.4950, lng: 77.0895 }
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

  // Create passenger user with complete profile
  const passengerUser = new User({
    phone: `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`,
    role: 'passenger',
    name: overrides.passengerName || 'Test Passenger',
    email: `passenger${Date.now()}@test.com`,
    emergencyContacts: [{
      name: 'Emergency Contact',
      phone: '+919876543210',
      relationship: 'friend'
    }]
  });
  await passengerUser.save();

  return { trip, driver, driverUser, passengerUser };
};

describe('End-to-End Booking Flow Integration Tests', () => {
  describe('Step 1: Search for Rides', () => {
    it('should return trips matching search criteria with all required fields', async () => {
      // Setup
      const { trip } = await createTestSetup({
        sourceAddress: 'Connaught Place, Delhi',
        destAddress: 'Cyber Hub, Gurgaon',
        farePerSeat: 300,
        availableSeats: 4,
        verificationStatus: 'verified',
        instantBooking: true
      });

      // Execute search
      const searchResult = await searchRides({
        from: 'Delhi',
        to: 'Gurgaon'
      });

      // Verify search results
      expect(searchResult.success).toBe(true);
      expect(searchResult.trips.length).toBeGreaterThan(0);

      const foundTrip = searchResult.trips[0];
      
      // Verify required driver fields (Requirements 1.2)
      expect(foundTrip.driver).toBeDefined();
      expect(foundTrip.driver.name).toBeDefined();
      expect(foundTrip.driver.rating).toBeDefined();
      expect(foundTrip.driver.totalTrips).toBeDefined();
      expect(foundTrip.driver.verified).toBe(true);

      // Verify required trip fields (Requirements 1.3, 1.4, 1.5)
      expect(foundTrip.farePerSeat).toBe(300);
      expect(foundTrip.scheduledAt).toBeDefined();
      expect(foundTrip.source.address).toContain('Delhi');
      expect(foundTrip.destination.address).toContain('Gurgaon');
      expect(foundTrip.availableSeats).toBe(4);

      // Verify badges (Requirements 2.1, 2.2)
      expect(foundTrip.instantBooking).toBe(true);
    });

    it('should only return bookable trips (scheduled with available seats > 0)', async () => {
      // Create bookable trip
      await createTestSetup({
        status: 'scheduled',
        availableSeats: 4
      });

      // Create non-bookable trips
      await createTestSetup({
        status: 'completed',
        availableSeats: 4
      });
      await createTestSetup({
        status: 'scheduled',
        availableSeats: 0
      });

      // Execute search
      const searchResult = await searchRides({
        from: 'Delhi',
        to: 'Gurgaon'
      });

      // Should only return the bookable trip
      expect(searchResult.trips.length).toBe(1);
      expect(searchResult.trips[0].availableSeats).toBeGreaterThan(0);
    });
  });

  describe('Step 2: View Trip Details', () => {
    it('should return complete trip details with driver profile and vehicle info', async () => {
      const { trip } = await createTestSetup({
        driverName: 'Verified Driver',
        driverRating: 4.8,
        driverTotalTrips: 100,
        verificationStatus: 'verified',
        vehicleType: 'sedan',
        vehicleMake: 'Honda',
        vehicleModel: 'City',
        vehicleColor: 'Silver'
      });

      // Get trip details
      const detailsResult = await getPublicTripDetails(trip._id.toString());

      // Verify success
      expect(detailsResult.success).toBe(true);

      // Verify route information (Requirements 3.2)
      expect(detailsResult.trip.source.address).toBeDefined();
      expect(detailsResult.trip.destination.address).toBeDefined();

      // Verify driver profile (Requirements 3.3)
      expect(detailsResult.trip.driver.name).toBe('Verified Driver');
      expect(detailsResult.trip.driver.rating).toBe(4.8);
      expect(detailsResult.trip.driver.totalTrips).toBe(100);
      expect(detailsResult.trip.driver.verified).toBe(true);

      // Verify vehicle information (Requirements 3.4)
      expect(detailsResult.trip.vehicle).toBeDefined();
      expect(detailsResult.trip.vehicle.type).toBe('sedan');
      expect(detailsResult.trip.vehicle.make).toBe('Honda');
      expect(detailsResult.trip.vehicle.model).toBe('City');
      expect(detailsResult.trip.vehicle.color).toBe('Silver');

      // Verify scheduled date (Requirements 3.5)
      expect(detailsResult.trip.scheduledAt).toBeDefined();
      expect(new Date(detailsResult.trip.scheduledAt)).toBeInstanceOf(Date);
    });
  });

  describe('Step 3: Fare Calculation Verification', () => {
    it('should calculate correct fare breakdown with platform fees', () => {
      const farePerSeat = 250;
      const seats = 2;

      const fareBreakdown = calculateBookingFare(farePerSeat, seats);

      // Verify passenger fare (Requirements 4.1, 4.2, 4.3)
      expect(fareBreakdown.baseFare).toBe(500); // 250 × 2
      expect(fareBreakdown.passengerPlatformFee).toBe(30); // ₹15 × 2
      expect(fareBreakdown.totalPassengerPays).toBe(530); // 500 + 30

      // Verify driver earnings (Requirements 6.1, 6.3)
      expect(fareBreakdown.driverPlatformFee).toBe(30); // ₹15 × 2
      expect(fareBreakdown.driverNetEarnings).toBe(470); // 500 - 30
    });

    it('should update fare breakdown when seat count changes (Requirements 4.4)', () => {
      const farePerSeat = 300;

      // 1 seat
      const fare1 = calculateBookingFare(farePerSeat, 1);
      expect(fare1.totalPassengerPays).toBe(315); // 300 + 15

      // 3 seats
      const fare3 = calculateBookingFare(farePerSeat, 3);
      expect(fare3.totalPassengerPays).toBe(945); // 900 + 45

      // 6 seats
      const fare6 = calculateBookingFare(farePerSeat, 6);
      expect(fare6.totalPassengerPays).toBe(1890); // 1800 + 90
    });
  });

  describe('Step 4: Seat Validation', () => {
    it('should accept booking when seats are available (Requirements 5.1, 5.2)', () => {
      const result = validateSeatAvailability(2, 4);
      expect(result.isValid).toBe(true);
    });

    it('should reject booking when seats exceed available (Requirements 5.5)', () => {
      const result = validateSeatAvailability(5, 3);
      expect(result.isValid).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_SEATS');
      expect(result.message).toBe('Only 3 seats available');
    });

    it('should reject booking when no seats available', () => {
      const result = validateSeatAvailability(1, 0);
      expect(result.isValid).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_SEATS');
      expect(result.message).toBe('No seats available for this trip');
    });
  });

  describe('Step 5: Create Booking', () => {
    it('should create pending booking with valid data (Requirements 5.3)', async () => {
      const { trip, passengerUser } = await createTestSetup({
        farePerSeat: 250,
        availableSeats: 4
      });

      const bookingData = {
        tripId: trip._id.toString(),
        seats: 2,
        pickupPoint: {
          address: 'Pickup Location, Delhi',
          coordinates: { lat: 28.6315, lng: 77.2167 }
        },
        dropPoint: {
          address: 'Drop Location, Gurgaon',
          coordinates: { lat: 28.4950, lng: 77.0895 }
        }
      };

      const result = await createBooking(passengerUser._id.toString(), bookingData);

      // Verify booking created
      expect(result.success).toBe(true);
      expect(result.booking).toBeDefined();
      expect(result.booking.bookingId).toMatch(/^BK-\d{4}-\d{6}$/);
      expect(result.booking.status).toBe('pending');
      expect(result.booking.paymentStatus).toBe('pending');
      expect(result.booking.seats).toBe(2);
    });

    it('should prevent overbooking (Requirements 5.5)', async () => {
      const { trip, passengerUser } = await createTestSetup({
        farePerSeat: 250,
        availableSeats: 2
      });

      const bookingData = {
        tripId: trip._id.toString(),
        seats: 3, // More than available
        pickupPoint: {
          address: 'Pickup Location',
          coordinates: { lat: 28.6315, lng: 77.2167 }
        },
        dropPoint: {
          address: 'Drop Location',
          coordinates: { lat: 28.4950, lng: 77.0895 }
        }
      };

      await expect(createBooking(passengerUser._id.toString(), bookingData))
        .rejects.toThrow('Only 2 seats available');
    });
  });

  describe('Step 6: Confirm Booking with Payment', () => {
    it('should confirm booking on successful payment (Requirements 5.4)', async () => {
      const { trip, passengerUser } = await createTestSetup({
        farePerSeat: 250,
        availableSeats: 4
      });

      // Create pending booking
      const bookingData = {
        tripId: trip._id.toString(),
        seats: 2,
        pickupPoint: {
          address: 'Pickup Location',
          coordinates: { lat: 28.6315, lng: 77.2167 }
        },
        dropPoint: {
          address: 'Drop Location',
          coordinates: { lat: 28.4950, lng: 77.0895 }
        }
      };

      const createResult = await createBooking(passengerUser._id.toString(), bookingData);
      expect(createResult.booking.status).toBe('pending');

      // Confirm with payment
      const paymentId = `PAY-${Date.now()}-test123`;
      const confirmResult = await confirmBooking(createResult.booking.bookingId, paymentId);

      // Verify confirmation
      expect(confirmResult.success).toBe(true);
      expect(confirmResult.booking.status).toBe('confirmed');
      expect(confirmResult.booking.paymentStatus).toBe('paid');
      expect(confirmResult.booking.paymentId).toBe(paymentId);
    });
  });

  describe('Step 7: Driver Earnings Verification', () => {
    it('should correctly calculate driver net earnings after platform fee deduction (Requirements 6.2)', () => {
      // Scenario: 3 seats booked at ₹200/seat
      const farePerSeat = 200;
      const seats = 3;

      const fareBreakdown = calculateBookingFare(farePerSeat, seats);

      // Gross fare: 200 × 3 = 600
      expect(fareBreakdown.baseFare).toBe(600);

      // Platform fee: ₹15 × 3 = 45
      expect(fareBreakdown.driverPlatformFee).toBe(45);

      // Net earnings: 600 - 45 = 555
      expect(fareBreakdown.driverNetEarnings).toBe(555);

      // Verify formula: net = fare - (₹15 × seats)
      const expectedNet = (farePerSeat * seats) - (PLATFORM_FEE.DRIVER_FEE_PER_SEAT * seats);
      expect(fareBreakdown.driverNetEarnings).toBe(expectedNet);
    });
  });

  describe('Badge Computation Verification', () => {
    it('should compute correct badges based on trip flags (Requirements 2.1, 2.2, 2.3)', () => {
      // Verified driver with instant booking
      const trip1 = {
        driver: { verified: true },
        instantBooking: true,
        ladiesOnly: false
      };
      const badges1 = computeBadges(trip1);
      expect(badges1).toContain(BADGE_TYPES.ID_VERIFIED);
      expect(badges1).toContain(BADGE_TYPES.INSTANT_BOOKING);
      expect(badges1).not.toContain(BADGE_TYPES.LADIES_ONLY);

      // Ladies only trip
      const trip2 = {
        driver: { verified: false },
        instantBooking: false,
        ladiesOnly: true
      };
      const badges2 = computeBadges(trip2);
      expect(badges2).not.toContain(BADGE_TYPES.ID_VERIFIED);
      expect(badges2).not.toContain(BADGE_TYPES.INSTANT_BOOKING);
      expect(badges2).toContain(BADGE_TYPES.LADIES_ONLY);

      // All badges
      const trip3 = {
        driver: { verified: true },
        instantBooking: true,
        ladiesOnly: true
      };
      const badges3 = computeBadges(trip3);
      expect(badges3.length).toBe(3);
    });
  });

  describe('Complete End-to-End Flow', () => {
    it('should complete full booking flow: search → details → book → confirm', async () => {
      // Step 1: Setup - Create a trip
      const { trip, passengerUser } = await createTestSetup({
        sourceAddress: 'Connaught Place, Delhi',
        destAddress: 'Cyber Hub, Gurgaon',
        farePerSeat: 350,
        availableSeats: 4,
        verificationStatus: 'verified',
        instantBooking: true,
        driverName: 'Rahul Kumar',
        driverRating: 4.7
      });

      // Step 2: Search for rides
      const searchResult = await searchRides({
        from: 'Delhi',
        to: 'Gurgaon'
      });
      expect(searchResult.success).toBe(true);
      expect(searchResult.trips.length).toBe(1);
      
      const searchedTrip = searchResult.trips[0];
      expect(searchedTrip.farePerSeat).toBe(350);
      expect(searchedTrip.driver.verified).toBe(true);
      expect(searchedTrip.instantBooking).toBe(true);

      // Step 3: View trip details
      const detailsResult = await getPublicTripDetails(searchedTrip._id.toString());
      expect(detailsResult.success).toBe(true);
      expect(detailsResult.trip.driver.name).toBe('Rahul Kumar');
      expect(detailsResult.trip.driver.rating).toBe(4.7);

      // Step 4: Calculate fare for 2 seats
      const seats = 2;
      const fareBreakdown = calculateBookingFare(searchedTrip.farePerSeat, seats);
      expect(fareBreakdown.baseFare).toBe(700); // 350 × 2
      expect(fareBreakdown.passengerPlatformFee).toBe(30); // 15 × 2
      expect(fareBreakdown.totalPassengerPays).toBe(730); // 700 + 30
      expect(fareBreakdown.driverNetEarnings).toBe(670); // 700 - 30

      // Step 5: Create booking
      const bookingData = {
        tripId: trip._id.toString(),
        seats: seats,
        pickupPoint: {
          address: 'Rajiv Chowk Metro, Delhi',
          coordinates: { lat: 28.6328, lng: 77.2197 }
        },
        dropPoint: {
          address: 'Cyber Hub Gate 1, Gurgaon',
          coordinates: { lat: 28.4950, lng: 77.0895 }
        }
      };

      const createResult = await createBooking(passengerUser._id.toString(), bookingData);
      expect(createResult.success).toBe(true);
      expect(createResult.booking.status).toBe('pending');
      expect(createResult.booking.seats).toBe(2);

      // Step 6: Confirm booking with payment
      const paymentId = `PAY-${Date.now()}-razorpay123`;
      const confirmResult = await confirmBooking(createResult.booking.bookingId, paymentId);
      expect(confirmResult.success).toBe(true);
      expect(confirmResult.booking.status).toBe('confirmed');
      expect(confirmResult.booking.paymentStatus).toBe('paid');

      // Step 7: Verify booking in database
      const savedBooking = await Booking.findOne({ bookingId: createResult.booking.bookingId });
      expect(savedBooking).toBeDefined();
      expect(savedBooking.status).toBe('confirmed');
      expect(savedBooking.paymentId).toBe(paymentId);

      // Step 8: Verify trip passengers updated
      const updatedTrip = await Trip.findById(trip._id);
      expect(updatedTrip.passengers.length).toBe(1);
      expect(updatedTrip.passengers[0].seats).toBe(2);
    });
  });
});
