# Implementation Plan

- [x] 1. Create redirect URL service for auth and profile flows






  - [x] 1.1 Create redirectService utility in frontend/src/lib/redirectService.js

    - Implement setRedirectUrl, getAndClearRedirectUrl, hasRedirectUrl functions
    - Use sessionStorage for temporary redirect URL storage
    - Add URL validation to prevent open redirect vulnerabilities
    - _Requirements: 1.3, 1.4, 3.2, 3.3_
  - [ ]* 1.2 Write property test for redirect URL round trip
    - **Property 1: Redirect URL Storage and Retrieval Round Trip**
    - **Validates: Requirements 1.3, 1.4, 3.2, 3.3**

- [x] 2. Update authentication flow to handle redirects





  - [x] 2.1 Update login page to store redirect URL from query params


    - Read redirect parameter from URL on login page load
    - Store redirect URL using redirectService before auth flow
    - _Requirements: 1.3_

  - [x] 2.2 Update useAuth hook to redirect after authentication

    - Check for stored redirect URL after successful login
    - Validate redirect URL before navigating
    - Fall back to dashboard if redirect URL is invalid
    - _Requirements: 1.4, 1.5_

  - [x] 2.3 Update booking page to redirect unauthenticated users

    - Check auth status on booking page mount
    - Redirect to login with current URL as redirect parameter
    - _Requirements: 1.3_

- [x] 3. Implement profile completion check and redirect flow





  - [x] 3.1 Create profile completion service in frontend/src/lib/profileService.js


    - Implement checkCompletion function to validate required fields
    - Return isComplete boolean and list of missing field issues
    - _Requirements: 3.1, 3.4_
  - [ ]* 3.2 Write property test for profile completion validation
    - **Property 3: Profile Completion Validation**
    - **Validates: Requirements 3.1, 3.4, 3.5**
  - [x] 3.3 Update booking page to check profile completion


    - Fetch user profile on booking page load
    - Display warning with missing fields if profile incomplete
    - Block booking submission for incomplete profiles
    - _Requirements: 3.1, 3.5_
  - [x] 3.4 Update profile page to handle redirect after completion


    - Store redirect URL when navigating from booking page
    - Redirect back to booking page after profile save
    - _Requirements: 3.2, 3.3_

- [ ] 4. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Fix and enhance search filters





  - [x] 5.1 Update backend search service to handle all filter parameters


    - Implement departure time range filtering (before_06, 06_12, 12_18, after_18)
    - Implement amenities filtering with AND logic
    - Ensure sort options work correctly (earliest, lowest_price, shortest)
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [ ]* 5.2 Write property test for filter results correctness
    - **Property 2: Filter Results Correctness**
    - **Validates: Requirements 1.2, 5.1, 5.2, 5.3, 5.5**

  - [x] 5.3 Update FilterPanel component to sync with URL state

    - Ensure filter changes trigger API calls with correct parameters
    - Implement reset functionality to clear all filters
    - _Requirements: 5.4_
  - [ ]* 5.4 Write property test for filter reset idempotence
    - **Property 7: Filter Reset Idempotence**
    - **Validates: Requirements 5.4**

- [x] 6. Enhance breadcrumb navigation across all pages



  - [x] 6.1 Update Breadcrumb component with complete route mappings


    - Add all missing route name mappings
    - Improve dynamic segment detection for various ID formats
    - Handle edge cases for unknown routes
    - _Requirements: 4.1, 4.3, 4.4_
  - [ ]* 6.2 Write property test for breadcrumb generation
    - **Property 4: Breadcrumb Generation from Path**
    - **Validates: Requirements 4.1, 4.3, 4.4**
  - [x] 6.3 Add breadcrumb to all pages missing it



    - Audit all pages and add Breadcrumb component where missing
    - Ensure consistent styling and positioning
    - _Requirements: 4.1, 4.2_

  - [x] 6.4 Implement breadcrumb visibility logic for home page
    - Hide breadcrumb when on home page (path === '/')
    - _Requirements: 4.5_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update dashboard to display all bookings





  - [x] 8.1 Update dashboard page to fetch and display all upcoming bookings


    - Fetch bookings from API on dashboard load
    - Display bookings sorted by departure time (soonest first)
    - Show empty state when no bookings exist
    - _Requirements: 2.1, 2.3, 2.5, 6.1, 6.2_
  - [ ]* 8.2 Write property test for booking display ordering
    - **Property 5: Booking Display Ordering**
    - **Validates: Requirements 2.3, 6.4**

  - [x] 8.3 Implement "Upcoming Soon" indicator for bookings within 24 hours

    - Calculate time difference from current time to departure
    - Display indicator when within 24 hours
    - _Requirements: 6.5_
  - [ ]* 8.4 Write property test for upcoming soon indicator
    - **Property 6: Upcoming Soon Indicator**
    - **Validates: Requirements 6.5**

  - [x] 8.5 Add search functionality to dashboard

    - Add search form/link on dashboard
    - Navigate to search page with parameters when searching
    - _Requirements: 2.2_

- [x] 9. Implement booking status updates on dashboard






  - [x] 9.1 Update dashboard to reflect booking status changes

    - Fetch latest booking data on dashboard load
    - Display correct status badges for each booking
    - _Requirements: 6.3_

  - [x] 9.2 Add navigation from booking card to booking details

    - Implement click handler on booking cards
    - Navigate to correct booking/trip details page
    - _Requirements: 2.4_

- [ ] 10. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
