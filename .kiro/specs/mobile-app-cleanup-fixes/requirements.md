# Requirements Document

## Introduction

This specification addresses several UI cleanup and fixes for the HushRyd mobile app. The changes include removing redundant UI elements (Quick Actions section, Available Rides section, Free Cancellation banner), removing Demo Mode from the login screen, fixing the button text visibility issue on the login screen, and adding the Post Ride tab to the bottom navigation with proper styling.

## Glossary

- **Home_Screen**: The main dashboard screen displayed after user login, showing search functionality and promotional content
- **Login_Screen**: The authentication screen where users enter their phone number to receive an OTP
- **Tab_Bar**: The bottom navigation component containing tabs for different app sections
- **Quick_Actions**: A section on the home screen with shortcut buttons for common actions
- **Available_Rides**: A section on the home screen displaying nearby available rides
- **Demo_Mode**: A testing feature that allows app usage without backend connectivity
- **Post_Ride_Tab**: A tab in the bottom navigation for drivers to publish new rides
- **Button_Component**: The reusable UI button component used throughout the app

## Requirements

### Requirement 1

**User Story:** As a user, I want a cleaner home screen without redundant Quick Actions, so that I can focus on the primary search functionality.

#### Acceptance Criteria

1. WHEN the Home_Screen loads THEN the system SHALL NOT display the Quick Actions section
2. WHEN the Home_Screen renders THEN the system SHALL display the search card as the primary interaction element

### Requirement 2

**User Story:** As a user, I want the home screen without the Available Rides section, so that I use the dedicated Search tab for finding rides.

#### Acceptance Criteria

1. WHEN the Home_Screen loads THEN the system SHALL NOT display the Available Rides section
2. WHEN the Home_Screen renders THEN the system SHALL NOT call the loadAvailableRides function

### Requirement 3

**User Story:** As a user, I want the promotional banners without the Free Cancellation banner, so that I see only relevant promotions.

#### Acceptance Criteria

1. WHEN the PromoBanner component renders THEN the system SHALL NOT include the free-cancellation banner
2. WHEN the PromoBanner component renders THEN the system SHALL display only Women-Only Rides and Refer & Earn banners

### Requirement 4

**User Story:** As a user, I want the login screen without Demo Mode toggle, so that I have a cleaner authentication experience.

#### Acceptance Criteria

1. WHEN the Login_Screen loads THEN the system SHALL NOT display the Demo Mode toggle section
2. WHEN the Login_Screen loads THEN the system SHALL NOT display the role selector for demo mode

### Requirement 5

**User Story:** As a user, I want to see the Continue button text clearly on the login screen, so that I can proceed with authentication.

#### Acceptance Criteria

1. WHEN the Button_Component renders with primary variant THEN the system SHALL display text in white color (#FFFFFF)
2. WHEN the Button_Component is disabled THEN the system SHALL display text in neutral gray color

### Requirement 6

**User Story:** As a driver, I want to see the Post Ride tab in the bottom navigation, so that I can easily publish new rides.

#### Acceptance Criteria

1. WHEN the Tab_Bar renders THEN the system SHALL display the Post Ride tab with add-circle icon
2. WHEN the Tab_Bar renders THEN the system SHALL display five tabs: Search, Post Ride, Your Rides, Inbox, Profile
3. WHEN the Tab_Bar renders THEN the system SHALL use orange color (#F97316) for the tab border instead of black

### Requirement 7

**User Story:** As a user, I want the tab bar to have proper orange-themed styling, so that it matches the app's design system.

#### Acceptance Criteria

1. WHEN the Tab_Bar renders THEN the system SHALL use orange border color from the primary color palette
2. WHEN a tab is active THEN the system SHALL display the active indicator in orange color (#F97316)

### Requirement 8

**User Story:** As a new user, I want to see the onboarding screens when I first open the app, so that I can learn about the app features before logging in.

#### Acceptance Criteria

1. WHEN the app starts for the first time THEN the system SHALL redirect to the onboarding screens
2. WHEN the app starts THEN the system SHALL check if onboarding has been completed before redirecting
3. WHEN onboarding is completed THEN the system SHALL redirect to the login screen
