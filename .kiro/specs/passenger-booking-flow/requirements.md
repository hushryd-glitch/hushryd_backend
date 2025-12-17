# Requirements Document

## Introduction

This document specifies the complete passenger booking flow for the HushRyd ride-sharing platform. The flow covers the entire journey from landing page to ride completion, including user registration, booking, payment, ride verification with PIN, live tracking, emergency SOS features, and notifications.

## Glossary

- **Passenger**: A user who books rides on the platform
- **Driver**: A verified user who posts and operates rides
- **Booking PIN**: A permanent 4-digit unique code tied to a passenger's mobile number for ride verification
- **SOS**: Emergency alert system that shares location with emergency contacts and support team
- **Live Tracking**: Real-time GPS location sharing during an active ride
- **Emergency Contacts**: Up to 5 contacts who receive location updates when a ride starts

## Requirements

### Requirement 1: Landing Page to Search Navigation

**User Story:** As a visitor, I want to easily navigate from the landing page to search for rides, so that I can find available rides quickly.

#### Acceptance Criteria

1. WHEN a visitor lands on the homepage THEN the system SHALL display a prominent "Search Rides" button in the hero section
2. WHEN a visitor clicks "Search Rides" THEN the system SHALL navigate to the search page showing all available driver-posted rides
3. WHEN the search page loads THEN the system SHALL display all scheduled rides with available seats without requiring login

---

### Requirement 2: Ride Search and Filtering

**User Story:** As a passenger, I want to search and filter available rides, so that I can find rides that match my travel needs.

#### Acceptance Criteria

1. WHEN the search page loads THEN the system SHALL display all future scheduled rides posted by drivers
2. WHEN a passenger applies filters (date, time, route, price) THEN the system SHALL display only rides matching the filter criteria
3. WHEN a passenger clicks "View Details" on a ride THEN the system SHALL navigate to the trip details page showing full ride information
4. WHEN displaying ride cards THEN the system SHALL show driver name, rating, vehicle details, departure time, route, fare per seat, and available seats

---

### Requirement 3: Guest Booking Flow - Authentication

**User Story:** As a new user, I want to register and complete my profile when booking, so that I can book rides without prior registration.

#### Acceptance Criteria

1. WHEN an unauthenticated user clicks "Book Now" THEN the system SHALL redirect to login page with booking redirect URL preserved
2. WHEN a new user enters phone number THEN the system SHALL send OTP for verification
3. WHEN OTP is verified for a new user THEN the system SHALL redirect to profile setup page
4. WHEN profile setup is required THEN the system SHALL collect name, email (optional), and at least one emergency contact
5. WHEN profile is incomplete THEN the system SHALL prevent booking and display missing requirements

---

### Requirement 4: Booking PIN Generation

**User Story:** As a passenger, I want a permanent 4-digit PIN tied to my phone number, so that I can verify my identity when starting rides.

#### Acceptance Criteria

1. WHEN a new user completes registration THEN the system SHALL generate a permanent 4-digit unique PIN
2. WHEN generating PIN THEN the system SHALL ensure uniqueness across all users with the same mobile number
3. WHEN a user views their profile THEN the system SHALL display their booking PIN prominently
4. WHEN a booking is confirmed THEN the system SHALL include the PIN in booking confirmation details
5. WHEN a driver starts a ride THEN the system SHALL require passenger to provide their PIN for verification

---

### Requirement 5: Booking Creation and Payment

**User Story:** As a passenger, I want to book a ride and complete payment, so that my seat is reserved.

#### Acceptance Criteria

1. WHEN a passenger selects seats and confirms booking THEN the system SHALL create a pending booking record
2. WHEN booking is created THEN the system SHALL calculate total fare including platform fees and taxes
3. WHEN payment is initiated THEN the system SHALL integrate with payment gateway for secure transaction
4. WHEN payment succeeds THEN the system SHALL update booking status to confirmed
5. WHEN payment fails THEN the system SHALL retain booking for retry and display error message

