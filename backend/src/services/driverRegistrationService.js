const User = require('../models/User');
const Driver = require('../models/Driver');
const { validateUniqueIdentifier } = require('./userService');

/**
 * Driver Registration Service
 * Handles driver onboarding workflow including personal details and initial driver record creation
 * 
 * Requirements: 1.1, 1.2, 1.5, 1.6
 */

/**
 * Register a new driver with personal details
 * @param {Object} registrationData - Driver registration data
 * @param {string} registrationData.userId - User ID from existing user account
 * @param {Object} registrationData.personalDetails - Personal information
 * @returns {Promise<Object>} Driver registration result
 * @throws {Error} If validation fails or user already exists as driver
 * 
 * Requirements: 1.1, 1.2
 */
const registerDriver = async (registrationData) => {
  const { personalDetails, userId } = registrationData;

  // Validate required fields
  if (!personalDetails || !userId) {
    const error = new Error('Personal details and user ID are required');
    error.code = 'MISSING_REQUIRED_FIELDS';
    throw error;
  }

  const { name, phone, email, address, licenseNumber, licenseExpiry } = personalDetails;

  // Validate personal details
  if (!name || !phone || !email || !address) {
    const error = new Error('Name, phone, email, and address are required');
    error.code = 'INVALID_PERSONAL_DETAILS';
    throw error;
  }

  // Validate license details
  if (!licenseNumber || !licenseExpiry) {
    const error = new Error('License number and expiry date are required');
    error.code = 'MISSING_LICENSE_DETAILS';
    throw error;
  }

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  // Check if user is already a driver
  const existingDriver = await Driver.findOne({ userId });
  if (existingDriver) {
    const error = new Error('User is already registered as a driver');
    error.code = 'DRIVER_ALREADY_EXISTS';
    throw error;
  }

  // Check if license number is unique
  const existingLicense = await Driver.findOne({ licenseNumber: licenseNumber.trim() });
  if (existingLicense) {
    const error = new Error('License number is already registered');
    error.code = 'LICENSE_ALREADY_REGISTERED';
    throw error;
  }

  // Create driver record
  const driver = new Driver({
    userId,
    licenseNumber: licenseNumber.trim(),
    licenseExpiry: new Date(licenseExpiry),
    verificationStatus: 'pending',
    vehicles: [],
    documents: []
  });

  await driver.save();

  // Update user profile with name and role
  let userUpdated = false;
  if (!user.name && name) {
    user.name = name.trim();
    userUpdated = true;
  }
  // Update user role to driver
  if (user.role !== 'driver' && user.role !== 'admin') {
    user.role = 'driver';
    userUpdated = true;
  }
  if (userUpdated) {
    await user.save();
  }

  return {
    success: true,
    driverId: driver._id,
    status: driver.verificationStatus,
    role: user.role,
    message: 'Driver registration initiated successfully'
  };
};

/**
 * Get driver registration status
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Driver status information
 * 
 * Requirements: 1.5
 */
const getDriverStatus = async (userId) => {
  const driver = await Driver.findOne({ userId })
    .populate('userId', 'name phone email')
    .lean();

  if (!driver) {
    return {
      isDriver: false,
      status: null
    };
  }

  // Calculate onboarding progress
  const hasVehicle = driver.vehicles && driver.vehicles.length > 0;
  const hasDocuments = driver.documents && driver.documents.length > 0;
  const requiredDocs = ['license', 'registration', 'insurance', 'kyc'];
  const uploadedDocTypes = driver.documents?.map(d => d.type) || [];
  const hasAllRequiredDocs = requiredDocs.every(type => uploadedDocTypes.includes(type));

  let onboardingStep = 'personal_details_completed';
  if (hasVehicle) onboardingStep = 'vehicle_details_completed';
  if (hasAllRequiredDocs) onboardingStep = 'documents_uploaded';
  if (driver.verificationStatus === 'verified') onboardingStep = 'verified';

  return {
    isDriver: true,
    driverId: driver._id,
    status: driver.verificationStatus,
    onboardingStep,
    personalDetails: {
      name: driver.userId?.name,
      phone: driver.userId?.phone,
      email: driver.userId?.email
    },
    licenseNumber: driver.licenseNumber,
    licenseExpiry: driver.licenseExpiry,
    vehicleDetails: driver.vehicles?.[0] || null,
    documents: driver.documents,
    hasVehicle,
    hasAllRequiredDocs
  };
};

/**
 * Check if driver can create trips (must be verified)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Eligibility result
 * 
 * Requirements: 1.6
 */
const canCreateTrips = async (userId) => {
  const driver = await Driver.findOne({ userId }).lean();

  if (!driver) {
    return { eligible: false, reason: 'Not registered as driver' };
  }

  if (driver.verificationStatus !== 'verified') {
    return { 
      eligible: false, 
      reason: `Driver status is ${driver.verificationStatus}. Must be verified to create trips.`
    };
  }

  if (!driver.vehicles || driver.vehicles.length === 0) {
    return { eligible: false, reason: 'No vehicle registered' };
  }

  const activeVehicle = driver.vehicles.find(v => v.isActive);
  if (!activeVehicle) {
    return { eligible: false, reason: 'No active vehicle' };
  }

  return { 
    eligible: true, 
    driverId: driver._id,
    activeVehicle
  };
};

module.exports = {
  registerDriver,
  getDriverStatus,
  canCreateTrips
};
