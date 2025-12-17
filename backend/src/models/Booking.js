/**
 * Booking Model
 * Stores passenger booking information for trips
 * 
 * Requirements: 3.4, 3.5
 */

const mongoose = require('mongoose');

/**
 * Location Schema
 * Stores location information with coordinates
 */
const LocationSchema = new mongoose.Schema({
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  coordinates: {
    lat: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: -180,
      max: 180
    }
  },
  landmark: {
    type: String,
    trim: true
  }
}, { _id: false });

/**
 * Booking Schema
 * Main schema for passenger bookings
 */
const BookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: [true, 'Booking ID is required'],
    unique: true,
    index: true
    // Format: BK-YYYY-NNNNNN (e.g., BK-2024-001234)
  },
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: [true, 'Trip ID is required'],
    index: true
  },
  passengerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Passenger ID is required'],
    index: true
  },
  seats: {
    type: Number,
    required: [true, 'Number of seats is required'],
    min: [1, 'At least 1 seat is required'],
    max: [6, 'Maximum 6 seats allowed']
  },
  pickupPoint: {
    type: LocationSchema,
    required: [true, 'Pickup point is required']
  },
  dropPoint: {
    type: LocationSchema,
    required: [true, 'Drop point is required']
  },
  fare: {
    type: Number,
    required: [true, 'Fare is required'],
    min: [0, 'Fare cannot be negative']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentId: {
    type: String,
    sparse: true
  },
  bookedAt: {
    type: Date,
    default: Date.now
  },
  cancelledAt: {
    type: Date
  },
  cancelReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Cancel reason cannot exceed 500 characters']
  },
  cancelledBy: {
    type: String,
    enum: ['passenger', 'driver', 'system']
  },
  // Driver response tracking for booking acceptance flow
  // Requirements: 4.1, 4.7
  driverResponse: {
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'auto_declined'],
      default: 'pending'
    },
    respondedAt: {
      type: Date
    },
    declineReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Decline reason cannot exceed 500 characters']
    }
  },
  // Booking expiry time (30 minutes from creation)
  expiresAt: {
    type: Date,
    index: true
  },
  rating: {
    type: Number,
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5']
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: [1000, 'Feedback cannot exceed 1000 characters']
  },
  // Passenger's booking PIN copied from User at booking time
  // Used for ride start verification (Requirements 4.4, 8.2)
  passengerPIN: {
    type: String,
    match: [/^\d{4}$/, 'Passenger PIN must be exactly 4 digits']
  },
  // Unique 4-digit verification code for ride start
  // Generated on booking confirmation (Requirements 7.1, 7.2)
  verificationCode: {
    type: String,
    match: [/^\d{4}$/, 'Verification code must be exactly 4 digits']
  },
  // Track when passenger was verified at ride start
  verifiedAt: {
    type: Date
  },
  // Pickup status for OTP verification flow (Requirements: 5.2)
  pickupStatus: {
    type: String,
    enum: ['pending', 'picked_up', 'no_show'],
    default: 'pending',
    index: true
  },
  // Timestamp when passenger was picked up (Requirements: 5.2)
  pickedUpAt: {
    type: Date
  },
  // Enhanced payment tracking for AbhiBus-style interface
  paymentDetails: {
    method: {
      type: String,
      enum: ['wallet', 'upi', 'card', 'netbanking', 'cash', 'cashfree'],
      default: 'wallet'
    },
    gatewayTransactionId: {
      type: String,
      sparse: true
    },
    walletAmountUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    gatewayAmountPaid: {
      type: Number,
      default: 0,
      min: 0
    },
    cashbackEarned: {
      type: Number,
      default: 0,
      min: 0
    },
    cashbackRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    // Cashfree payment gateway details
    cashfreeOrderId: {
      type: String,
      sparse: true
    },
    cashfreePaymentId: {
      type: String,
      sparse: true
    },
    paymentMode: {
      type: String,
      enum: ['cc', 'dc', 'nb', 'upi', 'wallet', 'emi', 'paylater']
    },
    bankReference: {
      type: String
    },
    paymentTime: {
      type: Date
    }
  },
  // Fare breakdown for transparency
  fareBreakdown: {
    baseFare: {
      type: Number,
      required: true,
      min: 0
    },
    platformFee: {
      type: Number,
      default: 0,
      min: 0
    },
    taxes: {
      type: Number,
      default: 0,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalFare: {
      type: Number,
      required: true,
      min: 0
    }
  },
  // Passenger details for the booking
  passengerDetails: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: Number,
      required: true,
      min: 1,
      max: 120
    },
    gender: {
      type: String,
      enum: ['male', 'female'],
      required: true
    },
    seatNumber: {
      type: String,
      required: true
    }
  }],
  // Boarding and dropping points with times
  boardingPoint: {
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    time: {
      type: String,
      required: true
    },
    landmark: String
  },
  droppingPoint: {
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    time: {
      type: String,
      required: true
    },
    landmark: String
  },
  // Enhanced invoice details for AbhiBus-style interface
  invoice: {
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    pdfUrl: {
      type: String
    },
    emailSent: {
      type: Boolean,
      default: false
    },
    whatsappSent: {
      type: Boolean,
      default: false
    },
    generatedAt: {
      type: Date
    },
    // Professional invoice details
    companyDetails: {
      name: {
        type: String,
        default: 'HushRyd Technologies Pvt Ltd'
      },
      address: {
        type: String,
        default: 'Bangalore, Karnataka, India'
      },
      gstin: {
        type: String,
        default: '29AABCH1234C1Z5'
      },
      pan: {
        type: String,
        default: 'AABCH1234C'
      }
    },
    // Invoice delivery tracking
    deliveryAttempts: {
      email: {
        attempts: {
          type: Number,
          default: 0
        },
        lastAttempt: {
          type: Date
        },
        delivered: {
          type: Boolean,
          default: false
        }
      },
      whatsapp: {
        attempts: {
          type: Number,
          default: 0
        },
        lastAttempt: {
          type: Date
        },
        delivered: {
          type: Boolean,
          default: false
        }
      }
    }
  },
  // Contact details for the booking
  contactDetails: {
    primaryPhone: {
      type: String,
      required: true
    },
    emergencyPhone: {
      type: String
    },
    email: {
      type: String
    }
  },
  // Cancellation details
  cancellationPolicy: {
    type: String,
    enum: ['free', 'partial', 'no-refund'],
    default: 'partial'
  },
  refundDetails: {
    refundAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    cancellationFee: {
      type: Number,
      default: 0,
      min: 0
    },
    refundMethod: {
      type: String,
      enum: ['wallet', 'original', 'bank'],
      default: 'wallet'
    },
    refundProcessedAt: {
      type: Date
    },
    refundTransactionId: {
      type: String
    }
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
BookingSchema.index({ tripId: 1, status: 1 });
BookingSchema.index({ passengerId: 1, status: 1 });
BookingSchema.index({ passengerId: 1, createdAt: -1 });
BookingSchema.index({ tripId: 1, passengerId: 1 }, { unique: true });
BookingSchema.index({ 'driverResponse.status': 1, expiresAt: 1 }); // For expired bookings query

/**
 * Generate unique booking ID
 * @returns {Promise<string>} Unique booking ID in format BK-YYYY-NNNNNN
 */
BookingSchema.statics.generateBookingId = async function() {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    bookingId: { $regex: `^BK-${year}-` }
  });
  const sequence = String(count + 1).padStart(6, '0');
  return `BK-${year}-${sequence}`;
};

/**
 * Get booking by ID (MongoDB ObjectId or human-readable)
 * @param {string} id - Booking ID
 * @returns {Promise<Object>} Booking document
 */
BookingSchema.statics.findByBookingId = async function(id) {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    const booking = await this.findById(id);
    if (booking) return booking;
  }
  return this.findOne({ bookingId: id });
};

const Booking = mongoose.model('Booking', BookingSchema);

module.exports = Booking;
