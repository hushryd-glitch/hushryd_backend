/**
 * Profile Service
 * Handles user profile operations including get, update, emergency contacts, and KYC
 * Requirements: 8.1, 8.2, 8.3, 8.4
 * 
 * Cache Integration:
 * Requirements: 6.4 - Invalidate user cache on profile update
 */
const User = require('../models/User');
const { invalidateUserCache } = require('./cacheService');

/**
 * List of fields that users can edit in their profile
 * Requirements: 5.2, 8.1 - Personal info including name, email, gender, date of birth
 */
const EDITABLE_FIELDS = ['name', 'email', 'gender', 'dateOfBirth', 'healthInfo', 'preferences'];

/**
 * Get user profile with editable fields list
 * Requirements: 8.1
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User profile with editable fields
 */
const getProfile = async (userId) => {
  const user = await User.findById(userId).select('-__v').lean();
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  return {
    user,
    editableFields: EDITABLE_FIELDS
  };
};

/**
 * Update user profile with validation
 * Requirements: 8.2
 * @param {string} userId - User ID
 * @param {Object} updateData - Profile data to update
 * @returns {Promise<Object>} Updated user with confirmation
 */
const updateProfile = async (userId, updateData) => {
  // Filter to only allow editable fields
  const allowedUpdates = {};
  const updatedFields = [];
  
  for (const field of EDITABLE_FIELDS) {
    if (updateData[field] !== undefined) {
      allowedUpdates[field] = updateData[field];
      updatedFields.push(field);
    }
  }
  
  if (updatedFields.length === 0) {
    const error = new Error('No valid fields to update');
    error.code = 'NO_VALID_FIELDS';
    throw error;
  }
  
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  ).select('-__v').lean();
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // Invalidate user cache on profile update - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    user,
    updatedFields
  };
};


/**
 * Add emergency contact to user profile
 * Requirements: 8.3
 * @param {string} userId - User ID
 * @param {Object} contactData - Emergency contact data
 * @returns {Promise<Object>} Updated user with new contact
 */
const addEmergencyContact = async (userId, contactData) => {
  // First check if user exists and get current contact count
  const existingUser = await User.findById(userId).select('emergencyContacts').lean();
  
  if (!existingUser) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // Check max contacts limit (5)
  if (existingUser.emergencyContacts && existingUser.emergencyContacts.length >= 5) {
    const error = new Error('Maximum 5 emergency contacts allowed');
    error.code = 'MAX_CONTACTS_REACHED';
    throw error;
  }
  
  // Use findByIdAndUpdate with $push to avoid triggering pre-save hooks
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { 
      $push: { 
        emergencyContacts: {
          name: contactData.name,
          phone: contactData.phone,
          relationship: contactData.relationship
        }
      }
    },
    { new: true, runValidators: true }
  ).select('emergencyContacts');
  
  if (!updatedUser) {
    const error = new Error('Failed to update user');
    error.code = 'UPDATE_FAILED';
    throw error;
  }
  
  const newContact = updatedUser.emergencyContacts[updatedUser.emergencyContacts.length - 1];
  
  // Invalidate user cache on emergency contact add - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    contact: newContact.toObject(),
    totalContacts: updatedUser.emergencyContacts.length
  };
};

/**
 * Get all emergency contacts for a user
 * Requirements: 8.3
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of emergency contacts
 */
const getEmergencyContacts = async (userId) => {
  const user = await User.findById(userId).select('emergencyContacts');
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  return user.emergencyContacts;
};

/**
 * Update an emergency contact
 * Requirements: 8.3
 * @param {string} userId - User ID
 * @param {string} contactId - Contact ID
 * @param {Object} updateData - Contact data to update
 * @returns {Promise<Object>} Updated contact
 */
const updateEmergencyContact = async (userId, contactId, updateData) => {
  // Build the update object for the specific array element
  const updateFields = {};
  if (updateData.name) updateFields['emergencyContacts.$.name'] = updateData.name;
  if (updateData.phone) updateFields['emergencyContacts.$.phone'] = updateData.phone;
  if (updateData.relationship) updateFields['emergencyContacts.$.relationship'] = updateData.relationship;
  
  if (Object.keys(updateFields).length === 0) {
    const error = new Error('No valid fields to update');
    error.code = 'NO_VALID_FIELDS';
    throw error;
  }
  
  // Use findOneAndUpdate with positional operator to update specific contact
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, 'emergencyContacts._id': contactId },
    { $set: updateFields },
    { new: true, runValidators: true }
  ).select('emergencyContacts');
  
  if (!updatedUser) {
    // Check if user exists
    const userExists = await User.findById(userId).select('_id').lean();
    if (!userExists) {
      const error = new Error('User not found');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
    const error = new Error('Emergency contact not found');
    error.code = 'CONTACT_NOT_FOUND';
    throw error;
  }
  
  const contact = updatedUser.emergencyContacts.id(contactId);
  
  // Invalidate user cache on emergency contact update - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    contact: contact.toObject()
  };
};

