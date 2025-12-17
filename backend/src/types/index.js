// Backend Types and Interfaces for AbhiBus-style Interface

/**
 * @typedef {Object} Location
 * @property {string} name
 * @property {[number, number]} coordinates - [longitude, latitude]
 * @property {string} placeId
 * @property {string} [address]
 * @property {string} [city]
 * @property {string} [state]
 */

/**
 * @typedef {Object} SearchParams
 * @property {Location} from
 * @property {Location} to
 * @property {Date} departureDate
 * @property {Date} [returnDate]
 * @property {number} passengers
 */

/**
 * @typedef {Object} UserPreferences
 * @property {boolean} emailAlerts
 * @property {boolean} mobileAlerts
 * @property {string} language
 * @property {string} currency
 */

/**
 * @typedef {Object} EmergencyContact
 * @property {string} name
 * @property {string} phone
 * @property {string} relationship
 */

/**
 * @typedef {Object} KYCDocument
 * @property {'aadhaar'|'pan'|'license'|'passport'} type
 * @property {string} documentNumber
 * @property {string} imageUrl
 * @property {'pending'|'verified'|'rejected'} status
 * @property {Date} uploadedAt
 */

/**
 * @typedef {Object} WalletData
 * @property {number} totalBalance
 * @property {number} promoBalance
 * @property {number} nonPromoBalance
 * @property {number} pendingCashback
 */

/**
 * @typedef {Object} Transaction
 * @property {string} _id
 * @property {string} userId
 * @property {'credit'|'debit'} type
 * @property {'cashback'|'referral'|'booking'|'refund'|'promo'} category
 * @property {number} amount
 * @property {string} description
 * @property {string} [bookingId]
 * @property {Date} [expiryDate]
 * @property {'pending'|'completed'|'failed'|'expired'} status
 * @property {Object} metadata
 * @property {Date} createdAt
 */

/**
 * @typedef {Object} BoardingPoint
 * @property {string} _id
 * @property {string} name
 * @property {string} address
 * @property {[number, number]} coordinates
 * @property {string} time
 * @property {string} [landmark]
 */

/**
 * @typedef {Object} Route
 * @property {Location} from
 * @property {Location} to
 * @property {number} distance
 * @property {number} estimatedDuration
 * @property {Location[]} waypoints
 */

/**
 * @typedef {Object} Vehicle
 * @property {string} type
 * @property {string} model
 * @property {string} registrationNumber
 * @property {string[]} amenities
 */

/**
 * @typedef {Object} Pricing
 * @property {number} baseFare
 * @property {number} perKmRate
 * @property {number} totalSeats
 * @property {number} availableSeats
 */

/**
 * @typedef {Object} PassengerDetail
 * @property {string} name
 * @property {number} age
 * @property {'male'|'female'} gender
 * @property {string} seatNumber
 */

/**
 * @typedef {Object} Invoice
 * @property {string} _id
 * @property {string} bookingId
 * @property {string} invoiceNumber
 * @property {string} pdfUrl
 * @property {boolean} emailSent
 * @property {boolean} whatsappSent
 * @property {Date} generatedAt
 */

/**
 * @typedef {Object} ReferralData
 * @property {string} code
 * @property {number} totalEarned
 * @property {number} successfulReferrals
 * @property {number} pendingRewards
 * @property {Array} recentReferrals
 */

/**
 * @typedef {Object} FilterOptions
 * @property {string[]} busType
 * @property {[number, number]} priceRange
 * @property {string[]} departureTime
 * @property {string[]} amenities
 * @property {string[]} operators
 * @property {number} ratings
 */

/**
 * @typedef {Object} PaymentSession
 * @property {string} sessionId
 * @property {string} paymentUrl
 * @property {number} amount
 * @property {string} currency
 * @property {Date} expiresAt
 */

/**
 * @typedef {Object} PaymentResult
 * @property {boolean} success
 * @property {string} transactionId
 * @property {string} paymentMethod
 * @property {number} amount
 * @property {Date} processedAt
 */

