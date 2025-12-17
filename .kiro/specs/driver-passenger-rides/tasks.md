# Implementation Plan

## Phase 1: Driver Registration & Onboarding

- [x] 1. Implement driver registration backend

  - [x] 1.1 Create driver registration service


    - Implement registerDriver function with validation
    - Handle personal details and initial driver record creation
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Create vehicle management service

    - Implement addVehicle function
    - Validate registration number, make, model, year, seats
    - _Requirements: 1.3_
  - [x] 1.3 Extend document service for driver documents


    - Add driver-specific document types handling
    - Link documents to driver record
    - _Requirements: 1.4_
  - [ ]* 1.4 Write property test for driver onboarding status
    - **Property 1: Driver Onboarding Status Transition**
    - **Validates: Requirements 1.5**
  - [ ]* 1.5 Write property test for driver verification
    - **Property 2: Driver Verification Enables Rides**
    - **Validates: Requirements 1.6**
  - [x] 1.6 Create driver registration API endpoints


    - POST /api/driver/register
    - POST /api/driver/vehicle
    - GET /api/driver/status
    - _Requirements: 1.1, 1.2, 1.3, 1.5_


- [ ] 2. Implement driver registration frontend
  - [x] 2.1 Create RegistrationForm component


    - Multi-step form with progress indicator
    - Personal details step
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Create VehicleForm component

    - Vehicle details input with validation
    - _Requirements: 1.3_

  - [x] 2.3 Create DocumentUpload component for drivers

    - Upload interface for required documents
    - _Requirements: 1.4_

  - [x] 2.4 Create driver registration pages

    - /driver/register route
    - /driver/onboarding route
    - _Requirements: 1.1, 1.5_


- [x] 3. Checkpoint - Ensure all tests pass


  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Driver Dashboard & Trip Management

- [x] 4. Implement trip management backend




  - [x] 4.1 Create trip service

    - Implement createTrip with validation
    - Implement getDriverTrips with filters
    - _Requirements: 2.2, 2.3_
  - [ ]* 4.2 Write property test for trip creation
    - **Property 3: Trip Creation Data Integrity**
    - **Validates: Requirements 2.2**

  - [x] 4.3 Implement trip start service
    - OTP verification for trip start
    - Status transition to 'in_progress'
    - _Requirements: 2.4_
  - [ ]* 4.4 Write property test for trip start
    - **Property 4: Trip Start Status Transition**
    - **Validates: Requirements 2.4**

  - [x] 4.5 Implement trip completion service
    - Status update and payment trigger
    - _Requirements: 2.5_
  - [ ]* 4.6 Write property test for trip completion
    - **Property 5: Trip Completion Triggers Payment**

    - **Validates: Requirements 2.5**
  - [x] 4.7 Create driver earnings service
    - Calculate total earnings
    - Get transaction history
    - _Requirements: 2.6_
  - [ ]* 4.8 Write property test for earnings
    - **Property 6: Earnings Consistency**
    - **Validates: Requirements 2.6**

  - [x] 4.9 Create trip management API endpoints


    - POST /api/trips
    - GET /api/driver/trips
    - PUT /api/trips/:id/start
    - PUT /api/trips/:id/complete
    - GET /api/driver/earnings
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 5. Implement driver dashboard frontend





  - [x] 5.1 Create Dashboard component


    - Overview with stats cards
    - Upcoming trips list
    - _Requirements: 2.1_

  - [x] 5.2 Create TripCreator component

    - Form for creating new trips
    - Source/destination picker
    - _Requirements: 2.2_
  - [x] 5.3 Create TripManager component


    - List of driver's trips
    - Start/complete trip actions
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 5.4 Create EarningsView component

    - Earnings summary
    - Transaction history table
    - _Requirements: 2.6_

  - [x] 5.5 Create driver dashboard pages

    - /driver/dashboard route
    - /driver/trips route
    - /driver/earnings route
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

- [x] 6. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Ride Search & Matching

- [x] 7. Implement search backend






  - [x] 7.1 Create ride search service

    - Geo-based search with radius matching
    - Filter by date, seats, vehicle type
    - _Requirements: 4.1, 4.3_
  - [ ]* 7.2 Write property test for geo-search
    - **Property 10: Geo-Search Radius Matching**
    - **Validates: Requirements 4.1**

  - [x] 7.3 Implement search result sorting

    - Sort by departure time, fare, rating
    - _Requirements: 4.2_
  - [ ]* 7.4 Write property test for sorting
    - **Property 11: Search Result Sorting**
    - **Validates: Requirements 4.2**
  - [ ]* 7.5 Write property test for search results
    - **Property 7: Search Results Completeness**
    - **Validates: Requirements 3.2**

  - [x] 7.6 Create search API endpoints

    - GET /api/search/rides
    - GET /api/trips/:id (public trip details)
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

