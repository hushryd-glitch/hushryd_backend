# Requirements Document

## Introduction

This feature removes the login/onboarding flow from the mobile app and provides direct access to the main app interface with pre-populated fake data. The goal is to enable UI testing and demonstration of the complete app flow including passenger booking, driver ride posting, live tracking, and SOS features without requiring authentication.

## Glossary

- **Preview_Mode**: A state where the app operates with fake data and bypasses authentication
- **Fake_User**: A pre-configured user profile used for demonstration purposes
- **Mock_Ride**: A pre-populated ride with realistic data for testing booking flows
- **Tab_Navigation**: The bottom navigation bar with 5 main sections

## Requirements

### Requirement 1

**User Story:** As a tester, I want to skip the login flow and go directly to the home screen, so that I can quickly test the app UI without authentication.

#### Acceptance Criteria

1. WHEN the app launches THEN the Preview_Mode SHALL navigate directly to the main tab navigation screen
2. WHEN Preview_Mode is active THEN the Preview_Mode SHALL provide a pre-configured Fake_User with complete profile data
3. WHEN the app initializes THEN the Preview_Mode SHALL bypass onboarding and authentication screens entirely

### Requirement 2

**User Story:** As a tester, I want to see the 5 main tabs (Home/Search, Post Ride, Your Rides, Inbox, Profile), so that I can navigate the complete app structure.

#### Acceptance Criteria

1. WHEN the main screen loads THEN the Tab_Navigation SHALL display exactly 5 tabs: Home, Post Ride, Your Rides, Inbox, and Profile
2. WHEN a user taps any tab THEN the Tab_Navigation SHALL switch to the corresponding screen immediately
3. WHEN the app is in Preview_Mode THEN each tab SHALL display appropriate fake data for demonstration

### Requirement 3

**User Story:** As a tester, I want to see 3 available rides with realistic data, so that I can test the search and booking flow.

#### Acceptance Criteria

1. WHEN the search screen loads THEN the Preview_Mode SHALL display exactly 3 Mock_Ride entries
2. WHEN displaying Mock_Ride data THEN each ride SHALL include driver name, photo, route, time, price, and available seats
3. WHEN a user selects a Mock_Ride THEN the Preview_Mode SHALL navigate to the booking details screen with complete ride information

### Requirement 4

**User Story:** As a tester, I want to complete the booking process with fake data, so that I can verify the booking UI flow works correctly.

#### Acceptance Criteria

1. WHEN a user initiates booking on a Mock_Ride THEN the Preview_Mode SHALL display the fare breakdown screen
2. WHEN a user confirms booking THEN the Preview_Mode SHALL simulate payment success and show booking confirmation
3. WHEN booking completes THEN the Preview_Mode SHALL add the booking to the Your Rides section

### Requirement 5

**User Story:** As a tester, I want to test live tracking functionality, so that I can verify the tracking UI displays correctly.

#### Acceptance Criteria

1. WHEN a user views an active booking THEN the Preview_Mode SHALL display a simulated live tracking map
2. WHEN tracking is active THEN the Preview_Mode SHALL show driver location, route progress, and ETA
3. WHEN tracking is displayed THEN the Preview_Mode SHALL include trip progress indicators and driver info card

### Requirement 6

**User Story:** As a tester, I want to test the SOS emergency feature, so that I can verify the safety UI works correctly.

#### Acceptance Criteria

1. WHEN viewing an active ride THEN the Preview_Mode SHALL display an accessible SOS button
2. WHEN a user activates SOS THEN the Preview_Mode SHALL display the emergency screen with contact options
3. WHEN SOS is triggered THEN the Preview_Mode SHALL simulate emergency contact notification without actual calls

### Requirement 7

**User Story:** As a driver tester, I want to access KYC document upload, so that I can verify the driver verification UI.

#### Acceptance Criteria

1. WHEN a user accesses driver features THEN the Preview_Mode SHALL display the KYC status screen
2. WHEN viewing KYC screen THEN the Preview_Mode SHALL show document upload options for license, RC, insurance, and profile photo
3. WHEN a user uploads a document THEN the Preview_Mode SHALL simulate upload success and update KYC status display

### Requirement 8

**User Story:** As a driver tester, I want to post rides, so that I can verify the ride creation flow.

#### Acceptance Criteria

1. WHEN a user accesses the Post Ride tab THEN the Preview_Mode SHALL display the trip creation form
2. WHEN a user fills ride details THEN the Preview_Mode SHALL validate route, time, seats, and price inputs
3. WHEN a user submits a ride THEN the Preview_Mode SHALL simulate ride creation and show success confirmation

### Requirement 9

**User Story:** As a tester, I want to see the profile section with fake user data, so that I can verify profile UI displays correctly.

#### Acceptance Criteria

1. WHEN a user views the Profile tab THEN the Preview_Mode SHALL display the Fake_User profile with name, photo, phone, and ratings
2. WHEN viewing profile THEN the Preview_Mode SHALL show wallet balance, subscription status, and settings options
3. WHEN a user edits profile THEN the Preview_Mode SHALL allow changes and simulate save success
