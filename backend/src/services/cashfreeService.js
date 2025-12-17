/**
 * Cashfree Payment Gateway Service
 * Implements authenticated API client with idempotency key support
 * Requirements: 7.1, 7.5, 12.1
 */

const crypto = require('crypto');
const { Cashfree } = require('cashfree-pg');
const { getCashfreeConfig, isCashfreeConfigured } = require('../config/cashfree');
const { getCircuitBreaker, CircuitState } = require('./circuitBreakerService');

// Circuit breaker for Cashfree API calls
const CASHFREE_CIRCUIT_BREAKER = 'cashfree-payment';

/**
 * Circuit breaker configuration for Cashfree API
 * Requirements: 10.1 - Circuit breaker pattern to prevent cascading failures
 */
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,      // Open circuit after 5 consecutive failures
  resetTimeout: 60000,      // Try to recover after 60 seconds
  halfOpenMaxAttempts: 2,   // Allow 2 test requests in half-open state
  volumeThreshold: 3        // Minimum requests before circuit can trip
};

/**
 * Generate a unique idempotency key for payment requests
 * @param {string} prefix - Optional prefix for the key
 * @returns {string} Unique idempotency key
 */
const generateIdempotencyKey = (prefix = 'cf') => {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${randomPart}`;
};

/**
 * Initialize Cashfree SDK with credentials
 * @returns {Object} Initialized Cashfree instance
 */
const initializeCashfree = () => {
  const config = getCashfreeConfig();
  
  Cashfree.XClientId = config.appId;
  Cashfree.XClientSecret = config.secretKey;
  Cashfree.XEnvironment = config.environment === 'production' 
    ? Cashfree.Environment.PRODUCTION 
    : Cashfree.Environment.SANDBOX;
  
  return Cashfree;
};

/**
 * Get circuit breaker for Cashfree API calls
 * Requirements: 10.1 - Circuit breaker pattern to prevent cascading failures
 * 
 * @returns {CircuitBreaker} Circuit breaker instance
 */
const getCashfreeCircuitBreaker = () => {
  return getCircuitBreaker(CASHFREE_CIRCUIT_BREAKER, CIRCUIT_BREAKER_CONFIG);
};

/**
 * Check if circuit breaker is open (not allowing requests)
 * Requirements: 10.1 - Circuit breaker activation when API load exceeds threshold
 * 
 * @returns {boolean} True if circuit is open
 */
const isCircuitOpen = () => {
  const breaker = getCashfreeCircuitBreaker();
  return breaker.getState() === CircuitState.OPEN;
};

/**
 * Get current circuit breaker state
 * @returns {string} Current state: CLOSED, OPEN, or HALF-OPEN
 */
const getCircuitState = () => {
  const breaker = getCashfreeCircuitBreaker();
  return breaker.getState();
};

/**
 * Fallback error for when circuit breaker is open
 * Requirements: 10.1 - Implement fallback behavior for open circuit
 */
class CircuitOpenError extends Error {
  constructor(operation, retryAfter) {
    super(`Cashfree API unavailable: Circuit breaker is open for ${operation}`);
    this.name = 'CircuitOpenError';
    this.code = 'CIRCUIT_OPEN';
    this.operation = operation;
    this.retryAfter = retryAfter;
    this.isRetryable = true;
    this.shouldQueue = true;
  }
}

/**
 * Execute Cashfree API call with circuit breaker protection
 * Requirements: 10.1 - Circuit breaker pattern to prevent cascading failures
 * 
 * @param {Function} apiCall - Async function making the API call
 * @param {string} operation - Name of the operation (for logging/errors)
 * @param {Object} options - Additional options
 * @param {Function} options.fallback - Optional fallback function when circuit is open
 * @returns {Promise<any>} API response or fallback result
 */
const executeWithCircuitBreaker = async (apiCall, operation = 'unknown', options = {}) => {
  const breaker = getCashfreeCircuitBreaker();
  
  // Check if circuit is open and we have a fallback
  if (breaker.getState() === CircuitState.OPEN) {
    const retryAfter = breaker.getRetryAfter();
    
    // If fallback is provided, use it
    if (options.fallback && typeof options.fallback === 'function') {
      console.warn(`[CashfreeService] Circuit open for ${operation}, using fallback`);
      return options.fallback(new CircuitOpenError(operation, retryAfter));
    }
    
    // Otherwise throw circuit open error
    throw new CircuitOpenError(operation, retryAfter);
  }
  
  try {
    return await breaker.execute(apiCall);
  } catch (error) {
    // If circuit just opened and we have a fallback, use it
    if (error.code === 'CIRCUIT_OPEN' && options.fallback) {
      console.warn(`[CashfreeService] Circuit opened during ${operation}, using fallback`);
      return options.fallback(error);
    }
    throw error;
  }
};

// ============================================
// Order Management
// ============================================

/**
 * Create a payment order with authorization (hold) mode
 * @param {Object} orderData - Order creation data
 * @param {string} orderData.orderId - Unique order ID
 * @param {number} orderData.amount - Order amount in INR
 * @param {string} orderData.currency - Currency code (default: INR)
 * @param {Object} orderData.customerDetails - Customer information
 * @param {Object} orderData.orderMeta - Additional order metadata
 * @returns {Promise<Object>} Created order with payment session
 */
const createOrder = async (orderData) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  const idempotencyKey = generateIdempotencyKey('order');
  
  const request = {
    order_id: orderData.orderId,
    order_amount: orderData.amount,
    order_currency: orderData.currency || 'INR',
    customer_details: {
      customer_id: orderData.customerDetails.customerId,
      customer_name: orderData.customerDetails.name,
      customer_email: orderData.customerDetails.email,
      customer_phone: orderData.customerDetails.phone
    },
    order_meta: {
      return_url: orderData.orderMeta?.returnUrl,
      notify_url: orderData.orderMeta?.notifyUrl,
      payment_methods: orderData.orderMeta?.paymentMethods
    },
    // Authorization mode for hold/capture flow
    order_expiry_time: orderData.expiryTime || new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min default
    order_note: orderData.note || 'HushRyd Ride Booking'
  };
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.PGCreateOrder(config.apiVersion, request, idempotencyKey);
    return {
      orderId: response.data.order_id,
      orderStatus: response.data.order_status,
      paymentSessionId: response.data.payment_session_id,
      orderAmount: response.data.order_amount,
      orderCurrency: response.data.order_currency,
      cfOrderId: response.data.cf_order_id,
      createdAt: response.data.created_at
    };
  });
};

/**
 * Get order details by order ID
 * @param {string} orderId - Order ID to fetch
 * @returns {Promise<Object>} Order details
 */
const getOrder = async (orderId) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.PGFetchOrder(config.apiVersion, orderId);
    return {
      orderId: response.data.order_id,
      orderStatus: response.data.order_status,
      orderAmount: response.data.order_amount,
      orderCurrency: response.data.order_currency,
      cfOrderId: response.data.cf_order_id,
      customerDetails: response.data.customer_details,
      orderMeta: response.data.order_meta,
      payments: response.data.payments,
      createdAt: response.data.created_at
    };
  });
};

// ============================================
// Payment Operations
// ============================================

/**
 * Get payment status for an order
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Payment status details
 */
const getPaymentStatus = async (orderId) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.PGOrderFetchPayments(config.apiVersion, orderId);
    const payments = response.data || [];
    
    return payments.map(payment => ({
      cfPaymentId: payment.cf_payment_id,
      paymentStatus: payment.payment_status,
      paymentAmount: payment.payment_amount,
      paymentCurrency: payment.payment_currency,
      paymentMethod: payment.payment_method,
      paymentTime: payment.payment_time,
      bankReference: payment.bank_reference
    }));
  });
};

/**
 * Capture an authorized payment
 * @param {string} orderId - Order ID
 * @param {number} amount - Amount to capture
 * @returns {Promise<Object>} Capture response
 */
const capturePayment = async (orderId, amount) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  const idempotencyKey = generateIdempotencyKey('capture');
  
  // Note: Cashfree auto-captures by default. For auth-capture flow,
  // you need to enable it in your Cashfree dashboard settings.
  // This function is for manual capture when auth-capture is enabled.
  
  return executeWithCircuitBreaker(async () => {
    // Get the payment ID first
    const payments = await getPaymentStatus(orderId);
    const authorizedPayment = payments.find(p => p.paymentStatus === 'AUTHORIZED');
    
    if (!authorizedPayment) {
      throw new Error('No authorized payment found for this order');
    }
    
    const request = {
      action: 'CAPTURE',
      amount: amount
    };
    
    const response = await Cashfree.PGAuthorizeOrder(
      config.apiVersion, 
      orderId, 
      authorizedPayment.cfPaymentId,
      request,
      idempotencyKey
    );
    
    return {
      orderId: orderId,
      paymentId: authorizedPayment.cfPaymentId,
      status: 'CAPTURED',
      amount: amount,
      capturedAt: new Date().toISOString()
    };
  });
};

// ============================================
// Refund Operations
// Requirements: 8.1, 8.2, 8.3
// ============================================

/**
 * Validate refund amount against original payment and non-refundable fees
 * Ensures refund amount does not exceed original payment minus non-refundable fees
 * 
 * Requirements: 8.3 - Validate refund amount does not exceed original payment minus non-refundable fees
 * 
 * @param {number} refundAmount - Requested refund amount
 * @param {number} originalPayment - Original payment amount
 * @param {Object} breakdown - Payment breakdown with non-refundable fees
 * @param {number} breakdown.platformFee - Platform fee (non-refundable)
 * @param {number} breakdown.freeCancellationFee - Free cancellation fee (non-refundable)
 * @returns {Object} Validation result with maxRefundable amount
 */
const validateRefundAmount = (refundAmount, originalPayment, breakdown = {}) => {
  // Validate inputs
  if (typeof refundAmount !== 'number' || isNaN(refundAmount)) {
    return {
      isValid: false,
      error: 'INVALID_REFUND_AMOUNT',
      message: 'Refund amount must be a valid number'
    };
  }
  
  if (refundAmount <= 0) {
    return {
      isValid: false,
      error: 'REFUND_AMOUNT_MUST_BE_POSITIVE',
      message: 'Refund amount must be greater than zero'
    };
  }
  
  if (typeof originalPayment !== 'number' || isNaN(originalPayment) || originalPayment <= 0) {
    return {
      isValid: false,
      error: 'INVALID_ORIGINAL_PAYMENT',
      message: 'Original payment amount is invalid'
    };
  }
  
  // Calculate non-refundable fees
  const platformFee = breakdown.platformFee || 0;
  const freeCancellationFee = breakdown.freeCancellationFee || 0;
  const totalNonRefundable = platformFee + freeCancellationFee;
  
  // Calculate maximum refundable amount
  const maxRefundable = Math.max(0, originalPayment - totalNonRefundable);
  
  // Check if refund amount exceeds maximum
  if (refundAmount > maxRefundable) {
    return {
      isValid: false,
      error: 'REFUND_EXCEEDS_MAXIMUM',
      message: `Refund amount (₹${refundAmount}) exceeds maximum refundable amount (₹${maxRefundable})`,
      maxRefundable,
      originalPayment,
      nonRefundableFees: {
        platformFee,
        freeCancellationFee,
        total: totalNonRefundable
      }
    };
  }
  
  // Check if refund amount exceeds original payment (safety check)
  if (refundAmount > originalPayment) {
    return {
      isValid: false,
      error: 'REFUND_EXCEEDS_ORIGINAL',
      message: `Refund amount (₹${refundAmount}) exceeds original payment (₹${originalPayment})`,
      maxRefundable,
      originalPayment
    };
  }
  
  return {
    isValid: true,
    refundAmount,
    maxRefundable,
    originalPayment,
    nonRefundableFees: {
      platformFee,
      freeCancellationFee,
      total: totalNonRefundable
    },
    isFullRefund: refundAmount === maxRefundable,
    isPartialRefund: refundAmount < maxRefundable
  };
};

/**
 * Create a refund for a payment
 * Supports full and partial refund amounts
 * Validates refund amount against original payment minus non-refundable fees
 * 
 * Requirements: 8.1 - Process refund through Cashfree Refunds API
 * Requirements: 8.2 - Support both full and partial refund amounts
 * Requirements: 8.3 - Validate refund amount does not exceed original payment minus non-refundable fees
 * 
 * @param {Object} refundData - Refund details
 * @param {string} refundData.orderId - Original order ID
 * @param {string} refundData.refundId - Unique refund ID (auto-generated if not provided)
 * @param {number} refundData.amount - Refund amount
 * @param {string} refundData.reason - Refund reason
 * @param {number} refundData.originalPayment - Original payment amount (for validation)
 * @param {Object} refundData.breakdown - Payment breakdown with non-refundable fees (for validation)
 * @param {string} refundData.refundType - 'full' or 'partial' (informational)
 * @returns {Promise<Object>} Refund response
 */
const createRefund = async (refundData) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  // Validate required fields
  if (!refundData.orderId) {
    const error = new Error('Order ID is required for refund');
    error.code = 'MISSING_ORDER_ID';
    throw error;
  }
  
  if (typeof refundData.amount !== 'number' || refundData.amount <= 0) {
    const error = new Error('Valid refund amount is required');
    error.code = 'INVALID_REFUND_AMOUNT';
    throw error;
  }
  
  // Validate refund amount against original payment if provided
  if (refundData.originalPayment) {
    const validation = validateRefundAmount(
      refundData.amount,
      refundData.originalPayment,
      refundData.breakdown || {}
    );
    
    if (!validation.isValid) {
      const error = new Error(validation.message);
      error.code = validation.error;
      error.details = validation;
      throw error;
    }
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  const idempotencyKey = generateIdempotencyKey('refund');
  
  // Generate refund ID if not provided
  const refundId = refundData.refundId || `REF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  
  const request = {
    refund_id: refundId,
    refund_amount: refundData.amount,
    refund_note: refundData.reason || 'Refund processed'
  };
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.PGOrderCreateRefund(
      config.apiVersion, 
      refundData.orderId, 
      request,
      idempotencyKey
    );
    
    return {
      refundId: response.data.refund_id,
      cfRefundId: response.data.cf_refund_id,
      orderId: response.data.order_id,
      refundAmount: response.data.refund_amount,
      refundStatus: response.data.refund_status,
      refundArn: response.data.refund_arn,
      createdAt: response.data.created_at,
      refundType: refundData.refundType || (refundData.amount === refundData.originalPayment ? 'full' : 'partial')
    };
  });
};

