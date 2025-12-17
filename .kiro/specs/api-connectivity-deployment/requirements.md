# Requirements Document

## Introduction

This specification addresses API connectivity and end-to-end integration between the HushRyd Mobile App (React Native), Web Frontend (Next.js), and the Node.js/Express backend. The system must ensure all features work seamlessly from app launch through complete user journeys including onboarding, authentication, ride search/booking, driver operations, payments, tracking, and SOS. This covers API health checks, environment configuration validation, graceful fallbacks, deployment pipeline integration, and ensuring the complete app flow works without errors in both local and production environments.

## Glossary

- **HushRyd Mobile App**: The React Native Expo mobile application for Android and iOS
- **HushRyd Web Frontend**: The Next.js web application for desktop and mobile browsers
- **Backend API**: The existing Node.js/Express REST API server at hushryd-api.onrender.com
- **API Health Check**: Endpoint that verifies backend service availability and readiness
- **Environment Configuration**: Settings that define API URLs and connection parameters for different environments
- **Graceful Fallback**: Behavior that maintains app stability when API is unavailable
- **Deployment Pipeline**: Automated process for building and releasing the application
- **API Contract**: Agreement between frontend and backend on request/response formats
- **Connection Timeout**: Maximum time to wait for API response before failing
- **Retry Strategy**: Logic for retrying failed API requests with backoff
- **End-to-End Flow**: Complete user journey from app launch to feature completion

## Requirements

### Requirement 1: API Health Check System

**User Story:** As a developer, I want to verify API availability before deployment, so that I can prevent deploying an app that cannot connect to the backend.

#### Acceptance Criteria

1. WHEN the backend server starts THEN the Backend API SHALL expose a /api/health endpoint that returns service status within 100ms
2. WHEN the health endpoint is called THEN the Backend API SHALL verify database connectivity, Redis availability, and external service status
3. WHEN any critical service is unavailable THEN the Backend API SHALL return degraded status with specific service failure details
4. WHEN the mobile app launches THEN the Mobile App SHALL call the health endpoint and display appropriate status to the user
5. WHEN health check fails during deployment THEN the Deployment Pipeline SHALL abort deployment and notify the development team

### Requirement 2: Environment Configuration Validation

**User Story:** As a developer, I want environment configurations validated at build time, so that missing or incorrect API URLs are caught before deployment.

#### Acceptance Criteria

1. WHEN the mobile app builds THEN the Build System SHALL validate that API_BASE_URL environment variable is defined and properly formatted
2. WHEN environment variables are missing THEN the Build System SHALL fail with clear error message listing missing variables
3. WHEN API_BASE_URL is configured THEN the Mobile App SHALL validate URL format and protocol (https for production)
4. WHEN building for production THEN the Build System SHALL verify API_BASE_URL points to production server, not localhost
5. WHEN environment mismatch is detected THEN the Build System SHALL warn about potential configuration issues

### Requirement 3: API Connection Resilience

**User Story:** As a mobile app user, I want the app to handle API connection failures gracefully, so that I can continue using available features.

#### Acceptance Criteria

1. WHEN API request fails due to network error THEN the Mobile App SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s)
2. WHEN API request times out after 30 seconds THEN the Mobile App SHALL cancel the request and display timeout error
3. WHEN API returns 5xx error THEN the Mobile App SHALL display server error message and offer retry option
4. WHEN API returns 4xx error THEN the Mobile App SHALL display specific error message from response body
5. WHEN multiple consecutive API failures occur THEN the Mobile App SHALL switch to offline mode and queue requests
6. WHEN connection is restored THEN the Mobile App SHALL automatically retry queued requests in order

### Requirement 4: API Endpoint Availability Handling

**User Story:** As a mobile app user, I want the app to work even when some API endpoints are unavailable, so that partial backend outages don't crash the app.

#### Acceptance Criteria

