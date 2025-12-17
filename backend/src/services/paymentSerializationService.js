/**
 * Payment Data Serialization Service
 * 
 * Provides utilities for serializing and deserializing payment data
 * to/from JSON format for storage and transmission.
 * 
 * Requirements: 12.5
 * Design: Property 24 - Payment Data Serialization Round-Trip
 */

/**
 * Payment data types supported by serialization
 */
const PAYMENT_DATA_TYPES = {
  BREAKDOWN: 'breakdown',
  TRANSACTION: 'transaction',
  RECEIPT: 'receipt'
};

/**
 * Serialization version for forward compatibility
 */
const SERIALIZATION_VERSION = '1.0';

/**
 * Validate that a value is a valid number (not NaN, not Infinity)
 * @param {*} value - Value to validate
 * @returns {boolean} True if valid number
 */
const isValidNumber = (value) => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

/**
 * Validate that a value is a valid date string or Date object
 * @param {*} value - Value to validate
 * @returns {boolean} True if valid date
 */
const isValidDate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
};

/**
 * Serialize a Date object to ISO string
 * @param {Date|string} date - Date to serialize
 * @returns {string|null} ISO date string or null
 */
const serializeDate = (date) => {
  if (!date) return null;
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
};

/**
 * Deserialize an ISO string to Date object
 * @param {string} dateString - ISO date string
 * @returns {Date|null} Date object or null
 */
const deserializeDate = (dateString) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Serialize payment breakdown data
 * @param {Object} breakdown - Payment breakdown object
 * @returns {Object} Serialized breakdown
 */
const serializeBreakdown = (breakdown) => {
  if (!breakdown || typeof breakdown !== 'object') {
    throw new Error('INVALID_BREAKDOWN_DATA');
  }

  return {
    baseFare: breakdown.baseFare ?? 0,
    platformFee: breakdown.platformFee ?? 10,
    freeCancellationFee: breakdown.freeCancellationFee ?? 0,
    appliedDiscount: breakdown.appliedDiscount ?? breakdown.discountApplied ?? 0,
    discountedFare: breakdown.discountedFare ?? null,
    totalAmount: breakdown.totalAmount ?? null,
    driverEarnings: breakdown.driverEarnings ?? null,
    source: breakdown.source ?? null,
    hasFreeCancellation: breakdown.hasFreeCancellation ?? false
  };
};

/**
 * Deserialize payment breakdown data
 * @param {Object} data - Serialized breakdown data
 * @returns {Object} Deserialized breakdown
 */
const deserializeBreakdown = (data) => {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_BREAKDOWN_DATA');
  }

  const breakdown = {
    baseFare: data.baseFare ?? 0,
    platformFee: data.platformFee ?? 10,
    freeCancellationFee: data.freeCancellationFee ?? 0,
    appliedDiscount: data.appliedDiscount ?? 0,
    hasFreeCancellation: data.hasFreeCancellation ?? false
  };

  // Include optional fields if present
  if (data.discountedFare !== null && data.discountedFare !== undefined) {
    breakdown.discountedFare = data.discountedFare;
  }
  if (data.totalAmount !== null && data.totalAmount !== undefined) {
    breakdown.totalAmount = data.totalAmount;
  }
  if (data.driverEarnings !== null && data.driverEarnings !== undefined) {
    breakdown.driverEarnings = data.driverEarnings;
  }
  if (data.source) {
    breakdown.source = data.source;
  }

  return breakdown;
};

/**
 * Serialize transaction data
 * @param {Object} transaction - Transaction object
 * @returns {Object} Serialized transaction
 */
const serializeTransaction = (transaction) => {
  if (!transaction || typeof transaction !== 'object') {
    throw new Error('INVALID_TRANSACTION_DATA');
  }

  const serialized = {
    transactionId: transaction.transactionId ?? null,
    orderId: transaction.orderId ?? null,
    bookingId: transaction.bookingId?.toString() ?? null,
    tripId: transaction.tripId?.toString() ?? null,
    userId: transaction.userId?.toString() ?? null,
    driverId: transaction.driverId?.toString() ?? null,
    type: transaction.type ?? null,
    status: transaction.status ?? 'pending',
    amount: transaction.amount ?? 0,
    currency: transaction.currency ?? 'INR'
  };

  // Serialize breakdown if present
  if (transaction.breakdown) {
    serialized.breakdown = serializeBreakdown(transaction.breakdown);
  }

  // Serialize payment method if present
  if (transaction.paymentMethod) {
    serialized.paymentMethod = {
      type: transaction.paymentMethod.type ?? 'unknown',
      provider: transaction.paymentMethod.provider ?? null,
      last4: transaction.paymentMethod.last4 ?? null
    };
  }

  // Serialize Cashfree data if present
  if (transaction.cashfreeData) {
    serialized.cashfreeData = {
      orderId: transaction.cashfreeData.orderId ?? null,
      paymentId: transaction.cashfreeData.paymentId ?? null,
      refundId: transaction.cashfreeData.refundId ?? null,
      payoutId: transaction.cashfreeData.payoutId ?? null,
      referenceId: transaction.cashfreeData.referenceId ?? null
    };
  }

  // Serialize ride details if present
  if (transaction.rideDetails) {
    serialized.rideDetails = {
      origin: transaction.rideDetails.origin ?? null,
      destination: transaction.rideDetails.destination ?? null,
      departureTime: serializeDate(transaction.rideDetails.departureTime),
      passengerName: transaction.rideDetails.passengerName ?? null,
      driverName: transaction.rideDetails.driverName ?? null
    };
  }

  // Serialize metadata if present
  if (transaction.metadata !== undefined) {
    serialized.metadata = transaction.metadata;
  }

  // Serialize timestamps
  serialized.createdAt = serializeDate(transaction.createdAt);
  serialized.updatedAt = serializeDate(transaction.updatedAt);

  return serialized;
};

