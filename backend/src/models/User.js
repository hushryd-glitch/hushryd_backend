const mongoose = require('mongoose');
// Encryption plugin temporarily disabled
// const { encryptionPlugin } = require('../services/encryptionService');

/**
 * Emergency Contact Schema
 * Stores emergency contact details for SOS notifications
 */
const EmergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Emergency contact name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Emergency contact phone is required'],
    trim: true,
    match: [/^\+?[1-9]\d{6,14}$/, 'Please provide a valid phone number']
  },
  relationship: {
    type: String,
    required: [true, 'Relationship is required'],
    trim: true,
    maxlength: [50, 'Relationship cannot exceed 50 characters']
  }
}, { _id: true });

/**
 * User Preferences Schema
 * Stores user ride and notification preferences
 * Requirements: 5.4 - Save preferences for email alerts and mobile alerts with toggle controls
 */
const UserPreferencesSchema = new mongoose.Schema({
  rideType: [{
    type: String,
    enum: ['regular', 'female-only', 'accessible', 'premium']
  }],
  notificationChannels: [{
    type: String,
    enum: ['sms', 'email', 'whatsapp']
  }],
  emailAlerts: {
    type: Boolean,
    default: true
  },
  mobileAlerts: {
    type: Boolean,
    default: true
  },
  // Additional notification preferences - Requirements: 5.4
  bookingReminders: {
    type: Boolean,
    default: true
  },
  promotionalOffers: {
    type: Boolean,
    default: true
  },
  rideUpdates: {
    type: Boolean,
    default: true
  },
  walletAlerts: {
    type: Boolean,
    default: true
  },
  referralUpdates: {
    type: Boolean,
    default: true
  },
  language: {
    type: String,
    default: 'en',
    enum: ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'bn', 'gu', 'mr', 'pa']
  },
  currency: {
    type: String,
    default: 'INR'
  }
}, { _id: false });

/**
 * KYC Document Schema
 * Stores KYC document details for verification
 */
const KYCDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Document type is required'],
    enum: ['aadhaar', 'pan', 'license', 'passport', 'selfie']
  },
  documentNumber: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    required: [true, 'Document URL is required']
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: {
    type: Date
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String,
    trim: true
  }
}, { _id: true });


/**
 * User Schema
 * Design Decision: Single user collection with role-based access
 * Rationale: A user can be both passenger and driver, phone/email must be unique across all users
 */
