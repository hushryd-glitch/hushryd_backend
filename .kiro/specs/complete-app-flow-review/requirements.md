# Requirements Document

## Introduction

This document specifies the requirements for a comprehensive review and fix of the HushRyd mobile application. The scope covers three main areas:
1. Post Ride tab visibility issue after login
2. Upcoming rides page layout/scrolling issues
3. Complete end-to-end flow verification for both passenger and driver roles including live tracking, SOS, booking, KYC, ride posting, ride execution, and wallet functionality

## Glossary

- **HushRyd_App**: The React Native mobile application for ride-sharing
- **Passenger**: A user who searches for and books rides
- **Driver**: A user who posts rides and transports passengers
- **KYC**: Know Your Customer - document verification process for drivers
- **SOS**: Emergency alert system for safety during rides
- **Wallet**: In-app payment and earnings management system
- **Tab_Bar**: Bottom navigation component with 5 tabs (Search, Post Ride, Your Rides, Inbox, Profile)
- **Post_Ride_Tab**: The "Publish" tab that allows drivers to create new ride offerings
- **Live_Tracking**: Real-time GPS tracking of ongoing rides

## Requirements

### Requirement 1: Post Ride Tab Visibility

**User Story:** As a logged-in user, I want to see the Post Ride tab in the bottom navigation bar beside the Search tab, so that I can easily access ride posting functionality.

#### Acceptance Criteria

1. WHEN a user successfully logs in THEN the Tab_Bar SHALL display all 5 tabs including the Post_Ride_Tab in the correct order (Search, Post Ride, Your Rides, Inbox, Profile)
2. WHEN the Tab_Bar renders THEN the HushRyd_App SHALL display the Post_Ride_Tab with the "add-circle-outline" icon and "Post Ride" label
3. WHEN a user taps the Post_Ride_Tab THEN the HushRyd_App SHALL navigate to the publish screen without errors
4. IF the Tab_Bar fails to render all tabs THEN the HushRyd_App SHALL log the error and display a fallback navigation

### Requirement 2: Upcoming Rides Page Layout

**User Story:** As a user viewing my upcoming rides, I want the page to have a fixed and stable layout, so that I can scroll through my bookings without visual glitches.

#### Acceptance Criteria

1. WHEN a user navigates to the Your Rides tab THEN the HushRyd_App SHALL display a fixed header that remains visible during scrolling
2. WHEN the bookings list contains more items than fit on screen THEN the HushRyd_App SHALL enable smooth vertical scrolling within the content area
3. WHILE the user scrolls the bookings list THEN the Tab_Bar SHALL remain fixed at the bottom of the screen
4. WHEN the bookings list is empty THEN the HushRyd_App SHALL display a centered empty state without layout shifts
5. WHEN loading bookings data THEN the HushRyd_App SHALL display skeleton placeholders with consistent dimensions

### Requirement 3: Passenger Flow - Search and Booking

**User Story:** As a passenger, I want to search for rides and complete bookings, so that I can travel to my destination.

#### Acceptance Criteria

1. WHEN a passenger enters search criteria (pickup, drop, date, seats) THEN the HushRyd_App SHALL display matching available rides
2. WHEN a passenger selects a ride THEN the HushRyd_App SHALL navigate to the booking details screen with fare breakdown
3. WHEN a passenger confirms booking THEN the HushRyd_App SHALL process payment and display booking confirmation
4. WHEN a booking is confirmed THEN the HushRyd_App SHALL display the booking in the Your Rides tab under "Upcoming"

### Requirement 3.1: Payment Page with UPI Details

**User Story:** As a passenger, I want to pay for my booking using UPI by entering my UPI ID, so that I can complete payment conveniently.

#### Acceptance Criteria

1. WHEN a passenger selects UPI as payment method THEN the HushRyd_App SHALL display a UPI ID input field
2. WHEN a passenger enters a UPI ID THEN the HushRyd_App SHALL validate the UPI ID format (e.g., username@bankname)
3. WHEN a valid UPI ID is entered THEN the HushRyd_App SHALL enable the Pay button
4. WHEN payment is initiated with UPI THEN the HushRyd_App SHALL send payment request to the UPI ID
5. WHEN UPI payment is successful THEN the HushRyd_App SHALL display payment confirmation with transaction ID
6. IF UPI payment fails THEN the HushRyd_App SHALL display error message with retry option

### Requirement 4: Passenger Flow - Live Tracking

**User Story:** As a passenger with an active booking, I want to track my ride in real-time, so that I can monitor the driver's location and trip progress.

#### Acceptance Criteria

