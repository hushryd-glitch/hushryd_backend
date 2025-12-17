/**
 * Document Processing Worker Module
 * Processes uploaded documents from the BullMQ queue
 * 
 * Design Decision: Worker with concurrency control
 * Rationale: Process 10 documents simultaneously for optimal throughput
 * 
 * Requirements: 1.3 - Process documents with validation and metadata extraction
 */

const { Worker } = require('bullmq');
const Driver = require('../models/Driver');
const s3Service = require('../services/s3Service');
const { QUEUE_NAME } = require('../queues/documentQueue');

// Worker configuration
const WORKER_CONCURRENCY = 10; // Process 10 documents simultaneously
const LIMITER_MAX = 100; // Max 100 jobs per minute
const LIMITER_DURATION = 60000; // 1 minute

// Worker instance
let documentWorker = null;

/**
 * Get Redis connection options for BullMQ Worker
 * @returns {Object} Redis connection configuration
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null
  };
};

/**
 * Validate document in S3
 * @param {string} s3Key - S3 object key
 * @returns {Promise<Object>} Validation result
 */
const validateDocument = async (s3Key) => {
  try {
    const verification = await s3Service.verifyObjectExists(s3Key);
    
    if (!verification.exists) {
      return {
        valid: false,
        error: 'Document not found in S3'
      };
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (verification.contentLength > maxSize) {
      return {
        valid: false,
        error: `File too large: ${verification.contentLength} bytes (max ${maxSize})`
      };
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(verification.contentType)) {
      return {
        valid: false,
        error: `Invalid content type: ${verification.contentType}`
      };
    }

    return {
      valid: true,
      contentType: verification.contentType,
      contentLength: verification.contentLength,
      lastModified: verification.lastModified
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Extract metadata from document
 * @param {string} s3Key - S3 object key
 * @param {string} contentType - Content type
 * @returns {Promise<Object>} Extracted metadata
 */
const extractMetadata = async (s3Key, contentType) => {
  const metadata = {
    processedAt: new Date(),
    s3Key,
    contentType
  };

  // For images, we could add image analysis here
  // For PDFs, we could extract text/pages
  // For now, return basic metadata
  
  return metadata;
};

/**
 * Update driver document status in database
 * @param {string} driverId - Driver ID
 * @param {string} documentId - Document ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated document
 */
const updateDriverDocument = async (driverId, documentId, updateData) => {
  const driver = await Driver.findById(driverId);
  
  if (!driver) {
    throw new Error(`Driver not found: ${driverId}`);
  }

  const document = driver.documents.id(documentId);
  
  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // Update document fields
  Object.assign(document, updateData);
  
  await driver.save();
  
  return document;
};

/**
 * Process a single document job
 * @param {Object} job - BullMQ job
 * @returns {Promise<Object>} Processing result
 */
const processDocument = async (job) => {
  const { userId, driverId, documentId, documentType, s3Key } = job.data;

  console.log(`Processing document: ${documentId} (type: ${documentType})`);

  // Step 1: Validate document exists and is valid
  const validation = await validateDocument(s3Key);
  
  if (!validation.valid) {
    // Mark document as failed validation
    await updateDriverDocument(driverId, documentId, {
      status: 'rejected',
      rejectionReason: `Validation failed: ${validation.error}`,
      reviewedAt: new Date()
    });
    
    throw new Error(`Document validation failed: ${validation.error}`);
  }

  // Step 2: Extract metadata
  const metadata = await extractMetadata(s3Key, validation.contentType);

  // Step 3: Update document with processed metadata
  const updatedDocument = await updateDriverDocument(driverId, documentId, {
    contentType: validation.contentType,
    fileSize: validation.contentLength,
    processedAt: metadata.processedAt
    // Status remains 'pending' until admin review
  });

  console.log(`Document ${documentId} processed successfully`);

  return {
    success: true,
    documentId,
    documentType,
    metadata,
    processedAt: metadata.processedAt
  };
};

/**
 * Initialize the document processing worker
 * @returns {Worker} BullMQ Worker instance
 */
const initializeDocumentWorker = () => {
  if (documentWorker) {
    return documentWorker;
  }

  const connection = getRedisConnection();

  documentWorker = new Worker(
    QUEUE_NAME,
    processDocument,
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
      limiter: {
        max: LIMITER_MAX,
        duration: LIMITER_DURATION
      }
    }
  );

  // Worker event handlers
  documentWorker.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed:`, result.documentId);
  });

  documentWorker.on('failed', (job, error) => {
    console.error(`Job ${job.id} failed:`, error.message);
  });

  documentWorker.on('error', (error) => {
    console.error('Worker error:', error.message);
  });

  documentWorker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled`);
  });

  console.log(`✓ Document worker initialized (concurrency: ${WORKER_CONCURRENCY})`);
  return documentWorker;
};

/**
 * Get the worker instance
 * @returns {Worker|null} Worker instance
 */
const getDocumentWorker = () => documentWorker;

/**
 * Close the worker
 * @returns {Promise<void>}
 */
const closeWorker = async () => {
  if (documentWorker) {
    await documentWorker.close();
    documentWorker = null;
    console.log('Document worker closed');
  }
};

module.exports = {
  initializeDocumentWorker,
  getDocumentWorker,
  closeWorker,
  processDocument,
  validateDocument,
  extractMetadata,
  updateDriverDocument,
  WORKER_CONCURRENCY,
  LIMITER_MAX
};
