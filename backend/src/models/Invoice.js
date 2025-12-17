const mongoose = require('mongoose');

/**
 * Invoice Schema
 * Manages invoice generation and delivery for bookings
 * Design Decision: Separate invoice tracking for audit and delivery status
 * Rationale: Professional invoice system with multi-channel delivery tracking
 */
const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    index: true
    // Format: INV-YYYY-NNNNNN (e.g., INV-2024-001234)
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: [true, 'Booking ID is required'],
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  // Invoice details
  invoiceData: {
    // Customer details
    customer: {
      name: {
        type: String,
        required: true,
        trim: true
      },
      email: {
        type: String,
        trim: true,
        lowercase: true
      },
      phone: {
        type: String,
        required: true,
        trim: true
      },
      address: {
        type: String,
        trim: true
      }
    },
    // Trip details
    trip: {
      tripId: {
        type: String,
        required: true
      },
      from: {
        type: String,
        required: true
      },
      to: {
        type: String,
        required: true
      },
      departureDate: {
        type: Date,
        required: true
      },
      departureTime: {
        type: String,
        required: true
      },
      arrivalTime: {
        type: String,
        required: true
      },
      boardingPoint: {
        name: String,
        address: String,
        time: String
      },
      droppingPoint: {
        name: String,
        address: String,
        time: String
      }
    },
    // Passenger details
    passengers: [{
      name: {
        type: String,
        required: true
      },
      age: {
        type: Number,
        required: true
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
    // Fare breakdown
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
    // Payment details
    payment: {
      method: {
        type: String,
        enum: ['wallet', 'upi', 'card', 'netbanking', 'cash'],
        required: true
      },
      transactionId: {
        type: String
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
      paidAt: {
        type: Date,
        required: true
      }
    }
  },
  // PDF generation details
  pdf: {
    url: {
      type: String // S3 URL or file path
    },
    generatedAt: {
      type: Date
    },
    fileSize: {
      type: Number // in bytes
    },
    generationStatus: {
      type: String,
      enum: ['pending', 'generating', 'completed', 'failed'],
      default: 'pending'
    },
    generationError: {
      type: String
    }
  },
  // Delivery tracking
  delivery: {
    email: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: {
        type: Date
      },
      attempts: {
        type: Number,
        default: 0
      },
      lastAttemptAt: {
        type: Date
      },
      error: {
        type: String
      }
    },
    whatsapp: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: {
        type: Date
      },
      attempts: {
        type: Number,
        default: 0
      },
      lastAttemptAt: {
        type: Date
      },
      error: {
        type: String
      }
    }
  },
  // Invoice status
  status: {
    type: String,
    enum: ['draft', 'generated', 'sent', 'failed'],
    default: 'draft',
    index: true
  },
  // Template used for generation
  template: {
    type: String,
    default: 'default',
    enum: ['default', 'premium', 'minimal']
  },
  // Company details (for invoice header)
  company: {
    name: {
      type: String,
      default: 'HushRyd'
    },
    address: {
      type: String,
      default: 'Bangalore, Karnataka, India'
    },
    phone: {
      type: String,
      default: '+91-XXXXXXXXXX'
    },
    email: {
      type: String,
      default: 'support@hushryd.com'
    },
    website: {
      type: String,
      default: 'https://hushryd.com'
    },
    logo: {
      type: String // URL to company logo
    },
    gstin: {
      type: String
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ bookingId: 1 }, { unique: true });
InvoiceSchema.index({ userId: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ 'pdf.generationStatus': 1 });
InvoiceSchema.index({ 'delivery.email.sent': 1 });
InvoiceSchema.index({ 'delivery.whatsapp.sent': 1 });

/**
 * Generate unique invoice number
 * @returns {Promise<string>} Unique invoice number in format INV-YYYY-NNNNNN
 */
InvoiceSchema.statics.generateInvoiceNumber = async function() {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    invoiceNumber: { $regex: `^INV-${year}-` }
  });
  const sequence = String(count + 1).padStart(6, '0');
  return `INV-${year}-${sequence}`;
};

/**
 * Create invoice from booking data
 * @param {Object} booking - Booking document
 * @param {Object} user - User document
 * @returns {Promise<Object>} Created invoice
 */
InvoiceSchema.statics.createFromBooking = async function(booking, user) {
  const invoiceNumber = await this.generateInvoiceNumber();
  
  const invoiceData = {
    customer: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address || ''
    },
    trip: {
      tripId: booking.tripId,
      from: booking.source?.address || '',
      to: booking.destination?.address || '',
      departureDate: booking.scheduledAt,
      departureTime: booking.boardingPoint?.time || '',
      arrivalTime: booking.droppingPoint?.time || '',
      boardingPoint: {
        name: booking.boardingPoint?.name || '',
        address: booking.boardingPoint?.address || '',
        time: booking.boardingPoint?.time || ''
      },
      droppingPoint: {
        name: booking.droppingPoint?.name || '',
        address: booking.droppingPoint?.address || '',
        time: booking.droppingPoint?.time || ''
      }
    },
    passengers: booking.passengerDetails || [],
    fareBreakdown: booking.fareBreakdown,
    payment: {
      method: booking.paymentDetails?.method || 'wallet',
      transactionId: booking.paymentDetails?.gatewayTransactionId || '',
      walletAmountUsed: booking.paymentDetails?.walletAmountUsed || 0,
      gatewayAmountPaid: booking.paymentDetails?.gatewayAmountPaid || 0,
      paidAt: booking.createdAt
    }
  };

  const invoice = new this({
    invoiceNumber,
    bookingId: booking._id,
    userId: user._id,
    invoiceData,
    status: 'draft'
  });

  return await invoice.save();
};