- [x] 8. Implement search frontend




  - [x] 8.1 Create RideSearch component

    - Search form with location inputs
    - Date and seat selection
    - _Requirements: 3.1_
  - [x] 8.2 Create SearchResults component


    - Trip cards with key info
    - Sort and filter controls
    - _Requirements: 3.2, 4.2, 4.3_
  - [x] 8.3 Create TripDetails component


    - Full trip information
    - Book button
    - _Requirements: 3.3_


  - [x] 8.4 Create search pages

    - /search route
    - /trips/:id route
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Passenger Booking

- [x] 10. Implement booking backend





  - [x] 10.1 Create Booking model


    - BookingSchema with all fields
    - Indexes for efficient queries
    - _Requirements: 3.4, 3.5_

  - [x] 10.2 Create booking service

    - Implement createBooking with seat reservation
    - Implement getPassengerBookings
    - _Requirements: 3.4, 3.6_
  - [ ]* 10.3 Write property test for seat reservation
    - **Property 8: Booking Seat Reservation**
    - **Validates: Requirements 3.4**
  - [ ]* 10.4 Write property test for overbooking prevention
    - **Property 12: Overbooking Prevention**
    - **Validates: Requirements 4.5**


  - [x] 10.5 Implement booking confirmation
    - Payment integration
    - Booking reference generation
    - _Requirements: 3.5_
  - [ ]* 10.6 Write property test for booking confirmation
    - **Property 9: Booking Confirmation on Payment**

    - **Validates: Requirements 3.5**
  - [x] 10.7 Create booking API endpoints

    - POST /api/bookings
    - GET /api/bookings
    - GET /api/bookings/:id
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 11. Implement booking frontend





  - [x] 11.1 Create BookingForm component


    - Seat selection
    - Pickup/drop point selection
    - _Requirements: 3.4_

  - [x] 11.2 Create BookingConfirmation component

    - Booking summary
    - Payment button
    - _Requirements: 3.5_


  - [x] 11.3 Create MyBookings component
    - List of passenger bookings
    - Status filters

    - _Requirements: 3.6_
  - [x] 11.4 Create booking pages

    - /book/:tripId route
    - /bookings route
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 12. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: Cancellation & Ratings

- [x] 13. Implement cancellation and ratings





  - [x] 13.1 Create cancellation service


    - Passenger cancellation with refund policy
    - Driver cancellation with full refunds
    - _Requirements: 6.1, 6.2_
  - [ ]* 13.2 Write property test for passenger cancellation
    - **Property 13: Passenger Cancellation Refund**
    - **Validates: Requirements 6.1**
  - [ ]* 13.3 Write property test for driver cancellation
    - **Property 14: Driver Cancellation Full Refund**
    - **Validates: Requirements 6.2**


  - [x] 13.4 Create rating service
    - Submit rating and feedback
    - Calculate average ratings
    - _Requirements: 6.4_
  - [ ]* 13.5 Write property test for ratings
    - **Property 15: Rating Storage**
    - **Validates: Requirements 6.4**
  - [x] 13.6 Create cancellation and rating API endpoints


    - DELETE /api/bookings/:id
    - DELETE /api/trips/:id
    - POST /api/bookings/:id/rating
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 14. Implement cancellation and rating frontend


  - [x] 14.1 Create CancelBooking component
    - Cancellation confirmation
    - Refund info display
    - _Requirements: 6.1_
  - [x] 14.2 Create RatingForm component
    - Star rating input

    - Feedback textarea
    - _Requirements: 6.4_
  - [x] 14.3 Create TripHistory component

    - Past trips list
    - Rating display
    - _Requirements: 6.3_

- [x] 15. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

## Phase 6: Real-time Tracking

- [x] 16. Implement real-time tracking



  - [x] 16.1 Extend WebSocket service for tracking


    - Driver location broadcasts
    - Passenger subscription to trip
    - _Requirements: 5.1, 5.2_

  - [x] 16.2 Implement ETA calculation

    - Calculate and broadcast ETA updates
    - _Requirements: 5.3_

  - [x] 16.3 Implement proximity notifications
    - Notify when driver approaches pickup

    - _Requirements: 5.4_
  - [x] 16.4 Create tracking API endpoints


    - GET /api/trips/:id/tracking
    - WebSocket events for location updates
    - _Requirements: 5.1, 5.2, 5.5_

- [x] 17. Implement tracking frontend


  - [x] 17.1 Create LiveTracking component
    - Map with driver location
    - ETA display
    - _Requirements: 5.1, 5.3_

  - [x] 17.2 Create DriverInfo component
    - Driver details during tracking
    - Contact options
    - _Requirements: 5.5_

  - [x] 17.3 Create tracking page


    - /track/:bookingId route
    - _Requirements: 5.1, 5.5_


- [x] 18. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
