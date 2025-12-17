# Team Task Assignments - Hushryd Platform

## Overview
This document breaks down remaining tasks for 3 team members:
- **Backend Developer** - API, services, database
- **Frontend Developer** - UI components, pages
- **Intern** - Testing, checkpoints, documentation

---

## BACKEND DEVELOPER TASKS

### Week 1: Driver Booking Acceptance Flow (Platform Enhancements Section 4)

#### Task B1: ✅ ALREADY COMPLETE - Booking API Endpoints
**Files:** 
- `backend/src/routes/bookings.js` - accept/decline endpoints
- `backend/src/routes/driver.js` - booking-requests endpoint
- `backend/src/services/bookingService.js` - all service functions

**Status:** All endpoints implemented:
- ✅ GET /api/driver/booking-requests - returns pending bookings
- ✅ POST /api/bookings/:id/accept - accepts booking
- ✅ POST /api/bookings/:id/decline - declines booking

**Next Action:** Verify endpoints work with Postman/curl testing

---

#### Task B2: ✅ COMPLETE - Share Link Expiration
**File:** `backend/src/services/tripService.js`
**Status:** Hook added to completeTrip function

**Implementation Done:**
- Added `expireShareLinks(trip._id)` call in completeTrip function
- Error handling added to not fail trip completion if expiration fails

**Acceptance Criteria:**
- [x] When trip completes, call expireShareLinks(tripId)
- [ ] Verify expired links return "Link expired" message (needs testing)

---

#### Task B3: Add SOS Resolution Enhancements
**File:** `backend/src/services/sosService.js`
**Spec Reference:** platform-enhancements Task 5.8

**Implementation needed:**
```javascript
// In resolveAlert function, add:
// 1. Notify emergency contacts that situation is resolved
// 2. Clear any active location sharing for the trip
```

**Acceptance Criteria:**
- [ ] Emergency contacts receive "resolved" notification
- [ ] Resolution details logged with timestamp

---

### Week 2: Backend Testing & Validation

#### Task B4: Run All Backend Tests
**Command:** `cd backend && npm test`
**Fix any failing tests before proceeding**

#### Task B5: Verify All API Endpoints Work
Create a Postman collection or test script to verify:
- [ ] Auth endpoints (OTP request/verify)
- [ ] Driver endpoints (register, documents, trips)
- [ ] Booking endpoints (create, accept, decline)
- [ ] Admin endpoints (documents, rides, SOS)
- [ ] Tracking endpoints (share link, live tracking)

---

## FRONTEND DEVELOPER TASKS

### Week 1: Driver Booking Management UI

#### Task F1: Create BookingRequestCard Component
**File:** `frontend/src/components/driver/BookingRequestCard.jsx`
**Spec Reference:** platform-enhancements Task 4.13

```jsx
// Component structure:
// - Passenger name, photo
// - Number of seats requested
// - Pickup point
// - Amount (fare × seats)
// - Accept button (green)
// - Decline button (red) with reason modal
// - Countdown timer showing time remaining (30 min expiry)
```

**Props:**
```javascript
{
  booking: {
    _id, passengerName, passengerPhoto, seats,
    pickupPoint, amount, expiresAt, createdAt
  },
  onAccept: (bookingId) => {},
  onDecline: (bookingId, reason) => {}
}
```

**Acceptance Criteria:**
- [ ] Shows all booking details clearly
- [ ] Countdown timer updates every second
- [ ] Accept triggers API call and shows success
- [ ] Decline opens modal for reason input

---

#### Task F2: Create BookingManagement Component
**File:** `frontend/src/components/driver/BookingManagement.jsx`
**Spec Reference:** platform-enhancements Task 4.14

```jsx
// Component structure:
// - Tabs: Pending | Accepted | All
// - List of BookingRequestCard components
// - Trip seat availability summary
// - Empty state when no bookings
```

**Acceptance Criteria:**
- [ ] Fetches bookings from GET /api/driver/booking-requests
- [ ] Filters by status (pending, accepted)
- [ ] Shows trip seat availability
- [ ] Refreshes after accept/decline

---

