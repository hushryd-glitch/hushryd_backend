# Implementation Plan

## 1. Fix Post Ride Tab Visibility Issue

- [x] 1.1 Investigate and fix tab configuration loading
  - Review `mobile-app/src/config/tabConfig.js` for correct tab order
  - Verify TAB_CONFIG exports all 5 tabs: index, publish, bookings, inbox, profile
  - Ensure publish tab has correct icon and label configuration
  - _Requirements: 1.1, 1.2_

- [x] 1.2 Fix tab layout rendering in `_layout.jsx`
  - Review `mobile-app/app/(tabs)/_layout.jsx` for tab rendering logic
  - Ensure all tabs from TAB_CONFIG are rendered in the Tabs component
  - Verify no tabs are accidentally hidden or filtered out
  - Check that tab order matches TAB_CONFIG order
  - _Requirements: 1.1, 1.3_

- [ ]* 1.3 Write property test for tab configuration completeness
  - **Property 1: Tab Configuration Completeness**
  - **Validates: Requirements 1.1, 1.2**

- [ ]* 1.4 Write property test for tab rendering consistency
  - **Property 2: Tab Rendering Consistency**
  - **Validates: Requirements 1.2**

## 2. Fix Upcoming Rides Page Layout

- [x] 2.1 Fix bookings screen layout stability
  - Review `mobile-app/app/(tabs)/bookings.jsx` for layout issues
  - Ensure SafeAreaView wraps the entire screen correctly
  - Fix header to remain fixed during scroll (not inside ScrollView)
  - Verify FlatList has proper flex: 1 styling
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2.2 Fix skeleton loading dimensions
  - Ensure skeleton placeholders match actual card dimensions
  - Add consistent height to skeleton cards
  - Prevent layout shifts when data loads
  - _Requirements: 2.5_

- [x] 2.3 Fix empty state centering
  - Ensure empty state container uses flex: 1 and centers content
  - Verify no layout shifts when switching between empty and populated states
  - _Requirements: 2.4_

- [ ]* 2.4 Write property test for bookings list scroll stability
  - **Property 3: Bookings List Scroll Stability**
  - **Validates: Requirements 2.2**

## 3. Checkpoint - Verify Tab and Layout Fixes
- [x] 3. Ensure all tests pass, ask the user if questions arise.

## 4. Verify Passenger Search and Booking Flow

- [x] 4.1 Review and verify search functionality
  - Check `mobile-app/app/(tabs)/search.jsx` for search implementation
  - Verify search results display correctly with ride cards
  - Ensure search filters work (date, seats, women-only)
  - _Requirements: 3.1_

- [x] 4.2 Verify booking flow navigation
  - Check `mobile-app/app/(stack)/book/[rideId].jsx` for booking details
  - Verify fare breakdown displays correctly
  - Ensure booking confirmation navigates to confirmation screen
  - _Requirements: 3.2, 3.3_

- [x] 4.3 Add UPI ID input field to PaymentForm
  - Update `mobile-app/src/components/payment/PaymentForm.jsx`
  - Add UPI ID text input field when UPI method is selected
  - Implement UPI ID format validation (username@bankname pattern)
  - Show validation error for invalid UPI ID format
  - _Requirements: 3.1.1, 3.1.2, 3.1.3_

- [x] 4.4 Implement UPI payment flow
  - Add UPI payment initiation logic
  - Handle UPI payment success with transaction ID display
  - Handle UPI payment failure with retry option
  - Add loading state during UPI payment processing
  - _Requirements: 3.1.4, 3.1.5, 3.1.6_

- [ ]* 4.5 Write property test for search results relevance
  - **Property 4: Search Results Relevance**
  - **Validates: Requirements 3.1**

- [ ]* 4.6 Write property test for booking persistence
  - **Property 5: Booking Persistence**
  - **Validates: Requirements 3.4**

- [ ]* 4.7 Write property test for UPI ID validation
  - **Property 19: UPI ID Format Validation**
  - **Validates: Requirements 3.1.2**

## 5. Verify Passenger Live Tracking

- [x] 5.1 Review tracking screen implementation
  - Check `mobile-app/app/(stack)/track/[bookingId].jsx` for tracking display
  - Verify TrackingMap component receives and displays driver location
  - Ensure TripProgress shows pickup/drop progress correctly
  - Verify DriverInfoCard displays driver details
  - _Requirements: 4.1, 4.3, 4.4_

- [x] 5.2 Verify real-time location updates
  - Check tracking data fetch interval (should be 10 seconds)
  - Ensure location updates are reflected on the map
  - Verify ETA updates with location changes
  - _Requirements: 4.2_

- [ ]* 5.3 Write property test for tracking update interval
  - **Property 6: Tracking Update Interval**
  - **Validates: Requirements 4.2**

## 6. Verify SOS Implementation

- [x] 6.1 Review SOS button implementation
  - Check `mobile-app/src/components/sos/SOSButton.jsx` for visibility
  - Verify SOS button is prominent on tracking screen
  - Ensure confirmation dialog appears before trigger
  - _Requirements: 5.1, 5.2_

- [x] 6.2 Verify SOS alert and location sharing
  - Check `mobile-app/src/services/sos/sosService.js` for alert logic
  - Verify emergency contacts receive notifications
  - Ensure location sharing starts on SOS activation
  - _Requirements: 5.3, 5.4_

- [ ]* 6.3 Write property test for SOS alert delivery
  - **Property 7: SOS Alert Delivery**
  - **Validates: Requirements 5.3**

- [ ]* 6.4 Write property test for SOS location broadcast
  - **Property 8: SOS Location Broadcast**
  - **Validates: Requirements 5.4**

