# Implementation Plan

## 1. User Service - PIN Generation and Profile Management

- [x] 1.1 Implement booking PIN generation in User model
  - Add `bookingPIN` field to User schema (4-digit string, unique)
  - Create `generateBookingPIN()` function that generates unique 4-digit PIN (1000-9999)
  - Ensure PIN uniqueness validation before saving
  - _Requirements: 4.1, 4.2_

- [x] 1.2 Write property test for PIN generation uniqueness
  - **Property 6: PIN Generation Uniqueness**
  - **Validates: Requirements 4.1, 4.2**

- [x] 1.3 Implement profile completeness validation
  - Create `isProfileComplete()` method checking name and emergency contacts
  - Add validation middleware to block booking for incomplete profiles
  - _Requirements: 3.4, 3.5_

- [x] 1.4 Write property test for profile completeness validation
  - **Property 5: Profile Completeness Validation**
  - **Validates: Requirements 3.4, 3.5**

- [x] 1.5 Implement emergency contacts management
  - Add `emergencyContacts` array field to User schema (max 5)
  - Create `updateEmergencyContacts(userId, contacts)` service method
  - Validate contact phone numbers and limit to 5
  - _Requirements: 3.4, 9.2_

## 2. Search Service - Ride Discovery and Filtering

- [x] 2.1 Implement future rides filter in search
  - Modify search query to only return rides with `departureTime > now`
  - Ensure rides with zero available seats are marked as "Full"
  - _Requirements: 2.1, 1.3_

- [x] 2.2 Write property test for future rides filter
  - **Property 1: Future Rides Only in Search**
  - **Validates: Requirements 2.1**

- [x] 2.3 Implement search filters (date, time, route, price)
  - Add filter parameters to search endpoint
  - Implement filter logic for each criteria
  - Return only rides matching ALL applied filters
  - _Requirements: 2.2_

- [x] 2.4 Write property test for filter consistency
  - **Property 2: Filter Consistency**
  - **Validates: Requirements 2.2**

- [x] 2.5 Ensure ride card data completeness
  - Include driver name, rating, vehicle details, departure time, route, fare, available seats
  - Add driver profile photo URL to response
  - _Requirements: 2.4_

- [x] 2.6 Write property test for ride card completeness
  - **Property 3: Ride Card Completeness**
  - **Validates: Requirements 2.4**

## 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 4. Booking Service - Core Booking Logic

- [x] 4.1 Implement fare calculation with platform fee
  - Create `calculateFare(tripId, seats)` function
  - Calculate: totalAmount = (baseFare × seats) + (platformFee × seats)
  - Platform fee is ₹15 per seat
  - _Requirements: 5.2_

- [x] 4.2 Write property test for fare calculation
  - **Property 8: Fare Calculation Correctness**
  - **Validates: Requirements 5.2**

- [x] 4.3 Implement booking creation with PIN copy
  - Create `createBooking(tripId, userId, seats)` function
  - Copy passenger's bookingPIN to booking record
  - Set initial status as 'pending'
  - _Requirements: 5.1, 4.4_

- [x] 4.4 Write property test for booking confirmation contains PIN
  - **Property 7: Booking Confirmation Contains PIN**
  - **Validates: Requirements 4.4**

- [x] 4.5 Implement payment status handling
  - Update booking to 'confirmed' on payment success
  - Retain 'pending' status on payment failure
  - _Requirements: 5.4, 5.5_

- [x] 4.6 Write property tests for payment status transitions
  - **Property 9: Payment Success Updates Status**
  - **Property 10: Payment Failure Retains Pending**
  - **Validates: Requirements 5.4, 5.5**

- [x] 4.7 Implement upcoming bookings retrieval
  - Create `getUpcomingBookings(userId)` function
  - Sort by departure time ascending
  - Mark bookings within 24 hours as "Upcoming Soon"
  - _Requirements: 7.2, 7.3, 7.4_

- [x] 4.8 Write property tests for upcoming bookings
  - **Property 12: Upcoming Rides Chronological Order**
  - **Property 13: Upcoming Soon Highlight**
  - **Validates: Requirements 7.2, 7.4**

## 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 6. PIN Verification Service - Ride Start Verification

- [x] 6.1 Implement PIN validation for ride start
  - Create `validatePassengerPIN(bookingId, enteredPIN)` function
  - Compare entered PIN with booking's passengerPIN
  - Return validation result
  - _Requirements: 8.2, 8.3, 8.4_

- [x] 6.2 Write property test for PIN validation
  - **Property 14: PIN Validation Correctness**
  - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 6.3 Implement all passengers verified check
  - Create `canStartTrip(tripId)` function
  - Check all bookings for trip have verified PINs
  - Return true only when all passengers verified
  - _Requirements: 8.5_

- [x] 6.4 Write property test for all passengers verified
  - **Property 15: All Passengers Verified for Trip Start**
  - **Validates: Requirements 8.5**

## 7. Notification Service - Multi-Channel Notifications

- [x] 7.1 Implement booking confirmation notifications
  - Create `sendBookingConfirmation(booking)` function
  - Send Email via SendGrid with invoice
  - Send WhatsApp message with ride summary
  - Send SMS with booking reference
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 7.2 Ensure notification content completeness
  - Include trip date, time, pickup, drop, driver name, vehicle, fare, PIN
  - Format messages appropriately for each channel
  - _Requirements: 6.4_

- [x] 7.3 Write property test for notification content
  - **Property 11: Notification Content Completeness**
  - **Validates: Requirements 6.4**

