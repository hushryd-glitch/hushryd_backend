/**
 * Property-based tests for Invoice Content Completeness
 * Tests that generated invoices contain all required fields
 * 
 * **Feature: ride-safety-tracking-notifications, Property 12: Invoice Content Completeness**
 * **Validates: Requirements 6.1, 6.6**
 */
const fc = require('fast-check');

const {
  calculateFareBreakdown,
  generateVerificationCode,
  validateInvoiceCompleteness
} = require('../../src/services/invoiceService');

// Generators for invoice data
const objectIdArbitrary = fc.string({ minLength: 24, maxLength: 24, unit: fc.constantFrom(...'0123456789abcdef'.split('')) });

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

const fareArbitrary = fc.integer({ min: 50, max: 10000 });

const verificationCodeArbitrary = fc.integer({ min: 1000, max: 9999 }).map(n => String(n));

/**
 * Generate a mock ObjectId string
 */
const generateMockObjectId = () => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

/**
 * Creates a complete invoice object for testing
 */
const createInvoice = (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
  const fareBreakdown = calculateFareBreakdown(fare);
  const year = new Date().getFullYear();
  const sequence = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
  
  return {
    invoiceId: `INV-${year}-${sequence}`,
    bookingId: generateMockObjectId(),
    tripDetails,
    fareBreakdown,
    driverDetails,
    vehicleDetails,
    verificationCode,
    deliveryStatus: {
      whatsapp: { sent: false },
      sms: { sent: false },
      email: { sent: false }
    },
    generatedAt: new Date()
  };
};

describe('Invoice Content Completeness - Property Tests', () => {
  /**
   * **Feature: ride-safety-tracking-notifications, Property 12: Invoice Content Completeness**
   * **Validates: Requirements 6.1, 6.6**
   * 
   * *For any* generated invoice, the invoice SHALL contain trip details, fare breakdown,
   * driver details, vehicle information, and verification code.
   */
  describe('Property 12: Invoice Content Completeness', () => {
    it('generated invoice contains all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Validate completeness using the service function
            const validation = validateInvoiceCompleteness(invoice);
            
            // Invoice should be complete with no missing fields
            return validation.isComplete && validation.missingFields.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invoice contains trip details with source and destination', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Trip details should contain tripId, source, and destination
            const hasTripId = invoice.tripDetails.tripId !== undefined;
            const hasSource = invoice.tripDetails.source?.address !== undefined;
            const hasDestination = invoice.tripDetails.destination?.address !== undefined;
            const hasScheduledAt = invoice.tripDetails.scheduledAt !== undefined;
            
            return hasTripId && hasSource && hasDestination && hasScheduledAt;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invoice contains fare breakdown with total', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Fare breakdown should contain baseFare, distanceCharge, taxes, and total
            const hasBaseFare = invoice.fareBreakdown.baseFare !== undefined;
            const hasDistanceCharge = invoice.fareBreakdown.distanceCharge !== undefined;
            const hasTaxes = invoice.fareBreakdown.taxes !== undefined;
            const hasTotal = invoice.fareBreakdown.total !== undefined;
            
            // Total should equal the sum of components
            const totalIsCorrect = invoice.fareBreakdown.total === fare;
            
            return hasBaseFare && hasDistanceCharge && hasTaxes && hasTotal && totalIsCorrect;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invoice contains driver details', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Driver details should contain name, phone, and rating
            const hasName = invoice.driverDetails.name !== undefined && invoice.driverDetails.name.length > 0;
            const hasPhone = invoice.driverDetails.phone !== undefined;
            const hasRating = invoice.driverDetails.rating !== undefined;
            
            return hasName && hasPhone && hasRating;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invoice contains vehicle information', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Vehicle details should contain make, model, color, and plateNumber
            const hasMake = invoice.vehicleDetails.make !== undefined;
            const hasModel = invoice.vehicleDetails.model !== undefined;
            const hasColor = invoice.vehicleDetails.color !== undefined;
            const hasPlateNumber = invoice.vehicleDetails.plateNumber !== undefined;
            
            return hasMake && hasModel && hasColor && hasPlateNumber;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invoice contains verification code', async () => {
      await fc.assert(
        fc.asyncProperty(
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Verification code should be present and be 4 digits
            const hasVerificationCode = invoice.verificationCode !== undefined;
            const isValidFormat = /^\d{4}$/.test(invoice.verificationCode);
            
            return hasVerificationCode && isValidFormat;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fare breakdown components sum to total', async () => {
      await fc.assert(
        fc.asyncProperty(
          fareArbitrary,
          async (fare) => {
            const breakdown = calculateFareBreakdown(fare);
            
            // Sum of components should equal total
            const sum = breakdown.baseFare + breakdown.distanceCharge + breakdown.taxes;
            
            return sum === breakdown.total && breakdown.total === fare;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('generated verification code is 4 digits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          async () => {
            const code = generateVerificationCode();
            
            // Code should be exactly 4 digits
            const isValidFormat = /^\d{4}$/.test(code);
            const numericValue = parseInt(code, 10);
            const isInRange = numericValue >= 1000 && numericValue <= 9999;
            
            return isValidFormat && isInRange;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validates incomplete invoice correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('tripDetails', 'fareBreakdown', 'driverDetails', 'vehicleDetails', 'verificationCode'),
          tripDetailsArbitrary,
          driverDetailsArbitrary,
          vehicleDetailsArbitrary,
          fareArbitrary,
          verificationCodeArbitrary,
          async (fieldToRemove, tripDetails, driverDetails, vehicleDetails, fare, verificationCode) => {
            const invoice = createInvoice(tripDetails, driverDetails, vehicleDetails, fare, verificationCode);
            
            // Remove one required field
            delete invoice[fieldToRemove];
            
            // Validation should detect the missing field
            const validation = validateInvoiceCompleteness(invoice);
            
            return !validation.isComplete && validation.missingFields.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
