# Requirements Document

## Introduction

This document specifies the UI/UX enhancements for the HushRyd platform, focusing on landing page simplification, navigation improvements, search page redesign matching the reference design, and consistent orange-white color theming across all pages.

## Glossary

- **Landing_Page**: The main homepage of the HushRyd platform accessible at the root URL
- **Navigation_Bar**: The fixed header component containing logo, navigation links, and action buttons
- **Footer**: The bottom section of pages containing company links, social media, and app download options
- **Search_Page**: The passenger-facing page for searching and filtering available rides
- **Filter_Panel**: A sidebar component allowing users to refine search results by various criteria
- **Ride_Card**: A visual component displaying individual trip information in search results
- **Primary_Color**: Orange (#f97316) used as the main brand color throughout the platform

## Requirements

### Requirement 1

**User Story:** As a visitor, I want a cleaner landing page without pricing tiers, so that I can focus on the core value proposition without being overwhelmed by pricing information.

#### Acceptance Criteria

1. WHEN a user visits the landing page THEN the Landing_Page SHALL NOT display the pricing section with Economy, Comfort, and Premium tiers
2. WHEN the Landing_Page renders THEN the system SHALL display Hero, Features, HowItWorks, SafetySection, and Testimonials sections in sequence

### Requirement 2

**User Story:** As a user, I want separate navigation links for About Us, Careers, and Contact Us pages, so that I can easily access company information from any page.

#### Acceptance Criteria

1. WHEN the Navigation_Bar renders THEN the system SHALL display separate clickable links for About Us, Careers, and Contact Us
2. WHEN a user clicks the About Us link THEN the system SHALL navigate to the /about page
3. WHEN a user clicks the Careers link THEN the system SHALL navigate to the /careers page
4. WHEN a user clicks the Contact Us link THEN the system SHALL navigate to the /contact page
5. WHEN any page loads THEN the system SHALL display the same Navigation_Bar component with consistent styling

### Requirement 3

**User Story:** As a user, I want a consistent footer across all pages, so that I can access important links and company information from anywhere on the platform.

#### Acceptance Criteria

1. WHEN any page loads THEN the system SHALL display the Footer component at the bottom
2. WHEN the Footer renders THEN the system SHALL maintain consistent styling and links across all pages

### Requirement 4

**User Story:** As a passenger, I want a search page with filters matching the reference design, so that I can easily find and book rides with a familiar interface.

#### Acceptance Criteria

1. WHEN the Search_Page loads THEN the system SHALL display a horizontal search bar at the top with FROM, TO, DATE, and PASSENGERS fields
2. WHEN the Search_Page loads THEN the system SHALL display a left sidebar Filter_Panel with Sort options, Departure time filters, and Amenities checkboxes
3. WHEN the Filter_Panel renders THEN the system SHALL display Sort by options including Earliest departure, Lowest price, and Shortest duration as radio buttons
4. WHEN the Filter_Panel renders THEN the system SHALL display Departure time checkboxes for Before 06:00, 06:00-12:00, 12:01-18:00, and After 18:00
5. WHEN the Filter_Panel renders THEN the system SHALL display Amenities checkboxes for Max 2 in back seat, Instant Approval, Pets allowed, and Smoking allowed
6. WHEN the Filter_Panel renders THEN the system SHALL display a Trust & Safety information box
7. WHEN search results display THEN each Ride_Card SHALL show departure time, arrival time, pickup location, drop location, driver photo, driver name, driver rating, badges (ID Verified, Instant Booking, Ladies Only, Pet Friendly), price in INR, available seats, and a Book button
8. WHEN a user clicks the Book button on a Ride_Card THEN the system SHALL navigate to the booking page for that trip
9. WHEN search results exist THEN the system SHALL display a "Show more rides" button at the bottom for pagination
10. WHEN the Search_Page header renders THEN the system SHALL display a Modify button to update search criteria

### Requirement 5

**User Story:** As a user, I want all pages to use orange as the primary color with white backgrounds, so that I experience a consistent brand identity throughout the platform.

#### Acceptance Criteria

1. WHEN any page renders THEN the system SHALL use orange (#f97316) as the Primary_Color for buttons, links, and accents
2. WHEN any page renders THEN the system SHALL use white (#ffffff) as the background color for main content areas
3. WHEN interactive elements render THEN the system SHALL use orange for primary buttons, active states, and hover effects
4. WHEN the Navigation_Bar renders THEN the system SHALL use orange for the Post a Ride button and logo accent
5. WHEN Ride_Cards render THEN the system SHALL display prices in orange and Book buttons with orange background