1. WHEN a specific API endpoint returns 404 THEN the Mobile App SHALL display feature unavailable message without crashing
2. WHEN authentication endpoint fails THEN the Mobile App SHALL allow viewing cached data but block actions requiring auth
3. WHEN search endpoint fails THEN the Mobile App SHALL display cached search results if available with stale data indicator
4. WHEN booking endpoint fails THEN the Mobile App SHALL queue booking request and notify user of pending status
5. WHEN SOS endpoint fails THEN the Mobile App SHALL fallback to direct phone call to emergency contacts

### Requirement 5: Backend API Versioning

**User Story:** As a developer, I want API versioning, so that mobile app updates don't break due to backend API changes.

#### Acceptance Criteria

1. WHEN the mobile app makes API requests THEN the Mobile App SHALL include API version header (X-API-Version: v1)
2. WHEN backend receives request with version header THEN the Backend API SHALL route to appropriate version handler
3. WHEN API version is deprecated THEN the Backend API SHALL return warning header with deprecation date
4. WHEN API version is unsupported THEN the Backend API SHALL return 410 Gone with upgrade instructions
5. WHEN mobile app detects version mismatch THEN the Mobile App SHALL prompt user to update the app

### Requirement 6: Deployment Pre-flight Checks

**User Story:** As a DevOps engineer, I want automated pre-deployment checks, so that broken builds don't reach production.

#### Acceptance Criteria

1. WHEN deployment is triggered THEN the Deployment Pipeline SHALL verify backend API is reachable from build environment
2. WHEN pre-flight check runs THEN the Deployment Pipeline SHALL test critical endpoints (auth, health, search) with sample requests
3. WHEN any pre-flight check fails THEN the Deployment Pipeline SHALL halt deployment and create incident ticket
4. WHEN deploying mobile app THEN the Deployment Pipeline SHALL verify matching backend version is deployed
5. WHEN deployment succeeds THEN the Deployment Pipeline SHALL run smoke tests against production endpoints

### Requirement 7: Error Reporting and Diagnostics

**User Story:** As a developer, I want detailed error reporting, so that I can quickly diagnose and fix API connectivity issues.

#### Acceptance Criteria

1. WHEN API error occurs THEN the Mobile App SHALL log error details including endpoint, status code, response body, and timestamp
2. WHEN network error occurs THEN the Mobile App SHALL log connection state, retry attempts, and failure reason
3. WHEN error is logged THEN the Mobile App SHALL send error report to crash reporting service (Sentry/Crashlytics)
4. WHEN viewing error reports THEN the Developer SHALL see correlation between mobile errors and backend logs
5. WHEN recurring errors are detected THEN the Monitoring System SHALL alert development team with error pattern analysis

### Requirement 8: Local Development API Proxy

**User Story:** As a developer, I want easy local development setup, so that I can test mobile app against local or staging backend.

#### Acceptance Criteria

1. WHEN running in development mode THEN the Mobile App SHALL support configurable API_BASE_URL via .env file
2. WHEN local backend is unavailable THEN the Mobile App SHALL display clear error with setup instructions
3. WHEN using staging environment THEN the Mobile App SHALL connect to staging API without code changes
4. WHEN switching environments THEN the Mobile App SHALL clear cached data to prevent data mixing
5. WHEN development mode is active THEN the Mobile App SHALL display environment indicator badge



### Requirement 9: Animated Onboarding with Lottie

**User Story:** As a first-time user, I want to see engaging animated onboarding screens, so that I understand HushRyd's value proposition.

#### Acceptance Criteria

1. WHEN the app launches for the first time THEN the Mobile App SHALL display 4 onboarding screens with Lottie animations and smooth fade/slide transitions
2. WHEN displaying onboarding screens THEN the Mobile App SHALL show: Safe Carpooling (Women-first safety), Verified Drivers & OTP Rides, Live Tracking & SOS, Easy Cost Sharing
3. WHEN a user swipes between screens THEN the Mobile App SHALL animate with smooth horizontal slide within 300ms with minimal text and strong visuals
4. WHEN a user reaches the last screen THEN the Mobile App SHALL display "Get Started" CTA button navigating to login
5. WHEN onboarding is completed THEN the Mobile App SHALL persist completion state locally and skip on subsequent launches

