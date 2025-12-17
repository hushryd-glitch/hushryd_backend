# Design Document: Ride View Details Fix

## Overview

This design addresses the 404 error occurring when viewing ride details after a driver posts a ride. The solution ensures proper trip ID generation, robust API lookup handling, and complete data display for both driver and passenger views.

## Architecture

The system follows a client-server architecture with:
- **Frontend (Next.js)**: Trip details pages for drivers and passengers
- **Backend (Express.js)**: REST API endpoints for trip management and search
- **Database (MongoDB)**: Trip storage with dual ID system (ObjectId + human-readable tripId)

```mermaid
flowchart TD
    subgraph Frontend
        DTP[Driver Trip Page<br>/driver/trips/[id]]
        PTP[Passenger Trip Page<br>/trips/[id]]
    end
    
    subgraph Backend API
        TA[/api/trips/:id]
        SA[/api/search/trips/:id]
    end
    
    subgraph Services
        TS[tripService.getTripById]
        SS[searchService.getPublicTripDetails]
    end
    
    subgraph Database
        TC[(Trip Collection)]
    end
    
    DTP --> TA
    PTP --> SA
    TA --> TS
    SA --> SS
    TS --> TC
    SS --> TC
```

## Components and Interfaces

### 1. Trip Model (backend/src/models/Trip.js)

The Trip model already supports dual ID system:
- `_id`: MongoDB ObjectId (auto-generated)
- `tripId`: Human-readable ID in format HR-YYYY-NNNNNN

```javascript
// Trip ID format validation
const TRIP_ID_REGEX = /^HR-\d{4}-\d{6}$/;

// Static method for ID generation
TripSchema.statics.generateTripId = async function() {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    tripId: { $regex: `^HR-${year}-` }
  });
  const sequence = String(count + 1).padStart(6, '0');
  return `HR-${year}-${sequence}`;
};
```

### 2. Trip Service (backend/src/services/tripService.js)

The `getTripById` function handles lookup by both ID types:

```javascript
const getTripById = async (tripId) => {
  let trip;

  // Try MongoDB ObjectId first
  if (tripId.match(/^[0-9a-fA-F]{24}$/)) {
    trip = await Trip.findById(tripId)
      .populate('driver')
      .populate('passengers.userId', 'name phone email')
      .lean();
  }

  // Fallback to human-readable tripId
  if (!trip) {
    trip = await Trip.findOne({ tripId })
      .populate('driver')
      .populate('passengers.userId', 'name phone email')
      .lean();
  }

  if (!trip) {
    const error = new Error('Trip not found');
    error.code = 'TRIP_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  return { success: true, trip };
};
```

### 3. Search Service (backend/src/services/searchService.js)

The `getPublicTripDetails` function provides passenger-safe trip data:

```javascript
const getPublicTripDetails = async (tripId) => {
  // Same dual lookup logic
  // Returns sanitized trip data without sensitive driver info
};
```

### 4. Frontend Components

#### Driver Trip Details Page (frontend/src/app/driver/trips/[id]/page.js)
- Fetches from `/api/trips/:id` (authenticated)
- Displays full trip details including passengers and payment info

#### Passenger Trip Details Page (frontend/src/app/trips/[id]/page.js)
- Fetches from `/api/search/trips/:id` (public)
- Displays public trip info with driver and vehicle details

## Data Models

### Trip Response Structure (Driver View)

```typescript
interface TripResponse {
  success: boolean;
  trip: {
    _id: string;           // MongoDB ObjectId
    tripId: string;        // HR-YYYY-NNNNNN format
    source: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    destination: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    scheduledAt: Date;
    status: 'scheduled' | 'driver_assigned' | 'in_progress' | 'completed' | 'cancelled';
    fare: {
      baseFare: number;
      distanceCharge: number;
      tollCharges: number;
      platformFee: number;
      taxes: number;
      total: number;
    };
    payment: {
      driverAdvance: number;
      vaultAmount: number;
      vaultStatus: 'locked' | 'released';
      platformCommission: number;
    };
    passengers: Array<{
      userId: { name: string; phone: string; email: string };
      seats: number;
      fare: number;
      paymentStatus: string;
    }>;
    driver: Driver;
  };
}
```

### Public Trip Response Structure (Passenger View)

```typescript
interface PublicTripResponse {
  success: boolean;
  trip: {
    _id: string;
    tripId: string;
    source: Location;
    destination: Location;
    scheduledAt: Date;
    status: string;
    availableSeats: number;
    farePerSeat: number;
    fare: FareBreakdown;
    driver: {
      name: string;
      photo: string | null;
      selfie: string | null;
      rating: number;
      totalTrips: number;
      verified: boolean;
    };
    vehicle: {
      type: string;
      make: string;
      model: string;
      color: string;
      seats: number;
      year: number;
      photos: string[];
    } | null;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Trip ID Format Validity
*For any* created trip, the tripId field SHALL match the regex pattern `^HR-\d{4}-\d{6}$` (e.g., HR-2024-001234)
**Validates: Requirements 1.1, 1.2**

### Property 2: Dual ID Lookup Equivalence
*For any* valid trip, fetching by MongoDB ObjectId (_id) and fetching by human-readable tripId SHALL return equivalent trip data
**Validates: Requirements 2.2, 4.1, 4.2**

### Property 3: Trip Response Completeness (Driver View)
*For any* trip fetched via the authenticated endpoint, the response SHALL contain: source.address, destination.address, fare.baseFare, fare.platformFee, fare.total, payment.driverAdvance, and payment.vaultAmount
**Validates: Requirements 2.3, 2.4, 2.6**

### Property 4: Public Trip Response Completeness
*For any* trip fetched via the public search endpoint, the response SHALL contain: driver.name, driver.rating, driver.verified, availableSeats, and farePerSeat
**Validates: Requirements 3.3, 3.5**

### Property 5: Invalid ID Returns 404
*For any* invalid trip identifier (neither valid ObjectId nor existing tripId), the API SHALL return a 404 status with error code TRIP_NOT_FOUND
**Validates: Requirements 4.3**

## Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| TRIP_NOT_FOUND | 404 | Trip not found by either ObjectId or tripId |
| INVALID_TRIP_ID | 400 | Trip ID format is invalid |
| UNAUTHORIZED | 401 | Authentication required for driver endpoints |
| INTERNAL_ERROR | 500 | Unexpected server error |

## Testing Strategy

### Unit Tests
- Test Trip ID generation produces valid format
- Test dual lookup logic in getTripById
- Test response field completeness

### Property-Based Tests
Using fast-check library for JavaScript:

1. **Trip ID Format Property**: Generate random trip creation data, verify tripId matches regex
2. **Dual Lookup Equivalence Property**: For created trips, verify ObjectId and tripId lookups return same data
3. **Response Completeness Property**: For any trip, verify all required fields are present
4. **404 Property**: For random invalid IDs, verify 404 response

Each property-based test should run a minimum of 100 iterations.

Property tests must be tagged with format: `**Feature: ride-view-details-fix, Property {number}: {property_text}**`