#### Task F3: Update Driver Dashboard with Booking Requests
**File:** `frontend/src/components/driver/Dashboard.jsx`
**Spec Reference:** platform-enhancements Task 4.15

**Changes:**
- Add "Booking Requests" section
- Show notification badge with pending count
- Link to full BookingManagement page

**Acceptance Criteria:**
- [ ] Dashboard shows pending booking count
- [ ] Badge appears when pending > 0
- [ ] Click navigates to booking management

---

### Week 2: SOS & Tracking UI

#### Task F4: Add SOS Button to Trip Views
**Files:** 
- `frontend/src/app/track/[bookingId]/page.js`
- `frontend/src/app/driver/trips/[id]/page.js`
**Spec Reference:** platform-enhancements Task 5.12

**Implementation:**
- Import SOSButton component
- Add to active trip pages
- Position prominently (fixed bottom or header)

**Acceptance Criteria:**
- [ ] SOS button visible on passenger tracking page
- [ ] SOS button visible on driver active trip page
- [ ] Button only shows when trip is 'in_progress'

---

#### Task F5: Create Public Tracking Page
**File:** `frontend/src/app/track/share/[token]/page.js`
**Spec Reference:** platform-enhancements Task 6.12

```jsx
// Page structure (NO AUTH REQUIRED):
// - Fetch trip data via GET /api/tracking/share/:token
// - Display driver name, photo, vehicle details
// - Live map with driver location (WebSocket)
// - ETA display
// - Handle expired links with friendly message
```

**Acceptance Criteria:**
- [ ] Page loads without authentication
- [ ] Shows driver and vehicle info
- [ ] Map updates with live location
- [ ] Expired links show "Link expired" message

---

#### Task F6: Add Share Ride Button to Active Trip
**File:** `frontend/src/app/track/[bookingId]/page.js`
**Spec Reference:** platform-enhancements Task 6.14

**Implementation:**
- Import ShareRideButton component
- Add to tracking page
- Only show when trip status is 'in_progress'

**Acceptance Criteria:**
- [ ] Share button visible during active trips
- [ ] Generates shareable link
- [ ] Copy to clipboard works
- [ ] Native share API on mobile

---

## INTERN TASKS

### Week 1: Run All Checkpoints

#### Task I1: Run Backend Tests
**Commands:**
```bash
cd backend
npm install
npm test
```
**Document any failures in a file: `test-results-backend.md`**

---

#### Task I2: Run Frontend Build
**Commands:**
```bash
cd frontend
npm install
npm run build
```
**Document any build errors in: `test-results-frontend.md`**

---

#### Task I3: Manual Testing Checklist
Test each flow manually and document results:

**Authentication Flow:**
- [ ] Can request OTP with phone number
- [ ] Can verify OTP and login
- [ ] New user redirected to profile setup
- [ ] Existing user redirected to dashboard

**Driver Flow:**
- [ ] Can register as driver
- [ ] Can add vehicle details
- [ ] Can upload documents
- [ ] Can create a trip
- [ ] Can view earnings

**Passenger Flow:**
- [ ] Can search for rides
- [ ] Can view trip details
- [ ] Can book a ride
- [ ] Can track active booking
- [ ] Can cancel booking
- [ ] Can rate completed trip

**Admin Flow:**
- [ ] Can login as admin
- [ ] Can view rides list
- [ ] Can verify documents
- [ ] Can view SOS alerts
- [ ] Can view payments

---

### Week 2: Write Unit Tests

#### Task I4: SearchBar Component Tests
**File:** `frontend/src/__tests__/SearchBar.test.jsx`

```javascript
// Tests to write:
// 1. Renders with initial values
// 2. Updates state on input change
// 3. Calls onSearch with correct params
// 4. Modify button toggles edit mode
```

---

#### Task I5: FilterPanel Component Tests
**File:** `frontend/src/__tests__/FilterPanel.test.jsx`

```javascript
// Tests to write:
// 1. Renders all filter options
// 2. Sort selection updates state
// 3. Checkbox filters work correctly
// 4. Reset clears all filters
```

---

