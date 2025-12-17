# Requirements Document

## Introduction

This document specifies the requirements for a complete UI redesign of the HushRyd mobile app. The redesign focuses on creating a professional, stunning, women-friendly interface with modern animations, intuitive navigation, and safety-focused visual elements. The app will be built using React Native with JavaScript, featuring Lottie animations, smooth transitions, and a cohesive design system that supports 50K+ users.

## Glossary

- **HushRyd_App**: The React Native mobile application for the HushRyd carpooling platform
- **Design_System**: The collection of reusable UI components, colors, typography, and spacing rules
- **Onboarding_Flow**: The initial screens shown to new users introducing app features
- **OTP_Authentication**: One-Time Password verification system for user login
- **Profile_Completion**: Mandatory user information collection before accessing main features
- **Home_Screen**: The main dashboard showing search, upcoming rides, and promotional banners
- **Search_Flow**: The ride search, results, and booking process
- **Driver_Flow**: Role-based screens for drivers including KYC, ride posting, and wallet
- **SOS_System**: Emergency safety feature with live tracking and alerts
- **Wallet_System**: Driver earnings management with lock/unlock states
- **Lottie_Animation**: JSON-based animations for smooth visual effects
- **Women_Only_Mode**: Feature filtering rides to female passengers only

## Requirements

### Requirement 1: Design System Foundation

**User Story:** As a developer, I want a comprehensive design system, so that I can build consistent, professional UI components across the entire app.

#### Acceptance Criteria

1. THE Design_System SHALL provide a color palette with primary (vibrant orange), secondary (amber), background (white), success, warning, error, neutral, and women-only accent color scales with at least 5 shades each
2. THE Design_System SHALL define typography scales including heading (H1-H4), body (large, medium, small), and caption text styles with consistent line heights
3. THE Design_System SHALL specify spacing tokens (4, 8, 12, 16, 20, 24, 32, 40, 48, 64 pixels) for margins and padding
4. THE Design_System SHALL define border radius tokens (small: 4px, medium: 8px, large: 12px, xl: 16px, full: 9999px) for consistent rounded corners
5. THE Design_System SHALL include shadow definitions for elevation levels (none, sm, md, lg, xl) to create depth hierarchy

### Requirement 2: Reusable UI Components

**User Story:** As a developer, I want reusable UI components, so that I can build screens quickly with consistent styling.

#### Acceptance Criteria

1. THE HushRyd_App SHALL provide a Button component supporting variants (primary, secondary, outline, ghost), sizes (sm, md, lg), loading state, and disabled state
2. THE HushRyd_App SHALL provide an Input component supporting text, phone, email, password types with label, placeholder, error message, and icon support
3. THE HushRyd_App SHALL provide a Card component with configurable padding, shadow, border radius, and press feedback
4. THE HushRyd_App SHALL provide a Badge component for status indicators (verified, women-only, instant booking) with color variants
5. THE HushRyd_App SHALL provide an Avatar component supporting image, initials fallback, size variants, and online status indicator
6. THE HushRyd_App SHALL provide a BottomSheet component with drag-to-dismiss, snap points, and backdrop overlay

### Requirement 3: Animated Onboarding Screens

**User Story:** As a new user, I want engaging animated onboarding screens, so that I understand the app's safety features and value proposition.

#### Acceptance Criteria

1. WHEN a new user launches the HushRyd_App for the first time THEN the Onboarding_Flow SHALL display 4 animated screens with Lottie animations
2. WHEN displaying onboarding screens THEN the HushRyd_App SHALL show smooth fade and slide transitions between screens
3. THE Onboarding_Flow SHALL include screens for: Safe Carpooling (women-first safety), Verified Drivers & OTP Rides, Live Tracking & SOS, and Easy Cost Sharing
4. WHEN the user reaches the final onboarding screen THEN the HushRyd_App SHALL display a prominent "Get Started" call-to-action button
5. THE Onboarding_Flow SHALL include pagination dots indicating current screen position and total screens
6. WHEN the user taps "Skip" THEN the HushRyd_App SHALL navigate directly to the login screen

### Requirement 4: OTP Authentication Flow

**User Story:** As a user, I want a smooth OTP-based login experience, so that I can securely access my account without passwords.

#### Acceptance Criteria