1. WHEN a passenger opens an active booking THEN the HushRyd_App SHALL display a map with the driver's real-time location
2. WHILE the ride is in progress THEN the HushRyd_App SHALL update the driver's position on the map at regular intervals
3. WHEN viewing live tracking THEN the HushRyd_App SHALL display trip progress indicators (pickup, en-route, drop-off)
4. WHEN viewing live tracking THEN the HushRyd_App SHALL display driver information card with contact options

### Requirement 5: Passenger Flow - SOS Implementation

**User Story:** As a passenger during a ride, I want access to an SOS emergency button, so that I can quickly alert emergency contacts and authorities if needed.

#### Acceptance Criteria

1. WHEN a passenger is on the live tracking screen THEN the HushRyd_App SHALL display a visible SOS button
2. WHEN a passenger activates SOS THEN the HushRyd_App SHALL display the emergency screen with alert options
3. WHEN SOS is triggered THEN the HushRyd_App SHALL send alerts to registered emergency contacts
4. WHEN SOS is active THEN the HushRyd_App SHALL share the passenger's live location with emergency contacts

### Requirement 6: Passenger Wallet

**User Story:** As a passenger, I want to manage my wallet for payments and refunds, so that I can handle ride payments conveniently.

#### Acceptance Criteria

1. WHEN a passenger opens the wallet screen THEN the HushRyd_App SHALL display the current wallet balance
2. WHEN a passenger views wallet THEN the HushRyd_App SHALL display transaction history with payment and refund entries
3. WHEN a passenger adds money to wallet THEN the HushRyd_App SHALL process the payment and update the balance
4. WHEN a booking is cancelled with refund THEN the HushRyd_App SHALL credit the refund amount to the wallet

### Requirement 7: Driver Flow - KYC and Document Upload

**User Story:** As a driver, I want to complete KYC verification by uploading required documents, so that I can become eligible to post rides.

#### Acceptance Criteria

1. WHEN a user navigates to become a driver THEN the HushRyd_App SHALL display the KYC requirements screen
2. WHEN a driver uploads documents (license, RC, insurance, profile photo) THEN the HushRyd_App SHALL validate file format and size
3. WHEN documents are uploaded THEN the HushRyd_App SHALL display upload progress and confirmation
4. WHEN KYC is pending review THEN the HushRyd_App SHALL display the verification status clearly
5. WHEN KYC is approved THEN the HushRyd_App SHALL enable access to ride posting functionality

### Requirement 8: Driver Flow - Posting Rides

**User Story:** As a verified driver, I want to post rides with route, timing, and pricing details, so that passengers can find and book my rides.

#### Acceptance Criteria

1. WHEN a verified driver opens the Post_Ride_Tab THEN the HushRyd_App SHALL display the trip creation form
2. WHEN a driver enters ride details (source, destination, time, seats, price) THEN the HushRyd_App SHALL validate all required fields
3. WHEN a driver submits a valid ride THEN the HushRyd_App SHALL create the trip and display confirmation
4. WHEN a ride is posted THEN the HushRyd_App SHALL provide options to share the ride details
5. IF a non-verified driver opens Post_Ride_Tab THEN the HushRyd_App SHALL display the "Become a Driver" prompt

### Requirement 9: Driver Flow - Managing and Starting Rides

**User Story:** As a driver with posted rides, I want to view bookings and start rides, so that I can manage my trips and transport passengers.

#### Acceptance Criteria

1. WHEN a driver views their posted rides THEN the HushRyd_App SHALL display all rides with booking counts
2. WHEN a driver opens a ride with bookings THEN the HushRyd_App SHALL display passenger list with OTP verification
3. WHEN a driver starts a ride THEN the HushRyd_App SHALL verify passenger OTPs before departure
4. WHILE a ride is in progress THEN the HushRyd_App SHALL track and share the driver's location
5. WHEN a driver completes a ride THEN the HushRyd_App SHALL update ride status and process earnings

### Requirement 10: Driver Wallet

**User Story:** As a driver, I want a separate wallet view showing my earnings and withdrawal options, so that I can manage my income from rides.

#### Acceptance Criteria

1. WHEN a driver opens the wallet screen THEN the HushRyd_App SHALL display earnings balance separately from passenger wallet
2. WHEN a driver views wallet THEN the HushRyd_App SHALL display earnings history from completed rides
3. WHEN a driver requests withdrawal THEN the HushRyd_App SHALL display the withdrawal form with bank details
4. WHEN a withdrawal is processed THEN the HushRyd_App SHALL update the balance and show transaction status
5. WHEN viewing wallet THEN the HushRyd_App SHALL clearly differentiate between driver earnings and passenger balance

