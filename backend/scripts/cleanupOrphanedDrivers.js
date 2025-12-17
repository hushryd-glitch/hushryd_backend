/**
 * Cleanup Orphaned Drivers
 * This script removes driver records that have no valid user link
 * and optionally cleans up their S3 documents
 * 
 * Usage: 
 *   node scripts/cleanupOrphanedDrivers.js --dry-run  (preview changes)
 *   node scripts/cleanupOrphanedDrivers.js --execute  (actually delete)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';
const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

async function cleanup() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    if (isDryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    } else {
      console.log('⚠️  EXECUTE MODE - Changes will be applied\n');
    }

    const Driver = require('../src/models/Driver');
    const User = require('../src/models/User');

    // Find all drivers
    const drivers = await Driver.find().lean();
    console.log(`Found ${drivers.length} total drivers\n`);

    const orphanedDrivers = [];
    const validDrivers = [];

    for (const driver of drivers) {
      if (!driver.userId) {
        orphanedDrivers.push({ driver, reason: 'No userId set' });
        continue;
      }

      const user = await User.findById(driver.userId);
      if (!user) {
        orphanedDrivers.push({ driver, reason: `userId ${driver.userId} does not exist` });
      } else {
        validDrivers.push({ driver, user });
      }
    }

    console.log('========== VALID DRIVERS ==========');
    for (const { driver, user } of validDrivers) {
      console.log(`✅ ${user.name || 'Unknown'} (${user.phone || user.email})`);
      console.log(`   Driver ID: ${driver._id}`);
      console.log(`   Documents: ${driver.documents?.length || 0}`);
    }

    console.log('\n========== ORPHANED DRIVERS ==========');
    if (orphanedDrivers.length === 0) {
      console.log('No orphaned drivers found!');
    } else {
      for (const { driver, reason } of orphanedDrivers) {
        console.log(`❌ Driver ID: ${driver._id}`);
        console.log(`   Reason: ${reason}`);
        console.log(`   Documents: ${driver.documents?.length || 0}`);
        
        if (driver.documents?.length > 0) {
          console.log('   Document details:');
          for (const doc of driver.documents) {
            console.log(`     - ${doc.type}: ${doc.status}`);
            if (doc.s3Key) console.log(`       S3 Key: ${doc.s3Key}`);
            if (doc.url && !doc.s3Key) console.log(`       Local URL: ${doc.url.substring(0, 50)}...`);
          }
        }
      }

      if (!isDryRun) {
        console.log('\n========== DELETING ORPHANED DRIVERS ==========');
        
        for (const { driver } of orphanedDrivers) {
          // Delete S3 files if they exist
          if (driver.documents?.length > 0) {
            const s3Service = require('../src/services/s3Service');
            for (const doc of driver.documents) {
              if (doc.s3Key) {
                try {
                  await s3Service.deleteFile(doc.s3Key);
                  console.log(`   Deleted S3 file: ${doc.s3Key}`);
                } catch (err) {
                  console.log(`   Failed to delete S3 file: ${doc.s3Key} - ${err.message}`);
                }
              }
            }
          }

          // Delete the driver record
          await Driver.findByIdAndDelete(driver._id);
          console.log(`✅ Deleted driver: ${driver._id}`);
        }
      } else {
        console.log('\n⚠️  Run with --execute to delete these orphaned drivers');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

cleanup();
