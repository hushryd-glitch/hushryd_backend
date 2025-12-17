/**
 * Image Quality Validation Service
 * Validates image quality and document readability for driver documents
 * 
 * Requirements: 11.3 - Image quality validation and document readability checks
 */

/**
 * Minimum requirements for image quality
 */
const IMAGE_QUALITY_REQUIREMENTS = {
  minWidth: 640,
  minHeight: 480,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  minFileSize: 10 * 1024, // 10KB - too small likely means poor quality
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf']
};

/**
 * Document type specific requirements
 */
const DOCUMENT_REQUIREMENTS = {
  license: {
    label: 'Driving License',
    minWidth: 640,
    minHeight: 400,
    description: 'Clear photo of your driving license showing all details'
  },
  registration: {
    label: 'Vehicle Registration (RC)',
    minWidth: 640,
    minHeight: 400,
    description: 'Clear photo of your vehicle registration certificate'
  },
  kyc: {
    label: 'KYC Aadhaar Card',
    minWidth: 640,
    minHeight: 400,
    description: 'Clear photo of your Aadhaar card'
  },
  vehicle_front: {
    label: 'Vehicle Front Photo',
    minWidth: 800,
    minHeight: 600,
    description: 'Clear front view of your vehicle showing number plate'
  },
  vehicle_back: {
    label: 'Vehicle Back Photo',
    minWidth: 800,
    minHeight: 600,
    description: 'Clear back view of your vehicle showing number plate'
  },
  vehicle_side: {
    label: 'Vehicle Side Photo',
    minWidth: 800,
    minHeight: 600,
    description: 'Clear side view of your vehicle'
  },
  vehicle_inside: {
    label: 'Vehicle Inside Photo',
    minWidth: 800,
    minHeight: 600,
    description: 'Clear interior view of your vehicle showing seats'
  },
  // Legacy types for backward compatibility
  insurance: {
    label: 'Vehicle Insurance',
    minWidth: 640,
    minHeight: 400,
    description: 'Clear photo of your vehicle insurance document'
  },
  selfie_with_car: {
    label: 'Selfie with Car',
    minWidth: 640,
    minHeight: 480,
    description: 'Photo of you with your vehicle'
  },
  vehicle_photo: {
    label: 'Vehicle Photo',
    minWidth: 800,
    minHeight: 600,
    description: 'Clear photo of your vehicle'
  }
};

/**
 * Validate file type and extension
 * @param {Object} file - File object with mimetype and originalname
 * @returns {{valid: boolean, error?: string}}
 */
const validateFileType = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const { mimetype, originalname } = file;
  
  // Check MIME type
  if (!IMAGE_QUALITY_REQUIREMENTS.allowedMimeTypes.includes(mimetype)) {
    return { 
      valid: false, 
      error: `Invalid file type: ${mimetype}. Allowed types: JPEG, PNG, PDF` 
    };
  }

  // Check file extension
  if (originalname) {
    const ext = originalname.toLowerCase().substring(originalname.lastIndexOf('.'));
    if (!IMAGE_QUALITY_REQUIREMENTS.allowedExtensions.includes(ext)) {
      return { 
        valid: false, 
        error: `Invalid file extension: ${ext}. Allowed: .jpg, .jpeg, .png, .pdf` 
      };
    }
  }

  return { valid: true };
};

/**
 * Validate file size
 * @param {Object} file - File object with size property
 * @returns {{valid: boolean, error?: string}}
 */
const validateFileSize = (file) => {
  if (!file || typeof file.size !== 'number') {
    return { valid: false, error: 'File size information missing' };
  }

  if (file.size > IMAGE_QUALITY_REQUIREMENTS.maxFileSize) {
    const maxMB = IMAGE_QUALITY_REQUIREMENTS.maxFileSize / (1024 * 1024);
    return { 
      valid: false, 
      error: `File too large. Maximum size is ${maxMB}MB` 
    };
  }

  if (file.size < IMAGE_QUALITY_REQUIREMENTS.minFileSize) {
    return { 
      valid: false, 
      error: 'File too small. Image may be of poor quality' 
    };
  }

  return { valid: true };
};

/**
 * Validate image dimensions (for image files only)
 * Note: This requires image processing library for full implementation
 * For now, we do basic validation based on file size heuristics
 * 
 * @param {Object} file - File object
 * @param {string} documentType - Type of document
 * @returns {{valid: boolean, error?: string, warning?: string}}
 */
const validateImageDimensions = (file, documentType) => {
  // Skip dimension check for PDFs
  if (file.mimetype === 'application/pdf') {
    return { valid: true };
  }

  const requirements = DOCUMENT_REQUIREMENTS[documentType];
  if (!requirements) {
    return { valid: true }; // Unknown type, skip validation
  }

  // Heuristic: Very small files likely have poor resolution
  // A 640x480 JPEG at reasonable quality is typically > 50KB
  const minExpectedSize = 50 * 1024; // 50KB
  if (file.size < minExpectedSize) {
    return { 
      valid: true, 
      warning: 'Image may have low resolution. Please ensure the document is clearly readable.' 
    };
  }

  return { valid: true };
};

/**
 * Validate document type is valid
 * @param {string} documentType - Document type to validate
 * @returns {{valid: boolean, error?: string}}
 */
