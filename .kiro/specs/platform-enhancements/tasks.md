# Implementation Plan

## 1. Super Admin Dashboard

- [x] 1.1 Create AuditLog model and audit logging middleware
  - Create `backend/src/models/AuditLog.js` with schema for userId, action, targetType, targetId, details, ipAddress, userAgent, timestamp
  - Create audit logging middleware that intercepts admin actions
  - Add indexes for efficient querying by userId, action, timestamp
  - _Requirements: 1.7_

- [ ]* 1.2 Write property test for audit log completeness
  - **Property 5: Audit Log Completeness**
  - **Validates: Requirements 1.7**

- [x] 1.3 Create SupportTicket model
  - Create `backend/src/models/SupportTicket.js` with ticketId, userId, subject, description, priority, status, assignedTo, category, messages, resolvedAt
  - Add static method for generating ticket IDs (TK-YYYY-NNNNNN format)
  - Add indexes for status, priority, assignedTo
  - _Requirements: 1.5_

- [x] 1.4 Extend User model with super_admin role
  - Add 'super_admin' to role enum in `backend/src/models/User.js`
  - _Requirements: 1.1_

- [x] 1.5 Create AdminService with dashboard metrics
  - Create `backend/src/services/adminService.js`
  - Implement `getDashboardMetrics()` - aggregate total users, active drivers, ongoing trips, daily revenue
  - Implement `getUsers(filters)` - paginated user list with role, status, date, search filters
  - Implement `getTransactions(filters)` - transaction history with date range, type, status, amount filters
  - Implement `getSupportTickets(filters)` - ticket list with priority, status, assignment filters
  - Implement `getAnalytics(dateRange)` - revenue trends, user growth, trip analytics
  - Implement `logAdminAction(action)` - create audit log entry
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ]* 1.6 Write property tests for admin service
  - **Property 2: Dashboard Metrics Accuracy**
  - **Property 3: User Filter Correctness**
  - **Property 4: Transaction Filter Correctness**
  - **Validates: Requirements 1.2, 1.3, 1.4**

- [x] 1.7 Create super admin authentication middleware
  - Extend `backend/src/middleware/auth.js` with `requireSuperAdmin` middleware
  - Verify super_admin role before granting access
  - _Requirements: 1.1_

- [ ]* 1.8 Write property test for super admin authentication
  - **Property 1: Super Admin Role Authentication**
  - **Validates: Requirements 1.1**

- [x] 1.9 Create super admin API routes
  - Create `backend/src/routes/superAdmin.js`
  - GET `/api/admin/dashboard` - dashboard metrics
  - GET `/api/admin/users` - list users with filters
  - GET `/api/admin/users/:id` - user details
  - PUT `/api/admin/users/:id` - update user
  - GET `/api/admin/transactions` - list transactions
  - GET `/api/admin/tickets` - list support tickets
  - PUT `/api/admin/tickets/:id` - update ticket
  - GET `/api/admin/analytics` - analytics data
  - GET `/api/admin/audit-logs` - audit trail
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 1.10 Create Super Admin Dashboard frontend components
  - Create `frontend/src/components/admin/SuperAdminDashboard.jsx` - metrics cards, activity feed
  - Create `frontend/src/components/admin/UserManagement.jsx` - user table, filters, search
  - Create `frontend/src/components/admin/TransactionHistory.jsx` - transaction table, filters
  - Create `frontend/src/components/admin/AnalyticsDashboard.jsx` - charts for revenue, users, trips
  - _Requirements: 1.2, 1.3, 1.4, 1.6_

- [x] 1.11 Create Super Admin pages
  - Create `frontend/src/app/admin/super/page.js` - main dashboard
  - Create `frontend/src/app/admin/super/users/page.js` - user management
  - Create `frontend/src/app/admin/super/transactions/page.js` - transactions
  - Create `frontend/src/app/admin/super/analytics/page.js` - analytics
  - Update admin layout for super admin navigation
  - _Requirements: 1.2, 1.3, 1.4, 1.6_

- [ ] 1.12 Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 2. Operations Team - Document Verification

- [x] 2.1 Extend DocumentService for missing documents workflow
  - Add `markDocumentsMissing(driverId, documentTypes, message)` to `backend/src/services/documentService.js`
  - Send notification to driver with list of required documents
  - _Requirements: 2.4_

- [x] 2.2 Enhance document approval to update driver verification status
  - Update `approveDocument()` to check if all required documents are approved (already implemented via `hasAllRequiredDocuments()`)
  - Automatically set driver verificationStatus to 'verified' when all documents approved (already implemented)
  - Trigger notification to driver about verification completion (already implemented via `notifyDriverAboutVerification`)
  - _Requirements: 2.6_

