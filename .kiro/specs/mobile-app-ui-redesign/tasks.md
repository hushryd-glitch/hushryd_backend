# Implementation Plan

## HushRyd Mobile App UI Redesign

- [x] 1. Set up Design System Foundation






  - [x] 1.1 Create enhanced color palette with orange theme

    - Update `src/theme/colors.js` with primary orange (#F97316), secondary amber, white backgrounds, and all color scales
    - Include women-only accent colors (soft pink)
    - Export all color tokens for consistent usage
    - _Requirements: 1.1_

  - [ ]* 1.2 Write property test for color palette completeness
    - **Property 1: Design System Color Completeness**
    - **Validates: Requirements 1.1**


  - [x] 1.3 Create typography system

    - Update `src/theme/typography.js` with heading styles (H1-H4), body styles (large, medium, small), and caption
    - Define fontSize and lineHeight for each style
    - Include fontWeight and letterSpacing
    - _Requirements: 1.2_

  - [ ]* 1.4 Write property test for typography completeness
    - **Property 2: Typography Scale Completeness**
    - **Validates: Requirements 1.2**


  - [x] 1.5 Create spacing and layout tokens

    - Update `src/theme/spacing.js` with spacing scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64)
    - Update `src/theme/borderRadius.js` with radius tokens (sm, md, lg, xl, full)
    - Create `src/theme/shadows.js` with elevation levels (none, sm, md, lg, xl)
    - _Requirements: 1.3, 1.4, 1.5_


  - [x] 1.6 Create unified theme export

    - Update `src/theme/index.js` to export all theme tokens
    - Create theme context for easy access throughout app
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Build Core UI Components






  - [x] 2.1 Create Button component

    - Implement `src/components/ui/Button.jsx` with variants (primary, secondary, outline, ghost)
    - Support sizes (sm, md, lg), loading state with spinner, disabled state
    - Add left/right icon support and fullWidth option
    - Apply orange primary color for primary variant
    - _Requirements: 2.1_

  - [ ]* 2.2 Write property test for Button variants
    - **Property 3: Button Variant Rendering**
    - **Validates: Requirements 2.1**


  - [x] 2.3 Create Input component

    - Implement `src/components/ui/Input.jsx` with types (text, phone, email, password)
    - Support label, placeholder, error message display, and icon slots
    - Add validation visual feedback with orange focus border
    - _Requirements: 2.2_

  - [ ]* 2.4 Write property test for Input types
    - **Property 4: Input Type Handling**
    - **Validates: Requirements 2.2**


  - [x] 2.5 Create Card component

    - Implement `src/components/ui/Card.jsx` with configurable padding, shadow, borderRadius
    - Add press feedback with subtle scale animation
    - Use white background with shadow elevation
    - _Requirements: 2.3_

  - [ ]* 2.6 Write property test for Card configuration
    - **Property 5: Card Configuration Rendering**
    - **Validates: Requirements 2.3**


  - [x] 2.7 Create Badge component

    - Implement `src/components/ui/Badge.jsx` with variants (verified, women-only, instant, success, warning, error)
    - Support size variants (sm, md)
    - Use appropriate colors (orange for verified, pink for women-only)
    - _Requirements: 2.4_

  - [ ]* 2.8 Write property test for Badge variants
    - **Property 6: Badge Status Rendering**
    - **Validates: Requirements 2.4**


  - [x] 2.9 Create Avatar component

    - Implement `src/components/ui/Avatar.jsx` with image support and initials fallback
    - Support sizes (xs, sm, md, lg, xl) and online status indicator
    - Generate initials from name when no image provided
    - _Requirements: 2.5_

  - [ ]* 2.10 Write property test for Avatar fallback
    - **Property 7: Avatar Fallback Behavior**
    - **Validates: Requirements 2.5**

  - [x] 2.11 Create BottomSheet component


    - Implement `src/components/ui/BottomSheet.jsx` with drag-to-dismiss
    - Support snap points and backdrop overlay
    - Add smooth animation transitions
    - _Requirements: 2.6_


  - [x] 2.12 Update UI components index

    - Update `src/components/ui/index.js` to export all new components
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Build Onboarding Flow






  - [x] 4.1 Create onboarding data and assets

    - Create `src/assets/animations/` folder with placeholder Lottie JSON files
    - Define onboarding screens data structure with titles, subtitles, and animation references
    - _Requirements: 3.1, 3.3_


  - [x] 4.2 Create OnboardingScreen component

    - Update `src/components/onboarding/OnboardingScreen.jsx` with Lottie animation display
    - Add title and subtitle with fade animations
    - Style with white background and orange accents
    - _Requirements: 3.1, 3.2, 3.3_


  - [x] 4.3 Create OnboardingPagination component

    - Update `src/components/onboarding/OnboardingPagination.jsx` with dot indicators
    - Highlight current screen with orange color
    - Support dynamic screen count
    - _Requirements: 3.5_

  - [ ]* 4.4 Write property test for pagination accuracy
    - **Property 8: Onboarding Pagination Accuracy**
    - **Validates: Requirements 3.5**

  - [x] 4.5 Create onboarding flow screen


    - Update `app/(onboarding)/index.jsx` with swipeable screens
    - Add "Skip" button and "Get Started" CTA on final screen
    - Implement smooth slide transitions between screens
    - _Requirements: 3.4, 3.6_

