# Requirements Document

## Introduction

This feature implements a demo/dummy data mode for the HushRyd mobile app that allows complete testing of both passenger and driver flows without requiring a backend connection. The demo mode provides realistic mock data and simulates all API responses, enabling stakeholders to experience the full app functionality during development and demonstrations.

## Glossary

- **Demo_Mode**: A configuration flag that enables the app to use mock data instead of real API calls
- **Mock_Data_Service**: A service layer that intercepts API calls and returns predefined dummy data
- **Passenger_Flow**: The complete user journey from searching rides to booking, tracking, and completing a trip
- **Driver_Flow**: The complete driver journey from registration to creating trips, managing bookings, and completing rides
- **Dummy_User**: A pre-configured user account with realistic profile data for testing
- **Mock_Trip**: A simulated trip with all required data fields populated with realistic values
- **Mock_Booking**: A simulated booking with PIN, fare breakdown, and status tracking

## Requirements

### Requirement 1

**User Story:** As a developer/tester, I want to enable demo mode in the app, so that I can test all features without a backend connection.

#### Acceptance Criteria

1. WHEN the app starts with demo mode enabled THEN the Demo_Mode_Service SHALL intercept all API calls and return mock responses
2. WHEN demo mode is enabled THEN the app SHALL display a visual indicator showing demo mode is active
3. WHEN demo mode is disabled THEN the app SHALL connect to the real backend API
4. THE Demo_Mode_Service SHALL persist demo mode state across app restarts

### Requirement 2

**User Story:** As a tester, I want to experience the complete passenger flow with dummy data, so that I can verify the booking journey works correctly.

#### Acceptance Criteria

1. WHEN a passenger searches for rides in demo mode THEN the Mock_Data_Service SHALL return a list of 5-10 realistic Mock_Trips with varied departure times, fares, and driver ratings
2. WHEN a passenger views trip details THEN the Mock_Data_Service SHALL return complete trip information including driver photo, vehicle details, and route preview
3. WHEN a passenger creates a booking THEN the Mock_Data_Service SHALL generate a Mock_Booking with a unique 4-digit PIN and fare breakdown
4. WHEN a passenger confirms payment THEN the Mock_Data_Service SHALL update the booking status to confirmed and return payment confirmation
5. WHEN a passenger views their bookings THEN the Mock_Data_Service SHALL return a list of bookings in various statuses (upcoming, completed, cancelled)
6. WHEN a passenger tracks a ride THEN the Mock_Data_Service SHALL simulate driver location updates at regular intervals

### Requirement 3

**User Story:** As a tester, I want to experience the complete driver flow with dummy data, so that I can verify the trip management journey works correctly.

#### Acceptance Criteria

1. WHEN a driver registers in demo mode THEN the Mock_Data_Service SHALL simulate successful document upload and verification
2. WHEN a driver creates a trip THEN the Mock_Data_Service SHALL generate a Mock_Trip with a unique trip ID and return success
3. WHEN a driver views their trips THEN the Mock_Data_Service SHALL return trips in various statuses (scheduled, in-progress, completed)
4. WHEN a driver receives a booking request THEN the Mock_Data_Service SHALL simulate a passenger booking with realistic passenger details
5. WHEN a driver verifies a passenger PIN THEN the Mock_Data_Service SHALL validate the PIN against the Mock_Booking and update trip status
6. WHEN a driver completes a trip THEN the Mock_Data_Service SHALL update trip status and generate earnings summary

### Requirement 4

**User Story:** As a tester, I want the dummy data to be realistic and consistent, so that I can properly evaluate the app's user experience.

#### Acceptance Criteria

1. THE Mock_Data_Service SHALL generate driver names, photos, and ratings that appear realistic for the Indian market
2. THE Mock_Data_Service SHALL generate trip routes between real Indian cities with accurate distance and duration estimates
3. THE Mock_Data_Service SHALL calculate fares using the same fare calculation logic as the production system
4. THE Mock_Data_Service SHALL maintain data consistency across related entities (bookings reference valid trips, trips reference valid drivers)
5. THE Mock_Data_Service SHALL generate vehicle details with realistic Indian vehicle makes and models

### Requirement 5

**User Story:** As a tester, I want to switch between passenger and driver modes in demo, so that I can test both user journeys.

#### Acceptance Criteria

1. WHEN a user logs in as passenger in demo mode THEN the Mock_Data_Service SHALL provide passenger-specific mock data and navigation
2. WHEN a user logs in as driver in demo mode THEN the Mock_Data_Service SHALL provide driver-specific mock data including verified driver status
3. WHEN switching between modes THEN the Mock_Data_Service SHALL maintain separate state for passenger and driver data
4. THE Demo_Mode_Service SHALL allow quick role switching without re-authentication

### Requirement 6

**User Story:** As a tester, I want authentication to work seamlessly in demo mode, so that I can test the login flow.

#### Acceptance Criteria

1. WHEN a user requests OTP in demo mode THEN the Mock_Data_Service SHALL return success and display the OTP code directly in the app
2. WHEN a user enters the displayed OTP THEN the Mock_Data_Service SHALL authenticate the user and create a demo session
3. WHEN a user logs out in demo mode THEN the Mock_Data_Service SHALL clear the demo session and return to login
4. THE Demo_Mode_Service SHALL support any phone number format for demo authentication

### Requirement 7

**User Story:** As a tester, I want notifications and real-time updates to work in demo mode, so that I can test the complete user experience.

#### Acceptance Criteria

1. WHEN a booking is created in demo mode THEN the Mock_Data_Service SHALL trigger a simulated booking confirmation notification
2. WHEN tracking a ride in demo mode THEN the Mock_Data_Service SHALL emit simulated location updates every 5 seconds
3. WHEN a trip status changes THEN the Mock_Data_Service SHALL trigger appropriate status update notifications
4. THE Demo_Mode_Service SHALL simulate push notification behavior using in-app banners

### Requirement 8

**User Story:** As a tester, I want to test error scenarios in demo mode, so that I can verify error handling works correctly.

#### Acceptance Criteria

1. WHEN a specific test phone number is used THEN the Mock_Data_Service SHALL simulate network errors for testing error handling
2. WHEN booking a fully booked trip THEN the Mock_Data_Service SHALL return an appropriate error response
3. WHEN entering an invalid PIN THEN the Mock_Data_Service SHALL return a PIN validation error
4. THE Demo_Mode_Service SHALL provide a way to trigger specific error scenarios for testing
