# Requirements Document

## Introduction

This specification covers enhanced safety, tracking, and notification features for the HushRyd ride-sharing platform. The features include real OTP delivery to phones, comprehensive live location tracking for drivers and passengers, enhanced SOS functionality with detailed journey information, booking invoice generation with multi-channel delivery, unique ride verification codes, and stationary vehicle detection with passenger safety checks.

## Glossary

- **HushRyd_System**: The ride-sharing platform backend and frontend applications
- **OTP**: One-Time Password - a 6-digit verification code sent to users
- **SOS_Alert**: Emergency alert triggered by driver or passenger during a ride
- **Booking_Invoice**: A document containing booking confirmation details and fare breakdown
- **Ride_Verification_Code**: A unique 4-6 digit code shown to passenger and entered by driver to start the ride
- **Live_Location**: Real-time GPS coordinates updated every few seconds
- **Emergency_Contact**: Pre-registered contacts who receive location sharing and SOS alerts
- **Stationary_Detection**: System that monitors when a vehicle stops moving for extended periods
- **Super_Admin**: Platform administrator with full access to all system features
- **Customer_Support**: Support staff who handle user issues and SOS alerts

## Requirements

### Requirement 1

**User Story:** As a user, I want to receive OTP verification codes on my phone via SMS, so that I can securely verify my identity during login and registration.

#### Acceptance Criteria

1. WHEN a user requests OTP verification THEN the HushRyd_System SHALL send a 6-digit OTP to the user's registered phone number via SMS within 30 seconds
2. WHEN the OTP is sent THEN the HushRyd_System SHALL display a confirmation message showing the last 4 digits of the phone number
3. WHEN the SMS delivery fails THEN the HushRyd_System SHALL retry sending up to 3 times with 10-second intervals
4. WHEN all retry attempts fail THEN the HushRyd_System SHALL display an error message and offer alternative verification methods
5. WHEN the OTP is delivered THEN the HushRyd_System SHALL log the delivery status for audit purposes

### Requirement 2

**User Story:** As a driver, I want to share my live location with up to 5 contacts during a trip, so that my safety contacts can monitor my journey.

#### Acceptance Criteria

1. WHEN a driver starts a trip THEN the HushRyd_System SHALL enable live location sharing functionality
2. WHEN a driver enables location sharing THEN the HushRyd_System SHALL allow selection of up to 5 emergency contacts
3. WHEN location sharing is active THEN the HushRyd_System SHALL broadcast GPS coordinates to selected contacts every 10 seconds
4. WHEN a contact receives the shared location THEN the HushRyd_System SHALL display the driver's position on a map with route information
5. WHEN the trip ends THEN the HushRyd_System SHALL automatically stop location sharing and notify contacts

### Requirement 3

**User Story:** As a passenger, I want to share my live location with my emergency contacts during a ride, so that my family and friends can track my journey for safety.

#### Acceptance Criteria

1. WHEN a passenger's booking is confirmed THEN the HushRyd_System SHALL offer live location sharing option
2. WHEN a passenger enables location sharing THEN the HushRyd_System SHALL send tracking links to selected emergency contacts via SMS and WhatsApp
3. WHEN location sharing is active THEN the HushRyd_System SHALL update the passenger's position on the shared tracking page every 10 seconds
4. WHEN the ride completes THEN the HushRyd_System SHALL notify emergency contacts and disable the tracking link
5. WHEN an emergency contact opens the tracking link THEN the HushRyd_System SHALL display passenger location, driver details, and vehicle information

### Requirement 4

**User Story:** As a super admin, I want to view live locations of all active trips, so that I can monitor platform operations and respond to emergencies.

#### Acceptance Criteria

1. WHEN a super admin accesses the operations dashboard THEN the HushRyd_System SHALL display a map with all active trip locations
2. WHEN a trip location updates THEN the HushRyd_System SHALL reflect the change on the admin map within 5 seconds
3. WHEN a super admin clicks on a trip marker THEN the HushRyd_System SHALL display trip details including driver, passengers, route, and ETA
4. WHEN filtering by region or status THEN the HushRyd_System SHALL update the displayed trips accordingly
5. WHEN an SOS alert is active THEN the HushRyd_System SHALL highlight the affected trip with a distinct visual indicator

