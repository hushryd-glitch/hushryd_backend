# Implementation Plan

## 1. Mobile App UI - Error Display Components

- [x] 1.1 Create error display components for API failures
  - Created `ApiErrorDisplay.jsx` with TimeoutErrorDisplay, ServerErrorDisplay, ClientErrorDisplay, FeatureUnavailableDisplay, NetworkErrorDisplay, AuthErrorDisplay, RateLimitErrorDisplay
  - Generic ApiErrorDisplay auto-selects appropriate component based on error type
  - _Requirements: 3.2, 3.3, 3.4, 4.1_

- [x] 1.2 Create stale data indicator component
  - Created `StaleDataIndicator.jsx` with banner, inline, and badge variants
  - Shows "Last updated" timestamp with relative time formatting
  - Added OfflineDataBanner and SyncingIndicator components
  - _Requirements: 4.3_

- [x] 1.3 Create environment indicator badge
  - Created `EnvironmentBadge.jsx` with position options
  - Shows "DEV", "STAGING", or "PROD" indicator with color coding
  - Added EnvironmentIndicator and ApiUrlDisplay for settings screens
  - _Requirements: 8.5_

## 2. Backend Health Check System

- [x] 2.1 Create health check endpoint and service
  - Health check endpoints already exist in `backend/src/index.js` (`/health`, `/health/deep`, `/health/metrics`, `/health/alerts`)
  - Implements database, Redis, and external service checks via `healthMonitoringService.js`
  - Returns structured response with service statuses and latency metrics
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 2.2 Write property test for health check response completeness
  - **Property 1: Health Check Response Completeness**
  - **Validates: Requirements 1.1, 1.2**

- [ ]* 2.3 Write property test for degraded status accuracy
  - **Property 2: Health Check Degraded Status Accuracy**
  - **Validates: Requirements 1.3**

## 3. Environment Configuration Validation

- [x] 3.1 Create environment config validator for mobile app
  - Created `mobile-app/src/services/config/configValidator.js`
  - Implements URL format validation (HTTPS for production)
  - Detects missing required environment variables
  - Warns on environment mismatches (dev using prod URL, etc.)
  - Added validateConfig, validateConfigOrThrow, getMissingVariables functions
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 3.2 Write property test for environment URL validation
  - **Property 3: Environment URL Validation**
  - **Validates: Requirements 2.1, 2.3, 2.4**

- [ ]* 3.3 Write property test for missing environment variable detection
  - **Property 4: Missing Environment Variable Detection**
  - **Validates: Requirements 2.2**

## 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 5. API Connection Resilience

- [x] 5.1 Enhance resilient API client with retry logic
  - Already implemented in `mobile-app/src/services/api/resilientClient.js`
  - Implements exponential backoff with configurable retries
  - Has 30-second timeout handling via `REQUEST_TIMEOUT`
  - Classifies errors by HTTP status code (4xx vs 5xx)
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ]* 5.2 Write property test for exponential backoff retry timing
  - **Property 5: Exponential Backoff Retry Timing**
  - **Validates: Requirements 3.1**

- [ ]* 5.3 Write property test for HTTP status code classification
  - **Property 6: HTTP Status Code Classification**
  - **Validates: Requirements 3.3, 3.4**

- [x] 5.4 Implement offline mode and request queue
  - Already implemented in `mobile-app/src/services/storage/offlineService.js`
  - Queues requests with `queueAction` and `queueCriticalAction`
  - Auto-retry queued requests in FIFO order via `syncQueuedActions`
  - _Requirements: 3.5, 3.6_

- [x]* 5.5 Write property test for offline queue FIFO order
  - **Property 7: Offline Queue FIFO Order**
  - Already implemented in `mobile-app/tests/property/offline.property.test.js`
  - **Validates: Requirements 3.5, 3.6**

## 6. API Endpoint Availability Handling

- [x] 6.1 Implement graceful error handling for endpoint failures
  - Already implemented in `mobile-app/src/services/api/errors.js`
  - Handles 404 without crashing via `handleApiError`
  - Returns structured error responses with `canRetry` flag
  - _Requirements: 4.1, 4.2, 4.3_

- [ ]* 6.2 Write property test for graceful 404 handling
  - **Property 8: Graceful 404 Handling**
  - **Validates: Requirements 4.1**

- [ ]* 6.3 Write property test for cache fallback on failure
  - **Property 9: Cache Fallback on Failure**
  - **Validates: Requirements 4.2, 4.3**

- [x] 6.4 Implement booking queue and SOS fallback
  - Booking queue implemented via `queueCriticalAction` in offlineService
  - SOS fallback implemented with retry and phone call fallback
  - _Requirements: 4.4, 4.5_

## 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 8. Backend API Versioning

- [x] 8.1 Implement API version middleware
  - Created `backend/src/middleware/apiVersion.js`
  - Parses X-API-Version header from requests
  - Routes to appropriate version handlers via `versionRoute`
  - Returns deprecation warnings and 410 for unsupported versions
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 8.2 Add version header to mobile app requests
  - Updated `mobile-app/src/services/api/resilientClient.js`
  - Includes X-API-Version: v1 in all requests
  - Added response interceptor to detect version mismatch and deprecation warnings
  - Added `setVersionMismatchHandler` for app update prompts
  - _Requirements: 5.1, 5.5_

