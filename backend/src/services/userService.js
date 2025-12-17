const User = require('../models/User');

/**
 * Validate that phone and email are unique across all users
 * Design Decision: Enforce unique phone/email at database and application level
 * Rationale: Prevents fraud where same person creates driver and passenger accounts
 * to manipulate ratings or payments
 * 
 * @param {string|null} phone - Phone number to validate
 * @param {string|null} email - Email address to validate
 * @param {string|null} excludeUserId - User ID to exclude from check (for updates)
 * @returns {Promise<boolean>} True if identifiers are unique
 * @throws {Error} If phone or email already exists
 */
const validateUniqueIdentifier = async (phone, email, excludeUserId = null) => {
  const conditions = [];
  
  if (phone) {
    conditions.push({ phone });
  }
  if (email) {
    conditions.push({ email });
  }
  
  if (conditions.length === 0) {
    return true;
  }
  
  const query = { $or: conditions };
  
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }
  
  const existingUser = await User.findOne(query);
  
  if (existingUser) {
    if (phone && existingUser.phone === phone) {
      const error = new Error('Phone number is already registered');
      error.code = 'PHONE_ALREADY_REGISTERED';
      throw error;
    }
    if (email && existingUser.email === email) {
      const error = new Error('Email address is already registered');
      error.code = 'EMAIL_ALREADY_REGISTERED';
      throw error;
    }
  }
  
  return true;
};

/**
 * Create a new user with unique identifier validation
 * @param {Object} userData - User data to create
 * @returns {Promise<Object>} Created user
 */
const createUser = async (userData) => {
  await validateUniqueIdentifier(userData.phone, userData.email);
  const user = new User(userData);
  return user.save();
};

/**
 * Update user profile with unique identifier validation
 * @param {string} userId - User ID to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated user
 */
const updateUser = async (userId, updateData) => {
  if (updateData.phone || updateData.email) {
    await validateUniqueIdentifier(updateData.phone, updateData.email, userId);
  }
  
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  );
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  return user;
};

/**
 * Find user by phone or email
 * @param {string} identifier - Phone or email
 * @returns {Promise<Object|null>} User or null
 */
const findUserByIdentifier = async (identifier) => {
  return User.findOne({
    $or: [
      { phone: identifier },
      { email: identifier }
    ]
  });
};

/**
 * Find user by ID
 * @param {string} userId - User's MongoDB ObjectId
 * @returns {Promise<Object|null>} User or null
 */
const findUserById = async (userId) => {
  if (!userId) {
    return null;
  }
  return User.findById(userId);
};

/**
 * Generate and assign a unique booking PIN to a user
 * Design Decision: PIN is generated once and remains permanent
 * Rationale: Consistent PIN for ride verification across all bookings
 * 
 * Requirements: 4.1, 4.2
 * 
 * @param {string} userId - User ID to assign PIN to
 * @returns {Promise<Object>} Updated user with booking PIN
 */
const generateBookingPIN = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // If user already has a PIN, return it
  if (user.bookingPIN) {
    return {
      success: true,
      bookingPIN: user.bookingPIN,
      isNew: false
    };
  }
  
  // Generate new unique PIN
  const pin = await User.generateBookingPIN();
  
  // Assign PIN to user
  user.bookingPIN = pin;
  await user.save();
  
  return {
    success: true,
    bookingPIN: pin,
    isNew: true
  };
};

/**
 * Validate user profile completeness for booking
 * Checks if name and emergency contacts are set
 * 
 * Requirements: 3.4, 3.5
 * 
 * @param {string} userId - User ID to validate
 * @returns {Promise<Object>} Profile completeness status
 */
const validateProfileForBooking = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  return user.getProfileCompleteness();
};

/**
 * Update user's emergency contacts
 * Validates phone numbers and enforces max 5 contacts limit
 * 
 * Requirements: 3.4, 9.2
 * 
 * @param {string} userId - User ID
 * @param {Array} contacts - Array of emergency contacts
 * @returns {Promise<Object>} Updated user
 */
const updateEmergencyContacts = async (userId, contacts) => {
  const user = await User.findById(userId);
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // Validate contacts array
  if (!Array.isArray(contacts)) {
    const error = new Error('Contacts must be an array');
    error.code = 'INVALID_CONTACTS';
    throw error;
  }
  
  // Enforce max 5 contacts
  if (contacts.length > 5) {
    const error = new Error('Maximum 5 emergency contacts allowed');
    error.code = 'MAX_CONTACTS_EXCEEDED';
    throw error;
  }
  
  // Validate each contact
  const validatedContacts = contacts.map((contact, index) => {
    if (!contact.name || contact.name.trim().length === 0) {
      const error = new Error(`Contact ${index + 1}: Name is required`);
      error.code = 'INVALID_CONTACT_NAME';
      throw error;
    }
    
    if (!contact.phone || !/^\+?[1-9]\d{6,14}$/.test(contact.phone)) {
      const error = new Error(`Contact ${index + 1}: Valid phone number is required`);
      error.code = 'INVALID_CONTACT_PHONE';
      throw error;
    }
    
    if (!contact.relationship || contact.relationship.trim().length === 0) {
      const error = new Error(`Contact ${index + 1}: Relationship is required`);
      error.code = 'INVALID_CONTACT_RELATIONSHIP';
      throw error;
    }
    
    return {
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      relationship: contact.relationship.trim()
    };
  });
  
  user.emergencyContacts = validatedContacts;
  await user.save();
  
  return {
    success: true,
    emergencyContacts: user.emergencyContacts,
    message: `${validatedContacts.length} emergency contact(s) saved`
  };
};

/**
 * Get user profile with booking PIN
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User profile
 */
const getProfile = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  const completeness = user.getProfileCompleteness();
  
  return {
    success: true,
    profile: {
      _id: user._id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      gender: user.gender,
      bookingPIN: user.bookingPIN,
      emergencyContacts: user.emergencyContacts,
      kycStatus: user.kycStatus,
      role: user.role,
      isActive: user.isActive,
      profileComplete: completeness.isComplete,
      profileCompleteness: completeness,
      createdAt: user.createdAt
    }
  };
};

module.exports = {
  validateUniqueIdentifier,
  createUser,
  updateUser,
  findUserByIdentifier,
  findUserById,
  generateBookingPIN,
  validateProfileForBooking,
  updateEmergencyContacts,
  getProfile
};