/**
 * Mark PDF generation as completed
 * @param {string} pdfUrl - URL to generated PDF
 * @param {number} fileSize - File size in bytes
 * @returns {Promise<Object>} Updated invoice
 */
InvoiceSchema.methods.markPdfGenerated = async function(pdfUrl, fileSize) {
  this.pdf.url = pdfUrl;
  this.pdf.generatedAt = new Date();
  this.pdf.fileSize = fileSize;
  this.pdf.generationStatus = 'completed';
  this.status = 'generated';
  
  return await this.save();
};

/**
 * Mark PDF generation as failed
 * @param {string} error - Error message
 * @returns {Promise<Object>} Updated invoice
 */
InvoiceSchema.methods.markPdfFailed = async function(error) {
  this.pdf.generationStatus = 'failed';
  this.pdf.generationError = error;
  this.status = 'failed';
  
  return await this.save();
};

/**
 * Mark email as sent
 * @returns {Promise<Object>} Updated invoice
 */
InvoiceSchema.methods.markEmailSent = async function() {
  this.delivery.email.sent = true;
  this.delivery.email.sentAt = new Date();
  this.delivery.email.attempts += 1;
  this.delivery.email.lastAttemptAt = new Date();
  
  // Update overall status if both channels are sent
  if (this.delivery.whatsapp.sent) {
    this.status = 'sent';
  }
  
  return await this.save();
};

/**
 * Mark email delivery as failed
 * @param {string} error - Error message
 * @returns {Promise<Object>} Updated invoice
 */
InvoiceSchema.methods.markEmailFailed = async function(error) {
  this.delivery.email.attempts += 1;
  this.delivery.email.lastAttemptAt = new Date();
  this.delivery.email.error = error;
  
  return await this.save();
};

/**
 * Mark WhatsApp as sent
 * @returns {Promise<Object>} Updated invoice
 */
InvoiceSchema.methods.markWhatsAppSent = async function() {
  this.delivery.whatsapp.sent = true;
  this.delivery.whatsapp.sentAt = new Date();
  this.delivery.whatsapp.attempts += 1;
  this.delivery.whatsapp.lastAttemptAt = new Date();
  
  // Update overall status if both channels are sent
  if (this.delivery.email.sent) {
    this.status = 'sent';
  }
  
  return await this.save();
};

/**
 * Mark WhatsApp delivery as failed
 * @param {string} error - Error message
 * @returns {Promise<Object>} Updated invoice
 */
InvoiceSchema.methods.markWhatsAppFailed = async function(error) {
  this.delivery.whatsapp.attempts += 1;
  this.delivery.whatsapp.lastAttemptAt = new Date();
  this.delivery.whatsapp.error = error;
  
  return await this.save();
};

/**
 * Get delivery status summary
 * @returns {Object} Delivery status
 */
InvoiceSchema.methods.getDeliveryStatus = function() {
  return {
    email: {
      sent: this.delivery.email.sent,
      sentAt: this.delivery.email.sentAt,
      attempts: this.delivery.email.attempts,
      error: this.delivery.email.error
    },
    whatsapp: {
      sent: this.delivery.whatsapp.sent,
      sentAt: this.delivery.whatsapp.sentAt,
      attempts: this.delivery.whatsapp.attempts,
      error: this.delivery.whatsapp.error
    },
    allSent: this.delivery.email.sent && this.delivery.whatsapp.sent,
    anyFailed: !!this.delivery.email.error || !!this.delivery.whatsapp.error
  };
};

/**
 * Static method to get pending invoices for retry
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {Promise<Array>} Pending invoices
 */
InvoiceSchema.statics.getPendingForRetry = async function(maxAttempts = 3) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return await this.find({
    $or: [
      {
        'delivery.email.sent': false,
        'delivery.email.attempts': { $lt: maxAttempts },
        'pdf.generationStatus': 'completed',
        createdAt: { $gte: oneDayAgo }
      },
      {
        'delivery.whatsapp.sent': false,
        'delivery.whatsapp.attempts': { $lt: maxAttempts },
        'pdf.generationStatus': 'completed',
        createdAt: { $gte: oneDayAgo }
      }
    ]
  }).populate('userId', 'name email phone');
};

const Invoice = mongoose.model('Invoice', InvoiceSchema);

module.exports = Invoice;