const validateDocumentType = (documentType) => {
  if (!documentType) {
    return { valid: false, error: 'Document type is required' };
  }

  if (!DOCUMENT_REQUIREMENTS[documentType]) {
    return { 
      valid: false, 
      error: `Invalid document type: ${documentType}` 
    };
  }

  return { valid: true };
};

/**
 * Comprehensive image quality validation
 * Validates file type, size, and basic quality indicators
 * 
 * @param {Object} file - File object with buffer, mimetype, originalname, size
 * @param {string} documentType - Type of document being uploaded
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 * 
 * Requirements: 11.3 - Image quality validation and document readability checks
 */
const validateImageQuality = (file, documentType) => {
  const errors = [];
  const warnings = [];

  // Validate document type
  const typeValidation = validateDocumentType(documentType);
  if (!typeValidation.valid) {
    errors.push(typeValidation.error);
    return { valid: false, errors, warnings };
  }

  // Validate file type
  const fileTypeValidation = validateFileType(file);
  if (!fileTypeValidation.valid) {
    errors.push(fileTypeValidation.error);
  }

  // Validate file size
  const fileSizeValidation = validateFileSize(file);
  if (!fileSizeValidation.valid) {
    errors.push(fileSizeValidation.error);
  }

  // Validate image dimensions (heuristic)
  const dimensionValidation = validateImageDimensions(file, documentType);
  if (!dimensionValidation.valid) {
    errors.push(dimensionValidation.error);
  }
  if (dimensionValidation.warning) {
    warnings.push(dimensionValidation.warning);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Get required documents for driver registration
 * Returns the list of essential documents needed
 * 
 * @returns {Array<{type: string, label: string, description: string, required: boolean}>}
 * 
 * Requirements: 11.1 - Only driving license, RC, KYC Aadhaar, and 4 vehicle photos
 */
const getRequiredDocuments = () => {
  return [
    { 
      type: 'license', 
      label: 'Driving License', 
      description: 'Clear photo of your valid driving license',
      required: true,
      accept: '.jpg,.jpeg,.png,.pdf'
    },
    { 
      type: 'registration', 
      label: 'Vehicle Registration (RC)', 
      description: 'Clear photo of your vehicle registration certificate',
      required: true,
      accept: '.jpg,.jpeg,.png,.pdf'
    },
    { 
      type: 'kyc', 
      label: 'KYC Aadhaar Card', 
      description: 'Clear photo of your Aadhaar card for identity verification',
      required: true,
      accept: '.jpg,.jpeg,.png,.pdf'
    }
  ];
};

/**
 * Get required vehicle photos
 * Returns the list of 4 vehicle photos needed
 * 
 * @returns {Array<{type: string, label: string, description: string, required: boolean}>}
 * 
 * Requirements: 11.2 - 4 vehicle photos: front, back, side, and inside
 */
const getRequiredVehiclePhotos = () => {
  return [
    { 
      type: 'vehicle_front', 
      label: 'Vehicle Front Photo', 
      description: 'Clear front view showing number plate',
      required: true,
      accept: '.jpg,.jpeg,.png'
    },
    { 
      type: 'vehicle_back', 
      label: 'Vehicle Back Photo', 
      description: 'Clear back view showing number plate',
      required: true,
      accept: '.jpg,.jpeg,.png'
    },
    { 
      type: 'vehicle_side', 
      label: 'Vehicle Side Photo', 
      description: 'Clear side view of your vehicle',
      required: true,
      accept: '.jpg,.jpeg,.png'
    },
    { 
      type: 'vehicle_inside', 
      label: 'Vehicle Inside Photo', 
      description: 'Clear interior view showing seats',
      required: true,
      accept: '.jpg,.jpeg,.png'
    }
  ];
};

/**
 * Get all document types (required + vehicle photos)
 * @returns {Array}
 */
const getAllRequiredDocuments = () => {
  return [...getRequiredDocuments(), ...getRequiredVehiclePhotos()];
};

/**
 * Check if all required documents are uploaded
 * @param {Array} uploadedDocuments - Array of uploaded document objects
 * @returns {{complete: boolean, missing: Array<string>, uploaded: Array<string>}}
 */
const checkDocumentCompleteness = (uploadedDocuments) => {
  const allRequired = getAllRequiredDocuments();
  const requiredTypes = allRequired.map(d => d.type);
  
  const uploadedTypes = uploadedDocuments
    .filter(d => d.status !== 'rejected')
    .map(d => d.type);
  
  const missing = requiredTypes.filter(type => !uploadedTypes.includes(type));
  const uploaded = requiredTypes.filter(type => uploadedTypes.includes(type));
  
  return {
    complete: missing.length === 0,
    missing,
    uploaded,
    totalRequired: requiredTypes.length,
    totalUploaded: uploaded.length
  };
};

module.exports = {
  IMAGE_QUALITY_REQUIREMENTS,
  DOCUMENT_REQUIREMENTS,
  validateFileType,
  validateFileSize,
  validateImageDimensions,
  validateDocumentType,
  validateImageQuality,
  getRequiredDocuments,
  getRequiredVehiclePhotos,
  getAllRequiredDocuments,
  checkDocumentCompleteness
};
