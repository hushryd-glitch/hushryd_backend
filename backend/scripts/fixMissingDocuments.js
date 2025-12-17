/**
 * Fix Missing Documents Script
 * This script helps diagnose and fix issues where document files exist on disk
 * but the database records are missing or empty.
 * 
 * Usage: node scripts/fixMissingDocuments.js [driverPhone]
 * Example: node scripts/fixMissingDocuments.js +919177910890
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function fixMissingDocuments() {
  const driverPhone = process.argv[2];
  
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const Driver = require('../src/models/Driver');
    const User = require('../src/models/User');

    // Find the driver
    let driver;
    if (driverPhone) {
      const user = await User.findOne({ phone: driverPhone });
      if (!user) {
        console.log(`❌ No user found with phone: ${driverPhone}`);
        return;
      }
      driver = await Driver.findOne({ userId: user._id }).populate('userId', 'name phone email');
    } else {
      // Get all drivers with empty documents
      const driversWithNoDocuments = await Driver.find({ 
        $or: [
          { documents: { $size: 0 } },
          { documents: { $exists: false } }
        ]
      }).populate('userId', 'name phone email');
      
      console.log(`Found ${driversWithNoDocuments.length} drivers with no documents:\n`);
      driversWithNoDocuments.forEach(d => {
        console.log(`  - ${d.userId?.name || 'Unknown'} (${d.userId?.phone || 'N/A'}) - ID: ${d._id}`);
      });
      
      if (driversWithNoDocuments.length === 0) {
        console.log('All drivers have documents in the database.');
      }
      return;
    }

    if (!driver) {
      console.log(`❌ No driver record found for phone: ${driverPhone}`);
      return;
    }

    console.log('========== DRIVER INFO ==========');
    console.log(`Name: ${driver.userId?.name || 'Unknown'}`);
    console.log(`Phone: ${driver.userId?.phone || 'N/A'}`);
    console.log(`Email: ${driver.userId?.email || 'N/A'}`);
    console.log(`Driver ID: ${driver._id}`);
    console.log(`Verification Status: ${driver.verificationStatus}`);
    console.log(`Documents in DB: ${driver.documents?.length || 0}`);

    // Check for files on disk
    const uploadsDir = path.join(__dirname, '../uploads/driver-documents');
    let filesOnDisk = [];
    
    if (fs.existsSync(uploadsDir)) {
      const allFiles = fs.readdirSync(uploadsDir);
      filesOnDisk = allFiles.filter(f => f.startsWith(driver._id.toString()));
      
      console.log(`\n========== FILES ON DISK ==========`);
      console.log(`Files matching driver ID: ${filesOnDisk.length}`);
      filesOnDisk.forEach(f => console.log(`  - ${f}`));
    }

    // If there are files but no DB records, offer to fix
    if (filesOnDisk.length > 0 && (!driver.documents || driver.documents.length === 0)) {
      console.log('\n⚠️  ISSUE DETECTED: Files exist on disk but no database records!');
      console.log('\nTo fix this, the driver needs to re-upload their documents through the app.');
      console.log('The old files on disk are orphaned and can be cleaned up.');
      
      console.log('\n========== RECOMMENDED ACTIONS ==========');
      console.log('1. Have the driver log in and go to /driver/documents');
      console.log('2. Upload all required documents again');
      console.log('3. The old orphaned files can be deleted manually if needed');
      
      // Option to create placeholder records (for testing only)
      if (process.argv[3] === '--create-placeholders') {
        console.log('\n⚠️  Creating placeholder document records (for testing only)...');
        
        const docTypes = ['license', 'registration', 'insurance', 'kyc'];
        const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
        
        for (let i = 0; i < Math.min(filesOnDisk.length, docTypes.length); i++) {
          const file = filesOnDisk[i];
          const docType = docTypes[i];
          
          driver.documents.push({
            type: docType,
            url: `${apiBaseUrl}/uploads/driver-documents/${file}`,
            originalFilename: file,
            contentType: 'image/jpeg',
            uploadedAt: new Date(),
            status: 'pending'
          });
        }
        
        await driver.save();
        console.log(`✅ Created ${Math.min(filesOnDisk.length, docTypes.length)} placeholder document records`);
        console.log('   These documents will need to be reviewed by admin.');
      }
    } else if (driver.documents && driver.documents.length > 0) {
      console.log('\n✅ Driver has documents in the database:');
      driver.documents.forEach(doc => {
        console.log(`  - ${doc.type}: ${doc.status}`);
        if (doc.url) console.log(`    URL: ${doc.url.substring(0, 60)}...`);
        if (doc.s3Key) console.log(`    S3 Key: ${doc.s3Key}`);
      });
    } else {
      console.log('\n📝 Driver has no documents uploaded yet.');
      console.log('   They need to upload documents through /driver/documents');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixMissingDocuments();
