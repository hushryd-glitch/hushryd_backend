/**
 * Test S3 Presigned URLs
 * This script tests if S3 presigned URLs can be generated for driver documents
 * 
 * Usage: node scripts/testS3Urls.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function testUrls() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Load models in correct order
    require('../src/models/User');
    const Driver = require('../src/models/Driver');
    const s3Service = require('../src/services/s3Service');

    // Find drivers with S3 documents
    const drivers = await Driver.find({ 'documents.s3Key': { $exists: true, $ne: null } })
      .populate('userId', 'name phone email')
      .lean();

    console.log(`Found ${drivers.length} drivers with S3 documents\n`);

    for (const driver of drivers) {
      console.log(`\nDriver: ${driver.userId?.name || 'Unknown'}`);
      console.log(`Phone: ${driver.userId?.phone || 'N/A'}`);
      
      for (const doc of driver.documents) {
        if (doc.s3Key) {
          console.log(`\n  Document: ${doc.type} (${doc.status})`);
          console.log(`  S3 Key: ${doc.s3Key}`);
          
          try {
            const { url, expiresAt } = await s3Service.getPresignedUrl(doc.s3Key);
            console.log(`  ✅ Presigned URL generated successfully`);
            console.log(`  URL: ${url.substring(0, 80)}...`);
            console.log(`  Expires: ${expiresAt}`);
          } catch (err) {
            console.log(`  ❌ Failed to generate presigned URL: ${err.message}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n\nDisconnected from MongoDB');
  }
}

testUrls();