- [ ]* 8.3 Write property test for API version header inclusion
  - **Property 10: API Version Header Inclusion**
  - **Validates: Requirements 5.1**

- [ ]* 8.4 Write property test for version deprecation warning detection
  - **Property 11: Version Deprecation Warning Detection**
  - **Validates: Requirements 5.3, 5.4**

## 9. Error Reporting and Diagnostics

- [x] 9.1 Implement comprehensive error logging
  - Already implemented in `mobile-app/src/services/api/errors.js`
  - Logs endpoint, status code, response body, timestamp for API errors
  - Error handling integrated with resilient client
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 9.2 Write property test for error log completeness
  - **Property 12: Error Log Completeness**
  - **Validates: Requirements 7.1, 7.2**

## 10. Local Development API Configuration

- [x] 10.1 Implement environment switching support
  - Already implemented in `mobile-app/src/services/api/config.js`
  - Supports configurable API_BASE_URL via .env and Expo config
  - _Requirements: 8.1, 8.3_

- [x] 10.2 Add cache clear on environment switch
  - Added `clearCacheOnEnvironmentSwitch` function to offlineService
  - Detects environment changes and clears all cached data
  - Prevents data mixing between dev/staging/prod environments
  - _Requirements: 8.4_

- [ ]* 10.3 Write property test for environment configuration loading
  - **Property 13: Environment Configuration Loading**
  - **Validates: Requirements 8.1, 8.3**

- [ ]* 10.4 Write property test for cache clear on environment switch
  - **Property 14: Cache Clear on Environment Switch**
  - **Validates: Requirements 8.4**

## 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 12. OTP Authentication Enhancement

- [x] 12.1 Enhance phone number validation
  - Already implemented in `mobile-app/src/utils/validation.js`
  - Validates 10-digit Indian format
  - _Requirements: 10.1_

- [x]* 12.2 Write property test for phone number validation
  - **Property 15: Phone Number Validation (Indian Format)**
  - Already implemented in `mobile-app/tests/property/validation.property.test.js`
  - **Validates: Requirements 10.1**

- [x] 12.3 Enhance OTP generation and expiry
  - Already implemented in `backend/src/services/otpService.js`
  - Generates 6-digit OTP with configurable expiry (default 5 minutes)
  - _Requirements: 10.2_

- [ ]* 12.4 Write property test for OTP format and expiry
  - **Property 16: OTP Format and Expiry**
  - **Validates: Requirements 10.2**

- [x] 12.5 Implement countdown timer utility
  - Already implemented in `mobile-app/src/utils/countdown.js`
  - Accurate countdown with configurable duration
  - _Requirements: 10.4_

- [x]* 12.6 Write property test for countdown timer accuracy
  - **Property 17: Countdown Timer Accuracy**
  - Already implemented in `mobile-app/tests/property/countdown.property.test.js`
  - **Validates: Requirements 10.4**

## 13. Profile Completeness Validation

- [x] 13.1 Implement profile completeness check
  - Already implemented in `mobile-app/src/services/profile/profileService.js`
  - Booking service checks mandatory fields in `backend/src/services/bookingService.js`
  - Checks name and emergency contacts before booking
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ]* 13.2 Write property test for profile completeness validation
  - **Property 18: Profile Completeness Validation**
  - **Validates: Requirements 11.2, 11.3**

## 14. Booking Role Enforcement

- [x] 14.1 Implement booking role validation
  - Already implemented in `backend/src/services/bookingService.js`
  - Women-only ride validation prevents unauthorized bookings
  - Role-based access control via auth middleware
  - _Requirements: 13.2_

- [ ]* 14.2 Write property test for booking role enforcement
  - **Property 19: Booking Role Enforcement**
  - **Validates: Requirements 13.2**

## 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 16. Driver Wallet State Management

- [x] 16.1 Implement wallet state transitions
  - Already implemented in `backend/src/services/walletService.js`
  - Implements promo/non-promo balance segregation
  - Deduction logic ensures locked amount never exceeds total balance
  - _Requirements: 16.1, 16.2, 16.3_

- [ ]* 16.2 Write property test for wallet state transitions
  - **Property 20: Wallet State Transitions**
  - **Validates: Requirements 16.1, 16.2, 16.3**

## 17. WebSocket Connection Management

- [x] 17.1 Enhance WebSocket reconnection logic
  - Created `mobile-app/src/services/socket/socketManager.js`
  - Auto-reconnect within 3 seconds on disconnect (configurable)
  - Restores subscriptions after reconnection via `pendingSubscriptions`
  - Heartbeat monitoring with ping/pong
  - Connection state callbacks for UI updates
  - _Requirements: 18.1, 18.3_

- [ ]* 17.2 Write property test for WebSocket reconnection
  - **Property 21: WebSocket Reconnection**
  - **Validates: Requirements 18.3**

## 18. SOS Data Capture

