# Implementation Plan

## Phase 1: Project Setup and Core Infrastructure

- [x] 1. Initialize project structure and configuration
  - [x] 1.1 Set up Next.js 14 frontend with App Router and Tailwind CSS
    - Initialize Next.js project with TypeScript/JavaScript configuration
    - Configure Tailwind CSS with custom theme colors
    - Set up folder structure: `app/`, `components/`, `lib/`, `hooks/`
    - _Requirements: 1.1, 1.3_
  - [x] 1.2 Set up Node.js/Express backend with project structure
    - Initialize Express server with middleware (cors, helmet, compression)
    - Set up folder structure: `routes/`, `controllers/`, `services/`, `models/`, `middleware/`
    - Configure Joi for request validation
    - _Requirements: 9.1, 10.1_
  - [x] 1.3 Configure MongoDB connection with Mongoose ODM
    - Set up connection pooling and retry logic
    - Configure indexes for User, Trip, OTP collections
    - Implement connection health check
    - _Requirements: 10.1, 10.4_
  - [x] 1.4 Set up environment configuration and validation
    - Create config module to load and validate environment variables
    - Implement fail-fast startup validation for required API keys
    - _Requirements: 9.1, 9.2_
  - [x] 1.5 Configure Jest and fast-check for testing
    - Set up Jest configuration for unit and property tests
    - Configure fast-check with 100 minimum iterations
    - Create test folder structure: `tests/unit/`, `tests/property/`, `tests/integration/`
    - _Requirements: Testing Strategy_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Data Models and Validation

- [x] 3. Implement core data models
  - [x] 3.1 Create User model with validation
    - Implement UserSchema with phone/email unique indexes
    - Add EmergencyContact, UserPreferences, KYCDocument embedded schemas
    - Implement validateUniqueIdentifier service function
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 3.2 Write property test for phone/email uniqueness
    - **Property 31: Phone/Email Uniqueness Enforcement**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 3.3 Create OTP model with TTL index
    - Implement OTPSchema with hashed code storage
    - Configure TTL index for automatic expiry cleanup
    - Add attempts tracking field
    - _Requirements: 2.1, 2.2, 2.5_
  - [x] 3.4 Create Driver model with documents and vehicles
    - Implement DriverSchema linked to User via userId
    - Add VehicleSchema, DriverDocumentSchema, BankDetailsSchema
    - Configure verification status tracking
    - _Requirements: 6.1, 6.2_
  - [x] 3.5 Create Trip model with payment tracking
    - Implement TripSchema with passenger, location, fare schemas
    - Add PaymentInfoSchema with transaction history
    - Configure TrackingInfoSchema for GPS data
    - _Requirements: 4.1, 4.2, 5.2_
  - [x] 3.6 Create SOS Alert model
    - Implement SOSAlertSchema with location and resolution tracking
    - Add notification status tracking fields
    - _Requirements: 7.1, 7.5_
  - [x] 3.7 Create Notification Log model
    - Implement NotificationLogSchema with retry tracking
    - Add status and delivery timestamp fields
    - _Requirements: 3.5_
  - [x] 3.8 Write unit tests for data model validation
    - Test User model validation rules
    - Test OTP model expiry logic
    - Test Trip fare calculation
    - _Requirements: 10.1_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Authentication System