#### Task I6: RideCard Component Tests
**File:** `frontend/src/__tests__/RideCard.test.jsx`

```javascript
// Tests to write:
// 1. Renders trip details correctly
// 2. Shows driver info and rating
// 3. Book button calls onClick
// 4. Disabled when seats = 0
```

---

### Week 3: Documentation

#### Task I7: API Documentation
Create `docs/API.md` with:
- All endpoints grouped by feature
- Request/response examples
- Authentication requirements

#### Task I8: Setup Guide
Create `docs/SETUP.md` with:
- Prerequisites (Node, MongoDB, etc.)
- Environment variables needed
- How to run backend
- How to run frontend
- How to run tests

---

## TASK COMPLETION TRACKING

### Backend Developer Progress
| Task | Status | Priority | Est. Time |
|------|--------|----------|-----------|
| B1 - Booking API Endpoints | ✅ Done | - | - |
| B2 - Hook Share Link Expiration | ✅ Done | - | - |
| B3 - SOS Resolution Enhancement | [ ] | Medium | 2 hours |
| B4 - Run Tests | [ ] | High | 1 hour |
| B5 - API Verification | [ ] | Medium | 2 hours |

### Frontend Developer Progress
| Task | Status | Priority | Est. Time |
|------|--------|----------|-----------|
| F1 - BookingRequestCard | ✅ Done | High | - |
| F2 - BookingManagement | ✅ Done | High | - |
| F3 - Dashboard Update | [ ] | High | 1 hour |
| F4 - SOS Button Integration | [ ] | Medium | 1 hour |
| F5 - Public Tracking Page | ✅ Done | High | - |
| F6 - Share Ride Button | [ ] | Medium | 1 hour |

### Intern Progress
| Task | Status | Priority | Est. Time |
|------|--------|----------|-----------|
| I1 - Backend Tests | [ ] | High | 1 hour |
| I2 - Frontend Build | [ ] | High | 1 hour |
| I3 - Manual Testing | [ ] | High | 4 hours |
| I4 - SearchBar Tests | [ ] | Medium | 2 hours |
| I5 - FilterPanel Tests | [ ] | Medium | 2 hours |
| I6 - RideCard Tests | [ ] | Medium | 2 hours |
| I7 - API Docs | [ ] | Low | 3 hours |
| I8 - Setup Guide | [ ] | Low | 2 hours |

---

## SUMMARY: TOTAL REMAINING WORK

| Team Member | Total Tasks | Completed | Remaining | Est. Hours |
|-------------|-------------|-----------|-----------|------------|
| Backend | 5 tasks | 2 | 3 | ~4 hours |
| Frontend | 6 tasks | 3 | 3 | ~3 hours |
| Intern | 8 tasks | 0 | 8 | ~17 hours |

### ✅ COMPLETED BY KIRO
- **B2** - Share link expiration hook added to tripService
- **F1** - BookingRequestCard component created
- **F2** - BookingManagement component created  
- **F5** - Public tracking page created

### Critical Path (Must Complete First)
1. **Backend B4** - Run tests to ensure nothing is broken
2. **Frontend F3** - Update driver dashboard with booking requests
3. **Intern I1, I2** - Verify builds work

### Nice to Have (Can Do Later)
- Property tests (marked with * in specs)
- API documentation
- Additional unit tests

---

## DAILY STANDUP QUESTIONS
1. What did you complete yesterday?
2. What are you working on today?
3. Any blockers?

## DEFINITION OF DONE
- [ ] Code written and tested locally
- [ ] No console errors
- [ ] Follows existing code patterns
- [ ] PR created with description
- [ ] Code reviewed by team lead

---

## HOW TO START

### Backend Developer
```bash
cd backend
npm install
npm test  # Run this first to see current state
# Then work on Task B2 - add expireShareLinks call to tripService
```

### Frontend Developer
```bash
cd frontend
npm install
npm run dev  # Start dev server
# Create BookingRequestCard.jsx first (Task F1)
```

### Intern
```bash
# Start with running tests
cd backend && npm test
cd ../frontend && npm run build
# Document any errors you find
```
