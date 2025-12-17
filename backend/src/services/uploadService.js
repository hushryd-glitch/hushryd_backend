/**
 * Upload Service Module
 * Handles scalable document uploads using S3 presigned URLs
 * 
 * Design Decision: S3 Presigned URLs for direct upload
 * Rationale: Bypasses backend servers completely, S3 handles unlimited concurrent uploads
 * 
 * Flow:
 * 1. Client requests presigned URL from backend (lightweight)
 * 2. Client uploads directly to S3 (no backend load)
 * 3. Client notifies backend of upload completion
 * 4. Backend queues document for processing via BullMQ
 * 
 * Requirements: 1.2, 1.3, 1.5, 1.6
 */

const s3Service = require('./s3Service');
const Driver = require('../models/Driver');
const mongoose = require('mongoose');
const { addDocumentJob, getQueueStatus } = require('../queues/documentQueue');

/**
 * Valid document types for upload
 */
const VALID_DOCUMENT_TYPES = ['license', 'registration', 'insurance', 'kyc', 'selfie_with_car', 'vehicle_photo'];

/**
 * Valid file types for upload
 */
const VALID_FILE_TYPES = ['jpg', 'jpeg', 'png', 'pdf'];

/**
 * Generate a presigned URL for direct document upload to S3
 * 
 * @param {Object} params - Upload parameters
 * @param {string} params.userId - User ID requesting the upload
 * @param {string} params.driverId - Driver ID for the document
 * @param {string} params.documentType - Type of document
 * @param {string} params.fileType - File extension (jpg, png, pdf)
 * @returns {Promise<Object>} Presigned URL with metadata and queue info
 * 
 * Requirements: 1.2 - Generate S3 presigned URLs within 500ms
 */
const generateUploadUrl = async ({ userId, driverId, documentType, fileType }) => {
  const startTime = Date.now();

  // Validate userId
  if (!userId) {
    const error = new Error('User ID is required');
    error.code = 'MISSING_USER_ID';
    throw error;
  }

  // Validate driverId
  if (!driverId) {
    const error = new Error('Driver ID is required');
    error.code = 'MISSING_DRIVER_ID';
    throw error;
  }

  // Validate driverId format
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  if (!mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }

  // Validate document type
  if (!documentType) {
    const error = new Error('Document type is required');
    error.code = 'MISSING_DOCUMENT_TYPE';
    throw error;
  }

  if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
    const error = new Error(`Invalid document type: ${documentType}. Valid types: ${VALID_DOCUMENT_TYPES.join(', ')}`);
    error.code = 'INVALID_DOCUMENT_TYPE';
    throw error;
  }

  // Validate file type
  if (!fileType) {
    const error = new Error('File type is required');
    error.code = 'MISSING_FILE_TYPE';
    throw error;
  }

  const normalizedFileType = fileType.toLowerCase().replace(/^\./, '');
  if (!VALID_FILE_TYPES.includes(normalizedFileType)) {
    const error = new Error(`Invalid file type: ${fileType}. Valid types: ${VALID_FILE_TYPES.join(', ')}`);
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }

  // Verify driver exists and belongs to user
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  // Verify ownership
  if (driver.userId.toString() !== userId.toString()) {
    const error = new Error('You can only upload documents for your own driver profile');
    error.code = 'UNAUTHORIZED_UPLOAD';
    throw error;
  }

  // Generate presigned URL with 1-hour expiry
  const presignedData = await s3Service.generatePresignedUploadUrl(
    driverIdStr,
    documentType,
    normalizedFileType,
    { expiresIn: 3600 } // 1 hour as per Requirements 1.2
  );

  // Calculate current queue depth for user feedback
  const queueInfo = await getUploadQueueInfo();

  const responseTime = Date.now() - startTime;

  return {
    success: true,
    presignedUrl: presignedData.presignedUrl,
    key: presignedData.key,
    bucket: presignedData.bucket,
    expiresAt: presignedData.expiresAt,
    contentType: presignedData.contentType,
    maxFileSize: presignedData.maxFileSize,
    documentType,
    driverId: driverIdStr,
    queuePosition: queueInfo.queueDepth + 1,
    estimatedWaitMinutes: queueInfo.estimatedWaitMinutes,
    responseTimeMs: responseTime
  };
};

/**
 * Get current upload queue information
 * Used to provide user feedback on queue position and wait time
 * 
 * @returns {Promise<Object>} Queue depth and estimated wait time
 * 
 * Requirements: 1.6 - Return queue position and estimated wait time
 */
const getUploadQueueInfo = async () => {
  try {
    // Get BullMQ queue status for accurate queue depth
    const queueStatus = await getQueueStatus();
    
    // Queue depth is waiting + active jobs
    const queueDepth = queueStatus.waiting + queueStatus.active;
    
    // Use actual processing rate from queue, fallback to estimate
    const processingRatePerMinute = queueStatus.processingRate || 100;
    const estimatedWaitMinutes = queueStatus.estimatedWaitMinutes || 
      Math.ceil(queueDepth / processingRatePerMinute);

    return {
      queueDepth,
      estimatedWaitMinutes,
      processingRatePerMinute,
      waiting: queueStatus.waiting,
      active: queueStatus.active,
      failed: queueStatus.failed
    };
  } catch (error) {
    console.error('Error getting queue info:', error);
    // Fallback to database count if queue unavailable
    try {
      const result = await Driver.aggregate([
        { $unwind: '$documents' },
        { $match: { 'documents.status': 'pending' } },
        { $count: 'pendingCount' }
      ]);
      const queueDepth = result[0]?.pendingCount || 0;
      return {
        queueDepth,
        estimatedWaitMinutes: Math.ceil(queueDepth / 100),
        processingRatePerMinute: 100
      };
    } catch (dbError) {
      return {
        queueDepth: 0,
        estimatedWaitMinutes: 1,
        processingRatePerMinute: 100
      };
    }
  }
};

