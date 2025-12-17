/**
 * Script to fix document URLs for locally stored files
 * This script updates documents that have local files but no URL set
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

async function fixDocumentUrls() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const Driver = require('../src/models/Driver');
    
    // Get all drivers with documents
    const drivers = await Driver.find({ 'documents.0': { $exists: true } }).lean();
    console.log(`Found ${drivers.length} drivers with documents`);

    // Check local uploads folder
    const uploadsDir = path.join(__dirname, '../uploads/driver-documents');
    let localFiles = [];
    if (fs.existsSync(uploadsDir)) {
      localFiles = fs.readdirSync(uploadsDir);
      console.log(`Found ${localFiles.length} local files in uploads folder`);
    }

    let updatedCount = 0;
    
    for (const driver of drivers) {
      console.log(`\nDriver: ${driver._id}`);
      console.log(`  Documents: ${driver.documents.length}`);
      
      let needsUpdate = false;
      const updatedDocs = driver.documents.map(doc => {
        console.log(`  - ${doc.type}: status=${doc.status}, url=${doc.url ? 'set' : 'missing'}, s3Key=${doc.s3Key ? 'set' : 'missing'}`);
        
        // If document has no URL and no s3Key, try to find a local file
        if (!doc.url && !doc.s3Key) {
          // Look for a local file matching this driver
          const matchingFile = localFiles.find(f => f.startsWith(driver._id.toString()));
          if (matchingFile) {
            console.log(`    Found local file: ${matchingFile}`);
            doc.url = `${API_BASE_URL}/uploads/driver-documents/${matchingFile}`;
            needsUpdate = true;
          }
        }
        
        return doc;
      });

      if (needsUpdate) {
        await Driver.updateOne(
          { _id: driver._id },
          { $set: { documents: updatedDocs } }
        );
        updatedCount++;
        console.log(`  Updated driver documents`);
      }
    }

    console.log(`\n\nUpdated ${updatedCount} drivers`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixDocumentUrls();