/**
 * Get refund status
 * @param {string} orderId - Order ID
 * @param {string} refundId - Refund ID
 * @returns {Promise<Object>} Refund status
 */
const getRefundStatus = async (orderId, refundId) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.PGOrderFetchRefund(config.apiVersion, orderId, refundId);
    
    return {
      refundId: response.data.refund_id,
      cfRefundId: response.data.cf_refund_id,
      orderId: response.data.order_id,
      refundAmount: response.data.refund_amount,
      refundStatus: response.data.refund_status,
      refundArn: response.data.refund_arn,
      processedAt: response.data.processed_at
    };
  });
};

// ============================================
// Payout Operations (Beneficiary & Transfers)
// ============================================

/**
 * Add a beneficiary for payouts
 * Registers driver with bank account details on Cashfree
 * 
 * Requirements: 6.1 - Register driver as beneficiary with bank account details
 * 
 * @param {Object} beneficiaryData - Beneficiary details
 * @param {string} beneficiaryData.beneficiaryId - Unique beneficiary ID (usually driver ID)
 * @param {string} beneficiaryData.name - Account holder name
 * @param {string} beneficiaryData.email - Email address
 * @param {string} beneficiaryData.phone - Phone number
 * @param {string} beneficiaryData.bankAccount - Bank account number
 * @param {string} beneficiaryData.ifsc - IFSC code
 * @param {string} [beneficiaryData.address] - Address (optional)
 * @returns {Promise<Object>} Beneficiary response with status
 */