/**
 * @typedef {Object} CashbackResult
 * @property {number} amount
 * @property {number} percentage
 * @property {string} transactionId
 * @property {Date} creditedAt
 */

/**
 * @typedef {Object} NotificationPayload
 * @property {string} type
 * @property {string} recipient
 * @property {string} subject
 * @property {string} message
 * @property {Object} [data]
 * @property {string} [templateId]
 */

/**
 * @typedef {Object} OTPResponse
 * @property {boolean} success
 * @property {string} message
 * @property {string} [otpId]
 * @property {Date} [expiresAt]
 */

/**
 * @typedef {Object} AuthResponse
 * @property {boolean} success
 * @property {string} token
 * @property {string} refreshToken
 * @property {Object} user
 * @property {boolean} isNewUser
 */

/**
 * @typedef {Object} TokenResponse
 * @property {string} token
 * @property {string} refreshToken
 * @property {Date} expiresAt
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [message]
 * @property {string} [error]
 * @property {Object} [pagination]
 */

/**
 * @typedef {Object} Pagination
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 */

/**
 * @typedef {Object} HistoryFilters
 * @property {'upcoming'|'past'|'cancelled'|'unsuccessful'} [status]
 * @property {Date} [startDate]
 * @property {Date} [endDate]
 * @property {number} [page]
 * @property {number} [limit]
 */

/**
 * @typedef {Object} CancellationResponse
 * @property {boolean} success
 * @property {number} refundAmount
 * @property {number} cancellationFee
 * @property {string} refundMethod
 * @property {Date} refundProcessedAt
 */

// Service Interface Definitions

/**
 * Authentication Service Interface
 * @typedef {Object} AuthService
 * @property {function(string, 'sms'|'email'): Promise<OTPResponse>} sendOTP
 * @property {function(string, string): Promise<AuthResponse>} verifyOTP
 * @property {function(string): Promise<TokenResponse>} refreshToken
 */

/**
 * Booking Service Interface
 * @typedef {Object} BookingService
 * @property {function(SearchParams): Promise<Object[]>} searchRides
 * @property {function(Object): Promise<Object>} createBooking
 * @property {function(string, string): Promise<CancellationResponse>} cancelBooking
 * @property {function(string, HistoryFilters): Promise<Object[]>} getBookingHistory
 */

/**
 * Payment Service Interface
 * @typedef {Object} PaymentService
 * @property {function(number, string): Promise<PaymentSession>} initiateCashfreePayment
 * @property {function(string, number): Promise<PaymentResult>} processWalletPayment
 * @property {function(string, string): Promise<CashbackResult>} processCashback
 * @property {function(string): Promise<Invoice>} generateInvoice
 */

/**
 * Wallet Service Interface
 * @typedef {Object} WalletService
 * @property {function(string): Promise<WalletData>} getWalletBalance
 * @property {function(string, number, string): Promise<Transaction>} addCashback
 * @property {function(string, number, 'promo'|'regular'): Promise<Transaction>} deductAmount
 * @property {function(string, Pagination): Promise<Transaction[]>} getTransactionHistory
 */

/**
 * Maps Service Interface
 * @typedef {Object} MapsService
 * @property {function(string): Promise<Location[]>} autocompleteLocation
 * @property {function(Location, Location): Promise<Route>} calculateRoute
 * @property {function([number, number]): Promise<Location>} reverseGeocode
 */

/**
 * Notification Service Interface
 * @typedef {Object} NotificationService
 * @property {function(NotificationPayload): Promise<boolean>} sendEmail
 * @property {function(NotificationPayload): Promise<boolean>} sendSMS
 * @property {function(NotificationPayload): Promise<boolean>} sendWhatsApp
 * @property {function(NotificationPayload[]): Promise<boolean[]>} sendMultiChannel
 */

module.exports = {
  // Export types for JSDoc usage
};