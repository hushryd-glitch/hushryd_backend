# Implementation Plan

- [x] 1. Remove Quick Actions section from Home Screen






  - [x] 1.1 Remove QuickActionButton component and quickActionsSection from index.jsx

    - Remove the QuickActionButton component definition
    - Remove the Quick Actions section JSX from the render
    - Remove related styles (quickActionsSection, quickActionsRow, quickActionButton, quickActionIcon, quickActionLabel)
    - _Requirements: 1.1, 1.2_

- [x] 2. Remove Available Rides section from Home Screen






  - [x] 2.1 Remove AvailableRidesSection component and related code from index.jsx

    - Remove AvailableRidesSection import
    - Remove availableRides state and availableRidesLoading state
    - Remove loadAvailableRides function
    - Remove loadAvailableRides call from useEffect and handleRefresh
    - Remove AvailableRidesSection JSX from render
    - Remove handleAvailableRidePress and handleSearchPress callbacks
    - _Requirements: 2.1, 2.2_

- [x] 3. Remove Free Cancellation banner from PromoBanner






  - [x] 3.1 Update DEFAULT_BANNERS array in PromoBanner.jsx

    - Remove the 'free-cancellation' banner object from DEFAULT_BANNERS array
    - Keep only 'women-only' and 'referral-bonus' banners
    - _Requirements: 3.1, 3.2_
  - [ ]* 3.2 Write property test for banner exclusion
    - **Property 1: Default banners exclude free-cancellation**
    - **Validates: Requirements 3.1**

- [x] 4. Remove Demo Mode from Login Screen






  - [x] 4.1 Remove Demo Mode toggle and role selector from login.jsx

    - Remove demo-related imports (isDemoMode, setDemoMode, getDemoRole, setDemoRole)
    - Remove demo-related state (demoEnabled, demoRole)
    - Remove demo-related functions (handleDemoToggle, handleRoleSelect, loadDemoState useEffect)
    - Remove Demo Mode section JSX
    - Remove demo-related styles (demoSection, demoToggleRow, demoLabelContainer, demoLabel, demoHint, roleSelector, roleSelectorLabel, roleButtons, roleButton, roleButtonActive, roleEmoji, roleButtonText, roleButtonTextActive)
    - _Requirements: 4.1, 4.2_

- [x] 5. Fix Button text color for primary variant






  - [x] 5.1 Verify and fix Button component text color

    - Verify VARIANTS.primary.textColor is set to colors.white (#FFFFFF)
    - Ensure the text color is properly applied in the component
    - _Requirements: 5.1, 5.2_
  - [ ]* 5.2 Write property test for button text color
    - **Property 2: Button primary variant text color**
    - **Validates: Requirements 5.1**

- [x] 6. Fix Tab Bar styling






  - [x] 6.1 Update tab bar border color to orange in _layout.jsx

    - Change borderTopColor from colors.border to colors.primary[300] or colors.border.light
    - Verify active indicator uses colors.primary[500]
    - _Requirements: 6.3, 7.1, 7.2_
  - [ ]* 6.2 Write property test for tab configuration
    - **Property 3: Tab configuration completeness**
    - **Validates: Requirements 6.2**

- [x] 7. Implement App Entry Flow with Onboarding






  - [x] 7.1 Update app entry point (index.jsx) to check onboarding status

    - Import onboarding service to check completion status
    - Import auth service to check authentication status
    - Implement logic to redirect based on onboarding and auth status
    - If onboarding not completed → redirect to onboarding
    - If onboarding completed but not authenticated → redirect to login
    - If authenticated → redirect to tabs
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 7.2 Write property test for app entry flow
    - **Property 4: App entry flow correctness**
    - **Validates: Requirements 8.1, 8.2**

- [ ] 8. Final Checkpoint - Make sure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