const addBeneficiary = async (beneficiaryData) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  // Validate required fields
  const requiredFields = ['beneficiaryId', 'name', 'email', 'phone', 'bankAccount', 'ifsc'];
  for (const field of requiredFields) {
    if (!beneficiaryData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate IFSC format
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  if (!ifscRegex.test(beneficiaryData.ifsc.toUpperCase())) {
    throw new Error('Invalid IFSC code format');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  const idempotencyKey = generateIdempotencyKey('bene');
  
  // Prepare request for Cashfree Payouts API
  const request = {
    beneId: beneficiaryData.beneficiaryId,
    name: beneficiaryData.name,
    email: beneficiaryData.email,
    phone: beneficiaryData.phone,
    bankAccount: beneficiaryData.bankAccount,
    ifsc: beneficiaryData.ifsc.toUpperCase(),
    address1: beneficiaryData.address || 'India',
    city: beneficiaryData.city || 'India',
    state: beneficiaryData.state || 'India',
    pincode: beneficiaryData.pincode || '000000'
  };
  
  return executeWithCircuitBreaker(async () => {
    try {
      // Cashfree Payouts API endpoint
      // Note: This requires Payouts API to be enabled in Cashfree dashboard
      const response = await Cashfree.Payouts.Beneficiary.Add(request, idempotencyKey);
      
      return {
        beneficiaryId: response.data?.beneId || beneficiaryData.beneficiaryId,
        status: 'registered',
        message: response.data?.message || 'Beneficiary registered successfully',
        registeredAt: new Date().toISOString()
      };
    } catch (error) {
      // Handle duplicate beneficiary error (already registered)
      if (error.response?.data?.subCode === '409' || 
          error.message?.includes('already exists') ||
          error.response?.status === 409) {
        return {
          beneficiaryId: beneficiaryData.beneficiaryId,
          status: 'registered',
          message: 'Beneficiary already registered',
          registeredAt: new Date().toISOString()
        };
      }
      throw error;
    }
  });
};

/**
 * Get beneficiary details
 * @param {string} beneficiaryId - Beneficiary ID
 * @returns {Promise<Object>} Beneficiary details
 */
const getBeneficiary = async (beneficiaryId) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  if (!beneficiaryId) {
    throw new Error('Beneficiary ID is required');
  }
  
  initializeCashfree();
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.Payouts.Beneficiary.GetDetails({ beneId: beneficiaryId });
    
    return {
      beneficiaryId: response.data?.beneId,
      name: response.data?.name,
      email: response.data?.email,
      phone: response.data?.phone,
      bankAccount: response.data?.bankAccount,
      ifsc: response.data?.ifsc,
      status: response.data?.status
    };
  });
};