### Requirement 5

**User Story:** As a driver or passenger, I want to trigger an SOS alert that captures my exact location and journey details, so that emergency responders and support staff can assist me quickly.

#### Acceptance Criteria

1. WHEN a user triggers SOS THEN the HushRyd_System SHALL capture GPS coordinates, timestamp, and journey details within 2 seconds
2. WHEN SOS is triggered THEN the HushRyd_System SHALL send alert with location to super admin dashboard within 5 seconds
3. WHEN SOS is triggered THEN the HushRyd_System SHALL send alert with location to customer support dashboard within 5 seconds
4. WHEN SOS is triggered THEN the HushRyd_System SHALL notify all emergency contacts with live tracking link
5. WHEN viewing SOS alert THEN the HushRyd_System SHALL display complete journey details including route taken, stops made, and current location
6. WHEN SOS is active THEN the HushRyd_System SHALL continue tracking and broadcasting location updates every 5 seconds until resolved

### Requirement 6

**User Story:** As a passenger, I want to receive a booking invoice via WhatsApp, SMS, and email when my booking is confirmed, so that I have a record of my trip details and payment.

#### Acceptance Criteria

1. WHEN a booking is confirmed THEN the HushRyd_System SHALL generate an invoice containing trip details, fare breakdown, and booking reference
2. WHEN the invoice is generated THEN the HushRyd_System SHALL send it via WhatsApp to the passenger's registered number
3. WHEN the invoice is generated THEN the HushRyd_System SHALL send it via SMS with a link to view full details
4. WHEN the invoice is generated THEN the HushRyd_System SHALL send it via email with PDF attachment
5. WHEN any delivery channel fails THEN the HushRyd_System SHALL retry and log the failure for support review
6. WHEN the passenger views the invoice THEN the HushRyd_System SHALL display driver details, vehicle information, pickup/drop locations, scheduled time, and fare breakdown

### Requirement 7

**User Story:** As a passenger, I want to see a unique verification code when I book a ride, so that I can verify the correct driver picks me up.

#### Acceptance Criteria

1. WHEN a booking is confirmed THEN the HushRyd_System SHALL generate a unique 4-digit verification code
2. WHEN the code is generated THEN the HushRyd_System SHALL display it prominently in the passenger's booking confirmation screen
3. WHEN the code is generated THEN the HushRyd_System SHALL include it in all booking confirmation notifications (WhatsApp, SMS, email)
4. WHEN the driver arrives THEN the HushRyd_System SHALL prompt the driver to enter the passenger's verification code
5. WHEN the driver enters the correct code THEN the HushRyd_System SHALL start the ride and update trip status to "in_progress"
6. WHEN the driver enters an incorrect code THEN the HushRyd_System SHALL display an error and allow retry up to 3 times

### Requirement 8

**User Story:** As a passenger, I want to be notified when the vehicle stops for more than 15 minutes during my ride, so that I can confirm my safety or request assistance.

#### Acceptance Criteria

1. WHILE a trip is in progress THEN the HushRyd_System SHALL monitor vehicle movement using GPS coordinates
2. WHEN the vehicle remains stationary for 15 minutes THEN the HushRyd_System SHALL send a push notification to the passenger
3. WHEN the notification is sent THEN the HushRyd_System SHALL ask "Is everything okay?" with options to confirm safety or request help
4. WHEN the passenger confirms safety THEN the HushRyd_System SHALL log the confirmation and continue normal monitoring
5. WHEN the passenger requests help THEN the HushRyd_System SHALL trigger an SOS alert automatically
6. WHEN the passenger does not respond within 5 minutes THEN the HushRyd_System SHALL attempt to call the passenger
7. IF the passenger does not answer the call THEN the HushRyd_System SHALL escalate to customer support with trip details and location