const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    match: [/^\+?[1-9]\d{6,14}$/, 'Please provide a valid phone number']
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  healthInfo: {
    type: String,
    trim: true,
    maxlength: [500, 'Health info cannot exceed 500 characters']
  },
  preferences: {
    type: UserPreferencesSchema,
    default: () => ({
      rideType: ['regular'],
      notificationChannels: ['sms']
    })
  },
  emergencyContacts: {
    type: [EmergencyContactSchema],
    default: [],
    validate: {
      validator: function(contacts) {
        return contacts.length <= 5;
      },
      message: 'Cannot have more than 5 emergency contacts'
    }
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  kycDocuments: {
    type: [KYCDocumentSchema],
    default: []
  },
  role: {
    type: String,
    enum: ['passenger', 'driver', 'operations', 'customer_support', 'finance', 'admin', 'super_admin'],
    default: 'passenger'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Staff account fields for admin panel users
  isStaff: {
    type: Boolean,
    default: false
  },
  permissions: {
    type: [String],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastLogin: {
    type: Date
  },
  // Password field for staff accounts (email/password auth)
  password: {
    type: String,
    select: false // Don't include password in queries by default
  },
  // Booking PIN for ride verification (4-digit unique code)
  // Design Decision: Permanent PIN tied to phone number for ride start verification
  // Rationale: Ensures correct passenger boards the vehicle (Requirements 4.1, 4.2)
  bookingPIN: {
    type: String,
    match: [/^\d{4}$/, 'Booking PIN must be exactly 4 digits']
  },
  // Enhanced referral system fields for AbhiBus-style interface
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    match: [/^[A-Z0-9]{6}$/, 'Referral code must be 6 alphanumeric characters']
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referralStats: {
    totalReferrals: {
      type: Number,
      default: 0
    },
    successfulReferrals: {
      type: Number,
      default: 0
    },
    totalEarned: {
      type: Number,
      default: 0
    },
    // Enhanced stats for AbhiBus-style dashboard
    pendingReferrals: {
      type: Number,
      default: 0
    },
    lastReferralDate: {
      type: Date
    },
    referralTier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum'],
      default: 'bronze'
    }
  },
  // Social sharing preferences for referral system
  socialSharing: {
    whatsappEnabled: {
      type: Boolean,
      default: true
    },
    emailEnabled: {
      type: Boolean,
      default: true
    },
    facebookEnabled: {
      type: Boolean,
      default: false
    },
    twitterEnabled: {
      type: Boolean,
      default: false
    }
  },
  // Date of birth for age verification and offers
  dateOfBirth: {
    type: Date
  },
  // UPI details for instant transfers
  upiDetails: {
    upiId: {
      type: String,
      trim: true,
      lowercase: true
    },
    verifiedAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
// Note: phone and email indexes are already defined in schema with unique: true, sparse: true
UserSchema.index({ role: 1 });
UserSchema.index({ kycStatus: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ isStaff: 1 });
UserSchema.index({ createdBy: 1 });
UserSchema.index({ bookingPIN: 1 }, { sparse: true });

// Apply encryption plugin for sensitive fields
// Design Decision: Encrypt healthInfo at rest for privacy protection
// Rationale: Health information is sensitive PII that requires encryption per Requirements 10.3
// TEMPORARILY DISABLED - causing stack overflow issues
// UserSchema.plugin(encryptionPlugin, {
//   fields: ['healthInfo']
// });

// Pre-save validation to ensure at least phone or email is provided
UserSchema.pre('save', async function() {
  if (!this.phone && !this.email) {
    throw new Error('Either phone or email is required');
  }
});

/**
 * Generate a unique 4-digit booking PIN (1000-9999)
 * Design Decision: PIN is permanent and tied to user's phone number
 * Rationale: Used for ride start verification to ensure correct passenger boards
 * 
 * Requirements: 4.1, 4.2
 * 
 * @returns {Promise<string>} Unique 4-digit PIN
 */
UserSchema.statics.generateBookingPIN = async function() {
  const maxAttempts = 100;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Generate random 4-digit PIN between 1000-9999
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    
    // Check if PIN is already in use
    const existingUser = await this.findOne({ bookingPIN: pin });
    if (!existingUser) {
      return pin;
    }
    
    attempts++;
  }
  
  throw new Error('Unable to generate unique booking PIN after maximum attempts');
};

/**
 * Generate unique referral code for user
 * Format: 6 alphanumeric characters (e.g., ABC123)
 * 
 * Requirements: 2.1, 2.2
 * 
 * @returns {Promise<string>} Unique referral code
 */
UserSchema.statics.generateReferralCode = async function() {
  const maxAttempts = 100;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    // Generate random 6-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code is already in use
    const existingUser = await this.findOne({ referralCode: code });
    if (!existingUser) {
      return code;
    }
    
    attempts++;
  }
  
  throw new Error('Unable to generate unique referral code after maximum attempts');
};

/**
 * Check if user profile is complete for booking
 * Profile is complete if name is set and at least one emergency contact exists
 * 
 * Requirements: 3.4, 3.5
 * 
 * @returns {boolean} True if profile is complete
 */
UserSchema.methods.isProfileComplete = function() {
  const hasName = this.name && this.name.trim().length > 0;
  const hasEmergencyContact = this.emergencyContacts && this.emergencyContacts.length > 0;
  return hasName && hasEmergencyContact;
};

/**
 * Get profile completeness details
 * Returns which fields are missing for a complete profile
 * 
 * @returns {Object} Profile completeness status with missing fields
 */
UserSchema.methods.getProfileCompleteness = function() {
  const missing = [];
  
  if (!this.name || this.name.trim().length === 0) {
    missing.push('name');
  }
  
  if (!this.emergencyContacts || this.emergencyContacts.length === 0) {
    missing.push('emergencyContacts');
  }
  
  return {
    isComplete: missing.length === 0,
    missing,
    message: missing.length > 0 
      ? `Please complete your profile: ${missing.join(', ')} required`
      : 'Profile is complete'
  };
};

/**
 * Check if user is eligible for booking (Women-Only platform)
 * User must have gender set to 'female' to book rides
 * 
 * Requirements: 1.1, 1.4
 * 
 * @returns {Object} Eligibility status with reason if not eligible
 */
UserSchema.methods.isEligibleForBooking = function() {
  // Check if gender is set (Requirement 1.4)
  if (!this.gender) {
    return {
      eligible: false,
      reason: 'PROFILE_INCOMPLETE',
      message: 'Please complete your profile with gender information',
      redirectTo: '/profile/setup'
    };
  }
  
  // Check if user is female (Requirement 1.1)
  if (this.gender !== 'female') {
    return {
      eligible: false,
      reason: 'WOMEN_ONLY',
      message: 'HushRyd is currently available for women travelers only'
    };
  }
  
  return {
    eligible: true,
    reason: null,
    message: 'User is eligible for booking'
  };
};

const User = mongoose.model('User', UserSchema);

module.exports = User;
