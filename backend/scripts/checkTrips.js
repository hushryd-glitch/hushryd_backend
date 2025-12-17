/**
 * Check Trips Script
 * Lists all trips in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Trip = require('../src/models/Trip');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function checkTrips() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const trips = await Trip.find({}).lean();
    
    console.log(`Total trips in database: ${trips.length}\n`);
    
    if (trips.length === 0) {
      console.log('No trips found in database.');
    } else {
      trips.forEach((trip, index) => {
        console.log(`--- Trip ${index + 1} ---`);
        console.log('Trip ID:', trip.tripId);
        console.log('MongoDB _id:', trip._id);
        console.log('Status:', trip.status);
        console.log('Scheduled At:', trip.scheduledAt);
        console.log('Available Seats:', trip.availableSeats);
        console.log('Source:', trip.source?.address);
        console.log('Destination:', trip.destination?.address);
        console.log('');
      });
    }

    // Check scheduled trips with future dates
    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const futureTrips = await Trip.find({
      status: 'scheduled',
      scheduledAt: { $gte: startOfToday }
    }).lean();
    
    console.log(`\nScheduled trips from today onwards: ${futureTrips.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkTrips();
