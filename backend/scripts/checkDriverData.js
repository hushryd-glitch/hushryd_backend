/**
 * Check Driver Data
 * Run this script to see what drivers and documents exist in the database
 * 
 * Usage: node scripts/checkDriverData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function checkData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const Driver = require('../src/models/Driver');
    const User = require('../src/models/User');

    // Count users by role
    console.log('========== USER COUNTS ==========');
    const userCounts = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    userCounts.forEach(r => console.log(`  ${r._id}: ${r.count}`));

    // Count drivers
    console.log('\n========== DRIVER DATA ==========');
    const driverCount = await Driver.countDocuments();
    console.log(`Total drivers: ${driverCount}`);

    // Get drivers with documents
    const driversWithDocs = await Driver.find({ 'documents.0': { $exists: true } })
      .populate('userId', 'name phone email')
      .lean();
    
    console.log(`Drivers with documents: ${driversWithDocs.length}`);

    if (driversWithDocs.length > 0) {
      console.log('\n========== DRIVERS WITH DOCUMENTS ==========');
      for (const driver of driversWithDocs) {
        console.log(`\nDriver: ${driver.userId?.name || 'Unknown'}`);
        console.log(`  Phone: ${driver.userId?.phone || 'N/A'}`);
        console.log(`  Email: ${driver.userId?.email || 'N/A'}`);
        console.log(`  Verification Status: ${driver.verificationStatus}`);
        console.log(`  Documents: ${driver.documents.length}`);
        
        for (const doc of driver.documents) {
          console.log(`    - ${doc.type}: ${doc.status} (uploaded: ${doc.uploadedAt?.toISOString().split('T')[0] || 'N/A'})`);
          if (doc.s3Key) console.log(`      S3 Key: ${doc.s3Key}`);
          if (doc.url) console.log(`      URL: ${doc.url.substring(0, 50)}...`);
        }
      }
    } else {
      console.log('\n⚠️  No drivers have uploaded documents yet.');
      console.log('   Drivers need to register and upload documents first.');
    }

    // Get all drivers
    const allDrivers = await Driver.find()
      .populate('userId', 'name phone email')
      .lean();
    
    if (allDrivers.length > 0) {
      console.log('\n========== ALL DRIVERS ==========');
      for (const driver of allDrivers) {
        console.log(`\n${driver.userId?.name || 'Unknown'} (${driver.userId?.phone || driver.userId?.email || 'N/A'})`);
        console.log(`  Status: ${driver.verificationStatus}`);
        console.log(`  Documents: ${driver.documents?.length || 0}`);
      }
    }

    // Document stats
    console.log('\n========== DOCUMENT STATS ==========');
    const docStats = await Driver.aggregate([
      { $unwind: { path: '$documents', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$documents.status', count: { $sum: 1 } } }
    ]);
    
    if (docStats.length > 0) {
      docStats.forEach(s => {
        if (s._id) console.log(`  ${s._id}: ${s.count}`);
      });
    } else {
      console.log('  No documents found');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkData();
