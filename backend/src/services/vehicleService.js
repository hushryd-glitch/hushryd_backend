const Driver = require('../models/Driver');

/**
 * Vehicle Management Service
 * Handles vehicle information for driver onboarding
 * 
 * Requirements: 1.3
 */

/**
 * Vehicle types supported by the platform
 */
const VEHICLE_TYPES = ['sedan', 'suv', 'hatchback', 'premium'];

/**
 * Add vehicle information to driver profile
 * @param {string} driverId - Driver ID
 * @param {Object} vehicleData - Vehicle information
 * @returns {Promise<Object>} Vehicle addition result
 * @throws {Error} If validation fails or driver not found
 * 
 * Requirements: 1.3
 */
const addVehicle = async (driverId, vehicleData) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const { 
    registrationNumber, make, model, year, color, type, seats, insuranceExpiry 
  } = vehicleData;

  // Validate required fields
  if (!registrationNumber || !make || !model || !year || !color || !type || !seats || !insuranceExpiry) {
    const error = new Error('All vehicle fields are required');
    error.code = 'MISSING_VEHICLE_FIELDS';
    throw error;
  }

  // Validate vehicle type
  if (!VEHICLE_TYPES.includes(type.toLowerCase())) {
    const error = new Error(`Invalid vehicle type. Must be one of: ${VEHICLE_TYPES.join(', ')}`);
    error.code = 'INVALID_VEHICLE_TYPE';
    throw error;
  }

  // Validate year
  const currentYear = new Date().getFullYear();
  if (year < 1990 || year > currentYear + 1) {
    const error = new Error(`Invalid year. Must be between 1990 and ${currentYear + 1}`);
    error.code = 'INVALID_YEAR';
    throw error;
  }

  // Validate seats
  if (seats < 2 || seats > 8) {
    const error = new Error('Seat capacity must be between 2 and 8');
    error.code = 'INVALID_SEAT_COUNT';
    throw error;
  }

  // Validate registration number format (Indian format)
  const regNumberPattern = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
  const cleanRegNumber = registrationNumber.toUpperCase().replace(/\s/g, '');
  if (!regNumberPattern.test(cleanRegNumber)) {
    const error = new Error('Invalid registration number format');
    error.code = 'INVALID_REGISTRATION_FORMAT';
    throw error;
  }

  // Check if registration number already exists
  const existingVehicle = await Driver.findOne({
    'vehicles.registrationNumber': cleanRegNumber
  });
  if (existingVehicle) {
    const error = new Error('Vehicle with this registration number already exists');
    error.code = 'DUPLICATE_REGISTRATION';
    throw error;
  }

  // Find driver
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  // Check vehicle limit
  if (driver.vehicles.length >= 3) {
    const error = new Error('Cannot have more than 3 vehicles');
    error.code = 'VEHICLE_LIMIT_EXCEEDED';
    throw error;
  }

  // Prepare vehicle data
  const vehicle = {
    registrationNumber: cleanRegNumber,
    make: make.trim(),
    model: model.trim(),
    year: parseInt(year),
    color: color.trim(),
    type: type.toLowerCase(),
    seats: parseInt(seats),
    insuranceExpiry: new Date(insuranceExpiry),
    isActive: true,
    photos: []
  };

  // Add vehicle to driver
  driver.vehicles.push(vehicle);
  await driver.save();

  const addedVehicle = driver.vehicles[driver.vehicles.length - 1];

  return {
    success: true,
    vehicleId: addedVehicle._id,
    vehicleDetails: addedVehicle,
    message: 'Vehicle added successfully'
  };
};

/**
 * Get vehicle details for a driver
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Vehicle details
 */
const getVehicleDetails = async (driverId) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const driver = await Driver.findById(driverIdStr).select('vehicles').lean();
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  return {
    success: true,
    vehicles: driver.vehicles || []
  };
};

/**
 * Update vehicle details
 * @param {string} driverId - Driver ID
 * @param {string} vehicleId - Vehicle ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object>} Update result
 */
const updateVehicleDetails = async (driverId, vehicleId, updateData) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  const vehicle = driver.vehicles.id(vehicleId);
  if (!vehicle) {
    const error = new Error('Vehicle not found');
    error.code = 'VEHICLE_NOT_FOUND';
    throw error;
  }

  // Update allowed fields
  const allowedFields = ['color', 'insuranceExpiry', 'isActive', 'photos'];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      vehicle[field] = updateData[field];
    }
  }

  await driver.save();

  return {
    success: true,
    vehicleDetails: vehicle,
    message: 'Vehicle updated successfully'
  };
};

/**
 * Set active vehicle for driver
 * @param {string} driverId - Driver ID
 * @param {string} vehicleId - Vehicle ID to set as active
 * @returns {Promise<Object>} Result
 */
const setActiveVehicle = async (driverId, vehicleId) => {
  // Ensure driverId is a string (handle ObjectId objects)
  const driverIdStr = driverId?.toString ? driverId.toString() : driverId;
  
  const driver = await Driver.findById(driverIdStr);
  if (!driver) {
    const error = new Error('Driver not found');
    error.code = 'DRIVER_NOT_FOUND';
    throw error;
  }

  // Deactivate all vehicles
  driver.vehicles.forEach(v => { v.isActive = false; });

  // Activate selected vehicle
  const vehicle = driver.vehicles.id(vehicleId);
  if (!vehicle) {
    const error = new Error('Vehicle not found');
    error.code = 'VEHICLE_NOT_FOUND';
    throw error;
  }

  vehicle.isActive = true;
  await driver.save();

  return {
    success: true,
    activeVehicle: vehicle,
    message: 'Active vehicle updated'
  };
};

module.exports = {
  addVehicle,
  getVehicleDetails,
  updateVehicleDetails,
  setActiveVehicle,
  VEHICLE_TYPES
};
