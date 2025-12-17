const express = require('express');
const Joi = require('joi');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { uploadLimiter } = require('../middleware/rateLimiter');
const driverRegistrationService = require('../services/driverRegistrationService');
const vehicleService = require('../services/vehicleService');
const documentService = require('../services/documentService');
const uploadService = require('../services/uploadService');

const router = express.Router();

// Configure multer for memory storage (S3 upload)
// Files are stored in memory as Buffer objects for direct S3 upload
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
  }
});



// Validation schemas
const driverRegistrationSchema = Joi.object({
  personalDetails: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    phone: schemas.phone.required(),
    email: schemas.email.required(),
    address: Joi.string().min(10).max(500).required(),
    licenseNumber: Joi.string().min(5).max(20).required(),
    licenseExpiry: Joi.date().greater('now').required()
  }).required()
});


const vehicleSchema = Joi.object({
  registrationNumber: Joi.string().pattern(/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/).required()
    .messages({ 'string.pattern.base': 'Registration number must be in valid Indian format' }),
  make: Joi.string().min(2).max(50).required(),
  model: Joi.string().min(2).max(50).required(),
  year: Joi.number().integer().min(1990).max(new Date().getFullYear() + 1).required(),
  color: Joi.string().min(3).max(30).required(),
  type: Joi.string().valid('sedan', 'suv', 'hatchback', 'premium').required(),
  seats: Joi.number().integer().min(2).max(8).required(),
  insuranceExpiry: Joi.date().greater('now').required()
});

/**
 * POST /api/driver/register
 * Register as a driver with personal details
 * Requirements: 1.1, 1.2
 */
