# Design Document: Passenger Ride Search & Booking

## Overview

This feature enhances the passenger ride search and booking experience by displaying comprehensive driver and ride information in search results, providing a transparent fare breakdown with ₹15 platform fees, and implementing a complete booking flow. The system leverages existing search and booking services while adding enhanced display components and fee calculations.

## Architecture

The feature follows the existing architecture pattern with:
- Backend services handling search, booking, and payment logic
- Frontend React components for UI rendering
- RESTful API communication between frontend and backend

```mermaid
flowchart TB
    subgraph Frontend
        SearchPage[Search Page]
        SearchResults[SearchResults Component]
        RideCard[Enhanced RideCard]
        TripDetails[Trip Details Page]
        BookingFlow[Booking Flow]
        FareBreakdown[Fare Breakdown Component]
    end
    
    subgraph Backend
        SearchAPI[/api/search/rides]
        TripAPI[/api/search/trips/:id]
        BookingAPI[/api/bookings]
        PaymentService[Payment Service]
    end
    
    SearchPage --> SearchResults
    SearchResults --> RideCard
    RideCard -->|Click| TripDetails
    TripDetails --> BookingFlow
    BookingFlow --> FareBreakdown
    
    SearchResults -->|GET| SearchAPI
    TripDetails -->|GET| TripAPI
    BookingFlow -->|POST| BookingAPI
    BookingAPI --> PaymentService
```

## Components and Interfaces

### Enhanced RideCard Component

```javascript
// Props interface for RideCard
interface RideCardProps {
  trip: {
    _id: string;
    source: { address: string; coordinates: { lat: number; lng: number } };
    destination: { address: string; coordinates: { lat: number; lng: number } };
    scheduledAt: string;
    availableSeats: number;
    farePerSeat: number;
    driver: {
      name: string;
      photo: string | null;
      rating: number;
      totalTrips: number;
      verified: boolean;
    };
    vehicle: {
      type: string;
      make: string;
      model: string;
      color: string;
    } | null;
    instantBooking: boolean;
    ladiesOnly: boolean;
  };
  onBook: (tripId: string) => void;
}
```

### Fare Breakdown Component

```javascript
// Props interface for FareBreakdown
interface FareBreakdownProps {
  farePerSeat: number;
  seats: number;
  platformFeePerSeat: number; // Always ₹15
}

// Calculated values
interface FareCalculation {
  baseFare: number;        // farePerSeat * seats
  platformFee: number;     // 15 * seats
  totalAmount: number;     // baseFare + platformFee
}
```

### Search API Response Enhancement

```javascript
// Enhanced search response format
interface SearchResponse {
  success: boolean;
  trips: Array<{
    _id: string;
    tripId: string;
    source: LocationInfo;
    destination: LocationInfo;
    scheduledAt: string;
    availableSeats: number;
    farePerSeat: number;
    driver: {
      name: string;
      photo: string | null;
      rating: number;
      totalTrips: number;
      verified: boolean;
    };
    vehicle: VehicleInfo | null;
    instantBooking: boolean;
    ladiesOnly: boolean;
    badges: string[]; // Computed badges array
  }>;
  pagination: PaginationInfo;
}
```

## Data Models

### Platform Fee Constants

```javascript
const PLATFORM_FEE = {
  DRIVER_FEE_PER_SEAT: 15,    // ₹15 deducted from driver per seat
  PASSENGER_FEE_PER_SEAT: 15  // ₹15 charged to passenger per seat
};
```

### Fare Calculation Model

```javascript
// Fare calculation for booking
function calculateBookingFare(farePerSeat, seats) {
  const baseFare = farePerSeat * seats;
  const passengerPlatformFee = 15 * seats;
  const totalPassengerPays = baseFare + passengerPlatformFee;
  
  const driverPlatformFee = 15 * seats;
  const driverNetEarnings = baseFare - driverPlatformFee;
  
  return {
    baseFare,
    passengerPlatformFee,
    totalPassengerPays,
    driverPlatformFee,
    driverNetEarnings
  };
}
```

### Badge Computation

```javascript
// Compute badges for a trip
function computeBadges(trip) {
  const badges = [];
  if (trip.driver?.verified) badges.push('ID Verified');
  if (trip.instantBooking) badges.push('Instant Booking');
  if (trip.ladiesOnly) badges.push('Ladies Only');
  return badges;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Search results only contain bookable trips
*For any* search query, all returned trips SHALL have status 'scheduled' AND availableSeats greater than zero.
**Validates: Requirements 1.1**

### Property 2: Search results contain required driver and trip fields
*For any* trip in search results, the response SHALL contain: driver.name, driver.rating, driver.totalTrips, farePerSeat, scheduledAt, source.address, destination.address, and availableSeats.
**Validates: Requirements 1.2, 1.4, 1.5**

### Property 3: Badge computation is consistent with trip flags
*For any* trip, if driver.verified is true then badges SHALL contain 'ID Verified', if instantBooking is true then badges SHALL contain 'Instant Booking', if ladiesOnly is true then badges SHALL contain 'Ladies Only'.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 4: Trip details contain complete information
*For any* trip detail request, the response SHALL contain source.address, destination.address, driver profile (name, rating, totalTrips, verified), and scheduledAt in a valid date format.
**Validates: Requirements 3.2, 3.3, 3.5**

### Property 5: Platform fee calculation is correct
*For any* fare amount and seat count, the passenger total SHALL equal (farePerSeat × seats) + (15 × seats), and driver net earnings SHALL equal (farePerSeat × seats) - (15 × seats).
**Validates: Requirements 4.2, 4.3, 6.1, 6.3**

### Property 6: Seat validation prevents overbooking
*For any* booking attempt where requested seats exceed available seats, the system SHALL reject the booking with an appropriate error.
**Validates: Requirements 5.2, 5.5**

### Property 7: Booking confirmation creates valid booking record
*For any* successful booking confirmation, a booking record SHALL be created with status 'pending' and a valid bookingId, and upon payment success the status SHALL change to 'confirmed'.
**Validates: Requirements 5.3, 5.4**

## Error Handling

| Error Code | Description | HTTP Status | User Message |
|------------|-------------|-------------|--------------|
| TRIP_NOT_FOUND | Trip ID does not exist | 404 | "This ride is no longer available" |
| INSUFFICIENT_SEATS | Requested seats > available | 400 | "Only X seats available" |
| TRIP_NOT_AVAILABLE | Trip status not 'scheduled' | 400 | "This ride is not available for booking" |
| DUPLICATE_BOOKING | User already has booking | 400 | "You already have a booking for this ride" |
| PROFILE_INCOMPLETE | User profile missing required fields | 400 | "Please complete your profile before booking" |
| PAYMENT_FAILED | Payment processing failed | 400 | "Payment failed. Please try again" |

## Testing Strategy

### Unit Testing
- Test fare calculation functions with various inputs
- Test badge computation logic
- Test seat validation logic
- Test currency formatting functions

### Property-Based Testing
The following property-based tests will be implemented using fast-check library:

1. **Search Results Property Test**: Generate random search queries and verify all results have availableSeats > 0 and status 'scheduled'
2. **Fare Calculation Property Test**: Generate random fare amounts and seat counts, verify calculation formula holds
3. **Badge Computation Property Test**: Generate random trip objects with various flag combinations, verify badges match flags
4. **Seat Validation Property Test**: Generate random booking attempts with various seat counts, verify validation behavior

Each property test will run a minimum of 100 iterations to ensure comprehensive coverage.

Property tests will be tagged with format: `**Feature: passenger-ride-search-booking, Property {number}: {property_text}**`