- [x] 5. Build Authentication Flow






  - [x] 5.1 Create PhoneInput component

    - Update `src/components/auth/PhoneInput.jsx` with country code selector (+91 default)
    - Add phone number formatting and validation
    - Style with orange focus state
    - _Requirements: 4.1_


  - [x] 5.2 Create OTPInput component

    - Update `src/components/auth/OTPInput.jsx` with 6 individual digit boxes
    - Implement auto-focus progression between boxes
    - Add shake animation for error state
    - _Requirements: 4.3, 4.6_


  - [x] 5.3 Create OTP timer hook

    - Create `src/hooks/useOTPTimer.js` with 60-second countdown
    - Handle resend button state with 30-second cooldown
    - _Requirements: 4.4, 4.5_

  - [ ]* 5.4 Write property test for OTP timer behavior
    - **Property 9: OTP Timer Behavior**
    - **Validates: Requirements 4.4, 4.5**


  - [x] 5.5 Create login screen

    - Update `app/(auth)/login.jsx` with PhoneInput and submit button
    - Add HushRyd logo and welcome text
    - Style with white background and orange CTA
    - _Requirements: 4.1, 4.2_


  - [x] 5.6 Create OTP verification screen

    - Update `app/(auth)/otp.jsx` with OTPInput and timer display
    - Add resend button with cooldown state
    - Show success animation on verification
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 6. Build Profile Completion Flow





  - [x] 6.1 Create ProfileForm component


    - Update `src/components/profile/ProfileForm.jsx` with all required fields
    - Include Full Name, Email, Gender selector inputs
    - Add progress indicator showing completion percentage
    - _Requirements: 5.2, 5.4_

  - [x] 6.2 Create email validation utility


    - Create `src/utils/validation.js` with email format validation
    - Export reusable validation functions
    - _Requirements: 5.3_

  - [ ]* 6.3 Write property test for email validation
    - **Property 11: Email Validation**
    - **Validates: Requirements 5.3**


  - [x] 6.4 Create profile progress calculation

    - Create `src/utils/profileProgress.js` to calculate completion percentage
    - Handle all required fields including emergency contacts
    - _Requirements: 5.4, 5.5_

  - [ ]* 6.5 Write property test for profile progress
    - **Property 12: Profile Progress Calculation**
    - **Validates: Requirements 5.4, 5.5**


  - [x] 6.6 Create EmergencyContacts component

    - Update `src/components/profile/EmergencyContacts.jsx` for 3 contacts
    - Each contact has name and phone fields
    - Add/remove contact functionality
    - _Requirements: 5.2_


  - [x] 6.7 Create profile completion screen

    - Create `app/(stack)/profile/complete.jsx` with ProfileForm and EmergencyContacts
    - Add "Complete Profile" button enabled only when all fields filled
    - Navigate to home on successful save
    - _Requirements: 5.2, 5.5, 5.6_


  - [x] 6.8 Create profile routing logic

    - Update `app/_layout.jsx` to check profile completeness on app launch
    - Redirect incomplete profiles to completion screen
    - Direct complete profiles to home screen
    - _Requirements: 5.1, 5.7_

  - [ ]* 6.9 Write property test for profile routing
    - **Property 10: Profile Completion Routing**
    - **Validates: Requirements 5.1, 5.7**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Build Home Screen





  - [x] 8.1 Create greeting header component


    - Create `src/components/home/GreetingHeader.jsx` with personalized "Hi {name}" text
    - Add notification bell icon with badge count
    - Style with orange accent
    - _Requirements: 6.1_

  - [ ]* 8.2 Write property test for greeting text
    - **Property 13: Greeting Text Generation**
    - **Validates: Requirements 6.1**


  - [x] 8.3 Create SearchCard component

    - Create `src/components/home/SearchCard.jsx` with pickup/drop inputs
    - Add date/time picker and seats selector
    - Include "Search Rides" CTA button in orange
    - _Requirements: 6.2_


  - [x] 8.4 Create PromoBanner carousel

    - Create `src/components/home/PromoBanner.jsx` with horizontal scroll
    - Add banners for Women-Only Rides, Free Cancellation, Referral Bonus
    - Auto-scroll with pagination dots
    - _Requirements: 6.4_


  - [x] 8.5 Create UpcomingRideCard component

    - Create `src/components/home/UpcomingRideCard.jsx` with ride details
    - Show driver name, car, pickup time, OTP status
    - Add "Track Ride" button
    - _Requirements: 6.5_

  - [ ]* 8.6 Write property test for upcoming ride display
    - **Property 14: Upcoming Ride Display**
    - **Validates: Requirements 6.5**

  - [x] 8.7 Create home screen


    - Update `app/(tabs)/index.jsx` with all home components
    - Implement pull-to-refresh functionality
    - Style with white background
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

