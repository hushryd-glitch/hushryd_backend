/**
 * Fix Driver-User Links
 * Run this script to fix any broken driver-user relationships
 * 
 * Usage: node scripts/fixDriverUserLinks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function fixLinks() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const Driver = require('../src/models/Driver');
    const User = require('../src/models/User');

    // Find drivers without proper userId links
    const drivers = await Driver.find().lean();
    
    console.log(`Found ${drivers.length} drivers\n`);

    for (const driver of drivers) {
      console.log(`\nDriver ID: ${driver._id}`);
      console.log(`  userId: ${driver.userId || 'NOT SET'}`);
      console.log(`  Documents: ${driver.documents?.length || 0}`);
      
      if (!driver.userId) {
        console.log('  ⚠️  No userId linked - checking if we can find matching user...');
        
        // Try to find a user with role 'driver' that might match
        const driverUsers = await User.find({ role: 'driver' }).lean();
        console.log(`  Found ${driverUsers.length} users with driver role`);
        
        for (const user of driverUsers) {
          // Check if this user is already linked to another driver
          const existingDriver = await Driver.findOne({ userId: user._id });
          if (!existingDriver) {
            console.log(`  Could link to user: ${user.name || user.phone || user.email}`);
          }
        }
      } else {
        // Verify the userId exists
        const user = await User.findById(driver.userId);
        if (user) {
          console.log(`  ✅ Linked to: ${user.name || user.phone || user.email}`);
        } else {
          console.log(`  ❌ userId ${driver.userId} does not exist!`);
        }
      }
    }

    // Show all driver users
    console.log('\n========== USERS WITH DRIVER ROLE ==========');
    const driverUsers = await User.find({ role: 'driver' }).lean();
    for (const user of driverUsers) {
      const linkedDriver = await Driver.findOne({ userId: user._id });
      console.log(`\n${user.name || 'Unknown'} (${user.phone || user.email || 'N/A'})`);
      console.log(`  User ID: ${user._id}`);
      console.log(`  Has Driver Profile: ${linkedDriver ? 'Yes' : 'No'}`);
      if (linkedDriver) {
        console.log(`  Driver ID: ${linkedDriver._id}`);
        console.log(`  Documents: ${linkedDriver.documents?.length || 0}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixLinks();
