/**
 * Unit tests for data model validation
 * Tests User, OTP, and Trip model validation rules
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../src/models/User');
const OTP = require('../../src/models/OTP');
const Trip = require('../../src/models/Trip');

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
  await User.deleteMany({});
  await OTP.deleteMany({});
  await Trip.deleteMany({});
});

describe('User Model Validation', () => {
  describe('Required fields', () => {
    it('should require at least phone or email', async () => {
      const user = new User({ name: 'Test User' });
      await expect(user.save()).rejects.toThrow('Either phone or email is required');
    });

    it('should accept user with only phone', async () => {
      const user = new User({ phone: '+919876543210' });
      const saved = await user.save();
      expect(saved.phone).toBe('+919876543210');
    });

    it('should accept user with only email', async () => {
      const user = new User({ email: 'test@example.com' });
      const saved = await user.save();
      expect(saved.email).toBe('test@example.com');
    });
  });

  describe('Phone validation', () => {
    it('should accept valid phone numbers', async () => {
      const user = new User({ phone: '+919876543210' });
      const saved = await user.save();
      expect(saved.phone).toBe('+919876543210');
    });

    it('should reject invalid phone numbers', async () => {
      const user = new User({ phone: 'invalid' });
      await expect(user.save()).rejects.toThrow('valid phone number');
    });
  });


  describe('Email validation', () => {
    it('should accept valid email addresses', async () => {
      const user = new User({ email: 'test@example.com' });
      const saved = await user.save();
      expect(saved.email).toBe('test@example.com');
    });

    it('should reject invalid email addresses', async () => {
      const user = new User({ email: 'invalid-email' });
      await expect(user.save()).rejects.toThrow('valid email');
    });

    it('should lowercase email addresses', async () => {
      const user = new User({ email: 'TEST@EXAMPLE.COM' });
      const saved = await user.save();
      expect(saved.email).toBe('test@example.com');
    });
  });

  describe('Gender validation', () => {
    it('should accept valid gender values', async () => {
      const user = new User({ phone: '+919876543210', gender: 'female' });
      const saved = await user.save();
      expect(saved.gender).toBe('female');
    });

    it('should reject invalid gender values', async () => {
      const user = new User({ phone: '+919876543210', gender: 'invalid' });
      await expect(user.save()).rejects.toThrow();
    });
  });

  describe('Emergency contacts validation', () => {
    it('should accept valid emergency contacts', async () => {
      const user = new User({
        phone: '+919876543210',
        emergencyContacts: [{
          name: 'John Doe',
          phone: '+919876543211',
          relationship: 'Brother'
        }]
      });
      const saved = await user.save();
      expect(saved.emergencyContacts).toHaveLength(1);
    });

    it('should reject more than 5 emergency contacts', async () => {
      const contacts = Array(6).fill(null).map((_, i) => ({
        name: `Contact ${i}`,
        phone: `+91987654321${i}`,
        relationship: 'Friend'
      }));
      const user = new User({ phone: '+919876543210', emergencyContacts: contacts });
      await expect(user.save()).rejects.toThrow('more than 5');
    });
  });

  describe('Default values', () => {
    it('should set default role to passenger', async () => {
      const user = new User({ phone: '+919876543210' });
      const saved = await user.save();
      expect(saved.role).toBe('passenger');
    });

    it('should set default kycStatus to pending', async () => {
      const user = new User({ phone: '+919876543210' });
      const saved = await user.save();
      expect(saved.kycStatus).toBe('pending');
    });

    it('should set default isActive to true', async () => {
      const user = new User({ phone: '+919876543210' });
      const saved = await user.save();
      expect(saved.isActive).toBe(true);
    });
  });
});


describe('OTP Model Validation', () => {
  describe('Required fields', () => {
    it('should require identifier', async () => {
      const otp = new OTP({
        type: 'phone',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });
      await expect(otp.save()).rejects.toThrow('Identifier');
    });

    it('should require type', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });
      await expect(otp.save()).rejects.toThrow('type');
    });
  });

  describe('Type validation', () => {
    it('should accept phone type', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        type: 'phone',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });
      const saved = await otp.save();
      expect(saved.type).toBe('phone');
    });

    it('should accept email type', async () => {
      const otp = new OTP({
        identifier: 'test@example.com',
        type: 'email',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });
      const saved = await otp.save();
      expect(saved.type).toBe('email');
    });

    it('should reject invalid type', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        type: 'invalid',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });
      await expect(otp.save()).rejects.toThrow();
    });
  });

  describe('Expiry logic', () => {
    it('should correctly identify expired OTP', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        type: 'phone',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() - 1000) // 1 second ago
      });
      await otp.save();
      expect(otp.isExpired()).toBe(true);
    });

    it('should correctly identify valid OTP', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        type: 'phone',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
      });
      await otp.save();
      expect(otp.isExpired()).toBe(false);
    });
  });

  describe('Lockout logic', () => {
    it('should not be locked with 0 attempts', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        type: 'phone',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0
      });
      await otp.save();
      expect(otp.isLocked()).toBe(false);
    });

    it('should be locked with 3 attempts', async () => {
      const otp = new OTP({
        identifier: '+919876543210',
        type: 'phone',
        code: 'hashedcode',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 3
      });
      await otp.save();
      expect(otp.isLocked()).toBe(true);
    });
  });

  describe('Static methods', () => {
    it('should create OTP with 5-minute expiry', async () => {
      const before = Date.now();
      const otp = await OTP.createOTP('+919876543210', 'phone', 'hashedcode');
      const after = Date.now();
      
      const expectedExpiry = before + 5 * 60 * 1000;
      expect(otp.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(otp.expiresAt.getTime()).toBeLessThanOrEqual(after + 5 * 60 * 1000);
    });

    it('should delete existing OTPs when creating new one', async () => {
      await OTP.createOTP('+919876543210', 'phone', 'hashedcode1');
      await OTP.createOTP('+919876543210', 'phone', 'hashedcode2');
      
      const count = await OTP.countDocuments({ identifier: '+919876543210' });
      expect(count).toBe(1);
    });
  });
});


describe('Trip Model', () => {
  describe('Payment calculation', () => {
    it('should calculate correct payment breakdown with default commission', () => {
      const breakdown = Trip.calculatePaymentBreakdown(1000);
      
      // 12% commission = 120
      expect(breakdown.platformCommission).toBe(120);
      // Driver total = 1000 - 120 = 880
      // Driver advance (70%) = 616
      expect(breakdown.driverAdvance).toBe(616);
      // Vault amount (30%) = 264
      expect(breakdown.vaultAmount).toBe(264);
      expect(breakdown.totalCollected).toBe(1000);
      expect(breakdown.vaultStatus).toBe('locked');
    });

    it('should calculate correct payment breakdown with custom commission', () => {
      const breakdown = Trip.calculatePaymentBreakdown(1000, 0.15);
      
      // 15% commission = 150
      expect(breakdown.platformCommission).toBe(150);
      // Driver total = 1000 - 150 = 850
      // Driver advance (70%) = 595
      expect(breakdown.driverAdvance).toBe(595);
      // Vault amount (30%) = 255
      expect(breakdown.vaultAmount).toBe(255);
    });

    it('should ensure totalCollected = platformCommission + driverAdvance + vaultAmount', () => {
      const testAmounts = [500, 1000, 1500, 2000, 2500, 10000];
      
      testAmounts.forEach(amount => {
        const breakdown = Trip.calculatePaymentBreakdown(amount);
        const sum = breakdown.platformCommission + breakdown.driverAdvance + breakdown.vaultAmount;
        expect(sum).toBe(breakdown.totalCollected);
      });
    });
  });

  describe('Trip ID generation', () => {
    it('should generate trip ID in correct format', async () => {
      const tripId = await Trip.generateTripId();
      const year = new Date().getFullYear();
      expect(tripId).toMatch(new RegExp(`^HR-${year}-\\d{6}$`));
    });

    it('should generate trip ID with HR- prefix', async () => {
      const tripId = await Trip.generateTripId();
      expect(tripId.startsWith('HR-')).toBe(true);
    });

    it('should generate trip ID with current year', async () => {
      const tripId = await Trip.generateTripId();
      const year = new Date().getFullYear();
      expect(tripId).toContain(`HR-${year}-`);
    });

    it('should generate trip ID with 6-digit sequence number', async () => {
      const tripId = await Trip.generateTripId();
      const parts = tripId.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[2]).toHaveLength(6);
      expect(parts[2]).toMatch(/^\d{6}$/);
    });

    it('should increment sequence number for subsequent trips', async () => {
      // Generate first trip ID
      const tripId1 = await Trip.generateTripId();
      
      // Create a trip with this ID to increment the count
      const Driver = require('../../src/models/Driver');
      const User = require('../../src/models/User');
      
      // Create a user for the driver
      const user = await User.create({ phone: '+919876543210' });
      
      // Create a driver
      const driver = await Driver.create({
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
      
      // Create a trip with the first ID
      const totalFare = 1000;
      const payment = Trip.calculatePaymentBreakdown(totalFare);
      
      await Trip.create({
        tripId: tripId1,
        driver: driver._id,
        source: {
          address: 'Source Address',
          coordinates: { lat: 12.9716, lng: 77.5946 }
        },
        destination: {
          address: 'Destination Address',
          coordinates: { lat: 13.0827, lng: 80.2707 }
        },
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        availableSeats: 3,
        farePerSeat: 250,
        // New required fields for AbhiBus-style interface
        vehicleInfo: {
          type: 'ac',
          model: 'Toyota Camry',
          registrationNumber: 'KA01AB1234'
        },
        operator: {
          name: 'Test Operator'
        },
        routeData: {
          distance: 100,
          estimatedDuration: 120
        },
        pricing: {
          baseFare: 100,
          perKmRate: 8,
          totalSeats: 4,
          availableSeats: 3
        },
        fare: {
          baseFare: 100,
          distanceCharge: 800,
          tollCharges: 0,
          platformFee: 100,
          taxes: 0,
          total: totalFare
        },
        payment: payment
      });
      
      // Generate second trip ID
      const tripId2 = await Trip.generateTripId();
      
      // Extract sequence numbers
      const seq1 = parseInt(tripId1.split('-')[2], 10);
      const seq2 = parseInt(tripId2.split('-')[2], 10);
      
      // Second sequence should be greater than first
      expect(seq2).toBe(seq1 + 1);
    });

    it('should start sequence at 000001 when no trips exist for current year', async () => {
      const tripId = await Trip.generateTripId();
      const parts = tripId.split('-');
      expect(parts[2]).toBe('000001');
    });
  });

  describe('Trip ID validation', () => {
    it('should accept valid trip ID format HR-YYYY-NNNNNN', async () => {
      const Driver = require('../../src/models/Driver');
      const User = require('../../src/models/User');
      
      const user = await User.create({ phone: '+919876543211' });
      const driver = await Driver.create({
        userId: user._id,
        licenseNumber: 'DL1234567891',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        vehicleType: 'sedan',
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        vehicleYear: 2020,
        vehicleColor: 'White',
        vehicleRegistration: 'KA01AB1235',
        vehicleSeats: 4,
        status: 'approved'
      });
      
      const payment = Trip.calculatePaymentBreakdown(1000);
      
      const trip = new Trip({
        tripId: 'HR-2024-000001',
        driver: driver._id,
        source: {
          address: 'Source Address',
          coordinates: { lat: 12.9716, lng: 77.5946 }
        },
        destination: {
          address: 'Destination Address',
          coordinates: { lat: 13.0827, lng: 80.2707 }
        },
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        availableSeats: 3,
        farePerSeat: 250,
        // New required fields for AbhiBus-style interface
        vehicleInfo: {
          type: 'ac',
          model: 'Toyota Camry',
          registrationNumber: 'KA01AB1235'
        },
        operator: {
          name: 'Test Operator'
        },
        routeData: {
          distance: 100,
          estimatedDuration: 120
        },
        pricing: {
          baseFare: 100,
          perKmRate: 8,
          totalSeats: 4,
          availableSeats: 3
        },
        fare: {
          baseFare: 100,
          distanceCharge: 800,
          tollCharges: 0,
          platformFee: 100,
          taxes: 0,
          total: 1000
        },
        payment: payment
      });
      
      const saved = await trip.save();
      expect(saved.tripId).toBe('HR-2024-000001');
    });

    it('should reject invalid trip ID format', async () => {
      const Driver = require('../../src/models/Driver');
      const User = require('../../src/models/User');
      
      const user = await User.create({ phone: '+919876543212' });
      const driver = await Driver.create({
        userId: user._id,
        licenseNumber: 'DL1234567892',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        vehicleType: 'sedan',
        vehicleMake: 'Toyota',
        vehicleModel: 'Camry',
        vehicleYear: 2020,
        vehicleColor: 'White',
        vehicleRegistration: 'KA01AB1236',
        vehicleSeats: 4,
        status: 'approved'
      });
      
      const payment = Trip.calculatePaymentBreakdown(1000);
      
      const trip = new Trip({
        tripId: 'INVALID-ID',
        driver: driver._id,
        source: {
          address: 'Source Address',
          coordinates: { lat: 12.9716, lng: 77.5946 }
        },
        destination: {
          address: 'Destination Address',
          coordinates: { lat: 13.0827, lng: 80.2707 }
        },
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        availableSeats: 3,
        farePerSeat: 250,
        fare: {
          baseFare: 100,
          distanceCharge: 800,
          tollCharges: 0,
          platformFee: 100,
          taxes: 0,
          total: 1000
        },
        payment: payment
      });
      
      await expect(trip.save()).rejects.toThrow('not a valid Trip ID');
    });
  });
});