- [x] 9. Build Search and Results Flow





  - [x] 9.1 Create RideCard component


    - Update `src/components/search/RideCard.jsx` with complete ride info
    - Display route preview, driver rating, car details, seats, price
    - Add women-only badge (pink) and instant booking badge
    - _Requirements: 7.2_

  - [ ]* 9.2 Write property test for ride card completeness
    - **Property 15: Ride Card Information Completeness**
    - **Validates: Requirements 7.2**


  - [x] 9.3 Create search filter utilities

    - Create `src/utils/rideFilters.js` with filter functions
    - Support departure time, price range, women-only, instant booking filters
    - _Requirements: 7.3_

  - [ ]* 9.4 Write property test for search filters
    - **Property 16: Search Filter Correctness**
    - **Validates: Requirements 7.3**


  - [x] 9.5 Create SearchFilters component

    - Create `src/components/search/SearchFilters.jsx` with filter UI
    - Add filter chips and bottom sheet for advanced filters
    - _Requirements: 7.3_


  - [x] 9.6 Create EmptySearchState component

    - Create `src/components/search/EmptySearchState.jsx` with illustration
    - Add "Set Alert" button for ride notifications
    - _Requirements: 7.4_

  - [ ]* 9.7 Write property test for empty state
    - **Property 17: Empty State Display**
    - **Validates: Requirements 7.4**


  - [x] 9.8 Update search results screen




    - Update `app/(tabs)/search.jsx` with SearchResults, filters, and empty state
    - Add loading skeleton during fetch
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 10. Build Booking and Payment Flow






  - [x] 10.1 Create FareBreakdown component

    - Update `src/components/booking/FareBreakdown.jsx` with fare details
    - Show ride fare, platform fee, and total
    - _Requirements: 8.1_


  - [x] 10.2 Create fare calculation utility

    - Create `src/utils/fareCalculation.js` with fare logic
    - Calculate total from ride fare and platform fee
    - _Requirements: 8.1_

  - [ ]* 10.3 Write property test for fare calculation
    - **Property 18: Fare Calculation Accuracy**
    - **Validates: Requirements 8.1**


  - [x] 10.4 Create PaymentOptions component

    - Update `src/components/payment/PaymentForm.jsx` with UPI, Card, Wallet options
    - Show saved payment methods
    - _Requirements: 8.2_


  - [x] 10.5 Create BookingConfirmation component

    - Update `src/components/booking/BookingConfirmation.jsx` with booking details
    - Display unique Booking ID, Pickup OTP, Drop OTP
    - Add download invoice and share buttons
    - _Requirements: 8.3, 8.4, 8.5_


  - [x] 10.6 Create cancellation grace period logic

    - Create `src/utils/cancellation.js` with 3-minute grace period check
    - Calculate cancellation charges after grace period
    - _Requirements: 8.6, 15.1, 15.2_

  - [ ]* 10.7 Write property test for cancellation window
    - **Property 19: Free Cancellation Window**
    - **Validates: Requirements 8.6, 15.1, 15.2**

  - [x] 10.8 Create booking flow screens


    - Update `app/(stack)/book/[rideId].jsx` with booking form
    - Create `app/(stack)/book/confirm.jsx` for confirmation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Build Driver KYC Flow






  - [x] 12.1 Create DocumentUpload component

    - Update `src/components/driver/DocumentUpload.jsx` with camera/gallery options
    - Add image preview with remove functionality
    - Support Aadhaar, License, RC, and car photos
    - _Requirements: 9.1, 9.2, 9.3_


  - [x] 12.2 Create KYC status display

    - Create `src/components/driver/KYCStatus.jsx` showing review status
    - Display "Documents under review" message after submission
    - _Requirements: 9.4_


  - [x] 12.3 Create driver access control utility

    - Create `src/utils/driverAccess.js` to check approval status
    - Control access to ride posting based on status
    - _Requirements: 9.5, 9.6_

  - [ ]* 12.4 Write property test for driver access control
    - **Property 20: Driver Approval Access Control**
    - **Validates: Requirements 9.5, 9.6**


  - [x] 12.5 Create driver KYC screen

    - Update `app/(stack)/driver/kyc.jsx` with document upload flow
    - Show submission confirmation and status
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 13. Build Driver Ride Posting Flow






  - [x] 13.1 Create RidePostForm component

    - Update `src/components/driver/TripCreator.jsx` with all required fields
    - Add source, destination, time, price, seats inputs
    - Include Female-Only and Instant Booking toggles
    - _Requirements: 10.1, 10.2, 10.3_


  - [x] 13.2 Create women-only filter logic

    - Update `src/utils/rideFilters.js` with gender-based filtering
    - Filter women-only rides to show only to female users
    - _Requirements: 10.4_

  - [ ]* 13.3 Write property test for women-only filtering
    - **Property 21: Women-Only Ride Filtering**
    - **Validates: Requirements 10.4**


  - [x] 13.4 Create ride posting screen

    - Update `app/(tabs)/publish.jsx` with RidePostForm
    - Show confirmation on successful post
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 14. Build Driver Wallet System





  - [x] 14.1 Create WalletDisplay component


    - Update `src/components/wallet/WalletDisplay.jsx` with balance breakdown
    - Show total, locked, and available amounts separately
    - _Requirements: 11.1_


  - [x] 14.2 Create wallet state management

    - Create `src/utils/walletState.js` with state transition logic
    - Handle locked → unlocked → withdrawable transitions
    - _Requirements: 11.2, 11.3, 11.4_

  - [ ]* 14.3 Write property test for wallet state transitions
    - **Property 22: Wallet State Transitions**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**


  - [x] 14.4 Create TransactionHistory component

    - Create `src/components/wallet/TransactionHistory.jsx` with status indicators
    - Show locked, unlocked, withdrawn, pending states
    - _Requirements: 11.6_

  - [ ]* 14.5 Write property test for transaction status display
    - **Property 23: Transaction History Status Display**
    - **Validates: Requirements 11.6**


  - [x] 14.6 Create withdrawal options

    - Create `src/components/wallet/WithdrawalForm.jsx` with UPI/Bank options
    - _Requirements: 11.5_


  - [x] 14.7 Create wallet screen

    - Update `app/(stack)/wallet/index.jsx` with all wallet components
    - _Requirements: 11.1, 11.5, 11.6_