/**
 * Remove a beneficiary
 * @param {string} beneficiaryId - Beneficiary ID to remove
 * @returns {Promise<Object>} Removal status
 */
const removeBeneficiary = async (beneficiaryId) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  if (!beneficiaryId) {
    throw new Error('Beneficiary ID is required');
  }
  
  initializeCashfree();
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.Payouts.Beneficiary.Remove({ beneId: beneficiaryId });
    
    return {
      beneficiaryId,
      status: 'removed',
      message: response.data?.message || 'Beneficiary removed successfully'
    };
  });
};

/**
 * Initiate a payout to a beneficiary
 * @param {Object} payoutData - Payout details
 * @returns {Promise<Object>} Payout response
 */
const initiatePayout = async (payoutData) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  initializeCashfree();
  const config = getCashfreeConfig();
  const idempotencyKey = generateIdempotencyKey('payout');
  
  const request = {
    beneId: payoutData.beneficiaryId,
    amount: payoutData.amount,
    transferId: payoutData.transferId,
    transferMode: payoutData.transferMode || 'IMPS',
    remarks: payoutData.remarks || 'HushRyd Driver Earnings'
  };
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.Payouts.Transfers.RequestTransfer(request, idempotencyKey);
    
    return {
      transferId: response.data.transferId,
      referenceId: response.data.referenceId,
      status: response.data.status,
      amount: response.data.amount,
      utr: response.data.utr
    };
  });
};

