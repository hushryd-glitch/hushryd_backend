# Implementation Plan

- [x] 1. Update theme colors and border styling for orange consistency





  - [x] 1.1 Update border colors in colors.js to use orange theme consistently


    - Change border.default from neutral to orange (#FB923C)
    - Ensure focus states use primary orange (#F97316)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.2 Update Input component focus border styling

    - Verify inputContainerFocused uses colors.primary[500]
    - Add selection state styling with orange
    - _Requirements: 4.1, 4.4_

  - [x] 1.3 Update Card component border styling

    - Add orange accent border option
    - Update default border to use theme border colors
    - _Requirements: 4.2_
  - [ ]* 1.4 Write property test for button contrast ratio
    - **Property 6: Button Contrast Ratio**
    - **Validates: Requirements 5.2**

- [x] 2. Fix Button component for label visibility






  - [x] 2.1 Update Button component text styling

r    - Ensure minimum 16px font size for all button sizes
    - Fix text color contrast for all variants
    - Add text truncation with ellipsis for long text
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 2.2 Write property test for button text visibility
    - **Property 7: Button Text Visibility**
    - **Validates: Requirements 5.4**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.




- [x] 4. Add Available Rides section to Home Screen








  - [x] 4.1 Create AvailableRidesSection component


    - Display up to 5 recently posted rides
    - Show empty state when no rides available
    - Include ride card with driver info, route, time, price
    - _Requirements: 1.1, 1.2_

  - [x] 4.2 Create utility function for limiting rides display


    - Function to return min(rides.length, 5) rides
    - Handle null/undefined input gracefully
    - _Requirements: 1.1_
  - [ ]* 4.3 Write property test for available rides limit
    - **Property 1: Available Rides Display Limit**

    - **Validates: Requirements 1.1**
  - [x] 4.4 Integrate AvailableRidesSection into HomeScreen


    - Add section after PromoBanner
    - Fetch available rides from API
    - Handle navigation to ride details on tap
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 5. Enhance Home Screen with creative elements





  - [x] 5.1 Update GreetingHeader with time-based greeting


    - Add getTimeBasedGreeting utility function
    - Display "Good Morning/Afternoon/Evening, {name}"
    - _Requirements: 3.1_
  - [ ]* 5.2 Write property test for time-based greeting
    - **Property 4: Time-Based Greeting**
    - **Validates: Requirements 3.1**

  - [x] 5.3 Add countdown timer to UpcomingRideCard

    - Calculate and display hours/minutes until departure
    - Update countdown every minute
    - _Requirements: 3.4_
  - [ ]* 5.4 Write property test for countdown accuracy
    - **Property 5: Countdown Timer Accuracy**
    - **Validates: Requirements 3.4**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement role-based Wallet differentiation





  - [x] 7.1 Create wallet role detection utility


    - Detect user role from stored user data
    - Return 'driver' or 'passenger' based on isDriver flag
    - _Requirements: 2.1, 2.2_
  - [x] 7.2 Create DriverWalletView component


    - Display earnings summary prominently
    - Show pending payouts section
    - Include withdrawal options
    - _Requirements: 2.1_

  - [x] 7.3 Create PassengerWalletView component

    - Display current balance prominently
    - Show add money option
    - Include payment history
    - _Requirements: 2.2_

  - [x] 7.4 Update WalletScreen to use role-based views

    - Detect user role on mount
    - Render appropriate wallet view
    - Handle role switching
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 7.5 Create transaction label utility

    - Return "Earned" for driver transactions
    - Return "Paid" for passenger transactions
    - _Requirements: 2.4_
  - [ ]* 7.6 Write property test for transaction labels
    - **Property 2: Transaction Label by Role**
    - **Validates: Requirements 2.4**
  - [ ]* 7.7 Write property test for wallet role consistency
    - **Property 3: Wallet View Role Consistency**
    - **Validates: Requirements 2.3**

- [x] 8. Fix Profile Edit flow completion





  - [x] 8.1 Update ProfileForm validation logic


    - Validate all required fields (fullName, email, gender)
    - Return clear validation state
    - _Requirements: 6.2, 6.3, 6.5_

  - [x] 8.2 Update profile complete screen navigation

    - Ensure "Complete Profile" button is visible and functional
    - Enable button only when form is valid
    - Navigate to home on successful save
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 8.3 Add validation error highlighting

    - Highlight missing/invalid fields with error styling
    - Display inline validation messages
    - _Requirements: 6.5_
  - [ ]* 8.4 Write property test for profile validation
    - **Property 8: Profile Form Validation**
    - **Validates: Requirements 6.3, 6.5**



- [x] 9. Checkpoint - Ensure all tests pass



  - Ensure all tests pass, ask the user if questions arise.


- [x] 10. Add consistent back/close navigation buttons





  - [x] 10.1 Update Stack layout with consistent header options

    - Add headerBackVisible: true for all stack screens
    - Configure back button styling with orange tint
    - _Requirements: 7.1, 7.5_

  - [x] 10.2 Create CloseButton component for modals

    - Render X icon button
    - Handle onClose callback
    - Style with orange accent
    - _Requirements: 7.2, 7.4_

  - [x] 10.3 Update modal screens with close buttons

    - Add close button to withdrawal modal
    - Add close button to cancellation modal
    - Add close button to any overlay screens
    - _Requirements: 7.2, 7.4_

  - [x] 10.4 Verify back navigation functionality

    - Test back button navigates to previous screen
    - Ensure root screens hide back button
    - _Requirements: 7.3, 7.5_

- [ ] 11. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