- [x] 5. Implement OTP authentication flow
  - [x] 5.1 Create OTP generation service
    - Implement 6-digit OTP generation with bcrypt hashing
    - Add 5-minute expiry timestamp calculation
    - Create OTP storage with attempt counter initialization
    - _Requirements: 2.1, 2.2_
  - [x] 5.2 Write property test for OTP generation
    - **Property 1: OTP Generation Validity**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 5.3 Create OTP verification service
    - Implement OTP comparison with stored hash
    - Add expiry and attempt validation
    - Increment attempt counter on failure
    - _Requirements: 2.3, 2.4, 2.5_
  - [x] 5.4 Write property test for OTP verification
    - **Property 2: OTP Verification Correctness**
    - **Validates: Requirements 2.3, 2.4**
  - [x] 5.5 Write property test for OTP lockout
    - **Property 3: OTP Lockout Enforcement**
    - **Validates: Requirements 2.5**
  - [x] 5.6 Create JWT token service
    - Implement token generation with user payload
    - Add isNewUser flag for routing decision
    - Configure token expiry from environment
    - _Requirements: 2.3, 2.6, 2.7_
  - [x] 5.7 Write property test for post-authentication routing
    - **Property 4: Post-Authentication Routing**
    - **Validates: Requirements 2.6, 2.7**
  - [x] 5.8 Create authentication API endpoints
    - POST /api/auth/request-otp endpoint
    - POST /api/auth/verify-otp endpoint
    - Add request validation with Joi
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 5.9 Create authentication middleware
    - Implement JWT verification middleware
    - Add role-based access control
    - _Requirements: 2.3_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Notification System

- [x] 7. Implement multi-channel notification service
  - [x] 7.1 Create notification service base
    - Implement NotificationService class with channel abstraction
    - Add template rendering with variable substitution
    - Create notification logging
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 7.2 Implement SMS notification channel (Twilio)
    - Create TwilioService with API integration
    - Implement send method with error handling
    - _Requirements: 3.2_
  - [x] 7.3 Implement Email notification channel (SendGrid)
    - Create SendGridService with API integration
    - Add attachment support for invoices
    - _Requirements: 3.1_
  - [x] 7.4 Implement WhatsApp notification channel
    - Create WhatsAppService with Business API integration
    - Add PDF attachment support
    - _Requirements: 3.3_
  - [x] 7.5 Implement notification retry logic
    - Add exponential backoff retry mechanism (3 attempts)
    - Log each attempt with failure reason
    - _Requirements: 3.5_
  - [ ]* 7.6 Write property test for booking notifications
    - **Property 5: Booking Notification Completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  - [ ]* 7.7 Write property test for trip status notifications
    - **Property 6: Trip Status Notification Dispatch**
    - **Validates: Requirements 3.4**
  - [ ]* 7.8 Write property test for notification retry
    - **Property 7: Notification Retry Behavior**
    - **Validates: Requirements 3.5**
  - [x] 7.9 Create notification API endpoints
    - POST /api/notifications/send endpoint
    - Add channel selection and template support
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: User Profile Management

- [x] 9. Implement user profile features
  - [x] 9.1 Create profile service
    - Implement getProfile with editable fields list
    - Add updateProfile with validation
    - _Requirements: 8.1, 8.2_
  - [ ]* 9.2 Write property test for profile update persistence
    - **Property 19: Profile Update Persistence**
    - **Validates: Requirements 8.2**
  - [x] 9.3 Implement emergency contacts management
    - Add emergency contact CRUD operations
    - Validate contact phone format
    - _Requirements: 8.3_
  - [ ]* 9.4 Write property test for emergency contact storage
    - **Property 20: Emergency Contact Storage**
    - **Validates: Requirements 8.3**
  - [x] 9.5 Implement KYC document upload
    - Create secure file upload with encryption
    - Add document to verification queue
    - _Requirements: 8.4_
  - [ ]* 9.6 Write property test for KYC upload security
    - **Property 30: KYC Document Upload Security**
    - **Validates: Requirements 8.4**
  - [x] 9.7 Create profile API endpoints
    - GET /api/profile endpoint
    - PUT /api/profile endpoint
    - POST /api/profile/emergency-contacts endpoint
    - POST /api/profile/kyc endpoint
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 6: Admin Dashboard - Ride Management

