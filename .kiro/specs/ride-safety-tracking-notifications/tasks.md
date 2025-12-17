# Implementation Plan

- [x] 1. Set up OTP SMS delivery with Twilio






  - [x] 1.1 Extend otpService.js to integrate with Twilio for real SMS delivery

    - Add sendSMS method that calls twilioService
    - Implement phone number formatting for Indian numbers (+91)
    - Add delivery status tracking
    - _Requirements: 1.1, 1.5_

  - [x] 1.2 Write property test for OTP generation format

    - **Property 1: OTP Generation Format**
    - **Validates: Requirements 1.1**
  - [x] 1.3 Implement phone number masking utility

    - Create maskPhoneNumber function showing last 4 digits
    - Handle various phone number formats
    - _Requirements: 1.2_

  - [x] 1.4 Write property test for phone number masking

    - **Property 2: Phone Number Masking**
    - **Validates: Requirements 1.2**
  - [x] 1.5 Implement SMS retry mechanism

    - Add retry logic with 3 attempts and 10-second intervals
    - Log each attempt and final status
    - _Requirements: 1.3, 1.4_

  - [x] 1.6 Write property test for retry mechanism

    - **Property 3: Retry Mechanism Limit**
    - **Validates: Requirements 1.3**

- [x] 2. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement live location sharing for drivers





  - [x] 3.1 Create LocationShare model


    - Define schema with tripId, userId, contacts, isActive, lastLocation
    - Add indexes for efficient queries
    - _Requirements: 2.1, 2.2_
  - [x] 3.2 Create locationSharingService.js


    - Implement startSharing with contact limit validation (max 5)
    - Implement updateLocation to broadcast to contacts
    - Implement stopSharing for trip end cleanup
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  - [x] 3.3 Write property test for contact limit


    - **Property 4: Location Sharing Contact Limit**
    - **Validates: Requirements 2.2**
  - [x] 3.4 Extend socketService.js for location broadcasts


    - Add broadcastToContacts method
    - Implement contact-specific tracking rooms
    - _Requirements: 2.3, 2.4_
  - [x] 3.5 Write property test for broadcast completeness


    - **Property 5: Location Broadcast Completeness**
    - **Validates: Requirements 2.3, 3.3**
  - [x] 3.6 Implement trip end cleanup


    - Auto-stop sharing when trip ends
    - Notify all contacts of trip completion
    - _Requirements: 2.5_
  - [x] 3.7 Write property test for trip end cleanup


    - **Property 7: Trip End Cleanup**
    - **Validates: Requirements 2.5, 3.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement live location sharing for passengers





  - [x] 5.1 Extend locationSharingService for passenger sharing


    - Add passenger-specific sharing flow
    - Generate shareable tracking URLs
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 Create public tracking endpoint

    - Implement /track/share/:token route
    - Return passenger location, driver details, vehicle info
    - _Requirements: 3.5_

  - [x] 5.3 Write property test for tracking data completeness

    - **Property 6: Tracking Data Completeness**
    - **Validates: Requirements 3.5**
  - [x] 5.4 Send tracking links to emergency contacts


    - Send via SMS and WhatsApp when sharing enabled
    - Include tracking URL and trip details
    - _Requirements: 3.2_