### Requirement 10: OTP Authentication Flow (Twilio)

**User Story:** As a user, I want to log in using OTP sent to my phone, so that I can securely access my account without passwords.

#### Acceptance Criteria

1. WHEN a user enters phone number THEN the Mobile App SHALL validate 10-digit Indian format with +91 country code selector
2. WHEN OTP is requested THEN the Backend API SHALL generate 6-digit OTP via Twilio and send within 30 seconds with 60-second expiry
3. WHEN OTP is sent THEN the Mobile App SHALL navigate to OTP screen with auto-focus, auto-advance, and clipboard paste support
4. WHEN OTP expires THEN the Mobile App SHALL display "Resend OTP" button with 30-second countdown timer
5. WHEN OTP verification fails THEN the Mobile App SHALL block entry until valid OTP is submitted (No OTP → No entry rule)
6. WHEN OTP is verified THEN the Mobile App SHALL proceed to profile completeness check

### Requirement 11: Mandatory Profile Completion

**User Story:** As a new user, I want to complete my profile with all required fields, so that I can access all app features.

#### Acceptance Criteria

1. WHEN OTP is verified THEN the Mobile App SHALL check profile completeness via GET /api/profile endpoint
2. WHEN profile is incomplete THEN the Mobile App SHALL redirect to profile setup with ALL mandatory fields: Full Name, Email, Gender, Emergency Contacts (3 members with Name + Phone)
3. WHEN profile is incomplete on any app launch THEN the Mobile App SHALL always redirect to Profile page until complete
4. WHEN profile is complete THEN the Mobile App SHALL never show login again and app relaunch goes directly to Home Screen
5. WHEN user submits profile THEN the Mobile App SHALL call PUT /api/profile and display success or error with retry option

### Requirement 12: Passenger Home Screen

**User Story:** As a passenger, I want a clean home screen with search, banners, and upcoming ride info, so that I can quickly find and track rides.

#### Acceptance Criteria

1. WHEN passenger lands on home THEN the Mobile App SHALL display welcome message "Hi {Name} 👋" with notification bell icon
2. WHEN displaying search card THEN the Mobile App SHALL show Pickup Location (Google Maps API), Drop Location, Date & Time, Seats Required with "Search Rides" CTA
3. WHEN displaying banners THEN the Mobile App SHALL show Women-Only Rides, Free Cancellation, and Referral Bonus promotional cards
4. WHEN upcoming ride exists THEN the Mobile App SHALL display Driver Name + Car, Pickup Time, OTP Status, and "Track Ride" button
5. WHEN no upcoming rides THEN the Mobile App SHALL display empty state with search prompt

### Requirement 13: Search Results and Booking Flow

**User Story:** As a passenger, I want to search for rides and complete booking with payment, so that I can travel to my destination.

#### Acceptance Criteria

1. WHEN search results display THEN the Mobile App SHALL show Route Map Preview, Driver Rating, Car Details, Seats Available, and Female-only badge (if enabled)
2. WHEN booking rules apply THEN the Mobile App SHALL enforce: Passenger cannot switch to Driver, Driver cannot book rides
3. WHEN payment is initiated THEN the Mobile App SHALL integrate Cashfree with UPI/Card/Wallet options showing Ride Fare, Platform Fee, and Cancellation Option
4. WHEN booking is confirmed THEN the Mobile App SHALL display Unique Booking ID, Invoice PDF (sent via Email + WhatsApp), and fixed Pickup OTP + Drop OTP
5. WHEN booking API fails THEN the Mobile App SHALL queue booking request and notify user of pending status with retry

### Requirement 14: Driver KYC and Document Upload

**User Story:** As a driver, I want to register and upload my documents, so that I can start offering rides after approval.

#### Acceptance Criteria