- [ ]* 2.3 Write property test for driver verification status transition
  - **Property 9: Driver Verification Status Transition**
  - **Validates: Requirements 2.6**

- [x] 2.4 Enhance document rejection to require reason
  - Update `rejectDocument()` to validate rejection reason is provided (already implemented)
  - Send notification to driver via email and WhatsApp with specific feedback (already implemented)
  - _Requirements: 2.5_

- [ ]* 2.5 Write property test for document rejection
  - **Property 8: Document Rejection Requires Reason**
  - **Validates: Requirements 2.5**

- [x] 2.6 Add trip creation verification check
  - Update trip creation in `backend/src/services/tripService.js` to verify driver status is 'verified' (already implemented)
  - Return appropriate error if driver not verified (already implemented with DRIVER_NOT_VERIFIED error)
  - _Requirements: 2.7_

- [ ]* 2.7 Write property test for verified driver trip creation
  - **Property 10: Verified Driver Trip Creation**
  - **Validates: Requirements 2.7**

- [x] 2.8 Enhance document upload notification
  - Update `submitDocument()` to send dashboard alert and email to operations team (already implemented via `notifyOperationsTeam`)
  - Include driver details in notification (already implemented)
  - _Requirements: 2.1_

- [ ]* 2.9 Write property test for document upload notification
  - **Property 6: Document Upload Notification**
  - **Validates: Requirements 2.1**

- [x] 2.10 Create API route for missing documents
  - Add POST `/api/admin/drivers/:id/missing-documents` to mark missing documents
  - _Requirements: 2.4_

- [x] 2.11 Create DocumentQueue frontend component
  - `frontend/src/components/admin/DocumentVerification.jsx` already exists with pending documents list
  - Sort by submission time, filter by document type (already implemented)
  - Quick approve/reject actions (already implemented)
  - _Requirements: 2.2_

- [x] 2.12 Create DocumentReview frontend component
  - Create `frontend/src/components/admin/DocumentReview.jsx` - full-screen viewer
  - Add zoom, rotate, pan controls for document images
  - Driver profile sidebar
  - Approval/rejection form with reason field
  - _Requirements: 2.2, 2.3, 2.5_

- [x] 2.13 Create MissingDocumentsForm frontend component
  - Create `frontend/src/components/admin/MissingDocumentsForm.jsx`
  - Checklist of required documents
  - Custom message field
  - Send notification button
  - _Requirements: 2.4_

- [ ]* 2.14 Write property test for pending documents data completeness
  - **Property 7: Pending Documents Data Completeness**
  - **Validates: Requirements 2.2**

- [ ] 2.15 Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 3. Improved Ride Search with Google Maps

- [x] 3.1 Create LocationAutocomplete frontend component
  - Create `frontend/src/components/search/LocationAutocomplete.jsx`
  - Integrate Google Places Autocomplete API
  - Debounced input for performance
  - Store both display name and coordinates on selection
  - _Requirements: 3.1, 3.2, 3.3_

- [ ]* 3.2 Write property test for location storage completeness
  - **Property 11: Location Storage Completeness**
  - **Validates: Requirements 3.3**

- [ ] 3.3 Enhance RideSearchForm with Google Maps integration
  - Update `frontend/src/components/passenger/RideSearch.jsx`
  - Replace text inputs with LocationAutocomplete components
  - Add date picker, seat count selector
  - Add optional filters (vehicle type, price range)
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 3.4 Enhance SearchService with configurable radius
  - `backend/src/services/searchService.js` already has configurable radius parameter (DEFAULT_SEARCH_RADIUS_KM = 5)
  - Geo-matching uses Haversine formula correctly (already implemented via `calculateDistance`)
  - _Requirements: 3.5_

- [ ]* 3.5 Write property test for geo-search radius matching
  - **Property 12: Geo-Search Radius Matching**
  - **Validates: Requirements 3.5**

- [x] 3.6 Enhance search results data completeness
  - Search response already includes driver photo, vehicle details, departure time, route, available seats, fare
  - Implemented in `searchRides()` function
  - _Requirements: 3.6_

- [ ]* 3.7 Write property test for search results data completeness
  - **Property 13: Search Results Data Completeness**
  - **Validates: Requirements 3.6**

- [x] 3.8 Update SearchResults frontend component
  - `frontend/src/components/passenger/SearchResults.jsx` already exists
  - Display trip cards with all required information (already implemented)
  - Add sort options (departure, fare, rating) - needs enhancement
  - Show available seats prominently (already implemented)
  - _Requirements: 3.6_

- [ ] 3.9 Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 4. Driver Booking Acceptance Flow

