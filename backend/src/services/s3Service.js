/**
 * S3 Service Module
 * Handles all AWS S3 operations for document storage
 * 
 * Design Decision: Centralized S3 operations with presigned URLs for secure access
 * Rationale: Provides scalable, secure document storage with time-limited access URLs
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');
const { getConfig } = require('../config/environment');

// Lazy initialization of S3 client
let s3Client = null;

/**
 * Get or create S3 client instance
 * @returns {S3Client} Configured S3 client
 */
const getS3Client = () => {
  if (!s3Client) {
    const config = getConfig('s3');
    
    if (!config.bucket || !config.region) {
      throw new Error('S3_CONFIG_ERROR: S3 configuration missing');
    }
    
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }
  return s3Client;
};

/**
 * Generate a unique S3 key for driver documents
 * Key structure: driver-documents/{driverId}/{documentType}/{timestamp}-{uuid}.{extension}
 * 
 * @param {string} driverId - Driver's MongoDB ObjectId
 * @param {string} documentType - Type of document (license, registration, insurance, kyc)
 * @param {string} filename - Original filename with extension
 * @returns {string} Unique S3 key
 */
const generateDocumentKey = (driverId, documentType, filename) => {
  if (!driverId || !documentType || !filename) {
    throw new Error('INVALID_KEY_PARAMS: driverId, documentType, and filename are required');
  }
  
  const timestamp = Date.now();
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  const extension = path.extname(filename).toLowerCase() || '.bin';
  
  return `driver-documents/${driverId}/${documentType}/${timestamp}-${uuid}${extension}`;
};


/**
 * Upload a file to S3
 * 
 * @param {Buffer} file - File buffer to upload
 * @param {string} key - S3 object key
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<{key: string, bucket: string, location: string}>} Upload result
 */