- [x] 11. Implement ride management features
  - [x] 11.1 Create rides service
    - Implement paginated rides query with filters
    - Add trip detail retrieval
    - Implement search by tripId, passenger, driver
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 11.2 Write property test for rides pagination
    - **Property 8: Rides List Pagination Consistency**
    - **Validates: Requirements 4.1**
  - [ ]* 11.3 Write property test for trip detail completeness
    - **Property 9: Trip Detail Completeness**
    - **Validates: Requirements 4.2**
  - [ ]* 11.4 Write property test for trip search accuracy
    - **Property 10: Trip Search Accuracy**
    - **Validates: Requirements 4.3**
  - [x] 11.5 Implement trip intervention service
    - Add trip cancellation with status update
    - Implement refund initiation option
    - Add party contact functionality
    - _Requirements: 4.5_
  - [ ]* 11.6 Write property test for admin trip intervention
    - **Property 26: Admin Trip Intervention Completeness**
    - **Validates: Requirements 4.5**
  - [x] 11.7 Create admin rides API endpoints
    - GET /api/admin/rides endpoint with pagination
    - GET /api/admin/rides/:id endpoint
    - POST /api/admin/trips/:id/cancel endpoint
    - POST /api/admin/trips/:id/contact endpoint
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 7: Payment System

- [x] 13. Implement payment tracking
  - [x] 13.1 Create payment calculation service
    - Implement calculatePaymentBreakdown (70-30 split)
    - Add platform commission calculation
    - _Requirements: 5.2_
  - [ ]* 13.2 Write property test for payment recording integrity
    - **Property 11: Payment Recording Integrity**
    - **Validates: Requirements 5.2**
  - [x] 13.3 Create payment state machine
    - Implement onPaymentCollected handler
    - Implement onTripStart (driver advance) handler
    - Implement onTripComplete (vault release) handler
    - Implement onRefund handler
    - _Requirements: 5.2, 5.4_
  - [ ]* 13.4 Write property test for transaction detail completeness
    - **Property 12: Transaction Detail Completeness**
    - **Validates: Requirements 5.3**
  - [ ]* 13.5 Write property test for refund processing
    - **Property 13: Refund Processing Consistency**
    - **Validates: Requirements 5.4**
  - [x] 13.6 Implement financial report export
    - Create CSV export with date range filter
    - Create PDF export with formatting
    - _Requirements: 5.5_
  - [ ]* 13.7 Write property test for report export integrity
    - **Property 27: Financial Report Export Integrity**
    - **Validates: Requirements 5.5**
  - [x] 13.8 Create payment API endpoints
    - GET /api/admin/payments endpoint
    - GET /api/admin/payments/:id endpoint
    - POST /api/admin/payments/:id/refund endpoint
    - GET /api/admin/reports/export endpoint
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 8: Document Verification System

- [x] 15. Implement document verification
  - [x] 15.1 Create document submission service
    - Implement document upload with queue addition
    - Add pending status assignment
    - Trigger operations team notification
    - _Requirements: 6.1_
  - [ ]* 15.2 Write property test for document submission queue
    - **Property 28: Document Submission Queue Processing**
    - **Validates: Requirements 6.1**
  - [x] 15.3 Create document review service
    - Implement document retrieval for review
    - Display all document types (license, registration, insurance, KYC, photos)
    - _Requirements: 6.2_
  - [ ]* 15.4 Write property test for document review display
    - **Property 29: Document Review Display Completeness**
    - **Validates: Requirements 6.2**
  - [x] 15.5 Implement document verification workflow
    - Add approve action with status update and notification
    - Add reject action with reason recording and notification
    - _Requirements: 6.3, 6.4_
  - [ ]* 15.6 Write property test for document verification workflow
    - **Property 14: Document Verification Workflow**
    - **Validates: Requirements 6.3, 6.4**
  - [x] 15.7 Implement document expiry alerts
    - Create scheduled job for 30-day expiry check
    - Send alert notifications to drivers
    - Flag accounts with expiring documents
    - _Requirements: 6.5_
  - [ ]* 15.8 Write property test for document expiry alerts
    - **Property 15: Document Expiry Alert Timing**
    - **Validates: Requirements 6.5**
  - [x] 15.9 Create document verification API endpoints
    - GET /api/admin/documents endpoint
    - GET /api/admin/documents/:id endpoint
    - POST /api/admin/documents/:id/verify endpoint
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 9: SOS Emergency System

