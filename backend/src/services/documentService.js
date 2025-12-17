/**
 * Document Verification Service
 * Handles document submission, review, verification workflow, and expiry alerts
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 * Enhanced with S3 integration for Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4
 * Enhanced with streamlined document system for Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

const Driver = require('../models/Driver');
const User = require('../models/User');
const notificationService = require('./notificationService');
const s3Service = require('./s3Service');
const imageQualityService = require('./imageQualityService');

/**
 * Document types that can be submitted
 * Requirements: 11.1, 11.2 - Essential documents: license, RC, KYC Aadhaar, and 4 vehicle photos
 */
const DOCUMENT_TYPES = [
  'license', 
  'registration', 
  'insurance', 
  'kyc', 
  'selfie_with_car', 
  'vehicle_photo',
  // New vehicle photo types for Requirements 11.2
  'vehicle_front',
  'vehicle_back', 
  'vehicle_side',
  'vehicle_inside'
];

/**
 * Required document types for driver verification
 * Requirements: 11.1 - Only driving license, RC, KYC Aadhaar, and 4 vehicle photos
 * 
 * Note: For backward compatibility, we keep the original required types
 * but the streamlined flow uses the new vehicle photo types
 */
const REQUIRED_DOCUMENT_TYPES = ['license', 'registration', 'insurance'];

/**
 * Streamlined required documents for new driver registration
 * Requirements: 11.1, 11.2 - Essential documents only
 */
const STREAMLINED_REQUIRED_TYPES = [
  'license',      // Driving license photo
  'registration', // RC photo  
  'kyc',          // KYC Aadhaar card photo
  'vehicle_front', // Vehicle front photo
  'vehicle_back',  // Vehicle back photo
  'vehicle_side',  // Vehicle side photo
  'vehicle_inside' // Vehicle inside photo
];

/**
 * Evaluate and update driver verification status based on document states
 * Checks all required document statuses and determines the appropriate verification status
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<{status: string, rejectedDocuments: Array}>}
 * - status: 'pending' if any required document is rejected, 'verified' if all approved
 * - rejectedDocuments: Array of rejected documents with type and rejectionReason
 * 
 * Requirements: 1.1, 1.3, 4.1
 */
const evaluateDriverVerificationStatus = async (driverId) => {
  const mongoose = require('mongoose');
  
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate driverId format
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  // Find driver with documents
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }
  
  // Get the latest document for each required type
  // Requirements: 4.3 - Consider only the latest version of each document type
  const latestDocumentsByType = {};
  for (const doc of driver.documents) {
    if (REQUIRED_DOCUMENT_TYPES.includes(doc.type)) {
      const existing = latestDocumentsByType[doc.type];
      if (!existing || new Date(doc.uploadedAt) > new Date(existing.uploadedAt)) {
        latestDocumentsByType[doc.type] = doc;
      }
    }
  }
  
  // Collect rejected documents with their reasons
  const rejectedDocuments = [];
  let allRequiredApproved = true;
  let hasAnyRejected = false;
  
  for (const docType of REQUIRED_DOCUMENT_TYPES) {
    const doc = latestDocumentsByType[docType];
    
    if (!doc) {
      // Document type is missing - not approved
      allRequiredApproved = false;
    } else if (doc.status === 'rejected') {
      // Document is rejected
      hasAnyRejected = true;
      allRequiredApproved = false;
      rejectedDocuments.push({
        type: doc.type,
        status: doc.status,
        rejectionReason: doc.rejectionReason || 'No reason provided'
      });
    } else if (doc.status === 'pending') {
      // Document is pending - not yet approved
      allRequiredApproved = false;
    }
    // If doc.status === 'approved', it contributes to allRequiredApproved staying true
  }
  
  // Determine new status
  // Requirements: 1.1, 1.3 - If any rejected, status should be 'pending'
  // Requirements: 4.1 - If all approved, status should be 'verified'
  let newStatus;
  if (hasAnyRejected) {
    newStatus = 'pending';
  } else if (allRequiredApproved) {
    newStatus = 'verified';
  } else {
    // Some documents are missing or pending, but none rejected
    newStatus = 'pending';
  }
  
  return {
    status: newStatus,
    rejectedDocuments
  };
};

/**
 * Submit a document for verification with S3 upload
 * Uploads file to S3, adds document to queue with pending status, and notifies operations team
 * 
 * @param {Object} params - Submission parameters
 * @param {string} params.driverId - Driver ID
 * @param {string} params.type - Document type
 * @param {Object} params.file - File object with buffer and metadata
 * @param {Buffer} params.file.buffer - File buffer
 * @param {string} params.file.originalname - Original filename
 * @param {string} params.file.mimetype - MIME type
 * @param {number} params.file.size - File size in bytes
 * @param {Date} [params.expiryDate] - Document expiry date (optional)
 * @returns {Promise<Object>} Submitted document with queue position and presigned URL
 * 
 * Requirements: 4.1, 4.2, 6.1, 11.3 - Image quality validation
 */
