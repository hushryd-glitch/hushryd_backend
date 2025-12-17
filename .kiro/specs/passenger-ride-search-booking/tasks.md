# Implementation Plan

- [x] 1. Enhance search API response with complete driver and trip information




  - [x] 1.1 Update searchService.js to include driver verification status, instantBooking, and ladiesOnly flags in response


    - Add driver.verified field from verificationStatus
    - Include instantBooking and ladiesOnly from trip document
    - Ensure all required fields are present in formatted response
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [x] 1.2 Write property test for search results containing required fields

    - **Property 2: Search results contain required driver and trip fields**
    - **Validates: Requirements 1.2, 1.4, 1.5**

  - [x] 1.3 Write property test for search results only containing bookable trips

    - **Property 1: Search results only contain bookable trips**
    - **Validates: Requirements 1.1**

- [x] 2. Create fare calculation utility with platform fee logic





  - [x] 2.1 Create fareCalculation.js utility in backend/src/services


    - Implement calculateBookingFare(farePerSeat, seats) function
    - Return baseFare, passengerPlatformFee (₹15/seat), totalPassengerPays
    - Return driverPlatformFee (₹15/seat), driverNetEarnings
    - _Requirements: 4.2, 4.3, 6.1, 6.3_
  - [x] 2.2 Write property test for platform fee calculation


    - **Property 5: Platform fee calculation is correct**
    - **Validates: Requirements 4.2, 4.3, 6.1, 6.3**

- [x] 3. Create badge computation utility






  - [x] 3.1 Create badgeUtils.js utility in frontend/src/lib

    - Implement computeBadges(trip) function
    - Return array of badge strings based on trip flags
    - Implement getBadgeStyle(badge) for distinct colors
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Write property test for badge computation

    - **Property 3: Badge computation is consistent with trip flags**
    - **Validates: Requirements 2.1, 2.2, 2.3**
- [x] 4. Checkpoint - Make sure all tests are passing









- [ ] 4. Checkpoint - Make sure all tests are passing

  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Enhance RideCard component with driver details and badges






  - [x] 5.1 Update RideCard.jsx to display comprehensive driver information

    - Show driver photo, name, rating with stars, total trips
    - Display fare per seat with ₹ currency symbol
    - Show departure time, pickup/drop locations
    - Show available seats and vehicle details
    - Display "Full" with disabled button when availableSeats is 0
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 5.2 Add badge display to RideCard
    - Use computeBadges utility to get badges
    - Display ID Verified, Instant Booking, Ladies Only badges
    - Apply distinct colors using getBadgeStyle
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
- [x] 6. Update SearchResults component to use enhanced RideCard





- [ ] 6. Update SearchResults component to use enhanced RideCard

  - [x] 6.1 Update SearchResults.jsx to pass all required props to RideCard

    - Pass complete trip data including driver, vehicle, badges
    - Handle click navigation to trip details page
    - _Requirements: 1.1, 3.1_

- [x] 7. Create FareBreakdown component for booking flow







  - [x] 7.1 Create FareBreakdown.jsx component in frontend/src/components/passenger





    - Display base fare (farePerSeat × seats)
    - Display platform fee (₹15 × seats) with clear label
    - Display total amount with calculation
    - Update dynamically when seat count changes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Update trip details page with complete information






  - [x] 8.1 Enhance trips/[id]/page.js to show complete trip details

    - Display route with pickup and drop addresses
    - Show driver profile with photo, name, rating, trips, verification
    - Show vehicle information (type, make, model, color)
    - Display scheduled date/time in user-friendly format
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 8.2 Write property test for trip details containing complete information

    - **Property 4: Trip details contain complete information**
    - **Validates: Requirements 3.2, 3.3, 3.5**

- [x] 9. Enhance booking flow with fare breakdown and seat validation





  - [x] 9.1 Update BookingForm.jsx to include FareBreakdown component


    - Integrate FareBreakdown with seat selection
    - Update fare display when seats change
    - _Requirements: 4.4, 5.1_

  - [x] 9.2 Add seat validation to booking service

    - Validate selected seats <= available seats
    - Return appropriate error for overbooking attempts
    - _Requirements: 5.2, 5.5_

  - [x] 9.3 Write property test for seat validation

    - **Property 6: Seat validation prevents overbooking**
    - **Validates: Requirements 5.2, 5.5**

- [x] 10. Update booking confirmation flow





  - [x] 10.1 Ensure booking creates pending record and confirms on payment


    - Create booking with status 'pending'
    - Update to 'confirmed' on successful payment
    - Display success message with booking reference
    - _Requirements: 5.3, 5.4_
  - [x] 10.2 Write property test for booking confirmation

    - **Property 7: Booking confirmation creates valid booking record**
    - **Validates: Requirements 5.3, 5.4**

- [x] 11. Update driver earnings display with platform fee deduction






  - [x] 11.1 Update EarningsView.jsx to show fee breakdown

    - Display gross fare, platform fee deduction (₹15/seat), net earnings
    - Use fareCalculation utility for consistent calculations
    - _Requirements: 6.2_

- [x] 12. Checkpoint - Make sure all tests are passing





  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Final integration and testing






  - [x] 13.1 End-to-end flow verification

    - Test search → view details → book → payment flow
    - Verify fare calculations at each step
    - Verify driver earnings reflect correct deductions
    - _Requirements: All_
