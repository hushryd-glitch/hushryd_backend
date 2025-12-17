/**
 * Property-based tests for Booking Confirmation
 * Tests that booking confirmation creates valid booking records
 * 
 * **Feature: passenger-ride-search-booking**
 */
const fc = require('fast-check');

// Mock the booking service functions for isolated testing
// We test the pure logic of booking state transitions

/**
 * Simulates booking creation with pending status
 * @param {Object} bookingData - Booking input data
 * @returns {Object} Created booking with pending status
 */
const createPendingBooking = (bookingData) => {
  const year = new Date().getFullYear();
  const sequence = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
  const bookingId = `BK-${year}-${sequence}`;
  
  return {
    _id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    bookingId,
    tripId: bookingData.tripId,
    passengerId: bookingData.passengerId,
    seats: bookingData.seats,
    pickupPoint: bookingData.pickupPoint,
    dropPoint: bookingData.dropPoint,
    fare: bookingData.fare,
    status: 'pending',
    paymentStatus: 'pending',
    bookedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  };
};

/**
 * Simulates booking confirmation after payment
 * @param {Object} booking - Pending booking
 * @param {string} paymentId - Payment transaction ID
 * @returns {Object} Confirmed booking
 */
const confirmBookingWithPayment = (booking, paymentId) => {
  if (booking.status !== 'pending') {
    throw new Error('Booking cannot be confirmed in current status');
  }
  
  if (!paymentId) {
    throw new Error('Payment ID is required');
  }
  
  return {
    ...booking,
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentId
  };
};

/**
 * Validates booking ID format: BK-YYYY-NNNNNN
 * @param {string} bookingId - Booking ID to validate
 * @returns {boolean} Whether the format is valid
 */
const isValidBookingIdFormat = (bookingId) => {
  const pattern = /^BK-\d{4}-\d{6}$/;
  return pattern.test(bookingId);
};

// Generators for booking data
const objectIdArbitrary = fc.string({ minLength: 24, maxLength: 24, unit: fc.constantFrom(...'0123456789abcdef'.split('')) });

const locationArbitrary = fc.record({
  address: fc.string({ minLength: 5, maxLength: 50 }),
  coordinates: fc.record({
    lat: fc.double({ min: -90, max: 90, noNaN: true }),
    lng: fc.double({ min: -180, max: 180, noNaN: true })
  })
});

const bookingDataArbitrary = fc.record({
  tripId: objectIdArbitrary,
  passengerId: objectIdArbitrary,
  seats: fc.integer({ min: 1, max: 6 }),
  pickupPoint: locationArbitrary,
  dropPoint: locationArbitrary,
  fare: fc.integer({ min: 50, max: 10000 })
});

const paymentIdArbitrary = fc.string({ minLength: 5, maxLength: 20 })
  .map(s => `PAY-${Date.now()}-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`);

describe('Booking Confirmation - Property Tests', () => {
  /**
   * **Feature: passenger-ride-search-booking, Property 7: Booking confirmation creates valid booking record**
   * **Validates: Requirements 5.3, 5.4**
   * 
   * *For any* successful booking confirmation, a booking record SHALL be created with 
   * status 'pending' and a valid bookingId, and upon payment success the status 
   * SHALL change to 'confirmed'.
   */
  describe('Property 7: Booking confirmation creates valid booking record', () => {
    it('creates booking with pending status and valid bookingId', async () => {
      await fc.assert(
        fc.asyncProperty(
          bookingDataArbitrary,
          async (bookingData) => {
            const booking = createPendingBooking(bookingData);
            
            // Booking should have pending status
            const hasPendingStatus = booking.status === 'pending';
            
            // Booking should have pending payment status
            const hasPendingPayment = booking.paymentStatus === 'pending';
            
            // Booking should have valid bookingId format (BK-YYYY-NNNNNN)
            const hasValidBookingId = isValidBookingIdFormat(booking.bookingId);
            
            // Booking should have all required fields
            const hasRequiredFields = 
              booking._id !== undefined &&
              booking.tripId === bookingData.tripId &&
              booking.passengerId === bookingData.passengerId &&
              booking.seats === bookingData.seats &&
              booking.fare === bookingData.fare &&
              booking.bookedAt instanceof Date;
            
            return hasPendingStatus && hasPendingPayment && hasValidBookingId && hasRequiredFields;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('changes status to confirmed on successful payment', async () => {
      await fc.assert(
        fc.asyncProperty(
          bookingDataArbitrary,
          paymentIdArbitrary,
          async (bookingData, paymentId) => {
            // Create pending booking
            const pendingBooking = createPendingBooking(bookingData);
            
            // Confirm with payment
            const confirmedBooking = confirmBookingWithPayment(pendingBooking, paymentId);
            
            // Status should change to confirmed
            const hasConfirmedStatus = confirmedBooking.status === 'confirmed';
            
            // Payment status should change to paid
            const hasPaidStatus = confirmedBooking.paymentStatus === 'paid';
            
            // Payment ID should be stored
            const hasPaymentId = confirmedBooking.paymentId === paymentId;
            
            // BookingId should remain unchanged
            const bookingIdUnchanged = confirmedBooking.bookingId === pendingBooking.bookingId;
            
            return hasConfirmedStatus && hasPaidStatus && hasPaymentId && bookingIdUnchanged;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves booking data through confirmation', async () => {
      await fc.assert(
        fc.asyncProperty(
          bookingDataArbitrary,
          paymentIdArbitrary,
          async (bookingData, paymentId) => {
            const pendingBooking = createPendingBooking(bookingData);
            const confirmedBooking = confirmBookingWithPayment(pendingBooking, paymentId);
            
            // All original booking data should be preserved
            return (
              confirmedBooking.tripId === bookingData.tripId &&
              confirmedBooking.passengerId === bookingData.passengerId &&
              confirmedBooking.seats === bookingData.seats &&
              confirmedBooking.fare === bookingData.fare &&
              confirmedBooking.pickupPoint.address === bookingData.pickupPoint.address &&
              confirmedBooking.dropPoint.address === bookingData.dropPoint.address
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects confirmation without payment ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          bookingDataArbitrary,
          async (bookingData) => {
            const pendingBooking = createPendingBooking(bookingData);
            
            try {
              confirmBookingWithPayment(pendingBooking, '');
              return false; // Should have thrown
            } catch (error) {
              return error.message === 'Payment ID is required';
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects confirmation of non-pending booking', async () => {
      await fc.assert(
        fc.asyncProperty(
          bookingDataArbitrary,
          paymentIdArbitrary,
          paymentIdArbitrary,
          async (bookingData, paymentId1, paymentId2) => {
            const pendingBooking = createPendingBooking(bookingData);
            
            // First confirmation should succeed
            const confirmedBooking = confirmBookingWithPayment(pendingBooking, paymentId1);
            
            // Second confirmation should fail
            try {
              confirmBookingWithPayment(confirmedBooking, paymentId2);
              return false; // Should have thrown
            } catch (error) {
              return error.message === 'Booking cannot be confirmed in current status';
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('generates unique booking IDs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(bookingDataArbitrary, { minLength: 2, maxLength: 10 }),
          async (bookingDataArray) => {
            const bookings = bookingDataArray.map(data => createPendingBooking(data));
            const bookingIds = bookings.map(b => b.bookingId);
            
            // All booking IDs should be unique
            const uniqueIds = new Set(bookingIds);
            return uniqueIds.size === bookingIds.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
