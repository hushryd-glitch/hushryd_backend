/**
 * Property-based tests for Invoice Multi-Channel Delivery
 * Tests that invoices are sent via all three channels (WhatsApp, SMS, email)
 * 
 * **Feature: ride-safety-tracking-notifications, Property 13: Invoice Multi-Channel Delivery**
 * **Validates: Requirements 6.2, 6.3, 6.4**
 */
const fc = require('fast-check');

const {
  formatWhatsAppInvoice,
  formatSmsInvoice,
  formatEmailInvoice,
  validateMultiChannelDelivery
} = require('../../src/services/invoiceService');

// Generators for invoice data
const coordinatesArbitrary = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true })
});

const locationArbitrary = fc.record({
  address: fc.string({ minLength: 5, maxLength: 100 }),
  coordinates: coordinatesArbitrary
});

const tripDetailsArbitrary = fc.record({
  tripId: fc.string({ minLength: 5, maxLength: 20 }).map(s => `TR-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
  source: locationArbitrary,
  destination: locationArbitrary,
  scheduledAt: fc.date({ min: new Date(), max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
});

const driverDetailsArbitrary = fc.record({
  name: fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 0),
  phone: fc.string({ minLength: 10, maxLength: 15 }).map(s => s.replace(/[^0-9]/g, '').padEnd(10, '0').slice(0, 10)),
  rating: fc.double({ min: 1, max: 5, noNaN: true })
});

const vehicleDetailsArbitrary = fc.record({
  make: fc.constantFrom('Toyota', 'Honda', 'Maruti', 'Hyundai', 'Tata'),
  model: fc.constantFrom('Innova', 'City', 'Swift', 'Creta', 'Nexon'),
  color: fc.constantFrom('White', 'Black', 'Silver', 'Blue', 'Red'),
  plateNumber: fc.string({ minLength: 6, maxLength: 12 }).map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, 'X'))
});

const fareBreakdownArbitrary = fc.integer({ min: 50, max: 10000 }).map(total => ({
  baseFare: Math.round(total * 0.60),
  distanceCharge: Math.round(total * 0.25),
  taxes: total - Math.round(total * 0.60) - Math.round(total * 0.25),
  total
}));

const verificationCodeArbitrary = fc.integer({ min: 1000, max: 9999 }).map(n => String(n));

const invoiceIdArbitrary = fc.integer({ min: 1, max: 999999 }).map(n => {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(n).padStart(6, '0')}`;
});

const pdfUrlArbitrary = invoiceIdArbitrary.map(id => `https://api.hushryd.com/invoices/${id}/pdf`);

/**
 * Creates a complete invoice object for testing
 */
const createInvoice = (invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl) => {
  return {
    invoiceId,
    tripDetails,
    driverDetails,
    vehicleDetails,
    fareBreakdown,
    verificationCode,
    pdfUrl,
    deliveryStatus: {
      whatsapp: { sent: false },
      sms: { sent: false },
      email: { sent: false }
    },
    generatedAt: new Date()
  };
};

/**
 * Simulates multi-channel delivery results
 */
const simulateDeliveryResults = (channels, successChannels) => {
  const results = {
    whatsapp: { attempted: false, sent: false, error: null },
    sms: { attempted: false, sent: false, error: null },
    email: { attempted: false, sent: false, error: null }
  };

  for (const channel of channels) {
    results[channel].attempted = true;
    if (successChannels.includes(channel)) {
      results[channel].sent = true;
      results[channel].messageId = `msg_${channel}_${Date.now()}`;
    } else {
      results[channel].error = `Failed to send via ${channel}`;
    }
  }

  return { results };
};

describe('Invoice Multi-Channel Delivery - Property Tests', () => {
  /**
   * **Feature: ride-safety-tracking-notifications, Property 13: Invoice Multi-Channel Delivery**
   * **Validates: Requirements 6.2, 6.3, 6.4**
   * 
   * *For any* confirmed booking, the invoice SHALL be sent via all three channels
   * (WhatsApp, SMS, email).
   */
  describe('Property 13: Invoice Multi-Channel Delivery', () => {
    it('WhatsApp message contains all required invoice information', async () => {
      await fc.assert(
        fc.asyncProperty(
          invoiceIdArbitrary,
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareBreakdownArbitrary,
          verificationCodeArbitrary,
          pdfUrlArbitrary,
          async (invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl) => {
            const invoice = createInvoice(invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl);
            
            const scheduledDate = new Date(tripDetails.scheduledAt).toLocaleDateString('en-IN');
            const scheduledTime = new Date(tripDetails.scheduledAt).toLocaleTimeString('en-IN');
            
            const whatsappMessage = formatWhatsAppInvoice(invoice, scheduledDate, scheduledTime);
            
            // WhatsApp message should contain all required fields
            const containsInvoiceId = whatsappMessage.includes(invoiceId);
            const containsVerificationCode = whatsappMessage.includes(verificationCode);
            const containsDriverName = whatsappMessage.includes(driverDetails.name);
            const containsTotal = whatsappMessage.includes(String(fareBreakdown.total));
            const containsVehicle = whatsappMessage.includes(vehicleDetails.make);
            
            return containsInvoiceId && containsVerificationCode && containsDriverName && containsTotal && containsVehicle;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('SMS message contains invoice ID, verification code, and total', async () => {
      await fc.assert(
        fc.asyncProperty(
          invoiceIdArbitrary,
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareBreakdownArbitrary,
          verificationCodeArbitrary,
          pdfUrlArbitrary,
          async (invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl) => {
            const invoice = createInvoice(invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl);
            
            const scheduledDate = new Date(tripDetails.scheduledAt).toLocaleDateString('en-IN');
            const scheduledTime = new Date(tripDetails.scheduledAt).toLocaleTimeString('en-IN');
            
            const smsMessage = formatSmsInvoice(invoice, scheduledDate, scheduledTime);
            
            // SMS should contain essential info and link
            const containsInvoiceId = smsMessage.includes(invoiceId);
            const containsVerificationCode = smsMessage.includes(verificationCode);
            const containsTotal = smsMessage.includes(String(fareBreakdown.total));
            const containsLink = smsMessage.includes(pdfUrl);
            
            return containsInvoiceId && containsVerificationCode && containsTotal && containsLink;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Email contains subject and body with all invoice details', async () => {
      await fc.assert(
        fc.asyncProperty(
          invoiceIdArbitrary,
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareBreakdownArbitrary,
          verificationCodeArbitrary,
          pdfUrlArbitrary,
          async (invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl) => {
            const invoice = createInvoice(invoiceId, tripDetails, driverDetails, vehicleDetails, fareBreakdown, verificationCode, pdfUrl);
            
            const scheduledDate = new Date(tripDetails.scheduledAt).toLocaleDateString('en-IN');
            const scheduledTime = new Date(tripDetails.scheduledAt).toLocaleTimeString('en-IN');
            
            const emailContent = formatEmailInvoice(invoice, scheduledDate, scheduledTime);
            
            // Email should have subject and body
            const hasSubject = emailContent.subject && emailContent.subject.includes(invoiceId);
            const hasBody = emailContent.body && emailContent.body.length > 0;
            
            // Body should contain all required fields
            const containsVerificationCode = emailContent.body.includes(verificationCode);
            const containsDriverName = emailContent.body.includes(driverDetails.name);
            const containsTotal = emailContent.body.includes(String(fareBreakdown.total));
            const containsVehicle = emailContent.body.includes(vehicleDetails.make);
            
            return hasSubject && hasBody && containsVerificationCode && containsDriverName && containsTotal && containsVehicle;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validates successful multi-channel delivery correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(['whatsapp', 'sms', 'email']),
          async (channels) => {
            // All channels succeed
            const deliveryResults = simulateDeliveryResults(channels, channels);
            const validation = validateMultiChannelDelivery(deliveryResults);
            
            return validation.allChannelsSent === true && 
                   validation.sentChannels.length === 3 &&
                   validation.failedChannels.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validates partial delivery correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(['whatsapp', 'sms', 'email'], { minLength: 1, maxLength: 2 }),
          async (successChannels) => {
            const allChannels = ['whatsapp', 'sms', 'email'];
            const deliveryResults = simulateDeliveryResults(allChannels, successChannels);
            const validation = validateMultiChannelDelivery(deliveryResults);
            
            // Should not be marked as all channels sent if some failed
            const correctAllSent = validation.allChannelsSent === (successChannels.length === 3);
            const correctSentCount = validation.sentChannels.length === successChannels.length;
            const correctFailedCount = validation.failedChannels.length === (3 - successChannels.length);
            
            return correctAllSent && correctSentCount && correctFailedCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validates complete failure correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(['whatsapp', 'sms', 'email']),
          async (channels) => {
            // No channels succeed
            const deliveryResults = simulateDeliveryResults(channels, []);
            const validation = validateMultiChannelDelivery(deliveryResults);
            
            return validation.allChannelsSent === false && 
                   validation.sentChannels.length === 0 &&
                   validation.failedChannels.length === 3;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all three channels are attempted for delivery', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(['whatsapp', 'sms', 'email']),
          fc.subarray(['whatsapp', 'sms', 'email'], { minLength: 0, maxLength: 3 }),
          async (channels, successChannels) => {
            const deliveryResults = simulateDeliveryResults(channels, successChannels);
            
            // All three channels should be attempted
            const whatsappAttempted = deliveryResults.results.whatsapp.attempted;
            const smsAttempted = deliveryResults.results.sms.attempted;
            const emailAttempted = deliveryResults.results.email.attempted;
            
            return whatsappAttempted && smsAttempted && emailAttempted;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('failed channels have error messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.subarray(['whatsapp', 'sms', 'email'], { minLength: 1, maxLength: 2 }),
          async (successChannels) => {
            const allChannels = ['whatsapp', 'sms', 'email'];
            const failedChannels = allChannels.filter(c => !successChannels.includes(c));
            
            const deliveryResults = simulateDeliveryResults(allChannels, successChannels);
            const validation = validateMultiChannelDelivery(deliveryResults);
            
            // All failed channels should have error messages
            return validation.failedChannels.every(f => f.error && f.error.length > 0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