/**
 * Deserialize transaction data
 * @param {Object} data - Serialized transaction data
 * @returns {Object} Deserialized transaction
 */
const deserializeTransaction = (data) => {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_TRANSACTION_DATA');
  }

  const transaction = {
    transactionId: data.transactionId ?? null,
    orderId: data.orderId ?? null,
    bookingId: data.bookingId ?? null,
    tripId: data.tripId ?? null,
    userId: data.userId ?? null,
    driverId: data.driverId ?? null,
    type: data.type ?? null,
    status: data.status ?? 'pending',
    amount: data.amount ?? 0,
    currency: data.currency ?? 'INR'
  };

  // Deserialize breakdown if present
  if (data.breakdown) {
    transaction.breakdown = deserializeBreakdown(data.breakdown);
  }

  // Deserialize payment method if present
  if (data.paymentMethod) {
    transaction.paymentMethod = {
      type: data.paymentMethod.type ?? 'unknown',
      provider: data.paymentMethod.provider ?? null,
      last4: data.paymentMethod.last4 ?? null
    };
  }

  // Deserialize Cashfree data if present
  if (data.cashfreeData) {
    transaction.cashfreeData = {
      orderId: data.cashfreeData.orderId ?? null,
      paymentId: data.cashfreeData.paymentId ?? null,
      refundId: data.cashfreeData.refundId ?? null,
      payoutId: data.cashfreeData.payoutId ?? null,
      referenceId: data.cashfreeData.referenceId ?? null
    };
  }

  // Deserialize ride details if present
  if (data.rideDetails) {
    transaction.rideDetails = {
      origin: data.rideDetails.origin ?? null,
      destination: data.rideDetails.destination ?? null,
      departureTime: deserializeDate(data.rideDetails.departureTime),
      passengerName: data.rideDetails.passengerName ?? null,
      driverName: data.rideDetails.driverName ?? null
    };
  }

  // Deserialize metadata if present
  if (data.metadata !== undefined) {
    transaction.metadata = data.metadata;
  }

  // Deserialize timestamps
  transaction.createdAt = deserializeDate(data.createdAt);
  transaction.updatedAt = deserializeDate(data.updatedAt);

  return transaction;
};

/**
 * Serialize receipt data
 * @param {Object} receipt - Receipt object
 * @returns {Object} Serialized receipt
 */
const serializeReceipt = (receipt) => {
  if (!receipt || typeof receipt !== 'object') {
    throw new Error('INVALID_RECEIPT_DATA');
  }

  const serialized = {
    receiptId: receipt.receiptId ?? null,
    paymentId: receipt.paymentId ?? null,
    orderId: receipt.orderId ?? null,
    bookingId: receipt.bookingId?.toString() ?? null,
    status: receipt.status ?? 'pending',
    paymentMethod: receipt.paymentMethod ?? null,
    timestamp: serializeDate(receipt.timestamp)
  };

  // Serialize breakdown
  if (receipt.breakdown) {
    serialized.breakdown = {
      baseFare: receipt.breakdown.baseFare ?? 0,
      platformFee: receipt.breakdown.platformFee ?? 10,
      freeCancellationFee: receipt.breakdown.freeCancellationFee ?? 0,
      discount: receipt.breakdown.discount ?? 0,
      totalAmount: receipt.breakdown.totalAmount ?? 0
    };
  }

  // Serialize ride details if present
  if (receipt.rideDetails) {
    serialized.rideDetails = {
      origin: receipt.rideDetails.origin ?? null,
      destination: receipt.rideDetails.destination ?? null,
      departureTime: serializeDate(receipt.rideDetails.departureTime),
      passengerName: receipt.rideDetails.passengerName ?? null,
      driverName: receipt.rideDetails.driverName ?? null
    };
  }

  // Serialize refund details if present
  if (receipt.refund) {
    serialized.refund = {
      amount: receipt.refund.amount ?? 0,
      status: receipt.refund.status ?? null,
      processedAt: serializeDate(receipt.refund.processedAt),
      updatedAt: serializeDate(receipt.refund.updatedAt)
    };

    // Serialize refund deductions if present
    if (receipt.refund.deductions) {
      serialized.refund.deductions = {
        platformFee: receipt.refund.deductions.platformFee ?? 0,
        freeCancellationFee: receipt.refund.deductions.freeCancellationFee ?? 0,
        cancellationCharge: receipt.refund.deductions.cancellationCharge ?? 0
      };
    }
  }

  return serialized;
};