## 7. Checkpoint - Verify Passenger Flows
- [x] 7. Ensure all tests pass, ask the user if questions arise.

## 8. Verify Passenger Wallet

- [x] 8.1 Review passenger wallet implementation
  - Check `mobile-app/src/components/wallet/PassengerWalletView.jsx`
  - Verify balance display is accurate
  - Ensure add money options work correctly
  - Verify transaction history displays
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 8.2 Verify refund processing
  - Check wallet service for refund handling
  - Ensure cancelled bookings credit wallet correctly
  - _Requirements: 6.4_

- [ ]* 8.3 Write property test for wallet balance consistency
  - **Property 9: Wallet Balance Consistency**
  - **Validates: Requirements 6.3, 6.4**

- [ ]* 8.4 Write property test for transaction history completeness
  - **Property 10: Transaction History Completeness**
  - **Validates: Requirements 6.2, 10.2**

## 9. Verify Driver KYC Flow

- [x] 9.1 Review KYC screen implementation
  - Check `mobile-app/app/(stack)/driver/kyc.jsx` for KYC flow
  - Verify document upload UI works correctly
  - Ensure KYCStatus component displays correct status
  - _Requirements: 7.1, 7.3, 7.4_

- [x] 9.2 Verify document validation
  - Check `mobile-app/src/components/driver/DocumentUpload.jsx`
  - Ensure file format validation (jpg, png, pdf)
  - Verify file size validation (< 5MB)
  - _Requirements: 7.2_

- [x] 9.3 Verify KYC approval enables ride posting
  - Check publish screen conditional rendering
  - Ensure approved drivers see TripCreator
  - Verify non-approved users see BecomeDriverPrompt
  - _Requirements: 7.5_

- [ ]* 9.4 Write property test for document validation rules
  - **Property 11: Document Validation Rules**
  - **Validates: Requirements 7.2**

- [ ]* 9.5 Write property test for KYC access control
  - **Property 12: KYC Access Control**
  - **Validates: Requirements 7.5, 8.1**

## 10. Verify Driver Ride Posting

- [x] 10.1 Review ride creation form
  - Check `mobile-app/src/components/driver/TripCreator.jsx`
  - Verify all required fields are present
  - Ensure form validation works correctly
  - _Requirements: 8.1, 8.2_

- [x] 10.2 Verify ride posting confirmation
  - Check publish screen for RidePostConfirmation component
  - Ensure share options are available after posting
  - Verify ride appears in driver's trips list
  - _Requirements: 8.3, 8.4_

- [x] 10.3 Verify non-driver prompt
  - Ensure BecomeDriverPrompt displays for non-drivers
  - Verify navigation to driver registration
  - _Requirements: 8.5_

- [ ]* 10.4 Write property test for ride form validation
  - **Property 13: Ride Form Validation**
  - **Validates: Requirements 8.2**

- [ ]* 10.5 Write property test for non-driver access restriction
  - **Property 14: Non-Driver Access Restriction**
  - **Validates: Requirements 8.5**

## 11. Checkpoint - Verify Driver Setup Flows
- [x] 11. Ensure all tests pass, ask the user if questions arise.

## 12. Verify Driver Ride Management and Execution

- [x] 12.1 Review driver rides list
  - Check driver trips screen for ride listing
  - Verify booking counts display correctly
  - Ensure ride status is shown accurately
  - _Requirements: 9.1_

- [x] 12.2 Review ride execution screen
  - Check `mobile-app/app/(stack)/driver/ride/[rideId].jsx`
  - Verify PassengerOTPList displays correctly
  - Ensure OTP verification flow works
  - _Requirements: 9.2, 9.3_

- [x] 12.3 Verify ride start conditions
  - Ensure start ride button is disabled until all OTPs verified
  - Verify location sharing starts on ride start
  - Check ride status updates correctly
  - _Requirements: 9.3, 9.4_

- [x] 12.4 Verify ride completion
  - Ensure ride can be completed after reaching destination
  - Verify earnings are processed to driver wallet
  - _Requirements: 9.5_

- [ ]* 12.5 Write property test for OTP verification requirement
  - **Property 15: OTP Verification Requirement**
  - **Validates: Requirements 9.3**

- [ ]* 12.6 Write property test for ride earnings processing
  - **Property 16: Ride Earnings Processing**
  - **Validates: Requirements 9.5**

## 13. Verify Driver Wallet

- [x] 13.1 Review driver wallet implementation
  - Check `mobile-app/src/components/wallet/DriverWalletView.jsx`
  - Verify earnings summary displays correctly
  - Ensure pending payouts are shown
  - _Requirements: 10.1, 10.2_

- [x] 13.2 Verify withdrawal functionality
  - Check `mobile-app/src/components/wallet/WithdrawalForm.jsx`
  - Ensure withdrawal form validates bank details
  - Verify withdrawal amount validation
  - _Requirements: 10.3, 10.4_

- [x] 13.3 Verify wallet role differentiation
  - Check `mobile-app/app/(stack)/wallet/index.jsx`
  - Ensure correct wallet view is shown based on user role
  - Verify clear separation between passenger and driver balances
  - _Requirements: 10.5_

- [ ]* 13.4 Write property test for withdrawal balance validation
  - **Property 17: Withdrawal Balance Validation**
  - **Validates: Requirements 10.4**

- [ ]* 13.5 Write property test for wallet role differentiation
  - **Property 18: Wallet Role Differentiation**
  - **Validates: Requirements 10.5**

## 14. Final Checkpoint
- [x] 14. Ensure all tests pass, ask the user if questions arise.
