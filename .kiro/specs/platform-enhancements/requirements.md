# Requirements Document

## Introduction

This specification covers critical platform enhancements for HushRyd including a Super Admin dashboard for executive oversight (CEO/CTO access), an Operations Team workflow for driver document verification, improved ride search with Google Maps integration, driver booking acceptance flow with seat management, and enhanced SOS/tracking features for both passengers and drivers.

## Glossary

- **Super Admin**: Highest privilege role (CEO/CTO) with complete platform visibility and control
- **Operations Team**: Staff responsible for driver document verification and support
- **Document Verification**: Process of reviewing and approving/rejecting driver-submitted documents
- **Google Places API**: Google service for location autocomplete and geocoding
- **Seat Availability**: Number of remaining bookable seats on a trip
- **Booking Acceptance**: Driver's action to confirm or decline a passenger booking request
- **Live Location Sharing**: Real-time GPS sharing with emergency contacts during trips
- **SOS Alert**: Emergency distress signal triggered by passenger or driver

## Requirements

### Requirement 1: Super Admin Dashboard

**User Story:** As a CEO/CTO, I want exclusive access to a comprehensive admin dashboard, so that I can monitor all platform operations, users, transactions, and metrics in one place.

#### Acceptance Criteria

1. WHEN a super admin logs in THEN the HushRyd Platform SHALL authenticate using secure credentials and verify super_admin role before granting access
2. WHEN a super admin views the dashboard THEN the HushRyd Platform SHALL display real-time metrics including total users, active drivers, ongoing trips, and daily revenue
3. WHEN a super admin accesses user management THEN the HushRyd Platform SHALL display all users with filters for role, status, registration date, and search by name/phone/email
4. WHEN a super admin views transactions THEN the HushRyd Platform SHALL display complete transaction history with filters for date range, type, status, and amount range
5. WHEN a super admin views support tickets THEN the HushRyd Platform SHALL display all tickets with priority, status, and assignment details
6. WHEN a super admin accesses analytics THEN the HushRyd Platform SHALL display pin-to-pin trip data, revenue trends, user growth, and operational metrics
7. WHEN a super admin performs any action THEN the HushRyd Platform SHALL log the action with timestamp, user ID, and action details for audit trail

### Requirement 2: Operations Team - Driver Document Verification

**User Story:** As an operations team member, I want to review and verify driver documents, so that only qualified drivers can offer rides on the platform.

#### Acceptance Criteria

1. WHEN a driver uploads documents THEN the HushRyd Platform SHALL notify operations team via email and dashboard alert with driver details
2. WHEN operations team views pending documents THEN the HushRyd Platform SHALL display driver profile, uploaded documents (license, registration, insurance, vehicle photos), and submission timestamp
3. WHEN operations team reviews a document THEN the HushRyd Platform SHALL allow zoom, rotate, and full-screen view of each document image
4. WHEN operations team identifies missing documents THEN the HushRyd Platform SHALL allow marking specific documents as missing and send notification to driver with list of required documents
5. WHEN operations team rejects a document THEN the HushRyd Platform SHALL require rejection reason and notify driver via email and WhatsApp with specific feedback
6. WHEN operations team approves all documents THEN the HushRyd Platform SHALL update driver status to 'verified' and notify driver via email and WhatsApp that they can start posting trips
7. WHEN driver status changes to verified THEN the HushRyd Platform SHALL enable trip creation functionality for that driver

### Requirement 3: Improved Ride Search with Google Maps

**User Story:** As a passenger, I want to search for rides using location names and Google Maps, so that I can easily find rides without knowing coordinates.

#### Acceptance Criteria

1. WHEN a passenger enters source location THEN the HushRyd Platform SHALL display Google Places autocomplete suggestions as user types
2. WHEN a passenger enters destination location THEN the HushRyd Platform SHALL display Google Places autocomplete suggestions as user types
3. WHEN a passenger selects a location from suggestions THEN the HushRyd Platform SHALL store both display name and coordinates for matching
4. WHEN displaying search form THEN the HushRyd Platform SHALL show date picker, seat count selector, and optional filters (vehicle type, price range)
5. WHEN search is submitted THEN the HushRyd Platform SHALL match trips within configurable radius (default 5km) of source and destination coordinates
6. WHEN displaying results THEN the HushRyd Platform SHALL show trip cards with driver photo, vehicle details, departure time, route, available seats, and fare

### Requirement 4: Driver Booking Acceptance Flow

**User Story:** As a driver, I want to accept or decline booking requests, so that I can manage my trip capacity and passenger selection.

#### Acceptance Criteria

1. WHEN a passenger books a trip THEN the HushRyd Platform SHALL send booking request notification to driver via push notification, SMS, and WhatsApp
2. WHEN driver receives booking request THEN the HushRyd Platform SHALL display passenger details, requested seats, pickup point, and booking amount
3. WHEN driver accepts booking THEN the HushRyd Platform SHALL confirm booking, deduct seats from availability, and notify passenger of confirmation
4. WHEN driver declines booking THEN the HushRyd Platform SHALL release payment hold, notify passenger, and suggest alternative trips
5. WHEN all seats are filled THEN the HushRyd Platform SHALL automatically mark trip as 'fully_booked' and prevent new booking requests
6. WHEN trip is fully booked THEN the HushRyd Platform SHALL display 'Seats Filled' status to passengers searching for that trip
7. WHEN driver does not respond within 30 minutes THEN the HushRyd Platform SHALL auto-decline booking and notify passenger

### Requirement 5: Enhanced SOS for Passengers and Drivers

**User Story:** As a passenger or driver, I want to trigger SOS alerts during emergencies, so that I can get immediate help and share my location with emergency contacts.

#### Acceptance Criteria

1. WHEN a user (passenger or driver) triggers SOS THEN the HushRyd Platform SHALL capture current GPS location, timestamp, and trip context immediately
2. WHEN SOS is triggered THEN the HushRyd Platform SHALL send high-priority alert to operations team dashboard within 5 seconds
3. WHEN SOS is triggered THEN the HushRyd Platform SHALL notify all registered emergency contacts with live location tracking link
4. WHEN SOS is active THEN the HushRyd Platform SHALL continuously share live location with emergency contacts every 30 seconds
5. WHEN operations team receives SOS THEN the HushRyd Platform SHALL display trip details, both parties' information, exact location on map, and direct call options
6. WHEN SOS is resolved THEN the HushRyd Platform SHALL log resolution details, stop location sharing, and notify emergency contacts of resolution

### Requirement 6: Live Location Tracking and Ride Sharing

**User Story:** As a passenger, I want to share my ride details and live location with trusted contacts, so that they can track my journey for safety.

#### Acceptance Criteria

1. WHEN a trip starts THEN the HushRyd Platform SHALL enable 'Share Ride' option for passenger
2. WHEN passenger shares ride THEN the HushRyd Platform SHALL generate shareable link with trip details and live tracking map
3. WHEN shared link is accessed THEN the HushRyd Platform SHALL display driver details, vehicle info, route, and real-time location without requiring login
4. WHEN trip is in progress THEN the HushRyd Platform SHALL update shared location every 10 seconds
5. WHEN trip completes THEN the HushRyd Platform SHALL automatically expire shared links and stop location updates
6. WHEN passenger views active trip THEN the HushRyd Platform SHALL display driver's live location, ETA, and option to contact driver

