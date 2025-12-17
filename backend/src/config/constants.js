/**
 * Application Constants
 * Centralized configuration for the HushRyd platform
 */

const REFERRAL_REWARDS = {
  REFERRER: 150, // ₹150 for referrer
  REFEREE: 250,  // ₹250 for referee
};

const CASHBACK_RATES = {
  DEFAULT: 0.02,     // 2% default cashback
  REFERRAL: 0.05,    // 5% for referral bookings
  WOMEN_ONLY: 0.03,  // 3% for women-only rides
  FIRST_BOOKING: 0.10, // 10% for first booking
};

const SOCIAL_PLATFORMS = {
  WHATSAPP: 'whatsapp',
  FACEBOOK: 'facebook',
  TWITTER: 'twitter',
  EMAIL: 'email',
};

const REFERRAL_TIERS = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
};

const REFERRAL_TIER_THRESHOLDS = {
  SILVER: 5,    // 5 successful referrals
  GOLD: 10,     // 10 successful referrals
  PLATINUM: 20, // 20 successful referrals
};

const NOTIFICATION_TYPES = {
  REFERRAL_REWARD: 'referral_reward',
  REFERRAL_JOINED: 'referral_joined',
  CASHBACK_CREDITED: 'cashback_credited',
  BOOKING_CONFIRMED: 'booking_confirmed',
};

const TRANSACTION_CATEGORIES = {
  CASHBACK: 'cashback',
  REFERRAL: 'referral',
  BOOKING: 'booking',
  REFUND: 'refund',
  PROMO: 'promo',
  ADJUSTMENT: 'adjustment',
};

const WALLET_STATUS = {
  ACTIVE: 'active',
  FROZEN: 'frozen',
  SUSPENDED: 'suspended',
};

const BOOKING_STATUS = {
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no-show',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const KYC_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

const USER_ROLES = {
  PASSENGER: 'passenger',
  DRIVER: 'driver',
  OPERATIONS: 'operations',
  CUSTOMER_SUPPORT: 'customer_support',
  FINANCE: 'finance',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
};

const RIDE_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const DOCUMENT_TYPES = {
  AADHAAR: 'aadhaar',
  PAN: 'pan',
  LICENSE: 'license',
  PASSPORT: 'passport',
  SELFIE: 'selfie',
};

const GENDER_OPTIONS = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
};

const NOTIFICATION_CHANNELS = {
  SMS: 'sms',
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  PUSH: 'push',
};

const RIDE_TYPES = {
  REGULAR: 'regular',
  FEMALE_ONLY: 'female-only',
  ACCESSIBLE: 'accessible',
  PREMIUM: 'premium',
};

const LANGUAGES = {
  ENGLISH: 'en',
  HINDI: 'hi',
  TAMIL: 'ta',
  TELUGU: 'te',
  KANNADA: 'kn',
  MALAYALAM: 'ml',
  BENGALI: 'bn',
  GUJARATI: 'gu',
  MARATHI: 'mr',
  PUNJABI: 'pa',
};

const CURRENCY = {
  SYMBOL: '₹',
  CODE: 'INR',
};

const VALIDATION_PATTERNS = {
  PHONE: /^[6-9]\d{9}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  OTP: /^\d{6}$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  AADHAAR: /^\d{12}$/,
  REFERRAL_CODE: /^[A-Z0-9]{6}$/,
  BOOKING_PIN: /^\d{4}$/,
};

const API_LIMITS = {
  OTP_ATTEMPTS: 3,
  OTP_EXPIRY_MINUTES: 10,
  REFERRAL_CODE_ATTEMPTS: 100,
  BOOKING_PIN_ATTEMPTS: 100,
  MAX_EMERGENCY_CONTACTS: 5,
  MAX_KYC_DOCUMENTS: 10,
};

const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
};

const CACHE_TTL = {
  USER_PROFILE: 300,      // 5 minutes
  WALLET_BALANCE: 60,     // 1 minute
  REFERRAL_DATA: 300,     // 5 minutes
  SEARCH_RESULTS: 180,    // 3 minutes
  RIDE_DETAILS: 120,      // 2 minutes
};

const ERROR_CODES = {
  // Authentication
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // User Management
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  
  // Referral System
  INVALID_REFERRAL_CODE: 'INVALID_REFERRAL_CODE',
  REFERRAL_ALREADY_APPLIED: 'REFERRAL_ALREADY_APPLIED',
  SELF_REFERRAL_NOT_ALLOWED: 'SELF_REFERRAL_NOT_ALLOWED',
  
  // Wallet & Payments
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  WALLET_FROZEN: 'WALLET_FROZEN',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  
  // Booking
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  SEAT_NOT_AVAILABLE: 'SEAT_NOT_AVAILABLE',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
};

module.exports = {
  REFERRAL_REWARDS,
  CASHBACK_RATES,
  SOCIAL_PLATFORMS,
  REFERRAL_TIERS,
  REFERRAL_TIER_THRESHOLDS,
  NOTIFICATION_TYPES,
  TRANSACTION_CATEGORIES,
  WALLET_STATUS,
  BOOKING_STATUS,
  PAYMENT_STATUS,
  KYC_STATUS,
  USER_ROLES,
  RIDE_STATUS,
  DOCUMENT_TYPES,
  GENDER_OPTIONS,
  NOTIFICATION_CHANNELS,
  RIDE_TYPES,
  LANGUAGES,
  CURRENCY,
  VALIDATION_PATTERNS,
  API_LIMITS,
  PAGINATION_DEFAULTS,
  CACHE_TTL,
  ERROR_CODES,
};