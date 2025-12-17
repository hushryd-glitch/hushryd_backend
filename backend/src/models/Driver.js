const mongoose = require('mongoose');
const { encryptionPlugin } = require('../services/encryptionService');

/**
 * Vehicle Schema
 * Stores vehicle information for drivers
 */
const VehicleSchema = new mongoose.Schema({
  registrationNumber: {
    type: String,
    required: [true, 'Vehicle registration number is required'],
    trim: true,
    uppercase: true
  },
  make: {
    type: String,
    required: [true, 'Vehicle make is required'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'Vehicle model is required'],
    trim: true
  },
  year: {
    type: Number,
    required: [true, 'Vehicle year is required'],
    min: [1990, 'Vehicle year must be 1990 or later'],
    max: [new Date().getFullYear() + 1, 'Invalid vehicle year']
  },
  color: {
    type: String,
    required: [true, 'Vehicle color is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Vehicle type is required'],
    enum: ['sedan', 'suv', 'hatchback', 'premium']
  },
  seats: {
    type: Number,
    required: [true, 'Number of seats is required'],
    min: [2, 'Minimum 2 seats required'],
    max: [8, 'Maximum 8 seats allowed']
  },
  insuranceExpiry: {
    type: Date,
    required: [true, 'Insurance expiry date is required']
  },
  photos: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: true, timestamps: true });


/**
 * Driver Document Schema
 * Stores document information for verification
 * 
 * Design Decision: Added S3 fields for cloud storage integration
 * Rationale: Enables scalable document storage with presigned URL access
 * The url field is kept for backward compatibility during migration
 * 
 * Requirements: 11.1, 11.2 - Streamlined document types including 4 vehicle photos
 */
const DriverDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Document type is required'],
    enum: [
      'license',        // Driving license
      'registration',   // Vehicle RC
      'insurance',      // Vehicle insurance (legacy)
      'kyc',            // KYC Aadhaar card
      'selfie_with_car', // Selfie with car (legacy)
      'vehicle_photo',  // Generic vehicle photo (legacy)
      'vehicle_front',  // Vehicle front photo - Requirements 11.2
      'vehicle_back',   // Vehicle back photo - Requirements 11.2
      'vehicle_side',   // Vehicle side photo - Requirements 11.2
      'vehicle_inside'  // Vehicle inside photo - Requirements 11.2
    ]
  },
  // S3 storage fields (new)
  s3Key: {
    type: String,
    trim: true
  },
  s3Bucket: {
    type: String,
    trim: true
  },
  originalFilename: {
    type: String,
    trim: true
  },
  contentType: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number,
    min: 0
  },
  // Legacy field - kept for backward compatibility during migration
  url: {
    type: String
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  expiryDate: {
    type: Date
  }
}, { _id: true });

/**
 * Bank Details Schema
 * Stores encrypted bank account information for payouts
 */
const BankDetailsSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    required: [true, 'Account number is required']
    // Note: Should be encrypted at rest
  },
  ifscCode: {
    type: String,
    required: [true, 'IFSC code is required'],
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format']
  },
  accountHolderName: {
    type: String,
    required: [true, 'Account holder name is required'],
    trim: true
  },
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  // Cashfree beneficiary ID for payouts (Requirements: 6.1)
  beneficiaryId: {
    type: String,
    trim: true
  },
  beneficiaryStatus: {
    type: String,
    enum: ['pending', 'registered', 'failed'],
    default: 'pending'
  },
  beneficiaryRegisteredAt: {
    type: Date
  }
}, { _id: false });

/**
 * Driver Schema
 * Design Decision: Separate collection linked to User via userId
 * Rationale: Keeps user data normalized, driver can be deactivated without affecting user account
 */
const DriverSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true,
    index: true
  },
  licenseNumber: {
    type: String,
    required: [true, 'License number is required'],
    trim: true
  },
  licenseExpiry: {
    type: Date,
    required: [true, 'License expiry date is required']
  },
  vehicles: {
    type: [VehicleSchema],
    default: [],
    validate: {
      validator: function(vehicles) {
        return vehicles.length <= 3;
      },
      message: 'Cannot have more than 3 vehicles'
    }
  },
  documents: {
    type: [DriverDocumentSchema],
    default: []
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'suspended'],
    default: 'pending'
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalTrips: {
    type: Number,
    default: 0
  },
  earnings: {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    vault: { type: Number, default: 0 }
  },
  bankDetails: {
    type: BankDetailsSchema
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
DriverSchema.index({ verificationStatus: 1 });
DriverSchema.index({ licenseNumber: 1 }, { unique: true });
DriverSchema.index({ 'documents.status': 1 });
DriverSchema.index({ 'documents.expiryDate': 1 });

// Apply encryption plugin for sensitive fields
// Design Decision: Encrypt bank account numbers at rest for payment security
// Rationale: Payment details require encryption per Requirements 10.3
DriverSchema.plugin(encryptionPlugin, {
  fields: ['bankDetails.accountNumber']
});

/**
 * Get documents expiring within specified days
 * @param {number} days - Number of days to check
 * @returns {Array} Documents expiring soon
 */
DriverSchema.methods.getExpiringDocuments = function(days = 30) {
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this.documents.filter(doc => 
    doc.expiryDate && doc.expiryDate <= futureDate && doc.status === 'approved'
  );
};

/**
 * Check if driver has all required documents approved
 * @returns {boolean} True if all required documents are approved
 */
DriverSchema.methods.hasAllRequiredDocuments = function() {
  const requiredTypes = ['license', 'registration', 'insurance', 'kyc'];
  return requiredTypes.every(type => 
    this.documents.some(doc => doc.type === type && doc.status === 'approved')
  );
};

const Driver = mongoose.model('Driver', DriverSchema);

module.exports = Driver;