1. WHEN driver initiates KYC THEN the Mobile App SHALL require mandatory documents: Aadhaar, Driving License, RC, and 4 Car Photos (Interior + Exterior)
2. WHEN uploading documents THEN the Mobile App SHALL provide Camera or Gallery option with Preview + Remove functionality
3. WHEN all documents are uploaded THEN the Mobile App SHALL display "Documents under review. Approval in 2–3 hours." message
4. WHEN documents are pending THEN the Mobile App SHALL block ride posting (Cannot post ride until approved)
5. WHEN driver is approved THEN the Mobile App SHALL send push notification and enable trip posting

### Requirement 15: Driver Trip Posting with Female-Only Option

**User Story:** As a driver, I want to post rides with female-only option, so that I can offer safe rides to women passengers.

#### Acceptance Criteria

1. WHEN driver posts ride THEN the Mobile App SHALL provide form with Source → Destination, Time, Price, Seats, Female-Only Toggle, Instant Booking Toggle
2. WHEN Female-Only is enabled THEN the Backend API SHALL filter search results by gender allowing only female passengers to book
3. WHEN trip is posted THEN the Mobile App SHALL call POST /api/trips and display trip in driver dashboard
4. WHEN trip has bookings THEN the Mobile App SHALL display booking management with passenger details and OTP verification options
5. WHEN trip API fails THEN the Mobile App SHALL queue trip creation and retry when connection restores

### Requirement 16: Driver Wallet Lock System

**User Story:** As a driver, I want my earnings managed through a locked wallet system, so that payments are secure and released at appropriate stages.

#### Acceptance Criteria

1. WHEN booking is confirmed THEN the Backend API SHALL lock driver wallet amount until ride completion
2. WHEN ride starts THEN the Backend API SHALL unlock wallet and make advance payment available
3. WHEN ride completes THEN the Backend API SHALL enable full withdrawal via UPI/Bank with instant payout option
4. WHEN viewing wallet THEN the Mobile App SHALL display locked amount, unlocked amount, and withdrawal history
5. WHEN withdrawal is requested THEN the Backend API SHALL process payout and update wallet balance

### Requirement 17: Ride Execution with OTP Verification

**User Story:** As a driver, I want to verify passengers using OTP before starting the ride, so that I can ensure correct passengers are picked up.

#### Acceptance Criteria

1. WHEN picking up passengers THEN the Mobile App SHALL require driver to verify each passenger's OTP one by one
2. WHEN passenger is verified THEN the Backend API SHALL notify other passengers "Passenger picked up" without sharing personal info
3. WHEN all passengers are picked up THEN the Mobile App SHALL enable "Start Ride" button
4. WHEN ride starts THEN the Backend API SHALL share live location to Admin and Emergency contacts (WhatsApp/SMS)
5. WHEN ride is in progress THEN the Mobile App SHALL display real-time tracking with ETA updates

### Requirement 18: Real-Time Tracking and Location Sharing

**User Story:** As a user on an active trip, I want real-time tracking shared with admin and emergency contacts, so that my safety is monitored.

#### Acceptance Criteria

1. WHEN ride starts THEN the Mobile App SHALL establish WebSocket connection for location updates every 10 seconds
2. WHEN driver location updates THEN the Backend API SHALL broadcast to passengers, admin dashboard, and emergency contacts
3. WHEN WebSocket disconnects THEN the Mobile App SHALL automatically reconnect within 3 seconds and resume tracking
4. WHEN tracking is active THEN the Mobile App SHALL display driver location, ETA, and route on map
5. WHEN trip completes THEN the Mobile App SHALL stop tracking and display trip summary with rating option

### Requirement 19: SOS Emergency System (Real-Time)

**User Story:** As a user in distress, I want SOS to trigger immediately and notify all relevant parties, so that I can get help in emergencies.

#### Acceptance Criteria