/**
 * Confirm upload completion and queue for processing
 * Called after client successfully uploads to S3
 * 
 * @param {Object} params - Completion parameters
 * @param {string} params.userId - User ID
 * @param {string} params.driverId - Driver ID
 * @param {string} params.key - S3 object key
 * @param {string} params.documentType - Document type
 * @param {string} params.originalFilename - Original filename
 * @param {Date} [params.expiryDate] - Document expiry date
 * @returns {Promise<Object>} Processing queue info
 * 
 * Requirements: 1.3 - Queue document for processing with guaranteed delivery
 */
const confirmUploadCompletion = async ({ userId, driverId, key, documentType, originalFilename, expiryDate }) => {
  // Validate required parameters
  if (!userId) {
    const error = new Error('User ID is required');
    error.code = 'MISSING_USER_ID';
    throw error;
  }

  if (!driverId) {
    const error = new Error('Driver ID is required');
    error.code = 'MISSING_DRIVER_ID';
    throw error;
  }

  if (!key) {
    const error = new Error('S3 key is required');
    error.code = 'MISSING_S3_KEY';
    throw error;
  }

  if (!documentType) {
    const error = new Error('Document type is required');
    error.code = 'MISSING_DOCUMENT_TYPE';
    throw error;
  }

  // Validate driverId format
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  if (!mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }

  // Verify driver exists and belongs to user
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  if (driver.userId.toString() !== userId.toString()) {
    const error = new Error('Unauthorized access to driver profile');
    error.code = 'UNAUTHORIZED_ACCESS';
    throw error;
  }

  // Verify S3 object exists before processing
  const verification = await s3Service.verifyObjectExists(key);
  if (!verification.exists) {
    const error = new Error('Upload not found in S3. Please try uploading again.');
    error.code = 'S3_OBJECT_NOT_FOUND';
    throw error;
  }

  // Get S3 config for bucket info
  const { getConfig } = require('../config/environment');
  const s3Config = getConfig('s3');

  // Check for existing rejected document of this type (re-upload scenario)
  const existingRejectedDoc = driver.documents.find(
    doc => doc.type === documentType && doc.status === 'rejected'
  );

  let documentId;

  if (existingRejectedDoc) {
    // Re-upload: Update existing rejected document
    // Delete old S3 file if exists
    if (existingRejectedDoc.s3Key && existingRejectedDoc.s3Key !== key) {
      try {
        await s3Service.deleteFile(existingRejectedDoc.s3Key);
      } catch (deleteError) {
        console.error('Failed to delete old S3 file:', deleteError.message);
      }
    }

    existingRejectedDoc.s3Key = key;
    existingRejectedDoc.s3Bucket = s3Config.bucket;
    existingRejectedDoc.originalFilename = originalFilename || 'document';
    existingRejectedDoc.contentType = verification.contentType;
    existingRejectedDoc.fileSize = verification.contentLength;
    existingRejectedDoc.uploadedAt = new Date();
    existingRejectedDoc.status = 'pending';
    existingRejectedDoc.expiryDate = expiryDate ? new Date(expiryDate) : null;
    existingRejectedDoc.rejectionReason = undefined;
    existingRejectedDoc.reviewedBy = undefined;
    existingRejectedDoc.reviewedAt = undefined;

    await driver.save();
    documentId = existingRejectedDoc._id;
  } else {
    // New document: Add to documents array
    const newDocument = {
      type: documentType,
      s3Key: key,
      s3Bucket: s3Config.bucket,
      originalFilename: originalFilename || 'document',
      contentType: verification.contentType,
      fileSize: verification.contentLength,
      uploadedAt: new Date(),
      status: 'pending',
      expiryDate: expiryDate ? new Date(expiryDate) : null
    };

    driver.documents.push(newDocument);
    await driver.save();
    documentId = driver.documents[driver.documents.length - 1]._id;
  }

  // Queue document for background processing via BullMQ
  // Requirements: 1.3 - Queue document for processing with guaranteed delivery
  let jobInfo = { queuePosition: 1, estimatedWaitMinutes: 1 };
  try {
    jobInfo = await addDocumentJob({
      userId: userId.toString(),
      driverId: driverIdStr,
      documentId: documentId.toString(),
      documentType,
      s3Key: key
    });
  } catch (queueError) {
    console.error('Failed to queue document for processing:', queueError.message);
    // Continue without queuing - document is saved, can be processed later
  }

  // Generate presigned URL for viewing
  const { url: viewUrl, expiresAt: viewUrlExpiresAt } = await s3Service.getPresignedUrl(key);

  return {
    success: true,
    documentId: documentId.toString(),
    status: 'pending',
    jobId: jobInfo.jobId,
    queuePosition: jobInfo.queuePosition,
    estimatedWaitMinutes: jobInfo.estimatedWaitMinutes,
    viewUrl,
    viewUrlExpiresAt
  };
};

module.exports = {
  generateUploadUrl,
  confirmUploadCompletion,
  getUploadQueueInfo,
  VALID_DOCUMENT_TYPES,
  VALID_FILE_TYPES
};