const submitDocument = async ({ driverId, type, file, expiryDate = null }) => {
  const mongoose = require('mongoose');
  
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate driverId format
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  // Validate document type
  if (!DOCUMENT_TYPES.includes(type)) {
    const error = new Error(`Invalid document type: ${type}`);
    error.code = 'INVALID_DOCUMENT_TYPE';
    throw error;
  }

  // Validate file
  if (!file || !file.buffer) {
    const error = new Error('File buffer is required');
    error.code = 'FILE_REQUIRED';
    throw error;
  }

  // Requirements: 11.3 - Image quality validation and document readability checks
  const qualityValidation = imageQualityService.validateImageQuality(file, type);
  if (!qualityValidation.valid) {
    const error = new Error(qualityValidation.errors.join('. '));
    error.code = 'IMAGE_QUALITY_FAILED';
    error.errors = qualityValidation.errors;
    throw error;
  }

  // Log warnings but don't fail
  if (qualityValidation.warnings && qualityValidation.warnings.length > 0) {
    console.log(`Image quality warnings for ${type}:`, qualityValidation.warnings);
  }

  // Validate file type (redundant with quality service but kept for safety)
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    const error = new Error('Only JPEG, PNG, and PDF files are allowed');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }

  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    const error = new Error('File size must be less than 5MB');
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  // Find driver
  const driver = await Driver.findById(driverIdStr).populate('userId', 'phone email name');
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  // Check if there's an existing rejected document of this type (re-upload scenario)
  // Requirements: 4.1, 4.2, 4.3, 4.4
  const existingRejectedDoc = driver.documents.find(
    doc => doc.type === type && doc.status === 'rejected'
  );

  // Generate S3 key and upload file
  const s3Key = s3Service.generateDocumentKey(driverIdStr, type, file.originalname);
  const uploadResult = await s3Service.uploadFile(file.buffer, s3Key, file.mimetype);

  let addedDocument;

  if (existingRejectedDoc) {
    // Re-upload scenario: Replace the rejected document instead of creating new one
    // Requirements: 4.1, 4.2, 4.3, 4.4
    console.log(`Re-upload detected for document type ${type}, replacing rejected document ${existingRejectedDoc._id}`);
    
    // Delete old S3 file if it exists
    if (existingRejectedDoc.s3Key) {
      try {
        await s3Service.deleteFile(existingRejectedDoc.s3Key);
        console.log(`Deleted old S3 file: ${existingRejectedDoc.s3Key}`);
      } catch (s3DeleteError) {
        console.error('Failed to delete old S3 file:', s3DeleteError.message);
        // Continue even if S3 delete fails - the new file is already uploaded
      }
    }

    // Update existing document with new file data
    existingRejectedDoc.s3Key = uploadResult.key;
    existingRejectedDoc.s3Bucket = uploadResult.bucket;
    existingRejectedDoc.originalFilename = file.originalname;
    existingRejectedDoc.contentType = file.mimetype;
    existingRejectedDoc.fileSize = file.size;
    existingRejectedDoc.uploadedAt = new Date();
    existingRejectedDoc.status = 'pending';
    existingRejectedDoc.expiryDate = expiryDate ? new Date(expiryDate) : null;
    // Clear rejection metadata
    existingRejectedDoc.rejectionReason = undefined;
    existingRejectedDoc.reviewedBy = undefined;
    existingRejectedDoc.reviewedAt = undefined;

    await driver.save();
    addedDocument = existingRejectedDoc;
  } else {
    // New document upload (no rejected document exists)
    const document = {
      type,
      s3Key: uploadResult.key,
      s3Bucket: uploadResult.bucket,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      fileSize: file.size,
      uploadedAt: new Date(),
      status: 'pending',
      expiryDate: expiryDate ? new Date(expiryDate) : null
    };

    // Add to driver's documents array
    driver.documents.push(document);
    await driver.save();

    // Get the newly added document (last in array)
    addedDocument = driver.documents[driver.documents.length - 1];
  }

  // Calculate queue position (count of all pending documents across all drivers)
  const queuePosition = await getQueuePosition(addedDocument._id);

  // Generate presigned URL for immediate access
  const { url: presignedUrl, expiresAt } = await s3Service.getPresignedUrl(s3Key);

  // Notify operations team about new document submission (don't fail if notification fails)
  try {
    await notifyOperationsTeam({
      driverId: driver._id,
      driverName: driver.userId?.name || 'Unknown',
      documentType: type,
      documentId: addedDocument._id
    });
  } catch (notifyError) {
    console.error('Failed to notify operations team:', notifyError.message);
    // Don't throw - document was saved successfully
  }

  // Requirements: 2.1 - Re-evaluate driver verification eligibility after re-upload
  // If this was a re-upload of a rejected required document, re-evaluate driver status
  if (existingRejectedDoc && REQUIRED_DOCUMENT_TYPES.includes(type)) {
    try {
      const evaluation = await evaluateDriverVerificationStatus(driver._id);
      console.log(`Driver ${driver._id} verification re-evaluated after re-upload: status=${evaluation.status}, rejectedDocs=${evaluation.rejectedDocuments.length}`);
      
      // Note: The driver status will be updated when the document is approved
      // At this point, the re-uploaded document is 'pending', so the driver
      // may still have 'pending' verification status, but they should now be
      // eligible to post rides (no rejected documents)
    } catch (evalError) {
      // Log but don't fail the submission if status evaluation fails
      console.error('Failed to evaluate driver verification status after re-upload:', evalError.message);
    }
  }

  return {
    documentId: addedDocument._id,
    type: addedDocument.type,
    s3Key: addedDocument.s3Key,
    url: presignedUrl,
    urlExpiresAt: expiresAt,
    status: addedDocument.status,
    uploadedAt: addedDocument.uploadedAt,
    expiryDate: addedDocument.expiryDate,
    originalFilename: addedDocument.originalFilename,
    contentType: addedDocument.contentType,
    fileSize: addedDocument.fileSize,
    queuePosition
  };
};

/**
 * Delete a pending document
 * Removes document from S3 and database. Only pending documents can be deleted.
 * 
 * @param {string} documentId - Document ID
 * @param {string} driverId - Driver ID (for ownership validation)
 * @returns {Promise<{deleted: boolean, message: string}>} Deletion result
 * 
 * Requirements: 3.1, 3.2, 4.4
 */
