# Implementation Plan

- [-] 1. Set up demo mode infrastructure




  - [x] 1.1 Create demo configuration service with persistence

    - Create `src/services/demo/demoConfig.js` with enable/disable functions
    - Implement AsyncStorage persistence for demo mode state
    - Add demo role (passenger/driver) management
    - _Requirements: 1.1, 1.4_
  - [ ]* 1.2 Write property test for demo mode persistence
    - **Property 3: Demo mode persistence round-trip**
    - **Validates: Requirements 1.4**

  - [x] 1.3 Create demo state manager for in-memory state


    - Create `src/services/demo/demoStateManager.js`
    - Implement bookings and trips Maps
    - Add CRUD operations for demo entities
    - _Requirements: 4.4, 5.3_
  - [ ]* 1.4 Write property test for data referential integrity
    - **Property 13: Data referential integrity**
    - **Validates: Requirements 4.4**

- [x] 2. Implement mock data generators





  - [x] 2.1 Create Indian market data constants


    - Create `src/services/demo/mockData/indianData.js`
    - Add Indian cities with coordinates
    - Add Indian names (first and last)
    - Add Indian vehicle makes and models
    - _Requirements: 4.1, 4.2, 4.5_
  - [ ]* 2.2 Write property tests for Indian market data
    - **Property 10: Generated names are from Indian name pool**
    - **Property 11: Generated coordinates are within India bounds**
    - **Property 14: Generated vehicles are from Indian market**
    - **Validates: Requirements 4.1, 4.2, 4.5**
  - [x] 2.3 Create trip generator


    - Create `src/services/demo/mockData/tripGenerator.js`
    - Generate trips with valid required fields
    - Use Indian cities for source/destination
    - Calculate realistic distances and durations
    - _Requirements: 2.1, 2.2, 4.2_
  - [ ]* 2.4 Write property test for trip generation
    - **Property 4: Generated trips have valid required fields**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 2.5 Create booking generator


    - Create `src/services/demo/mockData/bookingGenerator.js`
    - Generate 4-digit PINs
    - Calculate fare breakdown
    - _Requirements: 2.3, 3.4_
  - [ ]* 2.6 Write property test for booking generation
    - **Property 5: Generated bookings have valid PIN and fare**
    - **Validates: Requirements 2.3**
  - [x] 2.7 Create user/driver generator


    - Create `src/services/demo/mockData/userGenerator.js`
    - Generate passenger and driver profiles
    - Include vehicle details for drivers
    - _Requirements: 4.1, 5.1, 5.2_

- [x] 3. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement mock API interceptor





  - [x] 4.1 Create mock API interceptor wrapper





    - Create `src/services/demo/mockApiInterceptor.js`
    - Wrap existing API client methods
    - Route to mock handlers when demo mode enabled
    - _Requirements: 1.1, 1.3_
  - [ ]* 4.2 Write property tests for API routing
    - **Property 1: Demo mode routing intercepts API calls**
    - **Property 2: Demo mode disabled passes through to real API**
    - **Validates: Requirements 1.1, 1.3**

  - [x] 4.3 Implement mock auth handlers

    - Create `src/services/demo/handlers/authHandlers.js`
    - Handle OTP request (return OTP in response)
    - Handle OTP verification (create demo session)
    - Handle logout (clear session)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 4.4 Write property tests for auth handlers
    - **Property 17: OTP request returns valid OTP**
    - **Property 18: OTP verification creates session**
    - **Property 19: Logout clears session**
    - **Property 20: Phone number format acceptance**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 4.5 Implement mock search handlers

    - Create `src/services/demo/handlers/searchHandlers.js`
    - Handle ride search with filters
    - Handle trip details retrieval
    - _Requirements: 2.1, 2.2_

  - [x] 4.6 Implement mock booking handlers

    - Create `src/services/demo/handlers/bookingHandlers.js`
    - Handle booking creation
    - Handle booking confirmation
    - Handle booking list retrieval
    - Handle booking cancellation
    - _Requirements: 2.3, 2.4, 2.5, 3.4_
  - [ ]* 4.7 Write property test for booking confirmation
    - **Property 6: Booking confirmation updates status**
    - **Validates: Requirements 2.4**

  - [x] 4.8 Implement mock trip handlers (driver)

    - Create `src/services/demo/handlers/tripHandlers.js`
    - Handle trip creation
    - Handle trip list retrieval
    - Handle trip start with PIN verification
    - Handle trip completion
    - _Requirements: 3.2, 3.3, 3.5, 3.6_
  - [ ]* 4.9 Write property tests for trip handlers
    - **Property 7: Trip creation generates unique IDs**
    - **Property 8: PIN validation correctness**
    - **Property 9: Trip completion updates status and earnings**
    - **Validates: Requirements 3.2, 3.5, 3.6**

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement fare calculation and error handling





  - [x] 6.1 Integrate production fare calculation


    - Import fare calculation logic from backend
    - Create `src/services/demo/fareCalculation.js`
    - Ensure mock fares match production
    - _Requirements: 4.3_
  - [ ]* 6.2 Write property test for fare calculation
    - **Property 12: Mock fare calculation matches production**
    - **Validates: Requirements 4.3**

  - [x] 6.3 Implement error scenario triggers

    - Create `src/services/demo/errorScenarios.js`
    - Map phone numbers to error types
    - Handle full trip booking error
    - Handle invalid PIN error
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 6.4 Write property tests for error scenarios
    - **Property 21: Error phone numbers trigger errors**
    - **Property 22: Full trip booking returns error**
    - **Property 23: Invalid PIN returns error**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 7. Implement role switching and state isolation






  - [x] 7.1 Implement role switching logic

    - Add role switch function to demoConfig
    - Maintain separate state per role
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 7.2 Write property tests for role switching
    - **Property 15: Role-specific login returns appropriate data**
    - **Property 16: Role switching maintains state isolation**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 8. Integrate demo mode into app






  - [x] 8.1 Update API client to use interceptor

    - Modify `src/services/api/client.js` to check demo mode
    - Route through mock interceptor when enabled
    - _Requirements: 1.1, 1.3_

  - [x] 8.2 Add demo mode indicator component

    - Create `src/components/common/DemoModeIndicator.jsx`
    - Show floating badge when demo mode active
    - _Requirements: 1.2_

  - [x] 8.3 Add demo mode to root layout

    - Update `app/_layout.jsx` to include indicator
    - Initialize demo mode on app start
    - _Requirements: 1.2_

  - [x] 8.4 Update auth screens for demo mode

    - Show OTP directly in demo mode
    - Add role selection for demo login
    - _Requirements: 6.1, 5.1, 5.2_

- [x] 9. Implement mock location tracking






  - [x] 9.1 Create mock location service

    - Create `src/services/demo/handlers/locationHandlers.js`
    - Generate simulated location updates
    - Interpolate between source and destination
    - _Requirements: 2.6, 7.2_

  - [x] 9.2 Integrate with tracking components

    - Update LiveTracking to use mock locations in demo mode
    - Emit updates every 5 seconds
    - _Requirements: 2.6, 7.2_

- [x] 10. Add demo mode toggle and seed data






  - [x] 10.1 Create demo mode settings screen

    - Add toggle in profile/settings
    - Show current demo role
    - Add role switch button
    - _Requirements: 1.1, 5.4_

  - [x] 10.2 Seed initial demo data

    - Create `src/services/demo/seedData.js`
    - Pre-populate trips for search
    - Pre-populate bookings for passenger
    - Pre-populate driver trips
    - _Requirements: 2.1, 2.5, 3.3_

- [ ] 11. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