- [x] 18.1 Enhance SOS data capture
  - Already implemented in `mobile-app/src/services/sos/sosService.js`
  - Captures GPS, user details, timestamp
  - Implements retry and phone call fallback via critical action queue
  - _Requirements: 19.1, 19.4_

- [ ]* 18.2 Write property test for SOS data capture completeness
  - **Property 22: SOS Data Capture Completeness**
  - **Validates: Requirements 19.1**

## 19. Cancellation Grace Period

- [x] 19.1 Implement cancellation grace period logic
  - Already implemented in `backend/src/services/cancellationService.js`
  - Time-based refund percentages with configurable policy
  - Free cancellation benefit for subscribers
  - _Requirements: 20.1, 20.2, 20.3_

- [ ]* 19.2 Write property test for cancellation grace period
  - **Property 23: Cancellation Grace Period**
  - **Validates: Requirements 20.1, 20.2, 20.3**

## 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 21. API Security Enhancement

- [x] 21.1 Enhance JWT validation middleware
  - Already implemented in `backend/src/middleware/auth.js`
  - Validates JWT signature and expiry via `verifyToken`
  - Returns 401 for invalid/expired tokens
  - _Requirements: 17.1, 17.2_

- [ ]* 21.2 Write property test for JWT token validation
  - **Property 24: JWT Token Validation**
  - **Validates: Requirements 17.1, 17.2**

## 22. Rate Limiting Enhancement

- [x] 22.1 Enhance rate limiter middleware
  - Already implemented in `backend/src/middleware/rateLimiter.js`
  - Enforces 100 requests per minute per user (standard limiter)
  - Returns 429 with Retry-After header
  - _Requirements: 18.2_

- [ ]* 22.2 Write property test for rate limit enforcement
  - **Property 25: Rate Limit Enforcement**
  - **Validates: Requirements 18.2**

## 23. Response Optimization

- [x] 23.1 Implement response compression
  - Already implemented in `backend/src/index.js` via `compression()` middleware
  - Gzip compression enabled for all responses
  - _Requirements: 19.1_

- [ ]* 23.2 Write property test for response compression
  - **Property 26: Response Compression**
  - **Validates: Requirements 19.1**

- [x] 23.3 Implement pagination consistency
  - Created `backend/src/utils/paginationUtils.js`
  - Provides `createPaginationMeta` with total count, totalPages, hasNextPage, hasPrevPage
  - Added `validatePaginationConsistency` to verify sum of pages equals total
  - Added cursor-based pagination support for large datasets
  - _Requirements: 19.3_

- [ ]* 23.4 Write property test for pagination consistency
  - **Property 27: Pagination Consistency**
  - **Validates: Requirements 19.3**

## 24. API Response Caching

- [x] 24.1 Implement Redis caching with TTL
  - Already implemented in `backend/src/services/cacheService.js`
  - Cache user profiles (5-min TTL via `USER_PROFILE_TTL`)
  - Cache search results (30-sec TTL via `TRIP_SEARCH_TTL`)
  - Fallback to database on cache miss
  - _Requirements: 23.1, 23.2, 23.3_

- [ ]* 24.2 Write property test for cache TTL enforcement
  - **Property 28: Cache TTL Enforcement**
  - **Validates: Requirements 23.1, 23.2, 23.3**

## 25. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 26. Mobile App UI - Wallet Display

- [x] 26.1 Create wallet display component
  - Created `mobile-app/src/components/wallet/WalletDisplay.jsx`
  - Displays locked amount, unlocked amount, and withdrawal history
  - Shows balance breakdown with promo balance indicator
  - Includes transaction history and withdrawal tabs
  - _Requirements: 16.4_

## 27. Mobile App UI - Tracking Display

- [x] 27.1 Create real-time tracking display
  - Already implemented in `mobile-app/src/components/tracking/LiveTracking.jsx` and `TrackingMap.jsx`
  - Created `mobile-app/src/components/tracking/TripSummary.jsx` for trip completion with rating
  - Displays driver location, ETA, and route on map
  - Shows trip summary with star rating and feedback option on completion
  - _Requirements: 18.4, 18.5_

## 28. Mobile App UI - SOS Emergency Screen

- [x] 28.1 Create SOS emergency screen
  - Created `mobile-app/src/components/sos/SOSEmergencyScreen.jsx`
  - Displays emergency screen with pulsing SOS indicator
  - Shows emergency contact numbers (112, 100, 1091 Women Helpline)
  - Displays user's emergency contacts with call buttons
  - Shows confirmation on SOS resolution/cancellation
  - _Requirements: 19.3, 19.5_

## 29. Mobile App UI - Cancellation Flow

- [x] 29.1 Create cancellation UI components
  - Created `mobile-app/src/components/booking/CancellationUI.jsx`
  - `GracePeriodAlert`: Shows countdown for free cancellation window (3 minutes)
  - `CancellationChargesDisplay`: Shows exact cancellation charges breakdown
  - `CancellationModal`: Full cancellation flow with charges preview and confirmation
  - `CancellationSuccess`: Shows confirmation after successful cancellation
  - Includes error handling with retry option
  - _Requirements: 20.1, 20.3, 20.5_

## 30. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