- [ ] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Build Ride Execution Flow





  - [x] 16.1 Create PassengerOTPList component


    - Create `src/components/driver/PassengerOTPList.jsx` showing all passenger OTPs
    - Display one OTP per passenger for verification
    - _Requirements: 12.1_

  - [ ]* 16.2 Write property test for passenger OTP display
    - **Property 24: Passenger OTP Display**
    - **Validates: Requirements 12.1**


  - [x] 16.3 Create ride start button logic

    - Create `src/utils/rideExecution.js` with verification tracking
    - Enable start button only when all passengers verified
    - _Requirements: 12.3_

  - [ ]* 16.4 Write property test for start ride button state
    - **Property 25: Start Ride Button State**
    - **Validates: Requirements 12.3**

  - [x] 16.5 Create passenger privacy filter


    - Create `src/utils/passengerPrivacy.js` to filter sensitive data
    - Remove personal info from driver-visible passenger data
    - _Requirements: 12.5_

  - [ ]* 16.6 Write property test for passenger privacy
    - **Property 26: Passenger Privacy Protection**
    - **Validates: Requirements 12.5**

  - [x] 16.7 Create driver ride execution screen


    - Create `app/(stack)/driver/ride/[rideId].jsx` with OTP verification
    - Add passenger pickup notifications
    - Include start ride button
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 17. Build Live Tracking Screen





  - [x] 17.1 Create TrackingMap component


    - Update `src/components/tracking/TrackingMap.jsx` with real-time location
    - Show driver marker, route line, and ETA
    - _Requirements: 14.1_


  - [x] 17.2 Create DriverInfoCard component

    - Update `src/components/trip/DriverInfoCard.jsx` with complete info
    - Show name, photo, car details, rating
    - _Requirements: 14.2_

  - [ ]* 17.3 Write property test for driver info completeness
    - **Property 27: Driver Info Card Completeness**
    - **Validates: Requirements 14.2**


  - [x] 17.4 Create ShareTrip functionality

    - Create `src/utils/shareTrip.js` with share link generation
    - _Requirements: 14.3_

  - [x] 17.5 Create TripProgress component


    - Create `src/components/tracking/TripProgress.jsx` with pickup/drop markers
    - _Requirements: 14.4_

  - [x] 17.6 Update TripSummary component


    - Update `src/components/tracking/TripSummary.jsx` with distance, duration, fare
    - _Requirements: 14.5_


  - [x] 17.7 Create tracking screen

    - Update `app/(stack)/track/[bookingId].jsx` with all tracking components
    - Add share trip button
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 18. Build SOS Emergency System





  - [x] 18.1 Create SOSButton component


    - Update `src/components/sos/SOSButton.jsx` with prominent styling
    - Make accessible within one tap on tracking screen
    - Style with red/orange emergency colors
    - _Requirements: 13.1_


  - [x] 18.2 Create SOS trigger logic

    - Update `src/services/sos/sosService.js` with GPS capture
    - Send alerts to emergency contacts and admin
    - Share passenger, driver, and route details
    - _Requirements: 13.2, 13.3, 13.4_


  - [x] 18.3 Create SOSConfirmation screen

    - Update `src/components/sos/SOSEmergencyScreen.jsx` with alert status
    - Show emergency contacts notified list
    - Add direct call to emergency services (100/112)
    - _Requirements: 13.5, 13.6_