/**
 * Get payout status
 * @param {string} transferId - Transfer ID
 * @returns {Promise<Object>} Payout status
 */
const getPayoutStatus = async (transferId) => {
  if (!isCashfreeConfigured()) {
    throw new Error('Cashfree is not configured');
  }
  
  initializeCashfree();
  
  return executeWithCircuitBreaker(async () => {
    const response = await Cashfree.Payouts.Transfers.GetTransferStatus({ transferId });
    
    return {
      transferId: response.data.transferId,
      referenceId: response.data.referenceId,
      status: response.data.status,
      amount: response.data.amount,
      utr: response.data.utr,
      processedAt: response.data.processedOn
    };
  });
};

// ============================================
// Webhook Verification
// ============================================

/**
 * Verify webhook signature from Cashfree
 * Uses Cashfree's signature verification algorithm
 * Signature = base64(HMAC-SHA256(timestamp + rawBody, secret))
 * 
 * Requirements: 7.2
 * 
 * @param {string} payload - Raw webhook payload (JSON string)
 * @param {string} signature - Signature from x-webhook-signature header
 * @param {string} timestamp - Timestamp from x-webhook-timestamp header (optional for some webhook versions)
 * @param {string} secret - Webhook secret (optional, uses config if not provided)
 * @returns {boolean} True if signature is valid
 */