- [x] 17. Implement SOS emergency support
  - [x] 17.1 Create SOS trigger service
    - Capture GPS coordinates and timestamp immediately
    - Create SOS alert record with active status
    - _Requirements: 7.1_
  - [x] 17.2 Implement SOS admin notification
    - Send high-priority WebSocket notification to admin dashboard
    - Ensure delivery within 5 seconds
    - _Requirements: 7.2_
  - [x] 17.3 Implement emergency contact notification
    - Send notifications to all registered emergency contacts
    - Include live location link
    - _Requirements: 7.3_
  - [ ]* 17.4 Write property test for SOS trigger response
    - **Property 16: SOS Trigger Response**
    - **Validates: Requirements 7.1, 7.2, 7.3**
  - [ ]* 17.5 Write property test for SOS alert data completeness
    - **Property 17: SOS Alert Data Completeness**
    - **Validates: Requirements 7.4**
  - [x] 17.6 Implement SOS resolution service
    - Add resolution logging with details and timeline
    - Record actions taken and resolver identity
    - _Requirements: 7.5_
  - [ ]* 17.7 Write property test for SOS resolution logging
    - **Property 18: SOS Resolution Logging**
    - **Validates: Requirements 7.5**
  - [x] 17.8 Create SOS API endpoints
    - POST /api/sos/trigger endpoint
    - GET /api/admin/sos endpoint
    - POST /api/admin/sos/:id/resolve endpoint
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 18. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 10: Security and Data Protection

- [x] 19. Implement security features
  - [x] 19.1 Implement API key security
    - Ensure keys loaded from server-side environment only
    - Verify keys not exposed in client responses
    - _Requirements: 9.2_
  - [ ]* 19.2 Write property test for API key security
    - **Property 21: API Key Security**
    - **Validates: Requirements 9.2**
  - [x] 19.3 Implement secure error logging
    - Log authentication errors without exposing key values
    - Add error type and timestamp to logs
    - _Requirements: 9.4_
  - [ ]* 19.4 Write property test for secure error logging
    - **Property 22: Secure Error Logging**
    - **Validates: Requirements 9.4**
  - [x] 19.5 Implement data encryption at rest
    - Encrypt sensitive user data (personal info, payment details)
    - Implement decryption for authorized operations
    - _Requirements: 10.3_
  - [ ]* 19.6 Write property test for data encryption
    - **Property 24: Sensitive Data Encryption**
    - **Validates: Requirements 10.3**
  - [x] 19.7 Implement database retry logic
    - Add retry mechanism for transient failures
    - Ensure no partial writes on failure
    - _Requirements: 10.4_
  - [ ]* 19.8 Write property test for database retry resilience
    - **Property 25: Database Retry Resilience**
    - **Validates: Requirements 10.4**
  - [ ]* 19.9 Write property test for data persistence consistency
    - **Property 23: Data Persistence Consistency**
    - **Validates: Requirements 10.1**

- [x] 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 11: Frontend - Landing Page

- [x] 21. Implement landing page components
  - [x] 21.1 Create Header component with sticky navigation
    - Implement sticky header with smooth scroll
    - Add navigation items with section links
    - _Requirements: 1.4_
  - [x] 21.2 Create Hero section component
    - Display tagline and call-to-action buttons
    - Add key service highlights
    - _Requirements: 1.1_
  - [x] 21.3 Create Features section component
    - Display feature cards with icons
    - _Requirements: 1.2_
  - [x] 21.4 Create HowItWorks section component
    - Display numbered steps with descriptions
    - _Requirements: 1.2_
  - [x] 21.5 Create SafetySection component
    - Display safety features and measures
    - _Requirements: 1.2_
  - [x] 21.6 Create Pricing section component
    - Display pricing tiers with features
    - _Requirements: 1.2_
  - [x] 21.7 Create Testimonials section component
    - Display user testimonials with ratings
    - _Requirements: 1.2_
  - [x] 21.8 Create Footer component
    - Add download links and navigation
    - _Requirements: 1.2_
  - [x] 21.9 Assemble landing page with all sections
    - Wire up navigation to sections
    - Implement CTA button routing to auth flow
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [ ]* 21.10 Write unit tests for landing page components
    - Test component rendering
    - Test navigation functionality
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 22. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 12: Frontend - Authentication

