# Design Document: Mobile App Cleanup Fixes

## Overview

This design document outlines the implementation approach for cleaning up the HushRyd mobile app UI by removing redundant elements and fixing styling issues. The changes focus on simplifying the home screen, removing demo mode from login, fixing button text visibility, and ensuring the tab bar displays correctly with proper styling.

## Architecture

The changes affect the following layers of the mobile app:

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
├─────────────────────────────────────────────────────────┤
│  Home Screen (index.jsx)                                │
│  - Remove Quick Actions section                         │
│  - Remove Available Rides section                       │
├─────────────────────────────────────────────────────────┤
│  Login Screen (login.jsx)                               │
│  - Remove Demo Mode toggle and role selector            │
├─────────────────────────────────────────────────────────┤
│  Tab Layout (_layout.jsx)                               │
│  - Fix border color to orange                           │
├─────────────────────────────────────────────────────────┤
│                    Component Layer                       │
├─────────────────────────────────────────────────────────┤
│  PromoBanner.jsx                                        │
│  - Remove free-cancellation banner from defaults        │
├─────────────────────────────────────────────────────────┤
│  Button.jsx                                             │
│  - Ensure white text color for primary variant          │
├─────────────────────────────────────────────────────────┤
│                    Configuration Layer                   │
├─────────────────────────────────────────────────────────┤
│  tabConfig.js                                           │
│  - Verify Post Ride tab is included                     │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Home Screen (mobile-app/app/(tabs)/index.jsx)

**Changes:**
- Remove the Quick Actions section (QuickActionButton component and quickActionsSection)
- Remove the Available Rides section (AvailableRidesSection component)
- Remove the loadAvailableRides function and related state
- Remove AvailableRidesSection import

**Interface remains unchanged** - The screen still exports the default HomeScreen component.

### 2. Login Screen (mobile-app/app/(auth)/login.jsx)

**Changes:**
- Remove Demo Mode toggle section entirely
- Remove demo-related state variables (demoEnabled, demoRole)
- Remove demo-related functions (handleDemoToggle, handleRoleSelect)
- Remove demo-related imports (isDemoMode, setDemoMode, getDemoRole, setDemoRole)
- Remove demo-related styles

**Interface remains unchanged** - The screen still exports the default LoginScreen component.

### 3. PromoBanner Component (mobile-app/src/components/home/PromoBanner.jsx)

**Changes:**
- Remove the 'free-cancellation' banner from DEFAULT_BANNERS array
- Keep only 'women-only' and 'referral-bonus' banners

**Interface remains unchanged** - Component props and exports stay the same.

### 4. Button Component (mobile-app/src/components/ui/Button.jsx)

**Changes:**
- Verify VARIANTS.primary.textColor is set to colors.white (#FFFFFF)
- The current implementation already has this correct, but we'll verify

**Interface remains unchanged**.

### 5. Tab Layout (mobile-app/app/(tabs)/_layout.jsx)

**Changes:**
- Change borderTopColor from colors.border to colors.primary[300] or similar orange shade
- Ensure active indicator uses colors.primary[500]

**Interface remains unchanged**.

### 6. Tab Configuration (mobile-app/src/config/tabConfig.js)

**Verification:**
- Confirm TAB_CONFIG includes the 'publish' tab with label 'Post Ride'
- The current configuration already includes this tab

### 7. App Entry Point (mobile-app/app/index.jsx)

**Changes:**
- Instead of directly redirecting to tabs, check if onboarding has been completed
- If onboarding not completed, redirect to onboarding screens
- If onboarding completed but not authenticated, redirect to login
- If authenticated, redirect to tabs

**New Flow:**
```
App Start
    │
    ▼
Check Onboarding Status
    │
    ├── Not Completed ──► Onboarding Screens
    │
    └── Completed ──► Check Auth Status
                          │
                          ├── Not Authenticated ──► Login Screen
                          │
                          └── Authenticated ──► Tabs (Home)
```

## Data Models

No data model changes required. This is purely a UI cleanup task.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Default banners exclude free-cancellation
*For any* rendering of the PromoBanner component with default banners, the banner list should not contain a banner with id 'free-cancellation'
**Validates: Requirements 3.1**

### Property 2: Button primary variant text color
*For any* Button component rendered with variant='primary' and not disabled, the text color should be white (#FFFFFF)
**Validates: Requirements 5.1**

### Property 3: Tab configuration completeness
*For any* TAB_CONFIG array, it should contain exactly 5 tabs with labels: 'Search', 'Post Ride', 'Your Rides', 'Inbox', 'Profile' in that order
**Validates: Requirements 6.2**

### Property 4: App entry flow correctness
*For any* app start, if onboarding is not completed, the system should redirect to onboarding screens; otherwise check authentication status
**Validates: Requirements 8.1, 8.2**

## Error Handling

No specific error handling changes required. The changes are removing UI elements and fixing styles, which don't introduce new error scenarios.

## Testing Strategy

### Unit Tests
- Verify PromoBanner DEFAULT_BANNERS array has exactly 2 items
- Verify Button VARIANTS.primary.textColor equals '#FFFFFF' or colors.white
- Verify TAB_CONFIG has 5 tabs with correct labels

### Property-Based Tests
Using Jest with fast-check for property-based testing:

1. **Banner exclusion property**: Generate random banner configurations and verify free-cancellation is never included in defaults
2. **Button text color property**: For any primary button state (enabled/disabled), verify correct text color
3. **Tab configuration property**: Verify tab count and labels match specification

### Integration Tests
- Render Home Screen and verify Quick Actions section is not present
- Render Home Screen and verify Available Rides section is not present
- Render Login Screen and verify Demo Mode section is not present
- Render Tab Bar and verify all 5 tabs are visible with correct styling