const verifyWebhookSignature = (payload, signature, timestamp = '', secret = null) => {
  // Validate inputs
  if (!payload || typeof payload !== 'string') {
    console.error('Webhook verification failed: Invalid payload');
    return false;
  }
  
  if (!signature || typeof signature !== 'string') {
    console.error('Webhook verification failed: Missing signature');
    return false;
  }
  
  // Get webhook secret from config or parameter
  const webhookSecret = secret || getCashfreeConfig().webhookSecret;
  
  if (!webhookSecret) {
    console.warn('CASHFREE_WEBHOOK_SECRET not configured, skipping signature verification');
    return false;
  }
  
  try {
    // Cashfree webhook signature verification
    // For newer API versions: Signature = base64(HMAC-SHA256(timestamp + payload, secret))
    // For older versions: Signature = base64(HMAC-SHA256(payload, secret))
    const signatureData = timestamp ? (timestamp + payload) : payload;
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signatureData)
      .digest('base64');
    
    // Use timing-safe comparison to prevent timing attacks
    // Handle different signature lengths gracefully
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return false;
  }
};

// ============================================
// Utility Functions
// ============================================

/**
 * Check if Cashfree service is available
 * @returns {boolean} True if service is configured and circuit is not open
 */
const isServiceAvailable = () => {
  if (!isCashfreeConfigured()) {
    return false;
  }
  
  const breaker = getCashfreeCircuitBreaker();
  return breaker.isAllowed();
};

/**
 * Get service health status
 * Requirements: 10.1 - Monitor circuit breaker state
 * 
 * @returns {Object} Health status
 */
const getServiceHealth = () => {
  const configured = isCashfreeConfigured();
  const breaker = getCashfreeCircuitBreaker();
  const metrics = breaker.getMetrics();
  
  return {
    configured,
    circuitState: metrics.state,
    circuitOpen: metrics.state === CircuitState.OPEN,
    available: configured && breaker.isAllowed(),
    metrics: {
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      rejectedRequests: metrics.rejectedRequests,
      currentFailures: metrics.failures
    },
    config: CIRCUIT_BREAKER_CONFIG,
    retryAfter: metrics.retryAfter,
    lastError: metrics.lastError
  };
};

// ============================================
// Payment Confirmation Queue Integration
// Requirements: 10.2, 10.4, 10.5
// ============================================

/**
 * Execute Cashfree API call with automatic queue fallback on timeout/circuit open
 * Queues payment confirmation for later reconciliation when API is unavailable
 * 
 * Requirements: 10.2 - Queue payment confirmations when API times out
 * 
 * @param {Function} apiCall - Async function making the API call
 * @param {Object} queueData - Data to queue if API call fails
 * @param {string} queueData.orderId - Cashfree order ID
 * @param {string} queueData.bookingId - Booking ID
 * @param {string} queueData.tripId - Trip ID
 * @param {number} queueData.amount - Payment amount
 * @param {string} queueData.type - Operation type
 * @param {number} [timeout=15000] - Timeout in milliseconds
 * @returns {Promise<Object>} API response or queue confirmation
 */