---

### Requirement 6: Booking Confirmation Notifications

**User Story:** As a passenger, I want to receive booking confirmation via multiple channels, so that I have ride details accessible.

#### Acceptance Criteria

1. WHEN booking is confirmed THEN the system SHALL send invoice via email with ride details, fare breakdown, and booking PIN
2. WHEN booking is confirmed THEN the system SHALL send WhatsApp message with ride summary and driver contact
3. WHEN booking is confirmed THEN the system SHALL send SMS with booking reference and essential ride details
4. WHEN sending notifications THEN the system SHALL include trip date, time, pickup/drop locations, driver name, vehicle details, and fare

---

### Requirement 7: Passenger Profile and Upcoming Rides

**User Story:** As a passenger, I want to view my profile and upcoming rides, so that I can manage my travel plans.

#### Acceptance Criteria

1. WHEN a passenger views their profile THEN the system SHALL display personal details, emergency contacts, and booking PIN
2. WHEN a passenger has upcoming bookings THEN the system SHALL display them in chronological order on the profile/dashboard
3. WHEN displaying upcoming rides THEN the system SHALL show trip details, driver info, and countdown to departure
4. WHEN a ride is within 24 hours THEN the system SHALL highlight it as "Upcoming Soon"

---

### Requirement 8: Ride Start Verification with PIN

**User Story:** As a driver, I want to verify passenger identity with PIN before starting the ride, so that the correct passenger boards.

#### Acceptance Criteria

1. WHEN driver initiates ride start THEN the system SHALL prompt for passenger's 4-digit PIN
2. WHEN PIN is entered THEN the system SHALL validate against the passenger's registered PIN
3. WHEN PIN matches THEN the system SHALL mark passenger as boarded and allow ride to start
4. WHEN PIN does not match THEN the system SHALL display error and prevent ride start for that passenger
5. WHEN all boarded passengers are verified THEN the system SHALL allow driver to start the trip

---

### Requirement 9: Live Location Tracking on Ride Start

**User Story:** As a passenger, I want my live location shared with emergency contacts when ride starts, so that my safety is ensured.

#### Acceptance Criteria

1. WHEN ride starts THEN the system SHALL immediately begin live GPS tracking
2. WHEN ride starts THEN the system SHALL send tracking link to all emergency contacts (up to 5)
3. WHEN tracking link is accessed THEN the system SHALL display real-time location on map with route
4. WHEN ride is in progress THEN the system SHALL update location every 10 seconds
5. WHEN ride completes THEN the system SHALL stop tracking and notify emergency contacts

---

### Requirement 10: SOS Emergency Alert System

**User Story:** As a passenger, I want to trigger SOS alert during emergencies, so that help can be dispatched quickly.

#### Acceptance Criteria

1. WHEN passenger triggers SOS THEN the system SHALL capture exact GPS location immediately
2. WHEN SOS is triggered THEN the system SHALL alert customer support team with passenger name, location, route, driver details
3. WHEN SOS is triggered THEN the system SHALL notify all emergency contacts with live location
4. WHEN SOS alert is raised THEN the system SHALL create high-priority support ticket with all trip details
5. WHEN SOS is active THEN the system SHALL continue tracking and updating location until resolved
6. WHEN support team views SOS THEN the system SHALL display passenger photo, phone, trip route, driver info, and live location

---

### Requirement 11: Existing User Booking Flow

**User Story:** As a returning user, I want to quickly book rides using my existing profile, so that booking is seamless.

#### Acceptance Criteria

1. WHEN an authenticated user clicks "Book Now" THEN the system SHALL proceed directly to booking form
2. WHEN booking form loads THEN the system SHALL pre-fill user details from profile
3. WHEN user has incomplete profile THEN the system SHALL prompt to complete before booking
4. WHEN booking is confirmed THEN the system SHALL follow same notification and tracking flow as new users
