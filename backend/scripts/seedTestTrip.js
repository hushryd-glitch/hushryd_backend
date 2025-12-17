/**
 * Seed Test Trip Script
 * Creates a test trip in the database for testing the search and booking flow
 * 
 * Usage: node scripts/seedTestTrip.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Trip = require('../src/models/Trip');
const Driver = require('../src/models/Driver');
const User = require('../src/models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function seedTestTrip() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, check if we have a driver
    let driver = await Driver.findOne({ verificationStatus: 'verified' }).populate('userId');
    
    if (!driver) {
      console.log('No verified driver found. Creating a test driver...');
      
      // Create a test user for the driver
      let testUser = await User.findOne({ phone: '+919999999999' });
      if (!testUser) {
        testUser = await User.create({
          phone: '+919999999999',
          name: 'Test Driver',
          role: 'driver',
          isVerified: true,
          profilePhoto: null
        });
        console.log('Created test user:', testUser._id);
      }

      // Create a test driver
      driver = await Driver.create({
        userId: testUser._id,
        licenseNumber: 'DL-TEST-12345',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        verificationStatus: 'verified',
        rating: 4.5,
        totalTrips: 25,
        vehicles: [{
          type: 'sedan',
          make: 'Maruti',
          model: 'Swift Dzire',
          color: 'White',
          registrationNumber: 'DL-01-AB-1234',
          seats: 4,
          year: 2022
        }]
      });
      console.log('Created test driver:', driver._id);
    } else {
      console.log('Found existing driver:', driver._id);
    }

    // Generate a unique trip ID
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const tripId = `HR-${year}-${randomNum}`;

    // Create a test trip scheduled for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0); // 10:00 AM tomorrow

    // Calculate payment breakdown using the model's static method
    const totalFare = 350;
    const paymentBreakdown = Trip.calculatePaymentBreakdown(totalFare);

    const testTrip = await Trip.create({
      tripId: tripId,
      driver: driver._id,
      vehicle: driver.vehicles[0]?._id,
      source: {
        address: 'Connaught Place, New Delhi',
        name: 'Connaught Place',
        coordinates: {
          lat: 28.6315,
          lng: 77.2167
        }
      },
      destination: {
        address: 'Cyber Hub, Gurugram',
        name: 'Cyber Hub',
        coordinates: {
          lat: 28.4949,
          lng: 77.0895
        }
      },
      scheduledAt: tomorrow,
      status: 'scheduled',
      availableSeats: 3,
      farePerSeat: 350,
      fare: {
        baseFare: 300,
        distanceCharge: 30,
        tollCharges: 0,
        platformFee: 15,
        taxes: 5,
        total: 350
      },
      payment: paymentBreakdown,
      instantBooking: true,
      ladiesOnly: false,
      passengers: []
    });

    console.log('\n✅ Test trip created successfully!');
    console.log('-----------------------------------');
    console.log('Trip ID:', testTrip.tripId);
    console.log('MongoDB _id:', testTrip._id);
    console.log('Route:', testTrip.source.address, '→', testTrip.destination.address);
    console.log('Scheduled:', testTrip.scheduledAt);
    console.log('Available Seats:', testTrip.availableSeats);
    console.log('Fare per Seat: ₹', testTrip.farePerSeat);
    console.log('-----------------------------------');
    console.log('\nYou can now:');
    console.log('1. Go to /search to see this trip');
    console.log('2. Click "View Details" to test the trip details page');
    console.log('3. Click "Book" to test the booking flow');

  } catch (error) {
    console.error('Error seeding test trip:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

seedTestTrip();
