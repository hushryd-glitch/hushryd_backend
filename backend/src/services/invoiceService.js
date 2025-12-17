/**
 * Invoice Service
 * Implements invoice generation and multi-channel delivery for bookings
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const User = require('../models/User');

/**
 * Generate invoice for a confirmed booking
 * Creates invoice with all required fields: trip details, fare breakdown,
 * driver details, vehicle information, and verification code
 * 
 * Requirements: 6.1, 6.6
 * 
 * @param {string} bookingId - Booking ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Generated invoice
 */
const generateInvoice = async (bookingId) => {
  // Find booking
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Check if invoice already exists for this booking
  const existingInvoice = await Invoice.findOne({ bookingId: booking._id });
  if (existingInvoice) {
    return { success: true, invoice: existingInvoice, existing: true };
  }

  // Get trip details with driver and vehicle info
  const trip = await Trip.findById(booking.tripId)
    .populate({
      path: 'driver',
      select: 'userId vehicles rating',
      populate: {
        path: 'userId',
        select: 'name phone'
      }
    });

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Get passenger details
  const passenger = await User.findById(booking.passengerId);
  if (!passenger) {
    const error = new Error('Passenger not found');
    error.code = 'PASSENGER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Generate invoice ID
  const invoiceId = await Invoice.generateInvoiceId();

  // Extract driver details
  const driverDetails = {
    name: trip.driver?.userId?.name || 'Driver',
    phone: trip.driver?.userId?.phone || 'N/A',
    rating: trip.driver?.rating || 0
  };

  // Extract vehicle details
  let vehicleDetails = {
    make: 'N/A',
    model: 'N/A',
    color: 'N/A',
    plateNumber: 'N/A'
  };

  if (trip.driver?.vehicles && trip.vehicle) {
    const vehicle = trip.driver.vehicles.find(v => 
      v._id.toString() === trip.vehicle.toString()
    );
    if (vehicle) {
      vehicleDetails = {
        make: vehicle.make || 'N/A',
        model: vehicle.model || 'N/A',
        color: vehicle.color || 'N/A',
        plateNumber: vehicle.plateNumber || vehicle.registrationNumber || 'N/A'
      };
    }
  }

  // Calculate fare breakdown
  const totalFare = booking.fare || 0;
  const fareBreakdown = calculateFareBreakdown(totalFare);

  // Create invoice
  const invoice = new Invoice({
    invoiceId,
    bookingId: booking._id,
    tripDetails: {
      tripId: trip.tripId,
      source: {
        address: trip.source?.address || booking.pickupPoint?.address,
        coordinates: trip.source?.coordinates || booking.pickupPoint?.coordinates
      },
      destination: {
        address: trip.destination?.address || booking.dropPoint?.address,
        coordinates: trip.destination?.coordinates || booking.dropPoint?.coordinates
      },
      scheduledAt: trip.scheduledAt
    },
    fareBreakdown,
    driverDetails,
    vehicleDetails,
    verificationCode: booking.verificationCode || booking.passengerPIN || generateVerificationCode(),
    deliveryStatus: {
      whatsapp: { sent: false },
      sms: { sent: false },
      email: { sent: false }
    },
    generatedAt: new Date()
  });

  // Generate PDF URL (in production, this would generate actual PDF)
  invoice.pdfUrl = generatePdfUrl(invoice.invoiceId);

  await invoice.save();

  return {
    success: true,
    invoice,
    existing: false
  };
};

/**
 * Calculate fare breakdown from total fare
 * @param {number} totalFare - Total fare amount
 * @returns {Object} Fare breakdown with baseFare, distanceCharge, taxes, total
 */
const calculateFareBreakdown = (totalFare) => {
  // Calculate breakdown (approximate percentages)
  // Base fare: 60%, Distance charge: 25%, Taxes: 15%
  const baseFare = Math.round(totalFare * 0.60);
  const distanceCharge = Math.round(totalFare * 0.25);
  const taxes = totalFare - baseFare - distanceCharge;

  return {
    baseFare,
    distanceCharge,
    taxes,
    total: totalFare
  };
};

/**
 * Generate 4-digit verification code
 * @returns {string} 4-digit code
 */
const generateVerificationCode = () => {
  return String(Math.floor(1000 + Math.random() * 9000));
};

/**
 * Generate PDF URL for invoice
 * In production, this would generate actual PDF and upload to S3
 * @param {string} invoiceId - Invoice ID
 * @returns {string} PDF URL
 */
const generatePdfUrl = (invoiceId) => {
  const baseUrl = process.env.API_BASE_URL || 'https://api.hushryd.com';
  return `${baseUrl}/invoices/${invoiceId}/pdf`;
};

/**
 * Generate PDF content for invoice (HTML template)
 * @param {Object} invoice - Invoice document
 * @returns {string} HTML content for PDF generation
 */
const generatePdfContent = (invoice) => {
  const scheduledDate = invoice.tripDetails.scheduledAt 
    ? new Date(invoice.tripDetails.scheduledAt).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'N/A';
  
  const scheduledTime = invoice.tripDetails.scheduledAt
    ? new Date(invoice.tripDetails.scheduledAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'N/A';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>HushRyd Invoice - ${invoice.invoiceId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
    .invoice-id { font-size: 14px; color: #666; margin-top: 5px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .label { color: #666; }
    .value { font-weight: 500; }
    .fare-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .fare-table td { padding: 8px; border-bottom: 1px solid #eee; }
    .fare-table .total { font-weight: bold; border-top: 2px solid #333; }
    .verification-code { text-align: center; background: #f0f0f0; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .code { font-size: 24px; font-weight: bold; color: #4F46E5; letter-spacing: 4px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">HushRyd</div>
    <div class="invoice-id">Invoice: ${invoice.invoiceId}</div>
    <div class="invoice-id">Generated: ${new Date(invoice.generatedAt).toLocaleString('en-IN')}</div>
  </div>

  <div class="section">
    <div class="section-title">Trip Details</div>
    <div class="row"><span class="label">Trip ID:</span><span class="value">${invoice.tripDetails.tripId || 'N/A'}</span></div>
    <div class="row"><span class="label">From:</span><span class="value">${invoice.tripDetails.source?.address || 'N/A'}</span></div>
    <div class="row"><span class="label">To:</span><span class="value">${invoice.tripDetails.destination?.address || 'N/A'}</span></div>
    <div class="row"><span class="label">Date:</span><span class="value">${scheduledDate}</span></div>
    <div class="row"><span class="label">Time:</span><span class="value">${scheduledTime}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Driver Details</div>
    <div class="row"><span class="label">Name:</span><span class="value">${invoice.driverDetails.name}</span></div>
    <div class="row"><span class="label">Phone:</span><span class="value">${invoice.driverDetails.phone}</span></div>
    <div class="row"><span class="label">Rating:</span><span class="value">${invoice.driverDetails.rating ? invoice.driverDetails.rating.toFixed(1) + ' ⭐' : 'N/A'}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Vehicle Details</div>
    <div class="row"><span class="label">Vehicle:</span><span class="value">${invoice.vehicleDetails.make} ${invoice.vehicleDetails.model}</span></div>
    <div class="row"><span class="label">Color:</span><span class="value">${invoice.vehicleDetails.color}</span></div>
    <div class="row"><span class="label">Plate Number:</span><span class="value">${invoice.vehicleDetails.plateNumber}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Fare Breakdown</div>
    <table class="fare-table">
      <tr><td class="label">Base Fare</td><td class="value">₹${invoice.fareBreakdown.baseFare}</td></tr>
      <tr><td class="label">Distance Charge</td><td class="value">₹${invoice.fareBreakdown.distanceCharge}</td></tr>
      <tr><td class="label">Taxes & Fees</td><td class="value">₹${invoice.fareBreakdown.taxes}</td></tr>
      <tr class="total"><td>Total</td><td>₹${invoice.fareBreakdown.total}</td></tr>
    </table>
  </div>

  <div class="verification-code">
    <div>Your Verification Code</div>
    <div class="code">${invoice.verificationCode}</div>
    <div style="font-size: 12px; color: #666; margin-top: 5px;">Share this code with your driver when boarding</div>
  </div>

  <div class="footer">
    <p>Thank you for choosing HushRyd!</p>
    <p>For support, contact us at support@hushryd.com</p>
  </div>
</body>
</html>`;
};

/**
 * Get invoice by ID
 * @param {string} invoiceId - Invoice ID (MongoDB ObjectId or human-readable)
 * @returns {Promise<Object>} Invoice document
 */
const getInvoice = async (invoiceId) => {
  const invoice = await Invoice.findByInvoiceId(invoiceId);
  if (!invoice) {
    const error = new Error('Invoice not found');
    error.code = 'INVOICE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
  return { success: true, invoice };
};

/**
 * Get invoice by booking ID
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Invoice document
 */
const getInvoiceByBooking = async (bookingId) => {
  const booking = await Booking.findByBookingId(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const invoice = await Invoice.findOne({ bookingId: booking._id });
  if (!invoice) {
    const error = new Error('Invoice not found for this booking');
    error.code = 'INVOICE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  return { success: true, invoice };
};

/**
 * Validate invoice content completeness
 * Checks that invoice contains all required fields per Requirements 6.1, 6.6
 * 
 * @param {Object} invoice - Invoice object to validate
 * @returns {Object} Validation result with isComplete and missingFields
 */
const validateInvoiceCompleteness = (invoice) => {
  const missingFields = [];

  // Check trip details
  if (!invoice.tripDetails) {
    missingFields.push('tripDetails');
  } else {
    if (!invoice.tripDetails.tripId) missingFields.push('tripDetails.tripId');
    if (!invoice.tripDetails.source?.address) missingFields.push('tripDetails.source.address');
    if (!invoice.tripDetails.destination?.address) missingFields.push('tripDetails.destination.address');
  }

  // Check fare breakdown
  if (!invoice.fareBreakdown) {
    missingFields.push('fareBreakdown');
  } else {
    if (invoice.fareBreakdown.total === undefined) missingFields.push('fareBreakdown.total');
  }

  // Check driver details
  if (!invoice.driverDetails) {
    missingFields.push('driverDetails');
  } else {
    if (!invoice.driverDetails.name) missingFields.push('driverDetails.name');
  }

  // Check vehicle details
  if (!invoice.vehicleDetails) {
    missingFields.push('vehicleDetails');
  }

  // Check verification code
  if (!invoice.verificationCode) {
    missingFields.push('verificationCode');
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields
  };
};

/**
 * Send invoice via multiple channels (WhatsApp, SMS, Email)
 * Requirements: 6.2, 6.3, 6.4
 * 
 * @param {Object} invoice - Invoice document
 * @param {Array} channels - Array of channels to send via ['whatsapp', 'sms', 'email']
 * @returns {Promise<Object>} Delivery results for each channel
 */
const sendInvoice = async (invoice, channels = ['whatsapp', 'sms', 'email']) => {
  // Get booking and passenger details
  const booking = await Booking.findById(invoice.bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.code = 'BOOKING_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const passenger = await User.findById(booking.passengerId);
  if (!passenger) {
    const error = new Error('Passenger not found');
    error.code = 'PASSENGER_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const results = {
    whatsapp: { attempted: false, sent: false, error: null },
    sms: { attempted: false, sent: false, error: null },
    email: { attempted: false, sent: false, error: null }
  };

  // Format date and time for messages
  const scheduledDate = invoice.tripDetails.scheduledAt 
    ? new Date(invoice.tripDetails.scheduledAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : 'N/A';
  
  const scheduledTime = invoice.tripDetails.scheduledAt
    ? new Date(invoice.tripDetails.scheduledAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'N/A';

  // Send via WhatsApp (Requirements: 6.2)
  if (channels.includes('whatsapp') && passenger.phone) {
    results.whatsapp.attempted = true;
    try {
      const whatsappService = require('./whatsappService').getInstance();
      const whatsappMessage = formatWhatsAppInvoice(invoice, scheduledDate, scheduledTime);
      
      const whatsappResult = await whatsappService.send(
        passenger.phone,
        { body: whatsappMessage },
        [{ type: 'pdf', url: invoice.pdfUrl, name: `HushRyd-Invoice-${invoice.invoiceId}.pdf` }]
      );
      
      results.whatsapp.sent = true;
      results.whatsapp.messageId = whatsappResult.messageId;
      
      // Update invoice delivery status
      invoice.deliveryStatus.whatsapp = {
        sent: true,
        sentAt: new Date(),
        messageId: whatsappResult.messageId
      };
    } catch (error) {
      results.whatsapp.error = error.message;
      invoice.deliveryStatus.whatsapp = {
        sent: false,
        error: error.message
      };
    }
  }

  // Send via SMS with short link (Requirements: 6.3)
  if (channels.includes('sms') && passenger.phone) {
    results.sms.attempted = true;
    try {
      const twilioService = require('./twilioService').getInstance();
      const smsMessage = formatSmsInvoice(invoice, scheduledDate, scheduledTime);
      
      const smsResult = await twilioService.send(
        passenger.phone,
        { body: smsMessage }
      );
      
      results.sms.sent = true;
      results.sms.messageId = smsResult.messageId;
      
      // Update invoice delivery status
      invoice.deliveryStatus.sms = {
        sent: true,
        sentAt: new Date(),
        messageId: smsResult.messageId
      };
    } catch (error) {
      results.sms.error = error.message;
      invoice.deliveryStatus.sms = {
        sent: false,
        error: error.message
      };
    }
  }

  // Send via Email with PDF attachment (Requirements: 6.4)
  if (channels.includes('email') && passenger.email) {
    results.email.attempted = true;
    try {
      const sendgridService = require('./sendgridService').getInstance();
      const emailContent = formatEmailInvoice(invoice, scheduledDate, scheduledTime);
      
      // Generate PDF content as base64 (simplified - in production would use PDF library)
      const pdfHtml = generatePdfContent(invoice);
      const pdfBase64 = Buffer.from(pdfHtml).toString('base64');
      
      const emailResult = await sendgridService.send(
        passenger.email,
        emailContent,
        [{ 
          content: pdfBase64, 
          name: `HushRyd-Invoice-${invoice.invoiceId}.pdf`,
          type: 'application/pdf'
        }]
      );
      
      results.email.sent = true;
      results.email.messageId = emailResult.messageId;
      
      // Update invoice delivery status
      invoice.deliveryStatus.email = {
        sent: true,
        sentAt: new Date(),
        messageId: emailResult.messageId
      };
    } catch (error) {
      results.email.error = error.message;
      invoice.deliveryStatus.email = {
        sent: false,
        error: error.message
      };
    }
  }

  // Save updated delivery status
  await invoice.save();

  return {
    success: true,
    invoiceId: invoice.invoiceId,
    results,
    channelsSent: Object.values(results).filter(r => r.sent).length,
    totalChannels: channels.length
  };
};

/**
 * Format invoice for WhatsApp message
 * @param {Object} invoice - Invoice document
 * @param {string} scheduledDate - Formatted date
 * @param {string} scheduledTime - Formatted time
 * @returns {string} WhatsApp message body
 */
const formatWhatsAppInvoice = (invoice, scheduledDate, scheduledTime) => {
  return `🧾 *HushRyd Booking Invoice*

📋 Invoice: ${invoice.invoiceId}
🔐 *Verification Code: ${invoice.verificationCode}*

📍 *Trip Details*
From: ${invoice.tripDetails.source?.address || 'N/A'}
To: ${invoice.tripDetails.destination?.address || 'N/A'}
📅 Date: ${scheduledDate}
⏰ Time: ${scheduledTime}

👤 *Driver*
Name: ${invoice.driverDetails.name}
Phone: ${invoice.driverDetails.phone}

🚗 *Vehicle*
${invoice.vehicleDetails.make} ${invoice.vehicleDetails.model} (${invoice.vehicleDetails.color})
Plate: ${invoice.vehicleDetails.plateNumber}

💰 *Fare Breakdown*
Base Fare: ₹${invoice.fareBreakdown.baseFare}
Distance: ₹${invoice.fareBreakdown.distanceCharge}
Taxes: ₹${invoice.fareBreakdown.taxes}
*Total: ₹${invoice.fareBreakdown.total}*

Thank you for choosing HushRyd! 🙏`;
};

/**
 * Format invoice for SMS message (short version with link)
 * @param {Object} invoice - Invoice document
 * @param {string} scheduledDate - Formatted date
 * @param {string} scheduledTime - Formatted time
 * @returns {string} SMS message body
 */
const formatSmsInvoice = (invoice, scheduledDate, scheduledTime) => {
  return `HushRyd Invoice ${invoice.invoiceId}. Code: ${invoice.verificationCode}. ${invoice.tripDetails.source?.address || 'Pickup'} to ${invoice.tripDetails.destination?.address || 'Drop'} on ${scheduledDate} ${scheduledTime}. Total: ₹${invoice.fareBreakdown.total}. View: ${invoice.pdfUrl}`;
};

/**
 * Format invoice for Email
 * @param {Object} invoice - Invoice document
 * @param {string} scheduledDate - Formatted date
 * @param {string} scheduledTime - Formatted time
 * @returns {Object} Email content with subject and body
 */
const formatEmailInvoice = (invoice, scheduledDate, scheduledTime) => {
  return {
    subject: `HushRyd Booking Invoice - ${invoice.invoiceId}`,
    body: `Dear Passenger,

Your booking invoice is attached.

Invoice ID: ${invoice.invoiceId}
Verification Code: ${invoice.verificationCode}

Trip Details:
- From: ${invoice.tripDetails.source?.address || 'N/A'}
- To: ${invoice.tripDetails.destination?.address || 'N/A'}
- Date: ${scheduledDate}
- Time: ${scheduledTime}

Driver: ${invoice.driverDetails.name}
Vehicle: ${invoice.vehicleDetails.make} ${invoice.vehicleDetails.model} (${invoice.vehicleDetails.color})
Plate: ${invoice.vehicleDetails.plateNumber}

Fare Breakdown:
- Base Fare: ₹${invoice.fareBreakdown.baseFare}
- Distance Charge: ₹${invoice.fareBreakdown.distanceCharge}
- Taxes & Fees: ₹${invoice.fareBreakdown.taxes}
- Total: ₹${invoice.fareBreakdown.total}

Please share your verification code (${invoice.verificationCode}) with the driver when boarding.

Thank you for choosing HushRyd!

Best regards,
HushRyd Team`
  };
};

/**
 * Validate that invoice was sent via all required channels
 * Requirements: 6.2, 6.3, 6.4
 * 
 * @param {Object} deliveryResults - Results from sendInvoice
 * @returns {Object} Validation result
 */
const validateMultiChannelDelivery = (deliveryResults) => {
  const requiredChannels = ['whatsapp', 'sms', 'email'];
  const sentChannels = [];
  const failedChannels = [];

  for (const channel of requiredChannels) {
    const result = deliveryResults.results[channel];
    if (result.attempted) {
      if (result.sent) {
        sentChannels.push(channel);
      } else {
        failedChannels.push({ channel, error: result.error });
      }
    }
  }

  return {
    allChannelsSent: sentChannels.length === requiredChannels.length,
    sentChannels,
    failedChannels,
    totalAttempted: sentChannels.length + failedChannels.length
  };
};

/**
 * Generate and send invoice on booking confirmation
 * Integrates invoice generation with booking confirmation flow
 * Handles delivery failures with retry logic
 * 
 * Requirements: 6.1, 6.5
 * 
 * @param {string} bookingId - Booking ID
 * @param {Object} options - Options for invoice generation and delivery
 * @returns {Promise<Object>} Invoice generation and delivery results
 */
const generateAndSendInvoice = async (bookingId, options = {}) => {
  const { maxRetries = 3, retryDelay = 5000 } = options;
  
  // Step 1: Generate invoice
  let invoiceResult;
  try {
    invoiceResult = await generateInvoice(bookingId);
  } catch (error) {
    console.error(`[Invoice] Failed to generate invoice for booking ${bookingId}:`, error.message);
    return {
      success: false,
      stage: 'generation',
      error: error.message
    };
  }

  const invoice = invoiceResult.invoice;

  // Step 2: Send invoice via all channels with retry logic
  const channels = ['whatsapp', 'sms', 'email'];
  let deliveryResult;
  let retryCount = 0;
  let failedChannels = channels;

  while (failedChannels.length > 0 && retryCount < maxRetries) {
    try {
      deliveryResult = await sendInvoice(invoice, failedChannels);
      
      // Check which channels failed
      const validation = validateMultiChannelDelivery(deliveryResult);
      failedChannels = validation.failedChannels.map(f => f.channel);
      
      if (failedChannels.length > 0 && retryCount < maxRetries - 1) {
        console.log(`[Invoice] Retrying failed channels: ${failedChannels.join(', ')} (attempt ${retryCount + 2}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      console.error(`[Invoice] Delivery attempt ${retryCount + 1} failed:`, error.message);
    }
    
    retryCount++;
  }

  // Log final delivery status
  const finalValidation = deliveryResult ? validateMultiChannelDelivery(deliveryResult) : null;
  
  if (finalValidation && finalValidation.failedChannels.length > 0) {
    console.warn(`[Invoice] Some channels failed after ${maxRetries} attempts:`, 
      finalValidation.failedChannels.map(f => `${f.channel}: ${f.error}`).join(', '));
  }

  return {
    success: true,
    invoiceId: invoice.invoiceId,
    bookingId,
    generation: {
      success: true,
      existing: invoiceResult.existing
    },
    delivery: deliveryResult ? {
      channelsSent: deliveryResult.channelsSent,
      totalChannels: deliveryResult.totalChannels,
      results: deliveryResult.results,
      retryAttempts: retryCount
    } : null
  };
};

/**
 * Retry failed invoice deliveries
 * Can be called by a background job to retry failed deliveries
 * 
 * Requirements: 6.5
 * 
 * @param {string} invoiceId - Invoice ID to retry
 * @param {Array} channels - Specific channels to retry (optional)
 * @returns {Promise<Object>} Retry results
 */
const retryInvoiceDelivery = async (invoiceId, channels = null) => {
  const invoice = await Invoice.findByInvoiceId(invoiceId);
  if (!invoice) {
    const error = new Error('Invoice not found');
    error.code = 'INVOICE_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  // Determine which channels to retry
  const channelsToRetry = channels || [];
  
  if (!channels) {
    // Retry channels that haven't been sent successfully
    if (!invoice.deliveryStatus.whatsapp?.sent) channelsToRetry.push('whatsapp');
    if (!invoice.deliveryStatus.sms?.sent) channelsToRetry.push('sms');
    if (!invoice.deliveryStatus.email?.sent) channelsToRetry.push('email');
  }

  if (channelsToRetry.length === 0) {
    return {
      success: true,
      invoiceId: invoice.invoiceId,
      message: 'All channels already delivered successfully',
      channelsRetried: []
    };
  }

  const deliveryResult = await sendInvoice(invoice, channelsToRetry);
  
  return {
    success: true,
    invoiceId: invoice.invoiceId,
    channelsRetried: channelsToRetry,
    results: deliveryResult.results
  };
};

module.exports = {
  generateInvoice,
  calculateFareBreakdown,
  generateVerificationCode,
  generatePdfUrl,
  generatePdfContent,
  getInvoice,
  getInvoiceByBooking,
  validateInvoiceCompleteness,
  sendInvoice,
  formatWhatsAppInvoice,
  formatSmsInvoice,
  formatEmailInvoice,
  validateMultiChannelDelivery,
  generateAndSendInvoice,
  retryInvoiceDelivery
};