const deleteDocument = async (documentId, driverId) => {
  const mongoose = require('mongoose');
  
  // Ensure IDs are strings (handle ObjectId objects)
  const documentIdStr = documentId?.toString ? documentId.toString() : documentId;
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate documentId and driverId format
  if (!documentIdStr || !mongoose.Types.ObjectId.isValid(documentIdStr)) {
    const error = new Error('Invalid document ID format');
    error.code = 'INVALID_DOCUMENT_ID';
    throw error;
  }
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  // Find driver with this document
  const driver = await Driver.findOne({
    _id: new mongoose.Types.ObjectId(driverIdStr),
    'documents._id': new mongoose.Types.ObjectId(documentIdStr)
  });

  if (!driver) {
    const error = new Error('Document not found or you do not have permission to delete it');
    error.code = 'UNAUTHORIZED_DELETE';
    throw error;
  }

  // Find the document
  const document = driver.documents.id(documentId);
  if (!document) {
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Check document status - only pending documents can be deleted
  if (document.status === 'approved') {
    const error = new Error('Approved documents cannot be deleted');
    error.code = 'CANNOT_DELETE_APPROVED';
    throw error;
  }

  if (document.status === 'rejected') {
    const error = new Error('Please upload a new document instead');
    error.code = 'CANNOT_DELETE_REJECTED';
    throw error;
  }

  // Delete from S3 if s3Key exists
  if (document.s3Key) {
    try {
      await s3Service.deleteFile(document.s3Key);
    } catch (s3Error) {
      console.error('Failed to delete from S3:', s3Error.message);
      // Continue with database deletion even if S3 fails
      // The orphaned S3 object can be cleaned up later
    }
  }

  // Remove document from driver's documents array
  driver.documents.pull(documentId);
  await driver.save();

  return {
    deleted: true,
    message: 'Document deleted successfully'
  };
};

/**
 * Get queue position for a document
 * @param {string} documentId - Document ID
 * @returns {Promise<number>} Queue position (1-based)
 */
const getQueuePosition = async (documentId) => {
  // Get all drivers with pending documents
  const driversWithPending = await Driver.find({
    'documents.status': 'pending'
  }).select('documents').lean();

  // Flatten all pending documents and sort by uploadedAt
  const pendingDocs = [];
  for (const driver of driversWithPending) {
    for (const doc of driver.documents) {
      if (doc.status === 'pending') {
        pendingDocs.push({
          _id: doc._id.toString(),
          uploadedAt: doc.uploadedAt
        });
      }
    }
  }

  // Sort by upload time (oldest first)
  pendingDocs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));

  // Find position of the document
  const position = pendingDocs.findIndex(d => d._id === documentId.toString());
  return position >= 0 ? position + 1 : pendingDocs.length + 1;
};

/**
 * Notify operations team about new document submission
 * @param {Object} params - Notification parameters
 */
const notifyOperationsTeam = async ({ driverId, driverName, documentType, documentId }) => {
  try {
    // Find operations team members
    const operationsUsers = await User.find({ 
      role: 'operations',
      isActive: true 
    }).select('_id phone email preferences').lean();

    // Send notification to each operations team member
    for (const user of operationsUsers) {
      const channels = user.preferences?.notificationChannels || ['email'];
      const recipients = {
        email: user.email,
        sms: user.phone
      };

      // Use a simple notification (template can be added later)
      if (user.email) {
        await notificationService.sendNotification({
          userId: user._id,
          channel: 'email',
          template: 'document_submission_ops',
          recipient: user.email,
          data: {
            driverName,
            documentType: formatDocumentType(documentType),
            documentId: documentId.toString(),
            driverId: driverId.toString()
          }
        }).catch(() => {
          // Log but don't fail if notification fails
          console.error('Failed to notify operations team member:', user._id);
        });
      }
    }
  } catch (error) {
    // Log but don't fail the submission if notification fails
    console.error('Failed to notify operations team:', error.message);
  }
};

/**
 * Format document type for display
 * @param {string} type - Document type
 * @returns {string} Formatted type
 * 
 * Requirements: 11.1, 11.2 - Include new vehicle photo types
 */
const formatDocumentType = (type) => {
  const typeMap = {
    license: 'Driving License',
    registration: 'Vehicle Registration (RC)',
    insurance: 'Insurance Certificate',
    kyc: 'KYC Aadhaar Card',
    selfie_with_car: 'Selfie with Vehicle',
    vehicle_photo: 'Vehicle Photo',
    vehicle_front: 'Vehicle Front Photo',
    vehicle_back: 'Vehicle Back Photo',
    vehicle_side: 'Vehicle Side Photo',
    vehicle_inside: 'Vehicle Inside Photo'
  };
  return typeMap[type] || type;
};

/**
 * Get documents for review (admin/operations)
 * Returns all documents with optional filters
 * 
 * @param {Object} params - Query parameters
 * @param {string} [params.status] - Filter by status
 * @param {string} [params.type] - Filter by document type
 * @param {string} [params.driverId] - Filter by driver
 * @param {number} [params.page] - Page number
 * @param {number} [params.limit] - Items per page
 * @returns {Promise<Object>} Documents with pagination
 * 
 * Requirements: 6.2
 */
