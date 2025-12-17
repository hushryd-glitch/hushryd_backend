/**
 * Property-based tests for Fare Calculation Service
 * Tests platform fee calculation correctness
 * 
 * **Feature: passenger-ride-search-booking**
 */
const fc = require('fast-check');
const { calculateBookingFare, PLATFORM_FEE } = require('../../src/services/fareCalculation');

// Generators for fare calculation inputs
const farePerSeatArbitrary = fc.integer({ min: 50, max: 5000 }); // ₹50 to ₹5000 per seat
const seatsArbitrary = fc.integer({ min: 1, max: 6 }); // 1 to 6 seats

describe('Fare Calculation Service - Property Tests', () => {
  /**
   * **Feature: passenger-ride-search-booking, Property 5: Platform fee calculation is correct**
   * **Validates: Requirements 4.2, 4.3, 6.1, 6.3**
   * 
   * *For any* fare amount and seat count, the passenger total SHALL equal (farePerSeat × seats) + (15 × seats),
   * and driver net earnings SHALL equal (farePerSeat × seats) - (15 × seats).
   */
  describe('Property 5: Platform fee calculation is correct', () => {
    it('passenger total equals (farePerSeat × seats) + (15 × seats) for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Expected passenger total: (farePerSeat × seats) + (15 × seats)
            const expectedPassengerTotal = (farePerSeat * seats) + (15 * seats);
            
            return result.totalPassengerPays === expectedPassengerTotal;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('driver net earnings equals (farePerSeat × seats) - (15 × seats) for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Expected driver net earnings: (farePerSeat × seats) - (15 × seats)
            const expectedDriverEarnings = (farePerSeat * seats) - (15 * seats);
            
            return result.driverNetEarnings === expectedDriverEarnings;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('base fare equals farePerSeat × seats for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Expected base fare: farePerSeat × seats
            const expectedBaseFare = farePerSeat * seats;
            
            return result.baseFare === expectedBaseFare;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('passenger platform fee equals ₹15 × seats for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Expected passenger platform fee: 15 × seats
            const expectedPassengerFee = 15 * seats;
            
            return result.passengerPlatformFee === expectedPassengerFee;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('driver platform fee equals ₹15 × seats for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Expected driver platform fee: 15 × seats
            const expectedDriverFee = 15 * seats;
            
            return result.driverPlatformFee === expectedDriverFee;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('totalPassengerPays equals baseFare + passengerPlatformFee for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Verify internal consistency
            return result.totalPassengerPays === result.baseFare + result.passengerPlatformFee;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('driverNetEarnings equals baseFare - driverPlatformFee for any valid inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          farePerSeatArbitrary,
          seatsArbitrary,
          async (farePerSeat, seats) => {
            const result = calculateBookingFare(farePerSeat, seats);
            
            // Verify internal consistency
            return result.driverNetEarnings === result.baseFare - result.driverPlatformFee;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('platform fee constants are correctly set to ₹15', () => {
      expect(PLATFORM_FEE.DRIVER_FEE_PER_SEAT).toBe(15);
      expect(PLATFORM_FEE.PASSENGER_FEE_PER_SEAT).toBe(15);
    });
  });
});