- [x] 23. Implement authentication UI
  - [x] 23.1 Create PhoneInput component
    - Implement phone number input with country code
    - Add validation feedback
    - _Requirements: 2.1_
  - [x] 23.2 Create OTPInput component
    - Implement 6-digit OTP input with auto-focus
    - Add onComplete callback
    - _Requirements: 2.3_
  - [x] 23.3 Create AuthForm component
    - Support phone and email modes
    - Handle OTP request and verification flow
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 23.4 Create authentication pages
    - Login page with phone/email selection
    - OTP verification page with retry handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 23.5 Implement post-auth routing
    - Route new users to profile setup
    - Route existing users to dashboard
    - _Requirements: 2.6, 2.7_
  - [ ]* 23.6 Write unit tests for auth components
    - Test OTPInput behavior
    - Test AuthForm submission
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 24. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 13: Frontend - Admin Dashboard

- [x] 25. Implement admin dashboard components
  - [x] 25.1 Create RidesList component
    - Display paginated rides with filters
    - Add status, date range, search filters
    - _Requirements: 4.1, 4.3_
  - [x] 25.2 Create RideDetail component
    - Display complete trip information
    - Show passenger, driver, vehicle, route, fare details
    - _Requirements: 4.2_
  - [x] 25.3 Create PaymentsDashboard component
    - Display revenue metrics and transaction history
    - Add export functionality (CSV/PDF)
    - _Requirements: 5.1, 5.5_
  - [x] 25.4 Create DocumentVerification component
    - Display documents for review
    - Add approve/reject actions with reason input
    - _Requirements: 6.2, 6.3, 6.4_
  - [x] 25.5 Create SOSAlerts component
    - Display active alerts with priority
    - Show trip details, location, contact options
    - Add resolution form
    - _Requirements: 7.4, 7.5_
  - [x] 25.6 Assemble admin dashboard pages
    - Create rides management page
    - Create payments page
    - Create document verification page
    - Create SOS alerts page
    - _Requirements: 4.1, 5.1, 6.2, 7.4_
  - [ ]* 25.7 Write unit tests for admin components
    - Test RidesList filtering and pagination
    - Test PaymentsDashboard export
    - Test DocumentVerification actions
    - _Requirements: 4.1, 5.1, 6.2, 7.4_

- [x] 26. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 14: Frontend - User Profile

- [x] 27. Implement user profile UI
  - [x] 27.1 Create ProfileForm component
    - Display editable fields (name, gender, health info, preferences)
    - Handle form submission with validation
    - _Requirements: 8.1, 8.2_
  - [x] 27.2 Create EmergencyContacts component
    - Display and manage emergency contacts
    - Add/edit/delete contact functionality
    - _Requirements: 8.3_
  - [x] 27.3 Create KYCUpload component
    - Handle document upload with preview
    - Show upload status and queue position
    - _Requirements: 8.4_
  - [x] 27.4 Assemble profile page
    - Combine profile form, emergency contacts, KYC upload
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 27.5 Write unit tests for profile components
    - Test ProfileForm validation
    - Test EmergencyContacts CRUD
    - Test KYCUpload flow
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 28. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 15: WebSocket Integration

- [x] 29. Implement real-time features
  - [x] 29.1 Set up Socket.io server
    - Configure WebSocket server with Express
    - Implement authentication for socket connections
    - _Requirements: 4.4, 7.2_
  - [x] 29.2 Implement real-time trip tracking
    - Broadcast GPS location updates
    - Send ETA updates to admin dashboard
    - _Requirements: 4.4_
  - [x] 29.3 Implement real-time SOS alerts
    - Push high-priority alerts to admin dashboard
    - Ensure delivery within 5 seconds
    - _Requirements: 7.2_
  - [x] 29.4 Create frontend WebSocket hooks
    - useRealTimeTracking hook
    - useSOSAlerts hook
    - _Requirements: 4.4, 7.2_
  - [ ]* 29.5 Write integration tests for WebSocket
    - Test connection and authentication
    - Test real-time updates
    - _Requirements: 4.4, 7.2_

- [x] 30. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