const executeWithQueueFallback = async (apiCall, queueData, timeout = 15000) => {
  const breaker = getCashfreeCircuitBreaker();
  
  // If circuit is open, queue immediately
  if (breaker.getState() === CircuitState.OPEN) {
    console.log(`[CashfreeService] Circuit open, queuing ${queueData.type} for order ${queueData.orderId}`);
    return queuePaymentForReconciliation(queueData, 'circuit_open');
  }
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error('Cashfree API timeout');
        error.code = 'TIMEOUT';
        reject(error);
      }, timeout);
    });
    
    // Race between API call and timeout
    const result = await Promise.race([
      breaker.execute(apiCall),
      timeoutPromise
    ]);
    
    return {
      success: true,
      queued: false,
      result
    };
    
  } catch (error) {
    // On timeout or circuit open, queue for later reconciliation
    if (error.code === 'TIMEOUT' || error.code === 'CIRCUIT_OPEN') {
      console.warn(`[CashfreeService] ${error.code} for ${queueData.type}, queuing for reconciliation`);
      return queuePaymentForReconciliation(queueData, error.code.toLowerCase());
    }
    
    // Re-throw other errors
    throw error;
  }
};

/**
 * Queue a payment operation for later reconciliation
 * 
 * Requirements: 10.2 - Queue payment confirmations when API times out
 * 
 * @param {Object} queueData - Data to queue
 * @param {string} reason - Reason for queuing (timeout, circuit_open)
 * @returns {Object} Queue result
 */
const queuePaymentForReconciliation = (queueData, reason) => {
  // Lazy load to avoid circular dependencies
  const { queuePaymentConfirmation } = require('../queues/paymentConfirmationQueue');
  
  const confirmationData = {
    ...queueData,
    reason,
    queuedAt: new Date().toISOString()
  };
  
  // Queue asynchronously - don't block the response
  queuePaymentConfirmation(confirmationData).catch(err => {
    console.error('[CashfreeService] Failed to queue payment confirmation:', err);
  });
  
  return {
    success: true,
    queued: true,
    reason,
    orderId: queueData.orderId,
    message: `Payment ${queueData.type} queued for reconciliation - operation can proceed`,
    retryAfter: reason === 'circuit_open' ? getCashfreeCircuitBreaker().getRetryAfter() : 60
  };
};

/**
 * Get payment status with queue fallback
 * Queues reconciliation request if API is unavailable
 * 
 * Requirements: 10.4 - Poll Cashfree API to reconcile payment status
 * 
 * @param {string} orderId - Order ID
 * @param {Object} queueData - Additional data for queuing
 * @returns {Promise<Object>} Payment status or queue confirmation
 */
const getPaymentStatusWithFallback = async (orderId, queueData = {}) => {
  return executeWithQueueFallback(
    async () => {
      if (!isCashfreeConfigured()) {
        throw new Error('Cashfree is not configured');
      }
      
      initializeCashfree();
      const config = getCashfreeConfig();
      
      const response = await Cashfree.PGOrderFetchPayments(config.apiVersion, orderId);
      const payments = response.data || [];
      
      return payments.map(payment => ({
        cfPaymentId: payment.cf_payment_id,
        paymentStatus: payment.payment_status,
        paymentAmount: payment.payment_amount,
        paymentCurrency: payment.payment_currency,
        paymentMethod: payment.payment_method,
        paymentTime: payment.payment_time,
        bankReference: payment.bank_reference
      }));
    },
    {
      orderId,
      type: 'status_check',
      ...queueData
    }
  );
};

module.exports = {
  // Order Management
  createOrder,
  getOrder,
  
  // Payment Operations
  getPaymentStatus,
  capturePayment,
  
  // Refund Operations
  createRefund,
  getRefundStatus,
  validateRefundAmount,
  
  // Payout Operations
  addBeneficiary,
  getBeneficiary,
  removeBeneficiary,
  initiatePayout,
  getPayoutStatus,
  
  // Webhook
  verifyWebhookSignature,
  
  // Utilities
  generateIdempotencyKey,
  isServiceAvailable,
  getServiceHealth,
  initializeCashfree,
  
  // Circuit Breaker (Requirements: 10.1)
  getCashfreeCircuitBreaker,
  executeWithCircuitBreaker,
  isCircuitOpen,
  getCircuitState,
  CircuitOpenError,
  CASHFREE_CIRCUIT_BREAKER,
  CIRCUIT_BREAKER_CONFIG,
  
  // Queue Fallback (Requirements: 10.2, 10.4, 10.5)
  executeWithQueueFallback,
  queuePaymentForReconciliation,
  getPaymentStatusWithFallback
};
