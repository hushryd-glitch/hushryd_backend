# Implementation Plan: HushRyd Mobile App UI Enhancements

- [x] 1. Set Up Design System Foundation





  - [x] 1.1 Create theme color palette


    - Create src/theme/colors.js with primary (#FF6B00), background (#FFFFFF), text colors
    - Export colors object with all color tokens
    - _Requirements: 4.1, 4.2, 4.3_


  - [x] 1.2 Create typography scale

    - Create src/theme/typography.js with h1, h2, h3, body1, body2, caption, button styles
    - Include fontSize, fontWeight, lineHeight for each
    - _Requirements: 4.3_

  - [x] 1.3 Create spacing and border radius system


    - Create src/theme/spacing.js with xs, sm, md, lg, xl, xxl values
    - Create src/theme/borderRadius.js with sm (4), md (8), lg (12), xl (16), full values
    - _Requirements: 4.4_

  - [x] 1.4 Create theme index and provider


    - Create src/theme/index.js exporting all theme values
    - Update existing theme files to use new design system
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.5 Write property tests for theme consistency


    - **Property 9: Theme Background Color Consistency**
    - **Property 10: Theme Primary Color Consistency**
    - **Property 11: Theme Typography Color Consistency**
    - **Property 12: Theme Border Radius Consistency**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 2. Create Core UI Components





  - [x] 2.1 Create Button component


    - Create src/components/ui/Button.jsx with variants (primary, secondary, outline, ghost)
    - Support sizes (sm, md, lg), loading state, disabled state
    - Apply orange (#FF6B00) for primary variant, 12px border radius
    - Ensure minimum 44px touch target
    - _Requirements: 4.2, 4.4, 5.5_

  - [x] 2.2 Create Input component


    - Create src/components/ui/Input.jsx with label, placeholder, error states
    - Support types: text, phone, email, password
    - Apply consistent styling with border focus color
    - _Requirements: 4.3, 4.4_

  - [x] 2.3 Create Card component


    - Create src/components/ui/Card.jsx with elevated and flat variants
    - Apply 8px border radius and shadow effects
    - Support onPress for touchable cards
    - _Requirements: 4.4_

  - [x] 2.4 Create Skeleton loader component


    - Create src/components/ui/Skeleton.jsx with rectangle, circle, text variants
    - Add subtle pulse animation
    - _Requirements: 4.5_

  - [x] 2.5 Create EmptyState component


    - Create src/components/ui/EmptyState.jsx with illustration, title, message, action
    - _Requirements: 4.6_

  - [x] 2.6 Write property test for empty state completeness


    - **Property 13: Empty State Content Completeness**
    - **Validates: Requirements 4.6**

  - [x] 2.7 Write property test for touch target size

    - **Property 16: Touch Target Minimum Size**
    - **Validates: Requirements 5.5**

- [x] 3. Implement Responsive Utilities





  - [x] 3.1 Create responsive scaling utilities


    - Create src/utils/responsive.js with scale, verticalScale, moderateScale functions
    - Implement getScreenCategory, isSmallScreen, isLargeScreen helpers
    - Base scaling on 375px reference width
    - _Requirements: 5.1, 5.2_

  - [x] 3.2 Create responsive container component


    - Create src/components/ui/Container.jsx with max width constraint for large screens
    - Center content on screens wider than 428px
    - _Requirements: 5.2_

  - [x] 3.3 Write property tests for responsive scaling


    - **Property 14: Responsive Font Scaling**
    - **Property 15: Large Screen Max Width**
    - **Validates: Requirements 5.1, 5.2**

- [x] 4. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Onboarding System





  - [x] 5.1 Create onboarding service


    - Create src/services/onboarding/onboardingService.js
    - Implement hasCompletedOnboarding, completeOnboarding, resetOnboarding
    - Store completion state in AsyncStorage
    - _Requirements: 1.6_

  - [x] 5.2 Create onboarding screen data


    - Define ONBOARDING_SCREENS array with 4 screens (Welcome, Find Ride, Share Journey, Safety)
    - Include id, illustration placeholder, title, description for each
    - _Requirements: 1.1, 1.3_

  - [x] 5.3 Write property tests for onboarding


    - **Property 1: Onboarding Display on First Launch**
    - **Property 2: Onboarding Screen Content Completeness**
    - **Property 3: Onboarding Persistence Round Trip**
    - **Validates: Requirements 1.1, 1.3, 1.6**

  - [x] 5.4 Create OnboardingScreen component


    - Create src/components/onboarding/OnboardingScreen.jsx
    - Display illustration, title, description with fade-in animation
    - _Requirements: 1.3_

  - [x] 5.5 Create OnboardingPagination component


    - Create src/components/onboarding/OnboardingPagination.jsx
    - Show dots indicating current screen position
    - _Requirements: 1.1_

  - [x] 5.6 Create onboarding flow screen


    - Create app/(onboarding)/index.jsx with horizontal swipe navigation
    - Implement slide animation with 300ms duration
    - Add Skip button and Get Started button on last screen
    - Navigate to login on completion
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 5.7 Update app entry point for onboarding check


    - Modify app/index.jsx to check onboarding completion
    - Route to onboarding or auth based on state
    - _Requirements: 1.1, 1.6_

- [x] 6. Enhance Phone Login Screen





  - [x] 6.1 Create phone validation utility


    - Create src/utils/validation.js with validatePhoneNumber function
    - Validate 10-digit Indian phone numbers
    - _Requirements: 2.1_


  - [x] 6.2 Write property test for phone validation

    - **Property 4: Phone Number Validation**
    - **Validates: Requirements 2.1**

  - [x] 6.3 Create enhanced PhoneInput component


    - Update src/components/auth/PhoneInput.jsx with country code selector
    - Default to +91 (India) with flag
    - Apply new design system styling
    - _Requirements: 2.1_


  - [x] 6.4 Update login screen with new design

    - Update app/(auth)/login.jsx with white background, orange accents
    - Add loading state during OTP request
    - Apply new Button and Input components
    - _Requirements: 2.1, 2.2, 4.1, 4.2_

- [x] 7. Enhance OTP Verification Screen





  - [x] 7.1 Create countdown timer utility


    - Create src/utils/countdown.js with useCountdown hook
    - Start at 30 seconds, decrement each second
    - _Requirements: 2.7_


  - [x] 7.2 Write property test for countdown timer

    - **Property 5: OTP Countdown Timer**
    - **Validates: Requirements 2.7**

  - [x] 7.3 Update OTP input component with animations


    - Update src/components/auth/OTPInput.jsx with shake animation on error
    - Apply new design system styling
    - _Requirements: 2.4, 2.6_


  - [x] 7.4 Update OTP screen with new design

    - Update app/(auth)/otp.jsx with white background, orange accents
    - Add resend button with countdown timer
    - Add success animation on verification
    - _Requirements: 2.3, 2.5, 2.7, 4.1, 4.2_

- [x] 8. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Redesign Home Screen and Tab Navigation





  - [x] 9.1 Create tab configuration


    - Define TAB_CONFIG with Search, Publish, Your Rides, Profile tabs
    - Include icon names for active and inactive states
    - _Requirements: 3.1_

  - [x] 9.2 Write property test for tab configuration


    - **Property 6: Tab Navigation Configuration**
    - **Validates: Requirements 3.1**

  - [x] 9.3 Update tab layout with new design


    - Update app/(tabs)/_layout.jsx with custom tab bar
    - Apply orange highlight for active tab
    - Use white background for tab bar
    - _Requirements: 3.1, 3.6, 4.1, 4.2_

  - [x] 9.4 Write property test for active tab highlighting


    - **Property 8: Active Tab Highlighting**
    - **Validates: Requirements 3.6**

  - [x] 9.5 Redesign Search tab (Home)


    - Update app/(tabs)/index.jsx with new design
    - Add prominent source/destination inputs
    - Add date picker and seat selector
    - Apply white background with orange accents
    - _Requirements: 3.2, 4.1, 4.2_

  - [x] 9.6 Create Publish tab screen


    - Create app/(tabs)/publish.jsx
    - Show trip creation form for drivers
    - Show "Become a Driver" prompt for passengers
    - _Requirements: 3.3_

  - [x] 9.7 Write property test for publish tab conditional rendering


    - **Property 7: Publish Tab Conditional Rendering**
    - **Validates: Requirements 3.3**

  - [x] 9.8 Redesign Your Rides tab


    - Update app/(tabs)/bookings.jsx with tabbed interface
    - Add Upcoming and Past tabs
    - Apply new card design for booking items
    - _Requirements: 3.4_

  - [x] 9.9 Redesign Profile tab


    - Update app/(tabs)/profile.jsx with new design
    - Show user avatar, name prominently
    - Add settings options with consistent styling
    - _Requirements: 3.5_

- [x] 10. Implement Functional Integration





  - [x] 10.1 Create trip creation validation


    - Create src/utils/tripValidation.js with validateTripForm function
    - Validate source, destination, date, time, seats, fare
    - _Requirements: 6.2_


  - [x] 10.2 Write property test for trip validation

    - **Property 17: Trip Creation Validation**
    - **Validates: Requirements 6.2**

  - [x] 10.3 Create error message formatter


    - Create src/utils/errorMessages.js with formatNetworkError function
    - Map error codes to user-friendly messages
    - Include retry option in error response
    - _Requirements: 6.5_


  - [x] 10.4 Write property test for error message formatting

    - **Property 18: Network Error Message Formatting**
    - **Validates: Requirements 6.5**

  - [x] 10.5 Update search results with new card design


    - Update src/components/search/RideCard.jsx with new styling
    - Apply Card component with 8px border radius
    - _Requirements: 6.1_


  - [x] 10.6 Add pull-to-refresh to bookings

    - Update bookings screen with RefreshControl
    - Show loading skeleton during refresh
    - _Requirements: 6.3_


  - [x] 10.7 Update profile update flow

    - Add success confirmation toast/modal after profile update
    - _Requirements: 6.4_

- [x] 11. Create Onboarding Assets






  - [x] 11.1 Create placeholder illustrations

    - Create mobile-app/assets/onboarding/ directory
    - Add placeholder images for 4 onboarding screens
    - _Requirements: 1.3_

- [x] 12. Final Polish and Testing





  - [x] 12.1 Apply consistent styling across all screens

    - Review all screens for design system compliance
    - Ensure white backgrounds and orange accents throughout
    - _Requirements: 4.1, 4.2_


  - [x] 12.2 Test responsive behavior

    - Test on small screens (< 375px)
    - Test on large screens (> 428px)
    - Verify safe area handling on notched devices
    - _Requirements: 5.1, 5.2, 5.4_


  - [x] 12.3 Test all user flows

    - Test onboarding flow end-to-end
    - Test login/OTP flow
    - Test tab navigation
    - Test search, booking, profile flows
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 13. Final Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.