/**
 * Delete an emergency contact
 * Requirements: 8.3
 * @param {string} userId - User ID
 * @param {string} contactId - Contact ID
 * @returns {Promise<Object>} Deletion confirmation
 */
const deleteEmergencyContact = async (userId, contactId) => {
  // Use findOneAndUpdate with $pull to remove the contact atomically
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, 'emergencyContacts._id': contactId },
    { $pull: { emergencyContacts: { _id: contactId } } },
    { new: true }
  ).select('emergencyContacts');
  
  if (!updatedUser) {
    // Check if user exists
    const userExists = await User.findById(userId).select('_id').lean();
    if (!userExists) {
      const error = new Error('User not found');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
    const error = new Error('Emergency contact not found');
    error.code = 'CONTACT_NOT_FOUND';
    throw error;
  }
  
  // Invalidate user cache on emergency contact delete - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    message: 'Emergency contact deleted',
    remainingContacts: updatedUser.emergencyContacts.length
  };
};


/**
 * Upload KYC document with secure storage
 * Requirements: 8.4
 * Design Decision: Multipart form upload with immediate queue processing
 * Rationale: Ensures documents are validated and queued atomically
 * 
 * @param {string} userId - User ID
 * @param {Object} documentData - Document data
 * @param {string} documentData.type - Document type ('id_proof' | 'selfie')
 * @param {string} documentData.url - Secure URL of uploaded document
 * @returns {Promise<Object>} Upload confirmation with queue position
 */
const uploadKYCDocument = async (userId, documentData) => {
  const user = await User.findById(userId);
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // Check if document type already exists and is pending/verified
  const existingDoc = user.kycDocuments.find(
    doc => doc.type === documentData.type && doc.verifiedAt
  );
  
  if (existingDoc) {
    const error = new Error(`${documentData.type} document already verified`);
    error.code = 'DOCUMENT_ALREADY_VERIFIED';
    throw error;
  }
  
  // Remove any existing pending document of same type
  user.kycDocuments = user.kycDocuments.filter(
    doc => doc.type !== documentData.type || doc.verifiedAt
  );
  
  // Add new document with pending status
  const newDocument = {
    type: documentData.type,
    url: documentData.url,
    uploadedAt: new Date()
  };
  
  user.kycDocuments.push(newDocument);
  
  // Update KYC status to pending if not already verified
  if (user.kycStatus !== 'verified') {
    user.kycStatus = 'pending';
  }
  
  await user.save();
  
  // Get queue position (count of pending documents before this one)
  const pendingDocsCount = await User.countDocuments({
    'kycDocuments': {
      $elemMatch: {
        verifiedAt: { $exists: false },
        uploadedAt: { $lt: newDocument.uploadedAt }
      }
    }
  });
  
  const addedDocument = user.kycDocuments[user.kycDocuments.length - 1];
  
  // Invalidate user cache on KYC document upload - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    documentId: addedDocument._id.toString(),
    status: 'pending',
    queuePosition: pendingDocsCount + 1
  };
};

/**
 * Get KYC documents for a user
 * Requirements: 8.4
 * @param {string} userId - User ID
 * @returns {Promise<Object>} KYC status and documents
 */
const getKYCDocuments = async (userId) => {
  const user = await User.findById(userId).select('kycStatus kycDocuments');
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  return {
    kycStatus: user.kycStatus,
    documents: user.kycDocuments
  };
};

/**
 * Update UPI details for a user
 * Requirements: 5.3 - Securely store payment information for instant transfers
 * @param {string} userId - User ID
 * @param {string} upiId - UPI ID to store
 * @returns {Promise<Object>} Updated UPI details
 */
const updateUPIDetails = async (userId, upiId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        'upiDetails.upiId': upiId.toLowerCase().trim(),
        'upiDetails.verifiedAt': null // Reset verification on update
      }
    },
    { new: true, runValidators: true }
  ).select('upiDetails');
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // Invalidate user cache on UPI update - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    upiDetails: user.upiDetails,
    message: 'UPI details updated successfully'
  };
};

/**
 * Remove UPI details for a user
 * Requirements: 5.3
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Removal confirmation
 */
const removeUPIDetails = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $unset: { upiDetails: 1 } },
    { new: true }
  ).select('_id');
  
  if (!user) {
    const error = new Error('User not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  
  // Invalidate user cache on UPI removal - Requirements: 6.4
  await invalidateUserCache(userId);
  
  return {
    success: true,
    message: 'UPI details removed successfully'
  };
};

module.exports = {
  EDITABLE_FIELDS,
  getProfile,
  updateProfile,
  addEmergencyContact,
  getEmergencyContacts,
  updateEmergencyContact,
  deleteEmergencyContact,
  uploadKYCDocument,
  getKYCDocuments,
  updateUPIDetails,
  removeUPIDetails
};