const uploadFile = async (file, key, contentType) => {
  if (!file || !key || !contentType) {
    throw new Error('S3_UPLOAD_FAILED: file, key, and contentType are required');
  }
  
  const config = getConfig('s3');
  const client = getS3Client();
  
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: file,
    ContentType: contentType
  });
  
  try {
    await client.send(command);
    
    return {
      key,
      bucket: config.bucket,
      location: `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`S3_UPLOAD_FAILED: ${error.message}`);
  }
};

/**
 * Delete a file from S3
 * 
 * @param {string} key - S3 object key to delete
 * @returns {Promise<{deleted: boolean}>} Deletion result
 */
const deleteFile = async (key) => {
  if (!key) {
    throw new Error('S3_DELETE_FAILED: key is required');
  }
  
  const config = getConfig('s3');
  const client = getS3Client();
  
  const command = new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key
  });
  
  try {
    await client.send(command);
    return { deleted: true };
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new Error(`S3_DELETE_FAILED: ${error.message}`);
  }
};

/**
 * Generate a presigned URL for viewing a document
 * 
 * @param {string} key - S3 object key
 * @param {number} [expiresIn] - URL validity in seconds (default from config)
 * @returns {Promise<{url: string, expiresAt: Date}>} Presigned URL with expiry
 */
const getPresignedUrl = async (key, expiresIn) => {
  if (!key) {
    throw new Error('S3_URL_GENERATION_FAILED: key is required');
  }
  
  const config = getConfig('s3');
  const client = getS3Client();
  const expiry = expiresIn || config.presignedUrlExpiry || 3600;
  
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key
  });
  
  try {
    const url = await getSignedUrl(client, command, { expiresIn: expiry });
    const expiresAt = new Date(Date.now() + expiry * 1000);
    
    return { url, expiresAt };
  } catch (error) {
    console.error('S3 presigned URL error:', error);
    throw new Error(`S3_URL_GENERATION_FAILED: ${error.message}`);
  }
};

/**
 * Generate a presigned URL for direct upload to S3
 * Design Decision: Direct-to-S3 upload bypasses backend servers
 * Rationale: Handles 7K+ concurrent uploads without backend load
 * 
 * @param {string} userId - User's MongoDB ObjectId
 * @param {string} documentType - Type of document (license, registration, insurance, kyc, etc.)
 * @param {string} fileType - File extension (jpg, png, pdf)
 * @param {Object} [options] - Additional options
 * @param {number} [options.expiresIn] - URL validity in seconds (default: 3600 = 1 hour)
 * @param {number} [options.maxFileSize] - Maximum file size in bytes (default: 5MB)
 * @returns {Promise<{presignedUrl: string, key: string, expiresAt: Date, bucket: string}>} Presigned URL with metadata
 * 
 * Requirements: 1.2 - Generate S3 presigned URLs for direct upload within 500ms
 */
const generatePresignedUploadUrl = async (userId, documentType, fileType, options = {}) => {
  // Validate required parameters
  if (!userId) {
    throw new Error('PRESIGNED_URL_FAILED: userId is required');
  }
  if (!documentType) {
    throw new Error('PRESIGNED_URL_FAILED: documentType is required');
  }
  if (!fileType) {
    throw new Error('PRESIGNED_URL_FAILED: fileType is required');
  }

  // Validate document type
  const validDocumentTypes = ['license', 'registration', 'insurance', 'kyc', 'selfie_with_car', 'vehicle_photo'];
  if (!validDocumentTypes.includes(documentType)) {
    throw new Error(`PRESIGNED_URL_FAILED: Invalid document type: ${documentType}`);
  }

  // Validate and normalize file type
  const normalizedFileType = fileType.toLowerCase().replace(/^\./, '');
  const validFileTypes = ['jpg', 'jpeg', 'png', 'pdf'];
  if (!validFileTypes.includes(normalizedFileType)) {
    throw new Error(`PRESIGNED_URL_FAILED: Invalid file type: ${fileType}. Allowed: jpg, jpeg, png, pdf`);
  }

  // Map file type to content type
  const contentTypeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'pdf': 'application/pdf'
  };
  const contentType = contentTypeMap[normalizedFileType];

  const config = getConfig('s3');
  const client = getS3Client();
  
  // Generate unique S3 key
  const key = generateDocumentKey(userId, documentType, `upload.${normalizedFileType}`);
  
  // Default expiry is 1 hour (3600 seconds) as per Requirements 1.2
  const expiresIn = options.expiresIn || 3600;
  
  // Default max file size is 5MB
  const maxFileSize = options.maxFileSize || 5 * 1024 * 1024;

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    Metadata: {
      'user-id': userId.toString(),
      'document-type': documentType,
      'uploaded-at': new Date().toISOString()
    }
  });

  try {
    const presignedUrl = await getSignedUrl(client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      presignedUrl,
      key,
      bucket: config.bucket,
      expiresAt,
      contentType,
      maxFileSize
    };
  } catch (error) {
    console.error('S3 presigned upload URL error:', error);
    throw new Error(`PRESIGNED_URL_FAILED: ${error.message}`);
  }
};

/**
 * Verify that an S3 object exists
 * Used to validate upload completion before processing
 * 
 * @param {string} key - S3 object key
 * @returns {Promise<{exists: boolean, metadata: Object|null, contentLength: number|null}>} Verification result
 * 
 * Requirements: 1.3 - Validate S3 object exists before processing
 */
const verifyObjectExists = async (key) => {
  if (!key) {
    throw new Error('S3_VERIFY_FAILED: key is required');
  }

  const { HeadObjectCommand } = require('@aws-sdk/client-s3');
  const config = getConfig('s3');
  const client = getS3Client();

  const command = new HeadObjectCommand({
    Bucket: config.bucket,
    Key: key
  });

  try {
    const response = await client.send(command);
    return {
      exists: true,
      metadata: response.Metadata || {},
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return {
        exists: false,
        metadata: null,
        contentLength: null
      };
    }
    console.error('S3 verify object error:', error);
    throw new Error(`S3_VERIFY_FAILED: ${error.message}`);
  }
};

/**
 * Reset S3 client (useful for testing)
 */
const resetClient = () => {
  s3Client = null;
};

module.exports = {
  uploadFile,
  deleteFile,
  getPresignedUrl,
  generateDocumentKey,
  resetClient,
  getS3Client,
  generatePresignedUploadUrl,
  verifyObjectExists
};