1. WHEN a user enters the login screen THEN the HushRyd_App SHALL display a phone number input with country code selector (+91 default)
2. WHEN a user submits a valid phone number THEN the HushRyd_App SHALL navigate to the OTP verification screen within 2 seconds
3. THE OTP_Authentication screen SHALL display 6 individual digit input boxes with auto-focus progression
4. THE OTP_Authentication screen SHALL show a 60-second countdown timer for OTP expiry
5. WHEN the countdown reaches zero THEN the HushRyd_App SHALL enable a "Resend OTP" button with 30-second cooldown
6. WHEN a user enters an incorrect OTP THEN the HushRyd_App SHALL display an error message with shake animation on input boxes
7. WHEN OTP verification succeeds THEN the HushRyd_App SHALL show a success animation before navigating to profile check

### Requirement 5: Profile Completion Screen

**User Story:** As a new user, I want to complete my profile with required information, so that I can access the app's features safely.

#### Acceptance Criteria

1. WHEN a user has incomplete profile THEN the HushRyd_App SHALL redirect to the Profile_Completion screen
2. THE Profile_Completion screen SHALL require: Full Name, Email, Gender selection, and 3 Emergency Contacts (name + phone each)
3. THE Profile_Completion screen SHALL validate email format before allowing submission
4. THE Profile_Completion screen SHALL display a progress indicator showing completion percentage
5. WHEN all required fields are completed THEN the HushRyd_App SHALL enable the "Complete Profile" button
6. WHEN profile is successfully saved THEN the HushRyd_App SHALL navigate to the Home_Screen and persist login state
7. WHEN a user with completed profile relaunches the app THEN the HushRyd_App SHALL navigate directly to the Home_Screen

### Requirement 6: Home Screen Dashboard

**User Story:** As a user, I want an intuitive home screen, so that I can quickly search for rides and view my upcoming bookings.

#### Acceptance Criteria

1. THE Home_Screen SHALL display a personalized greeting with the user's first name and notification bell icon
2. THE Home_Screen SHALL display a search card with pickup location, drop location, date/time picker, and seats selector
3. WHEN the user taps on location inputs THEN the HushRyd_App SHALL open Google Maps autocomplete with recent locations
4. THE Home_Screen SHALL display promotional banners for Women-Only Rides, Free Cancellation, and Referral Bonus in a horizontal carousel
5. WHEN the user has an upcoming ride THEN the Home_Screen SHALL display a ride card showing driver name, car details, pickup time, OTP status, and "Track Ride" button
6. THE Home_Screen SHALL use pull-to-refresh to update upcoming ride status

### Requirement 7: Ride Search and Results

**User Story:** As a passenger, I want to search and view available rides, so that I can find suitable carpooling options.

#### Acceptance Criteria

1. WHEN a user submits a search THEN the HushRyd_App SHALL display a loading skeleton while fetching results
2. THE Search_Flow results SHALL display each ride with: route map preview, driver rating, car details, seats available, price, and female-only badge if applicable
3. THE Search_Flow SHALL allow filtering by: departure time, price range, women-only rides, and instant booking
4. WHEN no rides match the search criteria THEN the HushRyd_App SHALL display an empty state with illustration and "Set Alert" option
5. WHEN a user taps on a ride card THEN the HushRyd_App SHALL navigate to the ride details screen with expanded information

### Requirement 8: Booking and Payment Flow

**User Story:** As a passenger, I want to book rides and pay securely, so that I can confirm my carpooling arrangements.

#### Acceptance Criteria

1. THE booking screen SHALL display fare breakdown showing: ride fare, platform fee, and total amount
2. THE booking screen SHALL offer payment options: UPI, Card, and Wallet with saved payment methods
3. WHEN payment is successful THEN the HushRyd_App SHALL display a booking confirmation with unique Booking ID
4. THE booking confirmation SHALL provide options to download invoice PDF and share via WhatsApp
5. THE booking confirmation SHALL display both Pickup OTP and Drop OTP for ride verification
6. WHEN booking is within 3 minutes THEN the HushRyd_App SHALL show free cancellation alert with countdown timer

### Requirement 9: Driver KYC and Verification

**User Story:** As a driver, I want to submit my documents for verification, so that I can start posting rides.

#### Acceptance Criteria

1. THE Driver_Flow KYC screen SHALL require: Aadhaar, Driving License, RC, and 4 car photos (interior and exterior)
2. THE Driver_Flow SHALL allow document capture via camera or gallery selection
3. THE Driver_Flow SHALL display image preview with remove option before submission
4. WHEN documents are submitted THEN the HushRyd_App SHALL display "Documents under review. Approval in 2-3 hours" message
5. WHEN driver is not approved THEN the HushRyd_App SHALL prevent access to ride posting features
6. WHEN driver is approved THEN the HushRyd_App SHALL send a push notification and enable ride posting

### Requirement 10: Driver Ride Posting

**User Story:** As a driver, I want to post rides with my preferences, so that passengers can find and book my trips.