1. WHEN SOS is triggered THEN the Mobile App SHALL capture exact GPS location, Passenger + Driver details, and Route within 2 seconds
2. WHEN SOS API succeeds THEN the Backend API SHALL notify Admin Dashboard and Super Admin Dashboard via WebSocket with high priority
3. WHEN SOS is active THEN the Mobile App SHALL display emergency screen with cancel option and emergency contact numbers
4. WHEN SOS API fails THEN the Mobile App SHALL retry 3 times and fallback to direct phone call to emergency contact
5. WHEN SOS is resolved THEN the Mobile App SHALL call POST /api/sos/:id/resolve and display confirmation

### Requirement 20: Cancellation Flow with 3-Minute Grace Period

**User Story:** As a user, I want a grace period for free cancellation, so that I can cancel without charges if I change my mind quickly.

#### Acceptance Criteria

1. WHEN booking is confirmed THEN the Mobile App SHALL display alert "You have 3 minutes to cancel without charge"
2. WHEN cancellation is within 3 minutes THEN the Backend API SHALL process cancellation with zero charges
3. WHEN cancellation is after 3 minutes THEN the Mobile App SHALL display exact cancellation charges and require confirmation
4. WHEN cancellation is confirmed THEN the Backend API SHALL process refund according to cancellation policy
5. WHEN cancellation fails THEN the Mobile App SHALL display error with retry option

### Requirement 16: Admin Dashboard API Integration

**User Story:** As an admin, I want the dashboard to load data reliably, so that I can manage platform operations.

#### Acceptance Criteria

1. WHEN admin logs in THEN the Web Frontend SHALL authenticate via POST /api/auth/admin/login and store session
2. WHEN viewing rides THEN the Web Frontend SHALL call GET /api/admin/rides with pagination and display results
3. WHEN viewing SOS alerts THEN the Web Frontend SHALL establish WebSocket for real-time alerts and display with priority
4. WHEN reviewing documents THEN the Web Frontend SHALL call GET /api/admin/documents and display with approve/reject actions
5. WHEN exporting reports THEN the Web Frontend SHALL call GET /api/admin/reports/export and download generated file



### Requirement 17: API Security and Authentication

**User Story:** As a platform operator, I want all API endpoints secured, so that unauthorized access and data breaches are prevented.

#### Acceptance Criteria

1. WHEN any API request is made THEN the Backend API SHALL validate JWT token in Authorization header before processing
2. WHEN JWT token is invalid or expired THEN the Backend API SHALL return 401 Unauthorized and Mobile App SHALL redirect to login
3. WHEN sensitive endpoints are accessed THEN the Backend API SHALL verify user role and permissions before allowing access
4. WHEN API keys are used for external services THEN the Backend API SHALL store keys in environment variables, never in code
5. WHEN transmitting data THEN the Backend API SHALL enforce HTTPS/TLS encryption for all API communications

### Requirement 18: API Gateway and Rate Limiting

**User Story:** As a platform operator, I want an API gateway with rate limiting, so that the system is protected from abuse and overload.

#### Acceptance Criteria

1. WHEN API requests are received THEN the API Gateway SHALL route requests through AWS API Gateway or similar service
2. WHEN a single user exceeds 100 requests per minute THEN the API Gateway SHALL return 429 Too Many Requests with Retry-After header
3. WHEN overall API load exceeds threshold THEN the API Gateway SHALL activate throttling and prioritize critical endpoints (SOS, tracking)
4. WHEN suspicious traffic patterns are detected THEN the API Gateway SHALL block IP addresses and alert operations team
5. WHEN API Gateway is configured THEN the Backend API SHALL log all requests with correlation IDs for tracing

### Requirement 19: Request/Response Optimization

**User Story:** As a user, I want API responses to be fast, so that the app feels responsive and smooth.

#### Acceptance Criteria

1. WHEN API response is generated THEN the Backend API SHALL compress response using gzip for payloads larger than 1KB
2. WHEN serving static data THEN the Backend API SHALL set appropriate Cache-Control headers for client-side caching
3. WHEN returning lists THEN the Backend API SHALL support pagination with limit/offset and return total count
4. WHEN returning large objects THEN the Backend API SHALL support field selection to return only requested fields
5. WHEN API response time exceeds 2 seconds THEN the Backend API SHALL log slow query for optimization