- [x] 19. Build Cancellation Flow






  - [x] 19.1 Create CancellationUI component

    - Update `src/components/booking/CancellationUI.jsx` with charge display
    - Show free cancellation alert within 3 minutes
    - Display exact charges after grace period
    - _Requirements: 15.1, 15.2, 15.3_


  - [x] 19.2 Create cancellation confirmation screen

    - Create `app/(stack)/book/cancel/[bookingId].jsx` with confirmation
    - Show refund timeline and amount
    - _Requirements: 15.3, 15.4, 15.5_




- [x] 20. Add Animations and Polish


  - [x] 20.1 Create Lottie animation components


    - Create `src/components/common/LottieLoader.jsx` for loading states
    - Create `src/components/common/SuccessAnimation.jsx` for confirmations
    - Create `src/components/common/EmptyStateAnimation.jsx` for empty states
    - _Requirements: 16.1_

  - [x] 20.2 Add haptic feedback


    - Create `src/utils/haptics.js` with feedback functions
    - Add haptic feedback to buttons and important actions
    - _Requirements: 16.2_


  - [x] 20.3 Configure screen transitions

    - Update navigation config with slide and fade transitions
    - _Requirements: 16.3_


  - [x] 20.4 Add list animations

    - Create `src/components/common/AnimatedList.jsx` with staggered entrance
    - _Requirements: 16.4_

- [ ] 21. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
