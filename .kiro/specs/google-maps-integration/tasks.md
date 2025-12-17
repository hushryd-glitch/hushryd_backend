# Implementation Plan

- [x] 1. Update document eligibility to exclude KYC





  - [x] 1.1 Modify REQUIRED_DOCUMENT_TYPES in tripService.js


    - Change from `['license', 'registration', 'insurance', 'kyc']` to `['license', 'registration', 'insurance']`
    - Update checkDriverDocumentEligibility to use new list
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Update REQUIRED_DOCUMENT_TYPES in documentService.js


    - Ensure consistency with tripService.js
    - Update evaluateDriverVerificationStatus to exclude KYC from required checks
    - _Requirements: 9.1, 9.2_
  - [ ]* 1.3 Write property test for vehicle documents only eligibility
    - **Property 3: Vehicle Documents Only for Ride Posting Eligibility**
    - **Validates: Requirements 9.1, 9.2, 9.4**

- [x] 2. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create RoutePreviewMap component





  - [x] 3.1 Create RoutePreviewMap.jsx component


    - Accept source and destination coordinates as props
    - Initialize Google Maps with markers for pickup and drop-off
    - Use Directions API to calculate and display route
    - _Requirements: 6.1, 6.2_
  - [x] 3.2 Add distance and duration display to RoutePreviewMap


    - Extract distance and duration from Directions API response
    - Display formatted distance (km) and duration (mins/hours)
    - Call onRouteCalculated callback with route data
    - _Requirements: 6.3_

  - [x] 3.3 Add error handling for route calculation failures





    - Display error message when route cannot be calculated
    - Show fallback text-based route information
    - _Requirements: 6.4_
  - [ ]* 3.4 Write property test for route preview data completeness
    - **Property 2: Route Preview Data Completeness**
    - **Validates: Requirements 6.3**

- [x] 4. Integrate RoutePreviewMap in TripCreator





  - [x] 4.1 Add RoutePreviewMap to TripCreator component


    - Display map when both source and destination are selected
    - Pass coordinates from LocationAutocomplete selections
    - _Requirements: 6.1_

  - [x] 4.2 Store route data in trip creation

    - Save distance, duration, and polyline from route calculation
    - Include route data in createTrip API call
    - _Requirements: 4.2, 6.2, 6.3_

- [x] 5. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integrate RoutePreviewMap in passenger views





  - [x] 6.1 Add RoutePreviewMap to TripDetails component


    - Display route map when viewing ride details
    - Show pickup and drop-off markers
    - _Requirements: 8.2_

  - [x] 6.2 Add RoutePreviewMap to SearchResults component

    - Display map showing available ride routes
    - _Requirements: 7.4_

- [x] 7. Update frontend document requirements display





  - [x] 7.1 Update DocumentUpload component


    - Show only license, registration, insurance as required
    - Mark KYC as optional
    - _Requirements: 9.3_


  - [x] 7.2 Update driver dashboard eligibility message





    - Update message to reflect vehicle docs only requirement
    - _Requirements: 9.3_

- [x] 8. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 9. Write property test for location selection
  - [ ]* 9.1 Write property test for location data persistence
    - **Property 1: Location Selection Data Persistence**
    - **Validates: Requirements 5.2, 5.4**

- [ ]* 10. Write unit tests for edge cases
  - [ ]* 10.1 Write unit tests for document eligibility
    - Test with KYC approved, pending, rejected, missing
    - Verify eligibility based only on vehicle docs
    - _Requirements: 9.1, 9.2, 9.4_
  - [ ]* 10.2 Write unit tests for RoutePreviewMap
    - Test with valid coordinates
    - Test with invalid coordinates
    - Test error handling
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 11. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