### Requirement 20: Large Data Handling

**User Story:** As a platform handling 50K+ users, I want the system to handle large data volumes efficiently, so that performance doesn't degrade under load.

#### Acceptance Criteria

1. WHEN querying large datasets THEN the Backend API SHALL use database indexes and limit result sets to prevent memory issues
2. WHEN uploading large files THEN the Backend API SHALL use streaming uploads directly to S3 without loading into memory
3. WHEN processing bulk operations THEN the Backend API SHALL use background job queues (BullMQ) to prevent request timeouts
4. WHEN returning search results THEN the Backend API SHALL implement cursor-based pagination for consistent performance
5. WHEN caching is enabled THEN the Backend API SHALL use Redis for frequently accessed data with appropriate TTL

### Requirement 21: Database Query Optimization

**User Story:** As a developer, I want optimized database queries, so that the system can handle high concurrent loads.

#### Acceptance Criteria

1. WHEN querying trips THEN the Backend API SHALL use compound indexes on (status, departureTime, source, destination)
2. WHEN querying bookings THEN the Backend API SHALL use indexes on (userId, status, createdAt) for efficient filtering
3. WHEN performing aggregations THEN the Backend API SHALL use MongoDB aggregation pipeline with $match early in pipeline
4. WHEN connection pool is exhausted THEN the Backend API SHALL queue requests with timeout rather than failing immediately
5. WHEN database query takes longer than 5 seconds THEN the Backend API SHALL timeout and return cached data if available

### Requirement 22: Real-Time Data Scalability

**User Story:** As a platform with thousands of active trips, I want real-time features to scale, so that tracking and notifications work for all users.

#### Acceptance Criteria

1. WHEN 3000+ users are tracking simultaneously THEN the Backend API SHALL maintain WebSocket connections with less than 100ms latency
2. WHEN driver location updates THEN the Backend API SHALL use Redis pub/sub to broadcast to relevant passengers efficiently
3. WHEN WebSocket server reaches 80% capacity THEN the Backend API SHALL automatically spawn additional Socket.io instances
4. WHEN sending notifications THEN the Backend API SHALL use message queues to handle burst traffic without dropping messages
5. WHEN real-time connections scale THEN the Backend API SHALL use sticky sessions or Redis adapter for Socket.io clustering

### Requirement 23: API Response Caching

**User Story:** As a user, I want frequently accessed data to load instantly, so that the app feels fast and responsive.

#### Acceptance Criteria

1. WHEN user profile is requested THEN the Backend API SHALL serve from Redis cache with 5-minute TTL
2. WHEN trip search is performed THEN the Backend API SHALL cache results for 30 seconds to handle repeated searches
3. WHEN static configuration is requested THEN the Backend API SHALL cache indefinitely until configuration changes
4. WHEN cache miss occurs THEN the Backend API SHALL populate cache and serve request within acceptable latency
5. WHEN cache becomes unavailable THEN the Backend API SHALL fall back to database with degraded performance rather than failing

### Requirement 24: API Monitoring and Alerting

**User Story:** As a platform operator, I want real-time visibility into API health, so that I can respond to issues before they affect users.

#### Acceptance Criteria

1. WHEN any API endpoint response time exceeds SLA THEN the Monitoring System SHALL alert operations team within 30 seconds
2. WHEN error rate exceeds 1% THEN the Monitoring System SHALL trigger automatic investigation and potential rollback
3. WHEN database connection pool is 80% utilized THEN the Monitoring System SHALL alert before exhaustion
4. WHEN external service (Twilio, Cashfree, S3) fails THEN the Monitoring System SHALL alert and activate fallback procedures
5. WHEN API metrics are collected THEN the Monitoring System SHALL display dashboard with request rate, latency, and error rate