/**
 * Deserialize receipt data
 * @param {Object} data - Serialized receipt data
 * @returns {Object} Deserialized receipt
 */
const deserializeReceipt = (data) => {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_RECEIPT_DATA');
  }

  const receipt = {
    receiptId: data.receiptId ?? null,
    paymentId: data.paymentId ?? null,
    orderId: data.orderId ?? null,
    bookingId: data.bookingId ?? null,
    status: data.status ?? 'pending',
    paymentMethod: data.paymentMethod ?? null,
    timestamp: deserializeDate(data.timestamp)
  };

  // Deserialize breakdown
  if (data.breakdown) {
    receipt.breakdown = {
      baseFare: data.breakdown.baseFare ?? 0,
      platformFee: data.breakdown.platformFee ?? 10,
      freeCancellationFee: data.breakdown.freeCancellationFee ?? 0,
      discount: data.breakdown.discount ?? 0,
      totalAmount: data.breakdown.totalAmount ?? 0
    };
  }

  // Deserialize ride details if present
  if (data.rideDetails) {
    receipt.rideDetails = {
      origin: data.rideDetails.origin ?? null,
      destination: data.rideDetails.destination ?? null,
      departureTime: deserializeDate(data.rideDetails.departureTime),
      passengerName: data.rideDetails.passengerName ?? null,
      driverName: data.rideDetails.driverName ?? null
    };
  }

  // Deserialize refund details if present
  if (data.refund) {
    receipt.refund = {
      amount: data.refund.amount ?? 0,
      status: data.refund.status ?? null,
      processedAt: deserializeDate(data.refund.processedAt),
      updatedAt: deserializeDate(data.refund.updatedAt)
    };

    // Deserialize refund deductions if present
    if (data.refund.deductions) {
      receipt.refund.deductions = {
        platformFee: data.refund.deductions.platformFee ?? 0,
        freeCancellationFee: data.refund.deductions.freeCancellationFee ?? 0,
        cancellationCharge: data.refund.deductions.cancellationCharge ?? 0
      };
    }
  }

  return receipt;
};

/**
 * Detect the type of payment data
 * @param {Object} data - Payment data object
 * @returns {string|null} Data type or null if unknown
 */
const detectPaymentDataType = (data) => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  // Receipt has receiptId
  if (data.receiptId !== undefined) {
    return PAYMENT_DATA_TYPES.RECEIPT;
  }

  // Transaction has transactionId and type
  if (data.transactionId !== undefined || data.type !== undefined) {
    return PAYMENT_DATA_TYPES.TRANSACTION;
  }

  // Breakdown has baseFare and platformFee
  if (data.baseFare !== undefined && data.platformFee !== undefined) {
    return PAYMENT_DATA_TYPES.BREAKDOWN;
  }

  return null;
};

/**
 * Serialize payment data to JSON string
 * Automatically detects data type and applies appropriate serialization
 * 
 * @param {Object} data - Payment data object (breakdown, transaction, or receipt)
 * @returns {string} JSON string representation
 * 
 * Requirements: 12.5
 */
const serializePaymentData = (data) => {
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_PAYMENT_DATA');
  }

  // Detect data type
  const dataType = detectPaymentDataType(data);
  
  let serialized;
  
  switch (dataType) {
    case PAYMENT_DATA_TYPES.RECEIPT:
      serialized = serializeReceipt(data);
      break;
    case PAYMENT_DATA_TYPES.TRANSACTION:
      serialized = serializeTransaction(data);
      break;
    case PAYMENT_DATA_TYPES.BREAKDOWN:
      serialized = serializeBreakdown(data);
      break;
    default:
      // For unknown types, serialize as-is with date handling
      serialized = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }));
  }

  // Wrap with metadata for versioning
  const envelope = {
    _version: SERIALIZATION_VERSION,
    _type: dataType,
    _serializedAt: new Date().toISOString(),
    data: serialized
  };

  return JSON.stringify(envelope);
};