- [x] 4.1 Extend Booking model for driver response
  - Add `driverResponse` field with status, respondedAt, declineReason to `backend/src/models/Booking.js`
  - Add `expiresAt` field (30 minutes from creation)
  - Update indexes for efficient expiry queries
  - _Requirements: 4.1, 4.7_

- [x] 4.2 Implement booking request creation with driver notification
  - Update `createBooking()` in `backend/src/services/bookingService.js`
  - Set expiresAt to 30 minutes from creation
  - Send notification to driver via push, SMS, and WhatsApp
  - _Requirements: 4.1_

- [ ]* 4.3 Write property test for booking driver notification
  - **Property 14: Booking Creates Driver Notification**
  - **Validates: Requirements 4.1**

- [x] 4.4 Implement driver booking acceptance
  - Create `acceptBooking(bookingId, driverId)` function in `backend/src/services/bookingService.js`
  - Update booking status to 'confirmed'
  - Deduct seats from trip availability
  - Send confirmation notification to passenger
  - Check if trip is now fully booked
  - _Requirements: 4.3_

- [ ]* 4.5 Write property test for booking acceptance seat deduction
  - **Property 15: Booking Acceptance Seat Deduction**
  - **Validates: Requirements 4.3**

- [x] 4.6 Implement driver booking decline
  - Create `declineBooking(bookingId, driverId, reason)` function
  - Update booking status to 'declined'
  - Release payment hold if exists
  - Send notification to passenger with alternative trips
  - _Requirements: 4.4_

- [ ]* 4.7 Write property test for booking decline payment release
  - **Property 16: Booking Decline Payment Release**
  - **Validates: Requirements 4.4**

- [x] 4.8 Implement fully booked trip handling
  - Create `checkTripFullyBooked(tripId)` function
  - Auto-mark trip as 'fully_booked' when all seats filled
  - Prevent new booking requests for fully booked trips
  - _Requirements: 4.5, 4.6_

- [ ]* 4.9 Write property test for fully booked trip prevention
  - **Property 17: Fully Booked Trip Prevention**
  - **Validates: Requirements 4.5, 4.6**

- [x] 4.10 Implement booking auto-decline for timeout
  - Create `autoDeclineExpiredBookings()` function for cron job
  - Find pending bookings past expiresAt
  - Auto-decline and notify passenger
  - _Requirements: 4.7_

- [ ]* 4.11 Write property test for booking auto-decline timeout
  - **Property 18: Booking Auto-Decline Timeout**
  - **Validates: Requirements 4.7**

- [x] 4.12 Create driver booking API routes
  - Add GET `/api/driver/booking-requests` - pending requests for driver
  - Add POST `/api/bookings/:id/accept` - driver accepts
  - Add POST `/api/bookings/:id/decline` - driver declines
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 4.13 Create BookingRequestCard frontend component
  - Create `frontend/src/components/driver/BookingRequestCard.jsx`
  - Display passenger details, seats, pickup point, amount
  - Accept/Decline buttons
  - Countdown timer showing time remaining
  - _Requirements: 4.2_

- [x] 4.14 Create BookingManagement frontend component
  - Create `frontend/src/components/driver/BookingManagement.jsx`
  - List pending booking requests
  - Show accepted bookings
  - Display trip seat availability
  - _Requirements: 4.2, 4.3_

- [ ] 4.15 Update driver dashboard with booking requests
  - Add booking requests section to driver dashboard
  - Show notification badge for pending requests
  - _Requirements: 4.2_

- [ ] 4.16 Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 5. Enhanced SOS for Passengers and Drivers

- [x] 5.1 Enhance SOS trigger to capture complete data
  - `triggerSOS()` in `backend/src/services/sosService.js` already captures GPS coordinates, timestamp, trip context
  - Supports both passenger and driver triggers (already implemented via userType parameter)
  - _Requirements: 5.1_

- [ ]* 5.2 Write property test for SOS data capture completeness
  - **Property 19: SOS Data Capture Completeness**
  - **Validates: Requirements 5.1**

- [x] 5.3 Enhance emergency contact notification
  - `notifyEmergencyContacts()` already sends to ALL registered contacts
  - Includes live location tracking link in notification (already implemented via `generateLocationLink`)
  - _Requirements: 5.3_

- [ ]* 5.4 Write property test for SOS emergency contact notification
  - **Property 20: SOS Emergency Contact Notification**
  - **Validates: Requirements 5.3**

- [x] 5.5 Enhance SOS alert details for operations team
  - `getAlertDetails()` already includes trip details, both parties' info, exact location, contact options
  - _Requirements: 5.5_

- [ ]* 5.6 Write property test for SOS details completeness
  - **Property 21: SOS Details Completeness**
  - **Validates: Requirements 5.5**