## 8. Tracking Service - Live Location Sharing

- [x] 8.1 Implement tracking session creation on ride start
  - Create `startTracking(bookingId)` function
  - Generate unique share token
  - Set status to 'active'
  - _Requirements: 9.1_

- [x] 8.2 Write property test for tracking starts on ride start
  - **Property 16: Tracking Starts on Ride Start**
  - **Validates: Requirements 9.1**

- [x] 8.3 Implement tracking link distribution to emergency contacts
  - Create `sendTrackingLinks(bookingId)` function
  - Send tracking URL to all emergency contacts (up to 5)
  - _Requirements: 9.2_

- [x] 8.4 Write property test for emergency contacts receive tracking
  - **Property 17: Emergency Contacts Receive Tracking**
  - **Validates: Requirements 9.2**

- [x] 8.5 Implement tracking session completion
  - Create `stopTracking(bookingId)` function
  - Update session status to 'completed'
  - Notify emergency contacts of ride completion
  - _Requirements: 9.5_

- [x] 8.6 Write property test for tracking stops on ride complete
  - **Property 18: Tracking Stops on Ride Complete**
  - **Validates: Requirements 9.5**

## 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 10. SOS Service - Emergency Alert System

- [x] 10.1 Implement SOS alert creation
  - Create `triggerSOS(bookingId, location)` function
  - Capture exact GPS coordinates
  - Populate all required fields (passenger, driver, route details)
  - _Requirements: 10.1, 10.2_

- [x] 10.2 Write property tests for SOS alert
  - **Property 19: SOS Captures Location**
  - **Property 20: SOS Alert Contains Required Details**
  - **Validates: Requirements 10.1, 10.2, 10.6**

- [x] 10.3 Implement support ticket creation for SOS
  - Create high-priority support ticket on SOS trigger
  - Include all trip and passenger details
  - _Requirements: 10.4_

- [x] 10.4 Write property test for SOS creates support ticket
  - **Property 21: SOS Creates Support Ticket**
  - **Validates: Requirements 10.4**

- [x] 10.5 Implement SOS notifications
  - Alert customer support team
  - Notify all emergency contacts with live location
  - _Requirements: 10.2, 10.3_

## 11. Frontend - Landing Page and Search

- [x] 11.1 Add "Search Rides" button to landing page hero
  - Create prominent CTA button in Hero component
  - Navigate to /search on click
  - _Requirements: 1.1, 1.2_

- [x] 11.2 Implement search page with ride cards
  - Display all available rides without requiring login
  - Show driver info, rating, vehicle, fare, seats
  - Add "Full" badge for rides with zero seats
  - _Requirements: 1.3, 2.4_

- [x] 11.3 Implement search filters UI
  - Add filter panel for date, time, route, price
  - Apply filters and update results
  - _Requirements: 2.2_

## 12. Frontend - Authentication and Profile Setup

- [x] 12.1 Implement booking redirect for unauthenticated users
  - Redirect to login with return URL preserved
  - After auth, redirect back to booking
  - _Requirements: 3.1_

- [x] 12.2 Implement profile setup page
  - Collect name, email (optional), emergency contacts
  - Generate booking PIN on profile completion
  - Display PIN prominently in profile
  - _Requirements: 3.3, 3.4, 4.3_

- [x] 12.3 Implement profile completeness check before booking
  - Block booking if profile incomplete
  - Show missing requirements message
  - _Requirements: 3.5_

- [x] 12.4 Write property test for authenticated user direct booking
  - **Property 22: Authenticated User Direct Booking**
  - **Validates: Requirements 11.1**

- [x] 12.5 Write property test for pre-filled booking form
  - **Property 23: Pre-filled Booking Form**
  - **Validates: Requirements 11.2**

## 13. Frontend - Booking Flow

- [x] 13.1 Implement trip details page
  - Show full ride information
  - Display fare breakdown with platform fee
  - Add "Book Now" button
  - _Requirements: 2.3_

- [x] 13.2 Implement booking form with seat selection
  - Allow seat selection up to available seats
  - Show fare breakdown updating with seat count
  - _Requirements: 5.1_

- [x] 13.3 Implement booking confirmation page
  - Show booking reference, PIN, ride details
  - Display payment status
  - _Requirements: 5.4_

## 14. Frontend - Profile and Upcoming Rides

- [x] 14.1 Implement profile page with PIN display
  - Show personal details, emergency contacts
  - Display booking PIN prominently
  - _Requirements: 7.1, 4.3_

- [x] 14.2 Implement upcoming rides section
  - Display upcoming bookings in chronological order
  - Show "Upcoming Soon" badge for rides within 24 hours
  - _Requirements: 7.2, 7.3, 7.4_

## 15. Frontend - Driver PIN Verification

- [x] 15.1 Implement PIN entry UI for driver
  - Add PIN input field on ride start
  - Validate PIN against passenger's registered PIN
  - Show success/error feedback
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 15.2 Implement trip start button with verification check
  - Enable start only when all passengers verified
  - Show verification status for each passenger
  - _Requirements: 8.5_

## 16. Frontend - Live Tracking and SOS

- [x] 16.1 Implement live tracking page
  - Display real-time location on map
  - Show route and current position
  - _Requirements: 9.3_

- [x] 16.2 Implement SOS button component
  - Add prominent SOS button during active ride
  - Capture location and trigger alert on press
  - Show confirmation of alert sent
  - _Requirements: 10.1_

## 17. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

