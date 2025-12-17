# Implementation Plan

- [x] 1. Remove Pricing Section from Landing Page





  - [x] 1.1 Update landing page to remove Pricing component


    - Remove Pricing import from `frontend/src/app/page.js`
    - Remove Pricing component from the page render
    - _Requirements: 1.1, 1.2_

- [x] 2. Update Navigation and Layout Components





  - [x] 2.1 Update Header component with separate navigation links


    - Modify `frontend/src/components/landing/Header.jsx`
    - Ensure About Us, Careers, Contact Us are direct page links (not scroll anchors)
    - Apply orange theming to Post a Ride button and logo accent
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.4_
  - [x] 2.2 Add Header and Footer to About page


    - Update `frontend/src/app/about/page.js` to include Header and Footer
    - Apply white background and orange accents
    - _Requirements: 2.5, 3.1, 5.1, 5.2_

  - [x] 2.3 Add Header and Footer to Careers page

    - Update `frontend/src/app/careers/page.js` to include Header and Footer
    - Apply white background and orange accents
    - _Requirements: 2.5, 3.1, 5.1, 5.2_

  - [x] 2.4 Add Header and Footer to Contact page

    - Update `frontend/src/app/contact/page.js` to include Header and Footer
    - Apply white background and orange accents
    - _Requirements: 2.5, 3.1, 5.1, 5.2_

- [x] 3. Create Search Page Components





  - [x] 3.1 Create SearchBar component


    - Create `frontend/src/components/passenger/SearchBar.jsx`
    - Implement horizontal layout with FROM, TO, DATE, PASSENGERS fields
    - Add Modify button functionality
    - Apply orange theming to buttons
    - _Requirements: 4.1, 4.10, 5.3_

  - [x] 3.2 Create FilterPanel component

    - Create `frontend/src/components/passenger/FilterPanel.jsx`
    - Implement Sort by radio buttons (Earliest departure, Lowest price, Shortest duration)
    - Implement Departure time checkboxes (Before 06:00, 06:00-12:00, 12:01-18:00, After 18:00)
    - Implement Amenities checkboxes (Max 2 in back seat, Instant Approval, Pets allowed, Smoking allowed)
    - Add Trust & Safety information box
    - Add Reset all link
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.3 Create RideCard component

    - Create `frontend/src/components/passenger/RideCard.jsx`
    - Display departure/arrival times with timeline visualization
    - Show pickup and drop locations
    - Display driver photo, name, rating with star count
    - Show badges (ID Verified, Instant Booking, Ladies Only, Pet Friendly)
    - Display price in orange INR format
    - Show available seats count
    - Add Book button with orange styling (disabled when full)
    - _Requirements: 4.7, 5.5_
  - [ ]* 3.4 Write property test for RideCard data completeness
    - **Property 1: Ride Card Data Completeness**
    - **Validates: Requirements 4.7**
    - Test that for any valid trip data, all required fields are rendered

- [x] 4. Redesign Search Page Layout






  - [x] 4.1 Update Search page with new layout

    - Update `frontend/src/app/search/page.js`
    - Add Header and Footer components
    - Integrate SearchBar at top
    - Implement two-column layout (FilterPanel left, results right)
    - Display ride count header
    - Add "Show more rides" pagination button
    - Apply white background throughout
    - _Requirements: 4.1, 4.2, 4.9, 5.2_

  - [x] 4.2 Integrate new components and wire up functionality

    - Connect SearchBar to search API
    - Connect FilterPanel to filter/sort logic
    - Replace existing trip cards with RideCard component
    - Wire Book button to navigate to booking page
    - _Requirements: 4.8_

- [x] 5. Apply Orange-White Theme Consistency






  - [x] 5.1 Update global styles and remaining components

    - Verify tailwind.config.js has correct orange primary colors
    - Update any blue-colored buttons/links to orange (primary-500/600)
    - Ensure white backgrounds on main content areas
    - Update RideSearch and SearchResults to use orange theme
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 7. Write unit tests for new components
  - [ ]* 7.1 Write tests for SearchBar component
    - Test rendering with initial values
    - Test form submission
    - Test Modify button behavior
  - [ ]* 7.2 Write tests for FilterPanel component
    - Test filter state changes
    - Test reset functionality
  - [ ]* 7.3 Write tests for RideCard component
    - Test rendering with various trip data
    - Test Book button click handler
    - Test disabled state when full
