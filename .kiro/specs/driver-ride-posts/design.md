# Design Document: Driver Ride Posts

## Overview

This feature implements a ride post system where drivers create trip listings with unique identifiers, and these posts are exclusively visible to passengers through the search and booking interface. The system ensures clear separation between driver management views and passenger browsing views while maintaining data integrity and security.

## Architecture

The feature follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                          │
├─────────────────────┬───────────────────────────────────────┤
│   Driver Section    │         Passenger Section              │
│  - Trip Creator     │  - Ride Search                        │
│  - Trip Manager     │  - Search Results                     │
│  - Earnings View    │  - Trip Details                       │
└─────────────────────┴───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
├─────────────────────┬───────────────────────────────────────┤
│  /api/trips/*       │  /api/search/*                        │
│  (Driver Auth)      │  (Public/Passenger)                   │
└─────────────────────┴───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
├─────────────────────┬───────────────────────────────────────┤
│   tripService       │   searchService                       │
│  - createTrip       │  - searchRides                        │
│  - getDriverTrips   │  - getPublicTripDetails               │
│  - startTrip        │  - filterTrips                        │
│  - completeTrip     │  - sortSearchResults                  │
└─────────────────────┴───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│                    Trip Model                                │
│  - tripId (unique)                                          │
│  - driver, source, destination                              │
│  - scheduledAt, status, fare                                │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Trip Model (Existing - Enhanced)

The Trip model stores ride posts with unique identifiers:

```javascript
// Key fields for ride posts
{
  tripId: String,        // Unique ID: HR-YYYY-NNNNNN
  driver: ObjectId,      // Reference to Driver
  source: LocationSchema,
  destination: LocationSchema,
  scheduledAt: Date,
  status: String,        // 'scheduled', 'in_progress', 'completed', 'cancelled'
  fare: FareBreakdownSchema,
  passengers: [TripPassengerSchema]
}
```

### 2. Trip Service Interface

```javascript
// Driver-facing operations
createTrip(driverId, tripData) → { success, trip, otp }
getDriverTrips(driverId, options) → { success, trips, pagination }
getTripById(tripId) → { success, trip }
startTrip(tripId, driverId, otp) → { success, trip }
completeTrip(tripId, driverId) → { success, trip }
cancelTrip(tripId, driverId, reason) → { success, trip }
```

### 3. Search Service Interface

```javascript
// Passenger-facing operations
searchRides(searchParams) → { success, trips, pagination }
getPublicTripDetails(tripId) → { success, trip }
```

### 4. Post ID Generator

```javascript
// Generates unique Post_ID
generateTripId() → String  // Format: HR-YYYY-NNNNNN
```

## Data Models

### Trip Schema (Post Storage)

| Field | Type | Description |
|-------|------|-------------|
| tripId | String | Unique identifier (HR-YYYY-NNNNNN) |
| driver | ObjectId | Reference to Driver document |
| source | LocationSchema | Pickup location with coordinates |
| destination | LocationSchema | Drop-off location with coordinates |
| scheduledAt | Date | Scheduled departure time |
| status | String | Trip status (scheduled, in_progress, completed, cancelled) |
| fare | FareBreakdownSchema | Fare details |
| passengers | Array | Booked passengers |
| availableSeats | Number | Computed from total - booked |

### Public Trip Response (Passenger View)

| Field | Type | Description |
|-------|------|-------------|
| tripId | String | Post identifier |
| source | Object | Source location (address, coordinates) |
| destination | Object | Destination location |
| scheduledAt | Date | Departure time |
| availableSeats | Number | Seats available for booking |
| farePerSeat | Number | Cost per seat |
| driver | Object | Driver name, rating, photo (no sensitive data) |
| vehicle | Object | Vehicle type, make, model, color |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unique Post ID Generation and Initial Status
*For any* ride post creation with valid data, the generated Post_ID SHALL be unique across all existing posts AND follow the format HR-YYYY-NNNNNN, AND the initial status SHALL be 'scheduled'.
**Validates: Requirements 1.1, 1.4**

### Property 2: Ride Post Data Persistence Round-Trip
*For any* valid ride post data (driver ID, source, destination, scheduled time, seats, fare), after creation, querying the post by its ID SHALL return all the originally stored fields with matching values.
**Validates: Requirements 1.2**

### Property 3: Invalid Post Creation Rejection
*For any* ride post creation attempt missing required fields (source, destination, scheduledAt, availableSeats, farePerSeat), the System SHALL reject the creation and return validation errors.
**Validates: Requirements 1.3**

### Property 4: Search Results Filter Invariant
*For any* passenger search query, all returned ride posts SHALL have status equal to 'scheduled' AND availableSeats greater than zero.
**Validates: Requirements 2.1**

### Property 5: Geo-Search Radius Constraint
*For any* search with source and destination coordinates, all returned ride posts SHALL have source within the configured radius from search source AND destination within the configured radius from search destination.
**Validates: Requirements 2.2**

### Property 6: Date Search Filter
*For any* search with a specific date, all returned ride posts SHALL have scheduledAt within that date's time range (00:00:00 to 23:59:59).
**Validates: Requirements 2.3**

### Property 7: Search Results Completeness
*For any* search result, each returned ride post SHALL contain: tripId, source, destination, scheduledAt, availableSeats, farePerSeat, and driver rating.
**Validates: Requirements 2.4**

### Property 8: Public Trip Details Completeness
*For any* valid Post_ID lookup, the response SHALL contain: driver name, driver rating, vehicle details, route information, and fare breakdown.
**Validates: Requirements 3.1, 3.2**

### Property 9: Sensitive Data Exclusion
*For any* public trip details response, the response SHALL NOT contain driver phone number, driver email, driver personal documents, or driver bank details.
**Validates: Requirements 3.4**

### Property 10: Passenger Authorization Rejection
*For any* passenger user attempting to access driver trip management endpoints (create, start, complete, cancel), the System SHALL return a 403 authorization error.
**Validates: Requirements 4.3**

## Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| INVALID_TRIP_DATA | 400 | Missing or invalid required fields |
| DRIVER_NOT_FOUND | 404 | Driver does not exist |
| DRIVER_NOT_VERIFIED | 403 | Driver not verified to create trips |
| TRIP_NOT_FOUND | 404 | Trip/Post does not exist |
| UNAUTHORIZED | 403 | User not authorized for operation |
| INVALID_TRIP_STATUS | 400 | Operation not allowed in current status |

## Testing Strategy

### Property-Based Testing Library
- **Library**: fast-check (JavaScript)
- **Minimum iterations**: 100 per property test

### Unit Tests
- Post ID generation format validation
- Trip creation with valid/invalid data
- Search filtering logic
- Public trip details field selection

### Property-Based Tests
Each correctness property will be implemented as a property-based test:

1. **Property 1 Test**: Generate random valid trip data, create posts, verify unique IDs and 'scheduled' status
2. **Property 2 Test**: Create posts with random valid data, retrieve by ID, verify field equality
3. **Property 3 Test**: Generate trip data with random missing required fields, verify rejection
4. **Property 4 Test**: Create mixed status trips, search, verify all results are 'scheduled' with seats > 0
5. **Property 5 Test**: Create trips at random coordinates, search with coordinates, verify distance constraints
6. **Property 6 Test**: Create trips on random dates, search by date, verify scheduledAt within range
7. **Property 7 Test**: Perform searches, verify all required fields present in results
8. **Property 8 Test**: Create trips, get public details, verify all required fields present
9. **Property 9 Test**: Get public trip details, verify sensitive fields absent
10. **Property 10 Test**: Attempt driver endpoints with passenger auth, verify 403 responses

### Test Annotations
Each property-based test MUST be tagged with:
```javascript
// **Feature: driver-ride-posts, Property {number}: {property_text}**
// **Validates: Requirements X.Y**
```