/**
 * Deserialize payment data from JSON string
 * Automatically detects data type and applies appropriate deserialization
 * 
 * @param {string} json - JSON string to deserialize
 * @returns {Object} Deserialized payment data object
 * 
 * Requirements: 12.5
 */
const deserializePaymentData = (json) => {
  if (!json || typeof json !== 'string') {
    throw new Error('INVALID_JSON_INPUT');
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error('INVALID_JSON_FORMAT');
  }

  // Check if it's an envelope format
  if (parsed._version && parsed.data) {
    const { _type, data } = parsed;
    
    switch (_type) {
      case PAYMENT_DATA_TYPES.RECEIPT:
        return deserializeReceipt(data);
      case PAYMENT_DATA_TYPES.TRANSACTION:
        return deserializeTransaction(data);
      case PAYMENT_DATA_TYPES.BREAKDOWN:
        return deserializeBreakdown(data);
      default:
        return data;
    }
  }

  // Handle legacy format (no envelope)
  const dataType = detectPaymentDataType(parsed);
  
  switch (dataType) {
    case PAYMENT_DATA_TYPES.RECEIPT:
      return deserializeReceipt(parsed);
    case PAYMENT_DATA_TYPES.TRANSACTION:
      return deserializeTransaction(parsed);
    case PAYMENT_DATA_TYPES.BREAKDOWN:
      return deserializeBreakdown(parsed);
    default:
      return parsed;
  }
};

/**
 * Validate serialized payment data
 * @param {string} json - JSON string to validate
 * @returns {Object} Validation result with isValid and errors
 */
const validateSerializedData = (json) => {
  const result = {
    isValid: true,
    errors: [],
    dataType: null
  };

  if (!json || typeof json !== 'string') {
    result.isValid = false;
    result.errors.push('Input must be a non-empty string');
    return result;
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    result.isValid = false;
    result.errors.push('Invalid JSON format');
    return result;
  }

  // Check envelope format
  if (parsed._version && parsed.data) {
    result.dataType = parsed._type;
    
    if (!PAYMENT_DATA_TYPES[parsed._type?.toUpperCase()]) {
      result.errors.push(`Unknown data type: ${parsed._type}`);
    }
  } else {
    result.dataType = detectPaymentDataType(parsed);
  }

  if (!result.dataType) {
    result.isValid = false;
    result.errors.push('Unable to determine payment data type');
  }

  return result;
};

/**
 * Compare two payment data objects for equality
 * Used for round-trip validation
 * @param {Object} original - Original data
 * @param {Object} deserialized - Deserialized data
 * @returns {boolean} True if equivalent
 */
const arePaymentDataEqual = (original, deserialized) => {
  if (!original || !deserialized) {
    return original === deserialized;
  }

  // Compare key fields based on data type
  const dataType = detectPaymentDataType(original);

  switch (dataType) {
    case PAYMENT_DATA_TYPES.BREAKDOWN:
      return (
        original.baseFare === deserialized.baseFare &&
        original.platformFee === deserialized.platformFee &&
        original.freeCancellationFee === deserialized.freeCancellationFee &&
        (original.appliedDiscount ?? original.discountApplied ?? 0) === 
          (deserialized.appliedDiscount ?? 0) &&
        original.hasFreeCancellation === deserialized.hasFreeCancellation
      );

    case PAYMENT_DATA_TYPES.TRANSACTION:
      return (
        original.transactionId === deserialized.transactionId &&
        original.orderId === deserialized.orderId &&
        original.type === deserialized.type &&
        original.status === deserialized.status &&
        original.amount === deserialized.amount
      );

    case PAYMENT_DATA_TYPES.RECEIPT:
      return (
        original.receiptId === deserialized.receiptId &&
        original.paymentId === deserialized.paymentId &&
        original.status === deserialized.status &&
        original.breakdown?.baseFare === deserialized.breakdown?.baseFare &&
        original.breakdown?.totalAmount === deserialized.breakdown?.totalAmount
      );

    default:
      // Deep comparison for unknown types
      return JSON.stringify(original) === JSON.stringify(deserialized);
  }
};

module.exports = {
  // Main serialization functions
  serializePaymentData,
  deserializePaymentData,
  
  // Type-specific serialization
  serializeBreakdown,
  deserializeBreakdown,
  serializeTransaction,
  deserializeTransaction,
  serializeReceipt,
  deserializeReceipt,
  
  // Utility functions
  detectPaymentDataType,
  validateSerializedData,
  arePaymentDataEqual,
  serializeDate,
  deserializeDate,
  
  // Constants
  PAYMENT_DATA_TYPES,
  SERIALIZATION_VERSION
};
