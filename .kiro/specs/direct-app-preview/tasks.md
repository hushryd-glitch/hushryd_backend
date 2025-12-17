# Implementation Plan

- [x] 1. Create Preview Data Service with Mock Data






  - [x] 1.1 Create previewDataService.js with mock user and 3 mock rides

    - Create `mobile-app/src/services/preview/previewDataService.js`
    - Define fake user with complete profile (name, phone, email, emergency contacts)
    - Create 3 realistic mock rides with different routes, drivers, prices
    - Include mock booking and tracking data generators
    - _Requirements: 1.2, 3.1, 3.2_
  - [ ]* 1.2 Write property test for fake user completeness
    - **Property 2: Fake User Completeness**
    - **Validates: Requirements 1.2**
  - [ ]* 1.3 Write property test for mock ride data completeness
    - **Property 3: Mock Ride Data Completeness**
    - **Validates: Requirements 3.2**

- [x] 2. Modify App Entry Point for Direct Navigation





  - [x] 2.1 Update app/index.jsx to skip auth and go directly to tabs


    - Remove onboarding and auth checks
    - Always redirect to `/(tabs)` route
    - Initialize preview user on app start
    - _Requirements: 1.1, 1.3_

  - [x] 2.2 Update app/_layout.jsx to skip profile completeness check

    - Remove profile completion redirect logic
    - Keep notification and demo mode setup
    - _Requirements: 1.3_
  - [ ]* 2.3 Write property test for direct navigation
    - **Property 1: Direct Navigation**
    - **Validates: Requirements 1.1, 1.3**

- [x] 3. Update Home/Search Tab with Mock Rides






  - [x] 3.1 Update search screen to display 3 mock rides by default

    - Import preview data service
    - Show mock rides on initial load without search
    - Keep search functionality working with mock data
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.2 Ensure ride cards display all required information

    - Verify driver name, photo, rating shown
    - Verify route, time, price, seats displayed
    - _Requirements: 3.2_

- [x] 4. Implement Booking Flow with Mock Data






  - [x] 4.1 Update booking screen to work with mock ride data

    - Load mock ride by ID from preview service
    - Display fare breakdown with mock calculations
    - _Requirements: 4.1_

  - [x] 4.2 Implement booking confirmation simulation

    - Simulate payment success on confirm
    - Generate mock booking with OTP
    - Add booking to preview service state
    - _Requirements: 4.2, 4.3_
  - [ ]* 4.3 Write property test for booking state persistence
    - **Property 4: Booking State Persistence**
    - **Validates: Requirements 4.3**

- [x] 5. Update Your Rides Tab with Mock Bookings






  - [x] 5.1 Update bookings screen to show mock bookings

    - Display bookings from preview service
    - Show booking status, ride details, OTP
    - Enable navigation to tracking screen
    - _Requirements: 4.3, 5.1_

- [x] 6. Implement Live Tracking with Mock Data






  - [x] 6.1 Update tracking screen with simulated driver location

    - Display mock driver location on map
    - Show route progress and ETA
    - Include driver info card
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 6.2 Write property test for tracking data completeness
    - **Property 5: Tracking Data Completeness**
    - **Validates: Requirements 5.2**

- [x] 7. Implement SOS Feature Simulation





  - [x] 7.1 Ensure SOS button is visible on tracking screen


    - Display accessible SOS button

    - _Requirements: 6.1_
  - [x] 7.2 Update SOS screen to simulate emergency without real calls

    - Show emergency screen with contact options
    - Simulate notification sent without actual calls
    - _Requirements: 6.2, 6.3_

- [x] 8. Update Profile Tab with Fake User Data






  - [x] 8.1 Update profile screen to display fake user

    - Show name, phone, email, photo
    - Display rating and ride count
    - Show wallet balance and subscription status
    - _Requirements: 9.1, 9.2_


  - [x] 8.2 Enable profile editing simulation





    - Allow form edits
    - Simulate save success
    - _Requirements: 9.3_

- [x] 9. Implement Driver Features





  - [x] 9.1 Update Post Ride tab with trip creation form





    - Display trip creation form

    - Include route, time, seats, price inputs
    - _Requirements: 8.1_
  - [x] 9.2 Implement form validation and ride posting simulation

    - Validate all required fields
    - Simulate ride creation success
    - _Requirements: 8.2, 8.3_
  - [ ]* 9.3 Write property test for trip form validation
    - **Property 6: Trip Form Validation**
    - **Validates: Requirements 8.2**


  - [x] 9.4 Update KYC screen for driver document upload simulation





    - Show document upload options (license, RC, insurance, photo)
    - Simulate upload success
    - Update KYC status display
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 10. Update Inbox Tab with Mock Messages






  - [x] 10.1 Display mock notifications/messages

    - Show sample booking confirmations
    - Show sample ride updates
    - _Requirements: 2.3_

- [ ] 11. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