const getDocumentsForReview = async ({ 
  status, 
  type, 
  driverId, 
  page = 1, 
  limit = 20 
} = {}) => {
  // Build aggregation pipeline
  const matchStage = {};
  if (driverId) {
    const mongoose = require('mongoose');
    matchStage._id = new mongoose.Types.ObjectId(driverId);
  }

  const pipeline = [
    { $match: matchStage },
    { $unwind: '$documents' },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
  ];

  // Add document filters
  const docMatch = {};
  if (status) docMatch['documents.status'] = status;
  if (type) docMatch['documents.type'] = type;
  
  if (Object.keys(docMatch).length > 0) {
    pipeline.push({ $match: docMatch });
  }

  // Sort by upload date (oldest first for pending, newest first for others)
  pipeline.push({
    $sort: {
      'documents.status': 1, // pending first
      'documents.uploadedAt': 1
    }
  });

  // Get total count before pagination
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await Driver.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Add pagination
  const skip = (page - 1) * limit;
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Project final shape - convert ObjectIds to strings for frontend compatibility
  pipeline.push({
    $project: {
      _id: { $toString: '$documents._id' },
      driverId: { $toString: '$_id' },
      driverName: '$user.name',
      driverPhone: '$user.phone',
      driverEmail: '$user.email',
      type: '$documents.type',
      url: '$documents.url',
      s3Key: '$documents.s3Key',
      s3Bucket: '$documents.s3Bucket',
      originalFilename: '$documents.originalFilename',
      contentType: '$documents.contentType',
      fileSize: '$documents.fileSize',
      status: '$documents.status',
      uploadedAt: '$documents.uploadedAt',
      expiryDate: '$documents.expiryDate',
      reviewedBy: '$documents.reviewedBy',
      reviewedAt: '$documents.reviewedAt',
      rejectionReason: '$documents.rejectionReason',
      verificationStatus: '$verificationStatus'
    }
  });

  const documents = await Driver.aggregate(pipeline);

  // Ensure all IDs are strings and filter out documents without valid IDs
  const processedDocuments = documents
    .map(doc => ({
      ...doc,
      _id: doc._id ? String(doc._id) : null,
      driverId: doc.driverId ? String(doc.driverId) : null
    }))
    .filter(doc => {
      // Filter out documents without valid MongoDB ObjectId format
      const isValidId = doc._id && /^[0-9a-fA-F]{24}$/.test(doc._id);
      if (!isValidId) {
        console.warn('Filtering out document with invalid _id:', doc._id, 'type:', doc.type);
      }
      return isValidId;
    });

  return {
    documents: processedDocuments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  };
};


/**
 * Get a single document by ID
 * 
 * @param {string} documentId - Document ID
 * @returns {Promise<Object>} Document details
 * 
 * Requirements: 6.2
 */
const getDocumentById = async (documentId) => {
  const mongoose = require('mongoose');
  
  // Validate documentId format
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    const error = new Error('Invalid document ID format');
    error.code = 'INVALID_DOCUMENT_ID';
    throw error;
  }
  
  const pipeline = [
    { $unwind: '$documents' },
    { 
      $match: { 
        'documents._id': new mongoose.Types.ObjectId(documentId) 
      } 
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'documents.reviewedBy',
        foreignField: '_id',
        as: 'reviewer'
      }
    },
    { $unwind: { path: '$reviewer', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: { $toString: '$documents._id' },
        driverId: { $toString: '$_id' },
        driverName: '$user.name',
        driverPhone: '$user.phone',
        driverEmail: '$user.email',
        licenseNumber: '$licenseNumber',
        type: '$documents.type',
        url: '$documents.url',
        status: '$documents.status',
        uploadedAt: '$documents.uploadedAt',
        expiryDate: '$documents.expiryDate',
        reviewedBy: {
          _id: { $toString: '$reviewer._id' },
          name: '$reviewer.name'
        },
        reviewedAt: '$documents.reviewedAt',
        rejectionReason: '$documents.rejectionReason',
        verificationStatus: '$verificationStatus',
        allDocuments: '$documents'
      }
    }
  ];

  const results = await Driver.aggregate(pipeline);
  
  if (results.length === 0) {
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Ensure _id is a string (fallback for older MongoDB versions)
  const result = results[0];
  return {
    ...result,
    _id: result._id ? String(result._id) : null,
    driverId: result.driverId ? String(result.driverId) : null
  };
};

/**
 * Get all documents for a specific driver
 * Displays all document types for review
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Driver with all documents
 * 
 * Requirements: 6.2
 */
const getDriverDocuments = async (driverId) => {
  const mongoose = require('mongoose');
  
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate driverId format
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  const driver = await Driver.findById(driverIdStr)
    .populate('userId', 'name phone email')
    .populate('documents.reviewedBy', 'name')
    .lean();

  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  // Convert document _ids to strings for frontend compatibility
  const documentsWithStringIds = driver.documents.map(doc => ({
    ...doc,
    _id: doc._id ? doc._id.toString() : null
  }));

  // Group documents by type for easier review
  const documentsByType = {};
  for (const docType of DOCUMENT_TYPES) {
    documentsByType[docType] = documentsWithStringIds.filter(d => d.type === docType);
  }

  return {
    driverId: driver._id ? driver._id.toString() : null,
    driverName: driver.userId?.name,
    driverPhone: driver.userId?.phone,
    driverEmail: driver.userId?.email,
    licenseNumber: driver.licenseNumber,
    licenseExpiry: driver.licenseExpiry,
    verificationStatus: driver.verificationStatus,
    documents: documentsWithStringIds,
    documentsByType,
    vehicles: driver.vehicles
  };
};

/**
 * Get all documents for a driver with presigned URLs
 * Retrieves all documents and generates fresh presigned URLs for each
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Array>} Documents with presigned URLs
 * 
 * Requirements: 1.1, 1.2, 1.4, 4.3
 */