- [x] 5.7 Enhance SOS resolution workflow
  - `resolveAlert()` already logs resolution details
  - Notifies via WebSocket broadcast (already implemented)
  - _Requirements: 5.6_

- [ ] 5.8 Add stop location sharing on SOS resolution
  - Update `resolveAlert()` to stop location sharing
  - Notify emergency contacts of resolution
  - _Requirements: 5.6_

- [ ]* 5.9 Write property test for SOS resolution logging
  - **Property 22: SOS Resolution Logging**
  - **Validates: Requirements 5.6**

- [x] 5.10 Create SOSButton frontend component
  - Create `frontend/src/components/common/SOSButton.jsx`
  - Prominent emergency button design
  - Long-press activation to prevent accidental triggers
  - Confirmation dialog before triggering
  - _Requirements: 5.1_

- [x] 5.11 Enhance SOSAlertsDashboard for operations team
  - `frontend/src/components/admin/SOSAlerts.jsx` already exists
  - Real-time alert feed via WebSocket (already implemented)
  - Map with alert locations (needs enhancement)
  - One-click call options for both parties (needs enhancement)
  - Resolution workflow UI (already implemented)
  - _Requirements: 5.5_

- [ ] 5.12 Add SOS button to passenger and driver trip views
  - Add SOSButton to active trip pages
  - Ensure button is always visible during trips
  - _Requirements: 5.1_

- [ ] 5.13 Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## 6. Live Location Tracking and Ride Sharing

- [x] 6.1 Create ShareLink model
  - Create `backend/src/models/ShareLink.js`
  - Fields: token, bookingId, tripId, createdBy, expiresAt, accessCount, isActive
  - Add unique index on token
  - _Requirements: 6.2_

- [x] 6.2 Create TrackingService for share links
  - Add share link functions to `backend/src/services/tripTrackingService.js`
  - Implement `generateShareLink(bookingId)` - create unique token, set expiry
  - Implement `getSharedTripData(token)` - return public trip data without auth
  - Implement `expireShareLinks(tripId)` - expire all links on trip completion
  - _Requirements: 6.2, 6.3, 6.5_

- [ ]* 6.3 Write property test for share ride availability
  - **Property 23: Share Ride Availability**
  - **Validates: Requirements 6.1**

- [ ]* 6.4 Write property test for share link generation
  - **Property 24: Share Link Generation**
  - **Validates: Requirements 6.2**

- [ ]* 6.5 Write property test for public share link access
  - **Property 25: Public Share Link Access**
  - **Validates: Requirements 6.3**

- [ ]* 6.6 Write property test for share link expiration
  - **Property 26: Share Link Expiration**
  - **Validates: Requirements 6.5**

- [x] 6.7 Create tracking API routes
  - Add POST `/api/tracking/share` - generate share link
  - Add GET `/api/tracking/share/:token` - get shared trip data (public, no auth)
  - Add DELETE `/api/tracking/share/:token` - revoke share link
  - Add GET `/api/tracking/trip/:id` - get live tracking data
  - _Requirements: 6.2, 6.3_

- [x] 6.8 Implement trip completion share link expiration
  - Add hook to trip completion to expire all share links
  - Return expired status for completed trip links
  - _Requirements: 6.5_

- [x] 6.9 Enhance active trip display
  - Passenger trip view already shows driver's live location, ETA, contact option
  - Implemented in `getTrackingInfo()` function
  - _Requirements: 6.6_

- [ ]* 6.10 Write property test for active trip display completeness
  - **Property 27: Active Trip Display Completeness**
  - **Validates: Requirements 6.6**

- [x] 6.11 Create ShareRideButton frontend component
  - Create `frontend/src/components/passenger/ShareRideButton.jsx`
  - Generate and copy share link
  - Native share API integration
  - QR code generation option
  - _Requirements: 6.2_

- [x] 6.12 Create PublicTrackingPage
  - Create `frontend/src/app/track/share/[token]/page.js`
  - No authentication required
  - Display driver details, vehicle info
  - Live map with driver location
  - ETA display
  - Handle expired links gracefully
  - _Requirements: 6.3_

- [x] 6.13 Enhance LiveTrackingMap component
  - `frontend/src/components/passenger/LiveTracking.jsx` already exists
  - Real-time driver location updates via WebSocket (already implemented)
  - Route polyline display (needs enhancement)
  - ETA calculation and display (already implemented)
  - _Requirements: 6.6_

- [ ] 6.14 Add share ride button to active trip view
  - Add ShareRideButton to passenger's active trip page
  - Only show when trip status is 'in_progress'
  - _Requirements: 6.1_

- [ ] 6.15 Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
