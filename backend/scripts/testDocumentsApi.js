/**
 * Test Documents API
 * This script tests the admin documents API endpoint
 * 
 * Usage: node scripts/testDocumentsApi.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

async function testApi() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Load models
    require('../src/models/User');
    const documentService = require('../src/services/documentService');
    const s3Service = require('../src/services/s3Service');

    console.log('========== Testing getDocumentsForReview ==========\n');
    
    const result = await documentService.getDocumentsForReview({
      status: 'pending',
      page: 1,
      limit: 20
    });

    console.log(`Total documents: ${result.pagination.total}`);
    console.log(`Documents returned: ${result.documents.length}`);
    console.log(`Pagination:`, result.pagination);

    if (result.documents.length > 0) {
      console.log('\n========== Documents ==========\n');
      for (const doc of result.documents) {
        console.log(`Document ID: ${doc._id}`);
        console.log(`  Type: ${doc.type}`);
        console.log(`  Status: ${doc.status}`);
        console.log(`  Driver Name: ${doc.driverName || 'Unknown'}`);
        console.log(`  Driver Phone: ${doc.driverPhone || 'N/A'}`);
        console.log(`  S3 Key: ${doc.s3Key || 'N/A'}`);
        console.log(`  URL: ${doc.url ? doc.url.substring(0, 50) + '...' : 'N/A'}`);
        
        // Try to generate presigned URL
        if (doc.s3Key) {
          try {
            const { url, expiresAt } = await s3Service.getPresignedUrl(doc.s3Key);
            console.log(`  ✅ Presigned URL generated`);
            console.log(`  Presigned URL: ${url.substring(0, 60)}...`);
          } catch (err) {
            console.log(`  ❌ Failed to generate presigned URL: ${err.message}`);
          }
        }
        console.log('');
      }
    } else {
      console.log('\n⚠️  No documents found with status "pending"');
    }

    // Also test without status filter
    console.log('\n========== Testing without status filter ==========\n');
    const allResult = await documentService.getDocumentsForReview({
      page: 1,
      limit: 20
    });
    console.log(`Total documents (all statuses): ${allResult.pagination.total}`);
    console.log(`Documents returned: ${allResult.documents.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testApi();