const getDriverDocumentsWithUrls = async (driverId) => {
  const fs = require('fs');
  const path = require('path');
  const mongoose = require('mongoose');
  
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate driverId format
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  const driver = await Driver.findById(driverIdStr)
    .populate('documents.reviewedBy', 'name')
    .lean();

  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  // Check for local files in uploads folder
  const uploadsDir = path.join(__dirname, '../../uploads/driver-documents');
  let localFiles = [];
  try {
    if (fs.existsSync(uploadsDir)) {
      localFiles = fs.readdirSync(uploadsDir);
    }
  } catch (err) {
    console.error('Error reading uploads directory:', err.message);
  }

  // Generate presigned URLs for each document
  const documentsWithUrls = await Promise.all(
    driver.documents.map(async (doc) => {
      let url = null;
      let urlExpiresAt = null;

      // Generate presigned URL if s3Key exists
      if (doc.s3Key) {
        try {
          const presigned = await s3Service.getPresignedUrl(doc.s3Key);
          url = presigned.url;
          urlExpiresAt = presigned.expiresAt;
        } catch (err) {
          console.error(`Failed to generate presigned URL for document ${doc._id}:`, err.message);
          // Continue without URL - document still returned
        }
      } else if (doc.url) {
        // Fallback to legacy url field for backward compatibility
        url = doc.url;
      }
      
      // If still no URL, try to find a local file
      if (!url && localFiles.length > 0) {
        // Look for files matching this driver ID
        const matchingFiles = localFiles.filter(f => f.startsWith(driverIdStr));
        if (matchingFiles.length > 0) {
          // Use the first matching file (or could match by document type/index)
          const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
          // Try to match by index based on document order
          const docIndex = driver.documents.findIndex(d => d._id.toString() === doc._id.toString());
          if (docIndex >= 0 && docIndex < matchingFiles.length) {
            url = `${apiBaseUrl}/uploads/driver-documents/${matchingFiles[docIndex]}`;
          } else if (matchingFiles.length > 0) {
            url = `${apiBaseUrl}/uploads/driver-documents/${matchingFiles[0]}`;
          }
        }
      }

      return {
        _id: doc._id ? doc._id.toString() : null,
        type: doc.type,
        uploadedAt: doc.uploadedAt,
        status: doc.status,
        rejectionReason: doc.rejectionReason || null,
        expiryDate: doc.expiryDate,
        originalFilename: doc.originalFilename,
        contentType: doc.contentType,
        fileSize: doc.fileSize,
        url,
        urlExpiresAt,
        reviewedBy: doc.reviewedBy,
        reviewedAt: doc.reviewedAt
      };
    })
  );

  return documentsWithUrls;
};

/**
 * Get a single document with a fresh presigned URL
 * Generates a new presigned URL for viewing the document
 * 
 * @param {string} documentId - Document ID
 * @returns {Promise<Object>} Document with presigned URL and expiry information
 * 
 * Requirements: 1.3, 5.3
 */
