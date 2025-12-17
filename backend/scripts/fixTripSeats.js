/**
 * Fix Trip Seats Script
 * Updates trips that have undefined availableSeats to have a default value
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Trip = require('../src/models/Trip');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function fixTripSeats() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find trips with undefined or null availableSeats
    const tripsToFix = await Trip.find({
      $or: [
        { availableSeats: { $exists: false } },
        { availableSeats: null },
        { availableSeats: undefined }
      ]
    });

    console.log(`Found ${tripsToFix.length} trips with missing availableSeats\n`);

    for (const trip of tripsToFix) {
      // Default to 4 available seats
      const defaultSeats = 4;
      const bookedSeats = trip.passengers?.reduce((sum, p) => sum + p.seats, 0) || 0;
      const availableSeats = Math.max(0, defaultSeats - bookedSeats);

      await Trip.updateOne(
        { _id: trip._id },
        { $set: { availableSeats: availableSeats } }
      );

      console.log(`Updated trip ${trip.tripId}: availableSeats = ${availableSeats}`);
    }

    console.log('\n✅ All trips updated successfully!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixTripSeats();