- [x] 6. Implement super admin live tracking dashboard





  - [x] 6.1 Create admin tracking API endpoints


    - GET /admin/trips/active - List all active trips with locations
    - GET /admin/trips/:id/details - Get trip details with driver, passengers, route
    - _Requirements: 4.1, 4.3_

  - [x] 6.2 Write property test for admin trip visibility

    - **Property 8: Admin Dashboard Trip Visibility**
    - **Validates: Requirements 4.1**
  - [x] 6.3 Implement trip filtering

    - Filter by region (coordinates bounding box)
    - Filter by status (in_progress, scheduled, etc.)
    - _Requirements: 4.4_

  - [x] 6.4 Write property test for trip filtering
    - **Property 9: Trip Filtering Correctness**
    - **Validates: Requirements 4.4**
  - [x] 6.5 Add SOS alert highlighting


    - Flag trips with active SOS alerts
    - Include alert details in trip response
    - _Requirements: 4.5_

  - [x] 6.6 Create admin tracking frontend component

    - Map view with all active trips
    - Real-time location updates via WebSocket
    - Trip detail modal on marker click
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 7. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Enhance SOS service with journey details





  - [x] 8.1 Extend SOSAlert model with journey details


    - Add routeTaken array of coordinates
    - Add stops array with location and duration
    - Add vehicle and driver details snapshot
    - _Requirements: 5.5_
  - [x] 8.2 Capture complete journey data on SOS trigger


    - Collect route history from trip tracking
    - Identify stops from location data
    - Include current location and timestamp
    - _Requirements: 5.1_
  - [x] 8.3 Write property test for SOS data capture


    - **Property 10: SOS Data Capture Completeness**
    - **Validates: Requirements 5.1**
  - [x] 8.4 Implement multi-dashboard SOS notifications


    - Notify super admin dashboard via WebSocket
    - Notify customer support dashboard via WebSocket
    - Send within 5 seconds of trigger
    - _Requirements: 5.2, 5.3_
  - [x] 8.5 Write property test for SOS dashboard notification


    - **Property 11: SOS Dashboard Notification**
    - **Validates: Requirements 5.2, 5.3**
  - [x] 8.6 Implement continuous SOS tracking


    - Broadcast location every 5 seconds during active SOS
    - Continue until alert is resolved
    - _Requirements: 5.6_
  - [x] 8.7 Update SOS frontend components


    - Show journey details in admin SOS view
    - Display route taken on map
    - Show stops with timestamps
    - _Requirements: 5.5_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement booking invoice service





  - [x] 10.1 Create Invoice model


    - Define schema with booking details, fare breakdown, delivery status
    - Add invoiceId generation
    - _Requirements: 6.1_

  - [x] 10.2 Create invoiceService.js

    - Implement generateInvoice with all required fields
    - Generate PDF using a template
    - _Requirements: 6.1, 6.6_

  - [x] 10.3 Write property test for invoice content completeness

    - **Property 12: Invoice Content Completeness**
    - **Validates: Requirements 6.1, 6.6**
  - [x] 10.4 Implement multi-channel invoice delivery


    - Send via WhatsApp with message and PDF link
    - Send via SMS with short link to view invoice
    - Send via email with PDF attachment
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 10.5 Write property test for multi-channel delivery

    - **Property 13: Invoice Multi-Channel Delivery**
    - **Validates: Requirements 6.2, 6.3, 6.4**
  - [x] 10.6 Integrate invoice generation with booking confirmation


    - Trigger invoice generation on booking confirmation
    - Handle delivery failures with retry
    - _Requirements: 6.1, 6.5_

- [x] 11. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement ride verification code system






  - [x] 12.1 Create verificationService.js

    - Implement generateCode for 4-digit unique codes
    - Store code with booking reference
    - _Requirements: 7.1_

  - [x] 12.2 Write property test for verification code format

    - **Property 14: Verification Code Format**
    - **Validates: Requirements 7.1**
  - [x] 12.3 Integrate verification code with booking flow


    - Generate code on booking confirmation
    - Include code in booking confirmation response
    - Include code in all notification channels
    - _Requirements: 7.2, 7.3_

  - [x] 12.4 Implement code validation for ride start

    - Create validateCode endpoint for drivers
    - Track validation attempts (max 3)
    - Start ride on successful validation
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 12.5 Write property test for code validation

    - **Property 15: Verification Code Validation**
    - **Validates: Requirements 7.5, 7.6**
  - [x] 12.6 Update driver app for code entry


    - Add code entry screen when arriving at pickup
    - Show error on incorrect code with retry count
    - _Requirements: 7.4, 7.6_

  - [x] 12.7 Update passenger app to display code

    - Show verification code prominently in booking confirmation
    - Include code in booking details screen
    - _Requirements: 7.2_

- [x] 13. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement stationary vehicle detection








  - [x] 14.1 Create StationaryEvent model

    - Define schema with trip, location, duration, response, escalation
    - Add indexes for active event queries
    - _Requirements: 8.1_

  - [x] 14.2 Create stationaryDetectionService.js

    - Implement movement monitoring using GPS coordinates
    - Detect stationary state (< 50m movement in 15 minutes)
    - Track stationary duration
    - _Requirements: 8.1, 8.2_

  - [x] 14.3 Write property test for stationary detection






    - **Property 16: Stationary Detection Trigger**
    - **Validates: Requirements 8.2**
  - [x] 14.4 Implement safety check notification


    - Send push notification with "Is everything okay?"
    - Include "Confirm Safety" and "Request Help" options
    - _Requirements: 8.2, 8.3_

  - [x] 14.5 Write property test for safety check options

    - **Property 17: Safety Check Options**
    - **Validates: Requirements 8.3**
  - [x] 14.6 Handle passenger safety responses


    - Log safety confirmation and continue monitoring
    - Trigger SOS on help request
    - _Requirements: 8.4, 8.5_

  - [x] 14.7 Write property test for help request SOS trigger

    - **Property 18: Help Request SOS Trigger**
    - **Validates: Requirements 8.5**
  - [x] 14.8 Implement escalation flow


    - Attempt call after 5 minutes of no response
    - Escalate to customer support if call unanswered
    - Include trip details and location in escalation
    - _Requirements: 8.6, 8.7_

  - [x] 14.9 Write property test for escalation flow

    - **Property 19: Escalation Flow**
    - **Validates: Requirements 8.6, 8.7**
  - [x] 14.10 Integrate stationary detection with trip tracking


    - Start monitoring when trip begins
    - Process each location update for movement
    - Stop monitoring when trip ends
    - _Requirements: 8.1_

- [ ] 15. Final Checkpoint - Ensure all tests pass








  - Ensure all tests pass, ask the user if questions arise.
