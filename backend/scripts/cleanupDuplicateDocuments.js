/**
 * Cleanup Duplicate Documents Script
 * 
 * This script fixes the issue where drivers have multiple documents of the same type
 * (e.g., both a rejected and pending KYC document).
 * 
 * For each document type, it keeps only the most relevant document:
 * - If there's a pending document, keep it and remove rejected ones
 * - If there's an approved document, keep it and remove rejected ones
 * - If only rejected documents exist, keep the most recent one
 * 
 * Usage: node scripts/cleanupDuplicateDocuments.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Driver = require('../src/models/Driver');

const DOCUMENT_TYPES = ['license', 'registration', 'insurance', 'kyc', 'selfie_with_car', 'vehicle_photo'];

async function cleanupDuplicateDocuments() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all drivers
    const drivers = await Driver.find({});
    console.log(`Found ${drivers.length} drivers to check`);

    let totalDuplicatesRemoved = 0;
    let driversFixed = 0;

    for (const driver of drivers) {
      let duplicatesRemoved = 0;
      const documentsToKeep = [];
      const documentsToRemove = [];

      // For each document type, find duplicates
      for (const docType of DOCUMENT_TYPES) {
        const docsOfType = driver.documents.filter(d => d.type === docType);
        
        if (docsOfType.length <= 1) {
          // No duplicates, keep the document if it exists
          if (docsOfType.length === 1) {
            documentsToKeep.push(docsOfType[0]._id.toString());
          }
          continue;
        }

        console.log(`\nDriver ${driver._id}: Found ${docsOfType.length} ${docType} documents`);
        
        // Prioritize: pending > approved > rejected (most recent)
        let docToKeep = null;
        
        const pending = docsOfType.find(d => d.status === 'pending');
        if (pending) {
          docToKeep = pending;
          console.log(`  Keeping pending document: ${pending._id}`);
        } else {
          const approved = docsOfType.find(d => d.status === 'approved');
          if (approved) {
            docToKeep = approved;
            console.log(`  Keeping approved document: ${approved._id}`);
          } else {
            // Keep the most recently uploaded rejected one
            const sorted = docsOfType.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            docToKeep = sorted[0];
            console.log(`  Keeping most recent rejected document: ${docToKeep._id}`);
          }
        }

        documentsToKeep.push(docToKeep._id.toString());
        
        // Mark others for removal
        for (const doc of docsOfType) {
          if (doc._id.toString() !== docToKeep._id.toString()) {
            documentsToRemove.push(doc._id.toString());
            duplicatesRemoved++;
            console.log(`  Removing duplicate: ${doc._id} (status: ${doc.status})`);
          }
        }
      }

      // Remove duplicate documents
      if (documentsToRemove.length > 0) {
        driver.documents = driver.documents.filter(
          d => !documentsToRemove.includes(d._id.toString())
        );
        await driver.save();
        driversFixed++;
        totalDuplicatesRemoved += duplicatesRemoved;
        console.log(`  Saved driver ${driver._id} - removed ${duplicatesRemoved} duplicates`);
      }
    }

    console.log('\n========================================');
    console.log('Cleanup Complete!');
    console.log(`Drivers fixed: ${driversFixed}`);
    console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);
    console.log('========================================');

  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
cleanupDuplicateDocuments();
