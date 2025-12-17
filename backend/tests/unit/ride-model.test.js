/**
 * Ride Model Tests
 * Tests for the new Ride model for AbhiBus-style interface
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Ride = require('../../src/models/Ride');
const Driver = require('../../src/models/Driver');
const User = require('../../src/models/User');

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
  await mongoose.connection.db.dropDatabase();
});

describe('Ride Model Validation', () => {
  let driver;

  beforeEach(async () => {
    const user = await User.create({ phone: '+919876543210' });
    driver = await Driver.create({
      userId: user._id,
      licenseNumber: 'DL1234567890',
      licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      vehicleType: 'sedan',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2020,
      vehicleColor: 'White',
      vehicleRegistration: 'KA01AB1234',
      vehicleSeats: 4,
      status: 'approved'
    });
  });

  describe('Required fields', () => {
    it('should require all mandatory fields', async () => {
      const ride = new Ride({});
      
      let error;
      try {
        await ride.save();
      } catch (err) {
        error = err;
      }
      
      expect(error).toBeDefined();
      expect(error.errors.driverId).toBeDefined();
      expect(error.errors.route).toBeDefined();
      expect(error.errors.departureTime).toBeDefined();
      expect(error.errors.arrivalTime).toBeDefined();
      expect(error.errors.vehicle).toBeDefined();
      expect(error.errors.boardingPoints).toBeDefined();
      expect(error.errors.droppingPoints).toBeDefined();
      expect(error.errors.operator).toBeDefined();
      
      // Check nested required fields
      expect(error.errors['pricing.baseFare'] || error.errors.pricing).toBeDefined();
    });

    it('should create ride with all required fields', async () => {
      const rideData = {
        driverId: driver._id,
        route: {
          from: {
            name: 'Bangalore',
            coordinates: [77.5946, 12.9716],
            placeId: 'ChIJbU60yXAWrjsR4E9-UejD3_g',
            address: 'Bangalore, Karnataka, India'
          },
          to: {
            name: 'Chennai',
            coordinates: [80.2707, 13.0827],
            placeId: 'ChIJYTN9T-plUjoRM9RjaAunYW4',
            address: 'Chennai, Tamil Nadu, India'
          },
          distance: 350,
          estimatedDuration: 420,
          polyline: 'encoded_polyline_string'
        },
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        arrivalTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
        vehicle: {
          type: 'ac',
          model: 'Toyota Innova',
          registrationNumber: 'KA01AB1234',
          amenities: ['wifi', 'charging-point']
        },
        pricing: {
          baseFare: 500,
          perKmRate: 8,
          totalSeats: 6,
          availableSeats: 6
        },
        boardingPoints: [{
          id: 'bp1',
          name: 'Majestic Bus Stand',
          address: 'Majestic, Bangalore',
          coordinates: [77.5946, 12.9716],
          time: '06:00',
          landmark: 'Near Railway Station'
        }],
        droppingPoints: [{
          id: 'dp1',
          name: 'CMBT',
          address: 'Chennai Mofussil Bus Terminus',
          coordinates: [80.2707, 13.0827],
          time: '13:00',
          landmark: 'Main Bus Terminal'
        }],
        operator: {
          name: 'HushRyd Express',
          rating: 4.5,
          totalTrips: 100
        }
      };

      const ride = await Ride.create(rideData);
      expect(ride._id).toBeDefined();
      expect(ride.driverId.toString()).toBe(driver._id.toString());
      expect(ride.status).toBe('active');
      expect(ride.isWomenOnly).toBe(false);
    });
  });

  describe('Women-only ride functionality', () => {
    it('should allow creating women-only rides', async () => {
      const rideData = {
        driverId: driver._id,
        route: {
          from: {
            name: 'Bangalore',
            coordinates: [77.5946, 12.9716],
            placeId: 'ChIJbU60yXAWrjsR4E9-UejD3_g',
            address: 'Bangalore, Karnataka, India'
          },
          to: {
            name: 'Chennai',
            coordinates: [80.2707, 13.0827],
            placeId: 'ChIJYTN9T-plUjoRM9RjaAunYW4',
            address: 'Chennai, Tamil Nadu, India'
          },
          distance: 350,
          estimatedDuration: 420,
          polyline: 'encoded_polyline_string'
        },
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        arrivalTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
        vehicle: {
          type: 'ac',
          model: 'Toyota Innova',
          registrationNumber: 'KA01AB1234'
        },
        pricing: {
          baseFare: 500,
          perKmRate: 8,
          totalSeats: 6,
          availableSeats: 6
        },
        isWomenOnly: true,
        boardingPoints: [{
          id: 'bp1',
          name: 'Majestic Bus Stand',
          address: 'Majestic, Bangalore',
          coordinates: [77.5946, 12.9716],
          time: '06:00'
        }],
        droppingPoints: [{
          id: 'dp1',
          name: 'CMBT',
          address: 'Chennai Mofussil Bus Terminus',
          coordinates: [80.2707, 13.0827],
          time: '13:00'
        }],
        operator: {
          name: 'HushRyd Express'
        }
      };

      const ride = await Ride.create(rideData);
      expect(ride.isWomenOnly).toBe(true);
    });

    it('should prevent male users from booking women-only rides', async () => {
      const ride = new Ride({
        isWomenOnly: true,
        status: 'active',
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        pricing: { availableSeats: 2 }
      });

      const maleUser = { gender: 'male' };
      const result = ride.canUserBook(maleUser);

      expect(result.canBook).toBe(false);
      expect(result.reason).toBe('WOMEN_ONLY_RIDE');
      expect(result.message).toContain('exclusively for women');
    });

    it('should allow female users to book women-only rides', async () => {
      const ride = new Ride({
        isWomenOnly: true,
        status: 'active',
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        pricing: { availableSeats: 2 }
      });

      const femaleUser = { gender: 'female' };
      const result = ride.canUserBook(femaleUser);

      expect(result.canBook).toBe(true);
      expect(result.reason).toBe(null);
    });
  });

  describe('Seat booking functionality', () => {
    let ride;

    beforeEach(async () => {
      const rideData = {
        driverId: driver._id,
        route: {
          from: {
            name: 'Bangalore',
            coordinates: [77.5946, 12.9716],
            placeId: 'ChIJbU60yXAWrjsR4E9-UejD3_g',
            address: 'Bangalore, Karnataka, India'
          },
          to: {
            name: 'Chennai',
            coordinates: [80.2707, 13.0827],
            placeId: 'ChIJYTN9T-plUjoRM9RjaAunYW4',
            address: 'Chennai, Tamil Nadu, India'
          },
          distance: 350,
          estimatedDuration: 420,
          polyline: 'encoded_polyline_string'
        },
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        arrivalTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
        vehicle: {
          type: 'ac',
          model: 'Toyota Innova',
          registrationNumber: 'KA01AB1234'
        },
        pricing: {
          baseFare: 500,
          perKmRate: 8,
          totalSeats: 6,
          availableSeats: 4
        },
        boardingPoints: [{
          id: 'bp1',
          name: 'Majestic Bus Stand',
          address: 'Majestic, Bangalore',
          coordinates: [77.5946, 12.9716],
          time: '06:00'
        }],
        droppingPoints: [{
          id: 'dp1',
          name: 'CMBT',
          address: 'Chennai Mofussil Bus Terminus',
          coordinates: [80.2707, 13.0827],
          time: '13:00'
        }],
        operator: {
          name: 'HushRyd Express'
        }
      };

      ride = await Ride.create(rideData);
    });

    it('should book seats successfully', async () => {
      const initialSeats = ride.pricing.availableSeats;
      await ride.bookSeats(2);
      
      expect(ride.pricing.availableSeats).toBe(initialSeats - 2);
    });

    it('should not allow booking more seats than available', async () => {
      let error;
      try {
        await ride.bookSeats(10);
      } catch (err) {
        error = err;
      }
      
      expect(error).toBeDefined();
      expect(error.message).toContain('Insufficient seats');
    });

    it('should release seats after cancellation', async () => {
      await ride.bookSeats(2);
      const seatsAfterBooking = ride.pricing.availableSeats;
      
      await ride.releaseSeats(1);
      expect(ride.pricing.availableSeats).toBe(seatsAfterBooking + 1);
    });
  });

  describe('Search functionality', () => {
    beforeEach(async () => {
      // Create test rides
      const rideData1 = {
        driverId: driver._id,
        route: {
          from: {
            name: 'Bangalore',
            coordinates: [77.5946, 12.9716],
            placeId: 'bangalore_place_id',
            address: 'Bangalore, Karnataka, India'
          },
          to: {
            name: 'Chennai',
            coordinates: [80.2707, 13.0827],
            placeId: 'chennai_place_id',
            address: 'Chennai, Tamil Nadu, India'
          },
          distance: 350,
          estimatedDuration: 420,
          polyline: 'encoded_polyline_string'
        },
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        arrivalTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
        vehicle: {
          type: 'ac',
          model: 'Toyota Innova',
          registrationNumber: 'KA01AB1234'
        },
        pricing: {
          baseFare: 500,
          perKmRate: 8,
          totalSeats: 6,
          availableSeats: 4
        },
        isWomenOnly: false,
        boardingPoints: [{
          id: 'bp1',
          name: 'Majestic Bus Stand',
          address: 'Majestic, Bangalore',
          coordinates: [77.5946, 12.9716],
          time: '06:00'
        }],
        droppingPoints: [{
          id: 'dp1',
          name: 'CMBT',
          address: 'Chennai Mofussil Bus Terminus',
          coordinates: [80.2707, 13.0827],
          time: '13:00'
        }],
        operator: {
          name: 'HushRyd Express'
        }
      };

      const rideData2 = {
        ...rideData1,
        isWomenOnly: true,
        vehicle: {
          type: 'non-ac',
          model: 'Tata Sumo',
          registrationNumber: 'KA01AB5678'
        },
        pricing: {
          baseFare: 400,
          perKmRate: 6,
          totalSeats: 8,
          availableSeats: 6
        }
      };

      await Ride.create(rideData1);
      await Ride.create(rideData2);
    });

    it('should search rides by route', async () => {
      const results = await Ride.searchRides({
        fromPlaceId: 'bangalore_place_id',
        toPlaceId: 'chennai_place_id'
      });

      expect(results).toHaveLength(2);
    });

    it('should filter women-only rides', async () => {
      const results = await Ride.searchRides({
        fromPlaceId: 'bangalore_place_id',
        toPlaceId: 'chennai_place_id',
        isWomenOnly: true
      });

      expect(results).toHaveLength(1);
      expect(results[0].isWomenOnly).toBe(true);
    });

    it('should filter by vehicle type', async () => {
      const results = await Ride.searchRides({
        fromPlaceId: 'bangalore_place_id',
        toPlaceId: 'chennai_place_id',
        vehicleType: 'ac'
      });

      expect(results).toHaveLength(1);
      expect(results[0].vehicle.type).toBe('ac');
    });

    it('should filter by passenger count', async () => {
      const results = await Ride.searchRides({
        fromPlaceId: 'bangalore_place_id',
        toPlaceId: 'chennai_place_id',
        passengers: 5
      });

      expect(results).toHaveLength(1);
      expect(results[0].pricing.availableSeats).toBeGreaterThanOrEqual(5);
    });
  });
});