# Design Document: HushRyd Mobile App UI Redesign

## Overview

This design document outlines the architecture and implementation approach for a complete UI redesign of the HushRyd mobile app. The redesign creates a professional, women-friendly carpooling interface with modern animations, intuitive navigation, and safety-focused visual elements using React Native with JavaScript.

The design prioritizes:
- **Visual Excellence**: Modern, minimal aesthetic with Lottie animations and smooth transitions
- **Safety Focus**: Prominent SOS features, women-only indicators, and trust signals
- **User Experience**: Intuitive flows, clear feedback, and accessibility compliance
- **Scalability**: Component-based architecture supporting 50K+ users
- **Maintainability**: Clean, well-documented JavaScript code

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HushRyd Mobile App                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Screens   │  │  Components │  │   Services  │             │
│  │  (app/*)    │  │  (src/*)    │  │  (src/*)    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────┴────────────────┴────────────────┴──────┐             │
│  │              Theme & Design System            │             │
│  │  (colors, typography, spacing, shadows)       │             │
│  └───────────────────────────────────────────────┘             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                    State Management (Zustand)               │
│  └─────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┤
│  │              Navigation (Expo Router)                       │
│  └─────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
src/
├── components/
│   ├── ui/                    # Base UI components
│   │   ├── Button.jsx
│   │   ├── Input.jsx
│   │   ├── Card.jsx
│   │   ├── Badge.jsx
│   │   ├── Avatar.jsx
│   │   ├── BottomSheet.jsx
│   │   └── index.js
│   ├── auth/                  # Authentication components
│   ├── onboarding/            # Onboarding flow components
│   ├── home/                  # Home screen components
│   ├── search/                # Search and results components
│   ├── booking/               # Booking flow components
│   ├── driver/                # Driver-specific components
│   ├── wallet/                # Wallet components
│   ├── tracking/              # Live tracking components
│   ├── sos/                   # SOS emergency components
│   └── common/                # Shared utility components
├── theme/
│   ├── colors.js              # Color palette
│   ├── typography.js          # Text styles
│   ├── spacing.js             # Spacing tokens
│   ├── shadows.js             # Shadow definitions
│   ├── borderRadius.js        # Border radius tokens
│   └── index.js               # Theme export
├── hooks/                     # Custom React hooks
├── services/                  # API and utility services
├── utils/                     # Helper functions
└── assets/
    └── animations/            # Lottie JSON files
```

## Components and Interfaces

### Design System Components

#### Colors Interface
```javascript
// src/theme/colors.js
const colors = {
  // Primary Orange - Main brand color
  primary: {
    50: '#FFF7ED',   // Lightest orange
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',  // Primary orange
    600: '#EA580C',
    700: '#C2410C',
    800: '#9A3412',
    900: '#7C2D12',  // Darkest orange
  },
  // Secondary - Deep orange/amber for accents
  secondary: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',  // Amber accent
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  // Background - Clean white theme
  background: {
    primary: '#FFFFFF',    // Main background
    secondary: '#FAFAFA',  // Card backgrounds
    tertiary: '#F5F5F5',   // Input backgrounds
  },
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',  // Success green
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',  // Warning amber
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',  // Error red
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',  // Mid gray
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',  // Near black for text
  },
  // Women-only feature accent (soft pink)
  womenOnly: {
    light: '#FDF2F8',
    main: '#EC4899',
    dark: '#BE185D',
  },
};
```

#### Button Component Interface
```javascript
// Props interface
{
  variant: 'primary' | 'secondary' | 'outline' | 'ghost',
  size: 'sm' | 'md' | 'lg',
  loading: boolean,
  disabled: boolean,
  onPress: () => void,
  children: React.ReactNode,
  leftIcon: React.ReactNode,
  rightIcon: React.ReactNode,
  fullWidth: boolean,
}
```

#### Input Component Interface
```javascript
// Props interface
{
  type: 'text' | 'phone' | 'email' | 'password',
  label: string,
  placeholder: string,
  value: string,
  onChangeText: (text: string) => void,
  error: string,
  leftIcon: React.ReactNode,
  rightIcon: React.ReactNode,
  disabled: boolean,
}
```

#### Card Component Interface
```javascript
// Props interface
{
  padding: 'none' | 'sm' | 'md' | 'lg',
  shadow: 'none' | 'sm' | 'md' | 'lg' | 'xl',
  borderRadius: 'sm' | 'md' | 'lg' | 'xl',
  onPress: () => void,
  children: React.ReactNode,
}
```

#### Badge Component Interface
```javascript
// Props interface
{
  variant: 'verified' | 'women-only' | 'instant' | 'success' | 'warning' | 'error',
  size: 'sm' | 'md',
  children: React.ReactNode,
}
```

#### Avatar Component Interface
```javascript
// Props interface
{
  source: { uri: string },
  name: string,  // For initials fallback
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl',
  showOnlineStatus: boolean,
  isOnline: boolean,
}
```

### Screen Flow Interfaces

#### Onboarding Data Structure
```javascript
const onboardingScreens = [
  {
    id: 'safety',
    title: 'Safe Carpooling',
    subtitle: 'Women-first safety with verified drivers',
    animation: require('../assets/animations/safety.json'),
  },
  {
    id: 'otp',
    title: 'Verified Drivers & OTP Rides',
    subtitle: 'Every ride verified with secure OTP',
    animation: require('../assets/animations/otp.json'),
  },
  {
    id: 'tracking',
    title: 'Live Tracking & SOS',
    subtitle: 'Real-time location sharing with emergency support',
    animation: require('../assets/animations/tracking.json'),
  },
  {
    id: 'sharing',
    title: 'Easy Cost Sharing',
    subtitle: 'Split costs fairly with transparent pricing',
    animation: require('../assets/animations/sharing.json'),
  },
];
```

#### Profile Data Structure
```javascript
const profileSchema = {
  fullName: string,        // Required
  email: string,           // Required, validated
  gender: 'male' | 'female' | 'other',  // Required
  emergencyContacts: [     // Required, exactly 3
    { name: string, phone: string },
    { name: string, phone: string },
    { name: string, phone: string },
  ],
};
```

#### Ride Search Data Structure
```javascript
const searchParams = {
  pickup: {
    address: string,
    lat: number,
    lng: number,
  },
  drop: {
    address: string,
    lat: number,
    lng: number,
  },
  date: Date,
  time: Date,
  seats: number,
};

const rideResult = {
  id: string,
  driver: {
    id: string,
    name: string,
    avatar: string,
    rating: number,
    totalRides: number,
  },
  vehicle: {
    model: string,
    color: string,
    plateNumber: string,
  },
  route: {
    pickup: { address: string, lat: number, lng: number },
    drop: { address: string, lat: number, lng: number },
    distance: number,
    duration: number,
  },
  departureTime: Date,
  availableSeats: number,
  pricePerSeat: number,
  isWomenOnly: boolean,
  isInstantBooking: boolean,
};
```

#### Wallet State Structure
```javascript
const walletState = {
  totalBalance: number,
  lockedAmount: number,
  availableAmount: number,
  transactions: [
    {
      id: string,
      type: 'earning' | 'withdrawal',
      amount: number,
      status: 'locked' | 'unlocked' | 'withdrawn' | 'pending',
      rideId: string,
      createdAt: Date,
      updatedAt: Date,
    },
  ],
};
```

## Data Models

### User Model
```javascript
{
  id: string,
  phone: string,
  fullName: string,
  email: string,
  gender: 'male' | 'female' | 'other',
  avatar: string | null,
  isProfileComplete: boolean,
  isDriver: boolean,
  driverStatus: 'none' | 'pending' | 'approved' | 'rejected',
  emergencyContacts: EmergencyContact[],
  createdAt: Date,
}
```

### Booking Model
```javascript
{
  id: string,
  passengerId: string,
  rideId: string,
  seats: number,
  pickupOTP: string,
  dropOTP: string,
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled',
  fare: {
    rideFare: number,
    platformFee: number,
    total: number,
  },
  payment: {
    method: 'upi' | 'card' | 'wallet',
    status: 'pending' | 'completed' | 'refunded',
    transactionId: string,
  },
  cancellation: {
    isFree: boolean,
    charge: number,
    reason: string,
  } | null,
  createdAt: Date,
}
```

### SOS Alert Model
```javascript
{
  id: string,
  triggeredBy: string,  // userId
  rideId: string,
  location: {
    lat: number,
    lng: number,
    address: string,
    accuracy: number,
  },
  passengerDetails: {
    name: string,
    phone: string,
  },
  driverDetails: {
    name: string,
    phone: string,
    vehicleNumber: string,
  },
  route: {
    pickup: Location,
    drop: Location,
  },
  emergencyContactsNotified: string[],
  adminNotified: boolean,
  status: 'active' | 'resolved',
  createdAt: Date,
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Design System Color Completeness
*For any* color category in the design system (primary, secondary, success, warning, error, neutral), the category SHALL contain at least 5 shade values (50, 100, 200, etc.).
**Validates: Requirements 1.1**

### Property 2: Typography Scale Completeness
*For any* text style in the typography system (headings H1-H4, body large/medium/small, caption), the style SHALL define both fontSize and lineHeight properties.
**Validates: Requirements 1.2**

### Property 3: Button Variant Rendering
*For any* combination of Button variant (primary, secondary, outline, ghost) and size (sm, md, lg), the Button component SHALL render without errors and apply the correct styles.
**Validates: Requirements 2.1**

### Property 4: Input Type Handling
*For any* Input type (text, phone, email, password) with any combination of label, placeholder, error, and icon props, the Input component SHALL render correctly and handle value changes.
**Validates: Requirements 2.2**

### Property 5: Card Configuration Rendering
*For any* Card with any combination of padding, shadow, and borderRadius props, the Card component SHALL render with the correct visual properties.
**Validates: Requirements 2.3**

### Property 6: Badge Status Rendering
*For any* Badge variant (verified, women-only, instant, success, warning, error), the Badge component SHALL render with the appropriate color and styling.
**Validates: Requirements 2.4**

### Property 7: Avatar Fallback Behavior
*For any* Avatar component, when no image source is provided, the component SHALL display initials derived from the name prop.
**Validates: Requirements 2.5**

### Property 8: Onboarding Pagination Accuracy
*For any* current screen index in the onboarding flow, the pagination component SHALL display the correct number of dots and highlight the current position.
**Validates: Requirements 3.5**

### Property 9: OTP Timer Behavior
*For any* OTP verification session, the timer SHALL start at 60 seconds, count down correctly, and enable the resend button only when the timer reaches zero with a 30-second cooldown.
**Validates: Requirements 4.4, 4.5**

### Property 10: Profile Completion Routing
*For any* user with incomplete profile (missing required fields), the app SHALL redirect to the profile completion screen; for users with complete profiles, the app SHALL navigate to the home screen.
**Validates: Requirements 5.1, 5.7**

### Property 11: Email Validation
*For any* email string input, the validation function SHALL return true only for strings matching valid email format (contains @, valid domain structure).
**Validates: Requirements 5.3**

### Property 12: Profile Progress Calculation
*For any* profile form state, the progress indicator SHALL accurately reflect the percentage of required fields completed, and the submit button SHALL be enabled only when progress reaches 100%.
**Validates: Requirements 5.4, 5.5**

### Property 13: Greeting Text Generation
*For any* user with a fullName, the home screen greeting SHALL display "Hi {firstName}" where firstName is the first word of fullName.
**Validates: Requirements 6.1**

### Property 14: Upcoming Ride Display
*For any* user with an upcoming ride booking, the home screen SHALL display the ride card; for users without upcoming rides, the ride card SHALL not be displayed.
**Validates: Requirements 6.5**

### Property 15: Ride Card Information Completeness
*For any* ride result displayed in search results, the ride card SHALL show: route preview, driver rating, car details, available seats, price, and women-only badge if applicable.
**Validates: Requirements 7.2**

### Property 16: Search Filter Correctness
*For any* search filter configuration (departure time, price range, women-only, instant booking), the filtered results SHALL only include rides matching all active filter criteria.
**Validates: Requirements 7.3**

### Property 17: Empty State Display
*For any* search with zero matching results, the app SHALL display an empty state with illustration and "Set Alert" option.
**Validates: Requirements 7.4**

### Property 18: Fare Calculation Accuracy
*For any* booking, the fare breakdown SHALL correctly calculate: total = rideFare + platformFee, and all values SHALL be non-negative.
**Validates: Requirements 8.1**

### Property 19: Free Cancellation Window
*For any* booking created within the last 3 minutes, the app SHALL display "Free cancellation available"; for bookings older than 3 minutes, the app SHALL display cancellation charges.
**Validates: Requirements 8.6, 15.1, 15.2**

### Property 20: Driver Approval Access Control
*For any* driver with status 'pending' or 'rejected', the app SHALL prevent access to ride posting features; for drivers with status 'approved', the app SHALL enable ride posting.
**Validates: Requirements 9.5, 9.6**

### Property 21: Women-Only Ride Filtering
*For any* ride with isWomenOnly=true, the ride SHALL only appear in search results for users with gender='female'.
**Validates: Requirements 10.4**

### Property 22: Wallet State Transitions
*For any* wallet transaction, the state SHALL transition correctly: booking confirmed → locked, ride started → unlocked, ride completed → withdrawable. The sum of lockedAmount + availableAmount SHALL equal totalBalance.
**Validates: Requirements 11.1, 11.2, 11.3, 11.4**

### Property 23: Transaction History Status Display
*For any* wallet transaction, the transaction list SHALL display the correct status indicator (locked, unlocked, withdrawn, pending).
**Validates: Requirements 11.6**

### Property 24: Passenger OTP Display
*For any* ride with N passengers, the driver verification screen SHALL display exactly N OTP codes, one for each passenger.
**Validates: Requirements 12.1**

### Property 25: Start Ride Button State
*For any* ride with N passengers, the "Start Ride" button SHALL be enabled only when all N passengers have been verified.
**Validates: Requirements 12.3**

### Property 26: Passenger Privacy Protection
*For any* passenger information displayed to the driver, the data SHALL NOT include personal details (phone number, email, address) beyond the verification OTP.
**Validates: Requirements 12.5**

### Property 27: Driver Info Card Completeness
*For any* tracking screen, the driver information card SHALL display: name, photo, car details (model, color, plate), and rating.
**Validates: Requirements 14.2**

## Error Handling

### Network Errors
- Display offline indicator when network is unavailable
- Queue critical actions (SOS, booking) for retry when online
- Show stale data indicator for cached content
- Implement exponential backoff for API retries

### Validation Errors
- Display inline error messages below input fields
- Highlight invalid fields with error border color
- Prevent form submission until all validations pass
- Show toast notifications for server-side validation errors

### Authentication Errors
- Redirect to login on session expiry
- Clear local storage on logout
- Handle OTP expiry with clear messaging
- Rate limit OTP requests with user feedback

### Payment Errors
- Display clear error messages for failed payments
- Provide retry option with different payment method
- Show transaction status for pending payments
- Handle refund failures with support contact

## Testing Strategy

### Property-Based Testing Library
The project will use **fast-check** for property-based testing, which is already installed in the project dependencies.

### Unit Testing Approach
- Test individual component rendering with various prop combinations
- Test utility functions (validation, formatting, calculations)
- Test state management actions and selectors
- Use Jest and React Native Testing Library

### Property-Based Testing Approach
- Each correctness property will be implemented as a single property-based test
- Tests will run a minimum of 100 iterations
- Tests will be tagged with format: `**Feature: mobile-app-ui-redesign, Property {number}: {property_text}**`
- Focus on:
  - Design system completeness and consistency
  - Component rendering across all prop combinations
  - Business logic correctness (filtering, calculations, state transitions)
  - Data validation functions

### Test File Structure
```
tests/
├── unit/
│   ├── components/
│   │   ├── Button.test.js
│   │   ├── Input.test.js
│   │   └── ...
│   ├── utils/
│   │   ├── validation.test.js
│   │   └── calculations.test.js
│   └── hooks/
│       └── useTimer.test.js
├── property/
│   ├── designSystem.property.test.js
│   ├── components.property.test.js
│   ├── businessLogic.property.test.js
│   └── wallet.property.test.js
└── integration/
    ├── onboarding.test.js
    ├── booking.test.js
    └── wallet.test.js
```

### Test Coverage Goals
- Unit tests: Cover specific examples and edge cases
- Property tests: Verify universal properties across all valid inputs
- Integration tests: Verify complete user flows work correctly