const getDocumentWithUrl = async (documentId) => {
  const mongoose = require('mongoose');
  
  // Validate documentId format
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    const error = new Error('Invalid document ID format');
    error.code = 'INVALID_DOCUMENT_ID';
    throw error;
  }
  
  // Find driver with this document
  const driver = await Driver.findOne({
    'documents._id': new mongoose.Types.ObjectId(documentId)
  }).lean();

  if (!driver) {
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Find the specific document
  const document = driver.documents.find(
    doc => doc._id.toString() === documentId.toString()
  );

  if (!document) {
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  let url = null;
  let urlExpiresAt = null;

  // Generate presigned URL if s3Key exists
  if (document.s3Key) {
    const presigned = await s3Service.getPresignedUrl(document.s3Key);
    url = presigned.url;
    urlExpiresAt = presigned.expiresAt;
  } else if (document.url) {
    // Fallback to legacy url field for backward compatibility
    url = document.url;
  }

  return {
    _id: document._id ? document._id.toString() : null,
    type: document.type,
    uploadedAt: document.uploadedAt,
    status: document.status,
    rejectionReason: document.rejectionReason || null,
    expiryDate: document.expiryDate,
    originalFilename: document.originalFilename,
    contentType: document.contentType,
    fileSize: document.fileSize,
    url,
    urlExpiresAt,
    reviewedAt: document.reviewedAt,
    driverId: driver._id ? driver._id.toString() : null
  };
};

/**
 * Approve a document
 * Updates status to approved and notifies driver
 * 
 * @param {string} documentId - Document ID
 * @param {string} reviewerId - Reviewer user ID
 * @returns {Promise<Object>} Updated document
 * 
 * Requirements: 6.3
 */
const approveDocument = async (documentId, reviewerId) => {
  const mongoose = require('mongoose');
  
  // Log the incoming documentId for debugging
  console.log('approveDocument called with documentId:', documentId, 'type:', typeof documentId);
  
  // Handle string conversion if needed
  let docIdStr = documentId;
  if (typeof documentId === 'object' && documentId !== null) {
    docIdStr = documentId._id || documentId.$oid || documentId.toString();
  }
  docIdStr = String(docIdStr).trim();
  
  console.log('Converted documentId:', docIdStr);
  
  // Validate documentId format
  if (!docIdStr || !mongoose.Types.ObjectId.isValid(docIdStr)) {
    console.error('Invalid document ID format:', docIdStr, 'Original:', documentId);
    const error = new Error('Invalid document ID format');
    error.code = 'INVALID_DOCUMENT_ID';
    throw error;
  }
  
  // Find driver with this document using the converted ID
  const driver = await Driver.findOne({
    'documents._id': new mongoose.Types.ObjectId(docIdStr)
  }).populate('userId', 'phone email name preferences');

  if (!driver) {
    console.error('Document not found for ID:', docIdStr);
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Find and update the document using the converted ID
  const document = driver.documents.id(docIdStr);
  if (!document) {
    console.error('Document subdocument not found for ID:', docIdStr);
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Check if already processed
  if (document.status !== 'pending') {
    const error = new Error(`Document already ${document.status}`);
    error.code = 'DOCUMENT_ALREADY_PROCESSED';
    throw error;
  }

  // Update document status
  document.status = 'approved';
  document.reviewedBy = reviewerId;
  document.reviewedAt = new Date();
  document.rejectionReason = undefined;

  await driver.save();

  // Requirements: 4.1, 4.2, 11.5 - Evaluate and update driver verification status after approval
  // If the approved document is a required type, evaluate and update driver's verification status
  let wasJustActivated = false;
  if (REQUIRED_DOCUMENT_TYPES.includes(document.type)) {
    try {
      const evaluation = await evaluateDriverVerificationStatus(driver._id);
      
      // Update driver's verification status to 'verified' if all required documents are approved
      if (evaluation.status === 'verified' && driver.verificationStatus !== 'verified') {
        driver.verificationStatus = 'verified';
        await driver.save();
        wasJustActivated = true;
        console.log(`Driver ${driver._id} verification status updated to 'verified' - all required documents approved`);
      }
    } catch (evalError) {
      // Log but don't fail the approval if status evaluation fails
      console.error('Failed to evaluate driver verification status after approval:', evalError.message);
    }
  }

  // Notify driver about approval
  await notifyDriverAboutVerification({
    driver,
    document,
    status: 'approved'
  });

  // Requirements: 11.5 - Send driver account activation notification when all documents approved
  if (wasJustActivated) {
    await notifyDriverAccountActivated(driver);
  }

  return {
    documentId: document._id.toString(),
    type: document.type,
    status: document.status,
    reviewedAt: document.reviewedAt,
    driverVerificationStatus: driver.verificationStatus
  };
};


/**
 * Reject a document
 * Updates status to rejected with reason and notifies driver
 * 
 * @param {string} documentId - Document ID
 * @param {string} reviewerId - Reviewer user ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<Object>} Updated document
 * 
 * Requirements: 6.4
 */
const rejectDocument = async (documentId, reviewerId, reason) => {
  const mongoose = require('mongoose');
  
  // Log the incoming documentId for debugging
  console.log('rejectDocument called with documentId:', documentId, 'type:', typeof documentId);
  
  // Handle string conversion if needed
  let docIdStr = documentId;
  if (typeof documentId === 'object' && documentId !== null) {
    docIdStr = documentId._id || documentId.$oid || documentId.toString();
  }
  docIdStr = String(docIdStr).trim();
  
  console.log('Converted documentId:', docIdStr);
  
  // Validate documentId format
  if (!docIdStr || !mongoose.Types.ObjectId.isValid(docIdStr)) {
    console.error('Invalid document ID format:', docIdStr, 'Original:', documentId);
    const error = new Error('Invalid document ID format');
    error.code = 'INVALID_DOCUMENT_ID';
    throw error;
  }
  
  if (!reason || reason.trim().length === 0) {
    const error = new Error('Rejection reason is required');
    error.code = 'REASON_REQUIRED';
    throw error;
  }

  // Find driver with this document using the converted ID
  const driver = await Driver.findOne({
    'documents._id': new mongoose.Types.ObjectId(docIdStr)
  }).populate('userId', 'phone email name preferences');

  if (!driver) {
    console.error('Document not found for ID:', docIdStr);
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Find and update the document using the converted ID
  const document = driver.documents.id(docIdStr);
  if (!document) {
    console.error('Document subdocument not found for ID:', docIdStr);
    const error = new Error('Document not found');
    error.code = 'DOCUMENT_NOT_FOUND';
    throw error;
  }

  // Check if already processed
  if (document.status !== 'pending') {
    const error = new Error(`Document already ${document.status}`);
    error.code = 'DOCUMENT_ALREADY_PROCESSED';
    throw error;
  }

  // Update document status
  document.status = 'rejected';
  document.reviewedBy = reviewerId;
  document.reviewedAt = new Date();
  document.rejectionReason = reason.trim();

  await driver.save();

  // Requirements: 1.1, 1.2, 1.3 - Update driver verification status when a required document is rejected
  // If the rejected document is a required type, evaluate and update driver's verification status
  if (REQUIRED_DOCUMENT_TYPES.includes(document.type)) {
    try {
      const evaluation = await evaluateDriverVerificationStatus(driver._id);
      
      // Update driver's verification status to 'pending' if any required document is rejected
      if (evaluation.status === 'pending' && driver.verificationStatus !== 'pending') {
        driver.verificationStatus = 'pending';
        await driver.save();
        console.log(`Driver ${driver._id} verification status updated to 'pending' due to document rejection`);
      }
    } catch (evalError) {
      // Log but don't fail the rejection if status evaluation fails
      console.error('Failed to evaluate driver verification status after rejection:', evalError.message);
    }
  }

  // Notify driver about rejection
  await notifyDriverAboutVerification({
    driver,
    document,
    status: 'rejected',
    reason: reason.trim()
  });

  return {
    documentId: document._id.toString(),
    type: document.type,
    status: document.status,
    rejectionReason: document.rejectionReason,
    reviewedAt: document.reviewedAt,
    driverVerificationStatus: driver.verificationStatus
  };
};

/**
 * Notify driver about document verification result
 * @param {Object} params - Notification parameters
 */
const notifyDriverAboutVerification = async ({ driver, document, status, reason }) => {
  try {
    const user = driver.userId;
    if (!user) return;

    const channels = user.preferences?.notificationChannels || ['sms'];
    const template = status === 'approved' ? 'document_approved' : 'document_rejected';
    
    const data = {
      documentType: formatDocumentType(document.type),
      reason: reason || ''
    };

    // Send via preferred channels
    for (const channel of channels) {
      const recipient = channel === 'email' ? user.email : user.phone;
      if (!recipient) continue;

      await notificationService.sendNotification({
        userId: user._id,
        channel,
        template,
        recipient,
        data,
        relatedEntity: {
          type: 'document',
          id: document._id
        }
      }).catch(err => {
        console.error(`Failed to send ${channel} notification to driver:`, err.message);
      });
    }
  } catch (error) {
    console.error('Failed to notify driver about verification:', error.message);
  }
};

/**
 * Notify driver that their account has been fully activated
 * Sent when all required documents are approved and driver status is set to 'verified'
 * 
 * @param {Object} driver - Driver document with populated userId
 * 
 * Requirements: 11.5 - Send confirmation notification when documents are approved
 */
const notifyDriverAccountActivated = async (driver) => {
  try {
    const user = driver.userId;
    if (!user) return;

    const channels = user.preferences?.notificationChannels || ['sms', 'email'];
    const data = {
      driverName: user.name || 'Driver'
    };

    // Send via all available channels for this important notification
    for (const channel of channels) {
      const recipient = channel === 'email' ? user.email : user.phone;
      if (!recipient) continue;

      await notificationService.sendNotification({
        userId: user._id,
        channel,
        template: 'driver_account_activated',
        recipient,
        data,
        relatedEntity: {
          type: 'driver',
          id: driver._id
        }
      }).catch(err => {
        console.error(`Failed to send ${channel} activation notification to driver:`, err.message);
      });
    }

    // Also try WhatsApp if phone is available
    if (user.phone) {
      await notificationService.sendNotification({
        userId: user._id,
        channel: 'whatsapp',
        template: 'driver_account_activated',
        recipient: user.phone,
        data,
        relatedEntity: {
          type: 'driver',
          id: driver._id
        }
      }).catch(err => {
        console.error('Failed to send WhatsApp activation notification:', err.message);
      });
    }

    console.log(`Driver account activation notification sent to ${user.name || user._id}`);
  } catch (error) {
    console.error('Failed to notify driver about account activation:', error.message);
  }
};

/**
 * Get documents expiring within specified days
 * Used for expiry alert scheduling
 * 
 * @param {number} days - Number of days to check (default: 30)
 * @returns {Promise<Array>} Documents expiring soon
 * 
 * Requirements: 6.5
 */
const getExpiringDocuments = async (days = 30) => {
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const today = new Date();

  const pipeline = [
    { $unwind: '$documents' },
    {
      $match: {
        'documents.status': 'approved',
        'documents.expiryDate': {
          $ne: null,
          $lte: futureDate,
          $gte: today
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        driverId: '$_id',
        driverName: '$user.name',
        driverPhone: '$user.phone',
        driverEmail: '$user.email',
        documentId: '$documents._id',
        documentType: '$documents.type',
        expiryDate: '$documents.expiryDate',
        daysUntilExpiry: {
          $ceil: {
            $divide: [
              { $subtract: ['$documents.expiryDate', today] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      }
    },
    { $sort: { expiryDate: 1 } }
  ];

  return Driver.aggregate(pipeline);
};

/**
 * Send expiry alerts to drivers
 * Should be called by a scheduled job
 * 
 * @param {number} days - Days before expiry to alert (default: 30)
 * @returns {Promise<Object>} Alert results
 * 
 * Requirements: 6.5
 */
const sendExpiryAlerts = async (days = 30) => {
  const expiringDocs = await getExpiringDocuments(days);
  
  const results = {
    total: expiringDocs.length,
    sent: 0,
    failed: 0,
    flagged: 0
  };

  for (const doc of expiringDocs) {
    try {
      // Send notification to driver
      const recipient = doc.driverPhone || doc.driverEmail;
      const channel = doc.driverPhone ? 'sms' : 'email';

      if (recipient) {
        await notificationService.sendNotification({
          userId: doc.driverId,
          channel,
          template: 'document_expiry_reminder',
          recipient,
          data: {
            documentType: formatDocumentType(doc.documentType),
            expiryDate: doc.expiryDate.toLocaleDateString('en-IN'),
            daysUntilExpiry: doc.daysUntilExpiry
          },
          relatedEntity: {
            type: 'document',
            id: doc.documentId
          }
        });
        results.sent++;
      }

      // Flag the driver account if document expires within 7 days
      if (doc.daysUntilExpiry <= 7) {
        await flagDriverAccount(doc.driverId, doc.documentType, doc.expiryDate);
        results.flagged++;
      }
    } catch (error) {
      console.error(`Failed to send expiry alert for document ${doc.documentId}:`, error.message);
      results.failed++;
    }
  }

  return results;
};


/**
 * Flag a driver account due to expiring documents
 * @param {string} driverId - Driver ID
 * @param {string} documentType - Type of expiring document
 * @param {Date} expiryDate - Document expiry date
 */
const flagDriverAccount = async (driverId, documentType, expiryDate) => {
  // If document is a required type and expires soon, suspend driver
  if (REQUIRED_DOCUMENT_TYPES.includes(documentType)) {
    await Driver.findByIdAndUpdate(driverId, {
      $set: {
        verificationStatus: 'suspended'
      }
    });
  }
};

/**
 * Verify a document (approve or reject)
 * Combined endpoint handler
 * 
 * @param {string} documentId - Document ID
 * @param {Object} params - Verification parameters
 * @param {string} params.status - 'approved' or 'rejected'
 * @param {string} params.reviewerId - Reviewer user ID
 * @param {string} [params.reason] - Rejection reason (required if rejected)
 * @returns {Promise<Object>} Verification result
 * 
 * Requirements: 6.3, 6.4
 */
const verifyDocument = async (documentId, { status, reviewerId, reason }) => {
  if (status === 'approved') {
    return approveDocument(documentId, reviewerId);
  } else if (status === 'rejected') {
    return rejectDocument(documentId, reviewerId, reason);
  } else {
    const error = new Error('Invalid status. Must be "approved" or "rejected"');
    error.code = 'INVALID_STATUS';
    throw error;
  }
};

/**
 * Get pending documents count for dashboard
 * @returns {Promise<Object>} Counts by status
 */
const getDocumentStats = async () => {
  const pipeline = [
    { $unwind: '$documents' },
    {
      $group: {
        _id: '$documents.status',
        count: { $sum: 1 }
      }
    }
  ];

  const results = await Driver.aggregate(pipeline);
  
  const stats = {
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0
  };

  for (const result of results) {
    stats[result._id] = result.count;
    stats.total += result.count;
  }

  return stats;
};

/**
 * Mark documents as missing for a driver
 * Sends notification to driver with list of required documents
 * 
 * @param {string} driverId - Driver ID
 * @param {Array<string>} documentTypes - List of missing document types
 * @param {string} message - Custom message to include in notification
 * @returns {Promise<Object>} Result with notification status
 * 
 * Requirements: 2.4
 */
const markDocumentsMissing = async (driverId, documentTypes, message = '') => {
  const mongoose = require('mongoose');
  
  // Validate document types
  const invalidTypes = documentTypes.filter(type => !DOCUMENT_TYPES.includes(type));
  if (invalidTypes.length > 0) {
    const error = new Error(`Invalid document types: ${invalidTypes.join(', ')}`);
    error.code = 'INVALID_DOCUMENT_TYPE';
    throw error;
  }

  // Find driver
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  // Validate driverId format
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  const driver = await Driver.findById(driverIdStr).populate('userId', 'phone email name preferences');
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  const user = driver.userId;
  if (!user) {
    const error = new Error('Driver user not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Format document types for display
  const formattedTypes = documentTypes.map(formatDocumentType);
  const documentList = formattedTypes.join(', ');

  // Build notification data
  const notificationData = {
    driverName: user.name || 'Driver',
    documentList,
    customMessage: message,
    requiredDocuments: formattedTypes
  };

  const notificationResults = [];
  const channels = user.preferences?.notificationChannels || ['sms', 'email'];

  // Send via preferred channels
  for (const channel of channels) {
    const recipient = channel === 'email' ? user.email : user.phone;
    if (!recipient) continue;

    try {
      const result = await notificationService.sendNotification({
        userId: user._id,
        channel,
        template: 'missing_documents',
        recipient,
        data: notificationData,
        relatedEntity: {
          type: 'driver',
          id: driver._id
        }
      });
      notificationResults.push({ channel, success: result.success });
    } catch (err) {
      notificationResults.push({ channel, success: false, error: err.message });
    }
  }

  // Also try WhatsApp if phone is available
  if (user.phone) {
    try {
      const result = await notificationService.sendNotification({
        userId: user._id,
        channel: 'whatsapp',
        template: 'missing_documents',
        recipient: user.phone,
        data: notificationData,
        relatedEntity: {
          type: 'driver',
          id: driver._id
        }
      });
      notificationResults.push({ channel: 'whatsapp', success: result.success });
    } catch (err) {
      notificationResults.push({ channel: 'whatsapp', success: false, error: err.message });
    }
  }

  return {
    driverId: driver._id,
    missingDocuments: documentTypes,
    notificationsSent: notificationResults.filter(r => r.success).length,
    notificationResults
  };
};

/**
 * Get streamlined document requirements
 * Returns the list of required documents for new driver registration
 * 
 * @returns {Object} Document requirements with types and descriptions
 * 
 * Requirements: 11.1, 11.2
 */
const getStreamlinedDocumentRequirements = () => {
  return {
    documents: imageQualityService.getRequiredDocuments(),
    vehiclePhotos: imageQualityService.getRequiredVehiclePhotos(),
    allRequired: imageQualityService.getAllRequiredDocuments()
  };
};

/**
 * Check if driver has all streamlined required documents
 * 
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Completeness status
 * 
 * Requirements: 11.1, 11.2
 */
const checkStreamlinedDocumentCompleteness = async (driverId) => {
  const mongoose = require('mongoose');
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  if (!driverIdStr || !mongoose.Types.ObjectId.isValid(driverIdStr)) {
    const error = new Error('Invalid driver ID format');
    error.code = 'INVALID_DRIVER_ID';
    throw error;
  }
  
  const driver = await Driver.findById(driverIdStr).lean();
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }
  
  return imageQualityService.checkDocumentCompleteness(driver.documents || []);
};

module.exports = {
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  STREAMLINED_REQUIRED_TYPES,
  submitDocument,
  deleteDocument,
  getQueuePosition,
  getDocumentsForReview,
  getDocumentById,
  getDriverDocuments,
  getDriverDocumentsWithUrls,
  getDocumentWithUrl,
  approveDocument,
  rejectDocument,
  verifyDocument,
  getExpiringDocuments,
  sendExpiryAlerts,
  getDocumentStats,
  formatDocumentType,
  markDocumentsMissing,
  evaluateDriverVerificationStatus,
  getStreamlinedDocumentRequirements,
  checkStreamlinedDocumentCompleteness
};