router.post('/register', authenticateToken, validate(driverRegistrationSchema), async (req, res) => {
  try {
    const { personalDetails } = req.body;
    const userId = req.user._id;

    const result = await driverRegistrationService.registerDriver({
      personalDetails,
      userId
    });

    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_ALREADY_EXISTS') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'LICENSE_ALREADY_REGISTERED') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }
    if (['INVALID_PERSONAL_DETAILS', 'MISSING_REQUIRED_FIELDS', 'MISSING_LICENSE_DETAILS'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Driver registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/driver/vehicle
 * Add vehicle details to driver profile
 * Requirements: 1.3
 */
router.post('/vehicle', authenticateToken, validate(vehicleSchema), async (req, res) => {
  try {
    const vehicleData = req.body;
    
    // Get driver ID from user
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({
        success: false,
        error: 'Driver registration not found',
        code: 'DRIVER_NOT_FOUND'
      });
    }

    const result = await vehicleService.addVehicle(driverStatus.driverId, vehicleData);
    res.status(201).json(result);
  } catch (error) {
    if (['INVALID_VEHICLE_TYPE', 'INVALID_YEAR', 'INVALID_SEAT_COUNT', 
         'INVALID_REGISTRATION_FORMAT', 'MISSING_VEHICLE_FIELDS'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DUPLICATE_REGISTRATION') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'VEHICLE_LIMIT_EXCEEDED') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Add vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/status
 * Get driver registration and verification status
 * Requirements: 1.5
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const result = await driverRegistrationService.getDriverStatus(req.user._id);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Get driver status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});


/**
 * POST /api/driver/documents
 * Upload driver documents to S3
 * Requirements: 4.1, 4.4 - Upload rate limited to 20 req/min
 */
router.post('/documents', authenticateToken, uploadLimiter, (req, res, next) => {
  // Wrap multer upload to handle errors
  upload.single('document')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File size must be less than 5MB', code: 'FILE_TOO_LARGE' });
      }
      return res.status(400).json({ success: false, error: err.message, code: 'UPLOAD_ERROR' });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message, code: 'UPLOAD_ERROR' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { documentType, expiryDate } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded', code: 'NO_FILE_UPLOADED' });
    }

    if (!documentType) {
      return res.status(400).json({ success: false, error: 'Document type is required', code: 'MISSING_DOCUMENT_TYPE' });
    }

    // Get driver ID
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ 
        success: false, 
        error: 'Please complete driver registration first', 
        code: 'DRIVER_NOT_FOUND',
        redirectTo: '/driver/register'
      });
    }

    // Submit document with file buffer for S3 upload
    const result = await documentService.submitDocument({
      driverId: driverStatus.driverId,
      type: documentType,
      file: {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      },
      expiryDate: expiryDate || null
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'INVALID_DOCUMENT_TYPE') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message && error.message.startsWith('S3_')) {
      return res.status(500).json({ success: false, error: 'Upload failed. Please try again.', code: 'S3_UPLOAD_FAILED' });
    }
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/documents
 * Get driver documents with presigned URLs
 * Requirements: 1.1, 1.2, 1.4
 */
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    // Use getDriverDocumentsWithUrls for presigned URL support
    const documents = await documentService.getDriverDocumentsWithUrls(driverStatus.driverId);
    res.status(200).json({ success: true, documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * DELETE /api/driver/documents/:documentId
 * Delete a pending document
 * Requirements: 3.1, 3.2
 */
router.delete('/documents/:documentId', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get driver ID
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    // Delete document (validates ownership and status)
    const result = await documentService.deleteDocument(documentId, driverStatus.driverId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'UNAUTHORIZED_DELETE') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'CANNOT_DELETE_APPROVED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'CANNOT_DELETE_REJECTED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Delete document error:', error);
    res.status(500).json({ success: false, error: 'Delete failed. Please try again.', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/documents/:documentId/url
 * Get fresh presigned URL for a document
 * Requirements: 1.3, 5.3
 */
router.get('/documents/:documentId/url', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get driver ID
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    // Get document with fresh presigned URL
    const document = await documentService.getDocumentWithUrl(documentId);
    
    // Verify ownership
    if (document.driverId.toString() !== driverStatus.driverId.toString()) {
      return res.status(403).json({ success: false, error: 'You can only access your own documents', code: 'UNAUTHORIZED_ACCESS' });
    }

    res.status(200).json({ 
      success: true, 
      url: document.url, 
      expiresAt: document.urlExpiresAt 
    });
  } catch (error) {
    if (error.code === 'DOCUMENT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message && error.message.startsWith('S3_')) {
      return res.status(500).json({ success: false, error: 'Unable to load document. Please refresh.', code: 'S3_URL_GENERATION_FAILED' });
    }
    console.error('Get document URL error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/profile/complete
 * Get complete driver profile with all documents and presigned URLs
 * Requirements: 5.1
 */
router.get('/profile/complete', authenticateToken, async (req, res) => {
  try {
    // Get driver ID
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    // Get driver profile with documents
    const profile = await documentService.getDriverDocuments(driverStatus.driverId);
    
    // Get documents with presigned URLs
    const documents = await documentService.getDriverDocumentsWithUrls(driverStatus.driverId);

    res.status(200).json({ 
      success: true, 
      profile: {
        driverId: profile.driverId,
        driverName: profile.driverName,
        driverPhone: profile.driverPhone,
        driverEmail: profile.driverEmail,
        licenseNumber: profile.licenseNumber,
        licenseExpiry: profile.licenseExpiry,
        verificationStatus: profile.verificationStatus,
        vehicles: profile.vehicles
      },
      documents 
    });
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get complete profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/vehicles
 * Get driver vehicles
 * Requirements: 1.3
 */
router.get('/vehicles', authenticateToken, async (req, res) => {
  try {
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    const result = await vehicleService.getVehicleDetails(driverStatus.driverId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * PUT /api/driver/vehicles/:vehicleId/active
 * Set active vehicle
 */
router.put('/vehicles/:vehicleId/active', authenticateToken, async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    const result = await vehicleService.setActiveVehicle(driverStatus.driverId, vehicleId);
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'VEHICLE_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Set active vehicle error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/eligibility
 * Check if driver can create trips
 * Requirements: 1.6
 */
router.get('/eligibility', authenticateToken, async (req, res) => {
  try {
    const result = await driverRegistrationService.canCreateTrips(req.user._id);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Check eligibility error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/document-requirements
 * Get streamlined document requirements for driver registration
 * Requirements: 11.1, 11.2
 */
router.get('/document-requirements', async (req, res) => {
  try {
    const requirements = documentService.getStreamlinedDocumentRequirements();
    res.status(200).json({ success: true, ...requirements });
  } catch (error) {
    console.error('Get document requirements error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/document-completeness
 * Check if driver has all required documents uploaded
 * Requirements: 11.1, 11.2
 */
router.get('/document-completeness', authenticateToken, async (req, res) => {
  try {
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ success: false, error: 'Driver registration not found', code: 'DRIVER_NOT_FOUND' });
    }

    const completeness = await documentService.checkStreamlinedDocumentCompleteness(driverStatus.driverId);
    res.status(200).json({ success: true, ...completeness });
  } catch (error) {
    console.error('Check document completeness error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/driver/documents/presigned-url
 * Generate presigned URL for direct S3 upload
 * Design Decision: Direct-to-S3 upload bypasses backend for scalability
 * 
 * Requirements: 1.2 - Generate S3 presigned URLs within 500ms
 * Requirements: 4.4 - Upload rate limited to 20 req/min
 */
router.post('/documents/presigned-url', authenticateToken, uploadLimiter, async (req, res) => {
  try {
    const { documentType, fileType } = req.body;

    // Validate required fields
    if (!documentType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Document type is required', 
        code: 'MISSING_DOCUMENT_TYPE' 
      });
    }

    if (!fileType) {
      return res.status(400).json({ 
        success: false, 
        error: 'File type is required', 
        code: 'MISSING_FILE_TYPE' 
      });
    }

    // Get driver ID
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ 
        success: false, 
        error: 'Please complete driver registration first', 
        code: 'DRIVER_NOT_FOUND',
        redirectTo: '/driver/register'
      });
    }

    // Generate presigned URL
    const result = await uploadService.generateUploadUrl({
      userId: req.user._id,
      driverId: driverStatus.driverId,
      documentType,
      fileType
    });

    res.status(200).json(result);
  } catch (error) {
    if (['INVALID_DOCUMENT_TYPE', 'INVALID_FILE_TYPE', 'MISSING_DOCUMENT_TYPE', 'MISSING_FILE_TYPE'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED_UPLOAD') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message && error.message.startsWith('PRESIGNED_URL_FAILED')) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to generate upload URL. Please try again.', 
        code: 'PRESIGNED_URL_FAILED' 
      });
    }
    console.error('Generate presigned URL error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/driver/documents/upload-complete
 * Confirm upload completion and queue for processing
 * Called after client successfully uploads to S3
 * 
 * Requirements: 1.3 - Queue document for processing with guaranteed delivery
 * Requirements: 4.4 - Upload rate limited to 20 req/min
 */
router.post('/documents/upload-complete', authenticateToken, uploadLimiter, async (req, res) => {
  try {
    const { key, documentType, originalFilename, expiryDate } = req.body;

    // Validate required fields
    if (!key) {
      return res.status(400).json({ 
        success: false, 
        error: 'S3 key is required', 
        code: 'MISSING_S3_KEY' 
      });
    }

    if (!documentType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Document type is required', 
        code: 'MISSING_DOCUMENT_TYPE' 
      });
    }

    // Get driver ID
    const driverStatus = await driverRegistrationService.getDriverStatus(req.user._id);
    if (!driverStatus.isDriver) {
      return res.status(404).json({ 
        success: false, 
        error: 'Please complete driver registration first', 
        code: 'DRIVER_NOT_FOUND',
        redirectTo: '/driver/register'
      });
    }

    // Confirm upload and queue for processing
    const result = await uploadService.confirmUploadCompletion({
      userId: req.user._id,
      driverId: driverStatus.driverId,
      key,
      documentType,
      originalFilename,
      expiryDate
    });

    res.status(201).json(result);
  } catch (error) {
    if (['MISSING_S3_KEY', 'MISSING_DOCUMENT_TYPE', 'INVALID_DRIVER_ID'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'UNAUTHORIZED_ACCESS') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'S3_OBJECT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Upload completion error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/documents/queue-status
 * Get current upload queue status
 * 
 * Requirements: 1.6 - Return queue position and estimated wait time
 */
router.get('/documents/queue-status', authenticateToken, async (req, res) => {
  try {
    const queueInfo = await uploadService.getUploadQueueInfo();
    res.status(200).json({ 
      success: true, 
      ...queueInfo 
    });
  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/driver/booking-requests
 * Get pending booking requests for driver
 * Requirements: 4.2
 */
router.get('/booking-requests', authenticateToken, async (req, res) => {
  try {
    const Driver = require('../models/Driver');
    const driver = await Driver.findOne({ userId: req.user._id });
    
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        error: 'Driver profile not found', 
        code: 'DRIVER_NOT_FOUND' 
      });
    }

    const bookingService = require('../services/bookingService');
    const result = await bookingService.getDriverBookingRequests(driver._id.toString());
    res.status(200).json(result);
  } catch (error) {
    if (error.code === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Get booking requests error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