#### Acceptance Criteria

1. THE Driver_Flow ride posting screen SHALL require: source, destination, departure time, price per seat, and available seats
2. THE Driver_Flow SHALL provide a "Female-Only" toggle to restrict bookings to female passengers
3. THE Driver_Flow SHALL provide an "Instant Booking" toggle to allow automatic booking confirmation
4. WHEN Female-Only is enabled THEN the Search_Flow SHALL filter the ride to show only to female users
5. WHEN ride is posted successfully THEN the HushRyd_App SHALL display confirmation with ride details and share option

### Requirement 11: Driver Wallet System

**User Story:** As a driver, I want to manage my earnings with clear wallet states, so that I understand when funds are available.

#### Acceptance Criteria

1. THE Wallet_System SHALL display current balance with locked and available amounts separately
2. WHEN a booking is confirmed THEN the Wallet_System SHALL show the fare amount as "Locked"
3. WHEN a ride starts THEN the Wallet_System SHALL transition the fare from "Locked" to "Unlocked"
4. WHEN a ride completes THEN the Wallet_System SHALL enable withdrawal for the completed ride amount
5. THE Wallet_System SHALL support withdrawal via UPI or Bank transfer with instant payout option
6. THE Wallet_System SHALL display transaction history with status indicators (locked, unlocked, withdrawn)

### Requirement 12: Ride Execution and OTP Verification

**User Story:** As a driver, I want to verify passengers using OTP, so that I can ensure ride security.

#### Acceptance Criteria

1. WHEN a ride is about to start THEN the HushRyd_App SHALL display each passenger's OTP for driver verification
2. WHEN a driver verifies a passenger's OTP THEN the HushRyd_App SHALL notify other passengers "Passenger picked up"
3. THE HushRyd_App SHALL enable "Start Ride" button only after all passengers are verified
4. WHEN ride starts THEN the HushRyd_App SHALL begin live location sharing to admin and emergency contacts
5. THE HushRyd_App SHALL not display personal passenger information to the driver beyond verification OTP

### Requirement 13: SOS Emergency System

**User Story:** As a user, I want quick access to emergency features, so that I can get help during unsafe situations.

#### Acceptance Criteria

1. THE SOS_System SHALL display a prominent SOS button on the tracking screen accessible within one tap
2. WHEN SOS is triggered THEN the HushRyd_App SHALL capture exact GPS coordinates immediately
3. WHEN SOS is triggered THEN the HushRyd_App SHALL send alerts to emergency contacts via SMS and WhatsApp
4. WHEN SOS is triggered THEN the HushRyd_App SHALL share passenger details, driver details, and route with admin
5. THE SOS_System SHALL display a confirmation screen showing alert sent status and emergency contact list
6. THE SOS_System SHALL provide option to call emergency services (100/112) directly

### Requirement 14: Live Tracking Screen

**User Story:** As a passenger, I want to track my ride in real-time, so that I can monitor the journey and share my location.

#### Acceptance Criteria

1. THE tracking screen SHALL display a map with real-time driver location, route, and ETA
2. THE tracking screen SHALL show driver information card with name, photo, car details, and rating
3. THE tracking screen SHALL provide "Share Trip" button to send live tracking link to contacts
4. THE tracking screen SHALL display ride progress with pickup and drop markers
5. WHEN ride completes THEN the HushRyd_App SHALL display trip summary with distance, duration, and fare

### Requirement 15: Cancellation Flow

**User Story:** As a user, I want clear cancellation options with transparent charges, so that I can cancel rides when needed.

#### Acceptance Criteria

1. WHEN a booking is within 3 minutes THEN the HushRyd_App SHALL display "Free cancellation available" alert
2. WHEN cancellation is requested after 3 minutes THEN the HushRyd_App SHALL display exact cancellation charges
3. THE cancellation screen SHALL require confirmation before processing the cancellation
4. WHEN cancellation is confirmed THEN the HushRyd_App SHALL process refund and display confirmation
5. THE cancellation screen SHALL show refund timeline and amount clearly

### Requirement 16: Animations and Micro-interactions

**User Story:** As a user, I want smooth animations and feedback, so that the app feels polished and responsive.

#### Acceptance Criteria

1. THE HushRyd_App SHALL use Lottie animations for loading states, success confirmations, and empty states
2. THE HushRyd_App SHALL provide haptic feedback on button presses and important actions
3. THE HushRyd_App SHALL animate screen transitions with smooth slide and fade effects
4. THE HushRyd_App SHALL animate list items with staggered entrance animations
5. THE HushRyd_App SHALL provide pull-to-refresh animation on scrollable screens
