# Requirements Document

## Introduction

This feature enhances the passenger ride search experience by displaying all driver-posted rides with comprehensive driver details (name, photo, rating, vehicle info, cost) in the search results. When a passenger clicks "Book", they are taken through a complete booking flow showing full ride details with transparent platform fee breakdown (₹15 for both driver and passenger). The goal is to provide passengers with all the information they need to make informed booking decisions while maintaining a clear, intuitive booking process.

## Glossary

- **Ride_Search_System**: The system component responsible for searching and displaying available rides posted by drivers
- **Booking_Flow_System**: The system component that handles the complete booking process from ride selection to payment confirmation
- **Platform_Fee**: A fixed ₹15 service charge applied to both driver and passenger per booking
- **Driver_Profile**: Public driver information including name, photo, rating, total trips, and verification status
- **Fare_Breakdown**: Detailed cost structure showing base fare, platform fees, and total amount
- **Available_Seats**: Number of seats remaining for booking on a trip

## Requirements

### Requirement 1

**User Story:** As a passenger, I want to see all driver-posted rides in search results with complete driver information, so that I can choose the best ride for my journey.

#### Acceptance Criteria

1. WHEN a passenger searches for rides THEN the Ride_Search_System SHALL display all scheduled trips matching the search criteria with available seats greater than zero
2. WHEN displaying search results THEN the Ride_Search_System SHALL show driver name, profile photo, rating (with star display), and total completed trips for each ride
3. WHEN displaying search results THEN the Ride_Search_System SHALL show the fare per seat prominently with currency symbol (₹)
4. WHEN displaying search results THEN the Ride_Search_System SHALL show departure time, pickup location, and drop location for each ride
5. WHEN displaying search results THEN the Ride_Search_System SHALL show available seats count and vehicle details (type, make, model, color)
6. WHEN a ride has zero available seats THEN the Ride_Search_System SHALL display the ride as "Full" with a disabled booking button

### Requirement 2

**User Story:** As a passenger, I want to see verification badges and special tags on rides, so that I can identify trusted drivers and rides with special features.

#### Acceptance Criteria

1. WHEN a driver is verified THEN the Ride_Search_System SHALL display an "ID Verified" badge on the ride card
2. WHEN a ride has instant booking enabled THEN the Ride_Search_System SHALL display an "Instant Booking" badge
3. WHEN a ride is marked as ladies only THEN the Ride_Search_System SHALL display a "Ladies Only" badge
4. WHEN displaying badges THEN the Ride_Search_System SHALL use distinct colors for each badge type

### Requirement 3

**User Story:** As a passenger, I want to click on a ride and see complete details before booking, so that I can make an informed decision.

#### Acceptance Criteria

1. WHEN a passenger clicks on a ride card THEN the Booking_Flow_System SHALL navigate to a detailed trip view page
2. WHEN displaying trip details THEN the Booking_Flow_System SHALL show complete route information with pickup and drop addresses
3. WHEN displaying trip details THEN the Booking_Flow_System SHALL show driver profile with photo, name, rating, total trips, and verification status
4. WHEN displaying trip details THEN the Booking_Flow_System SHALL show vehicle information including type, make, model, and color
5. WHEN displaying trip details THEN the Booking_Flow_System SHALL show scheduled departure date and time in user-friendly format

### Requirement 4

**User Story:** As a passenger, I want to see a transparent fare breakdown including platform fees, so that I understand exactly what I am paying.

#### Acceptance Criteria

1. WHEN displaying booking details THEN the Booking_Flow_System SHALL show fare per seat as the base amount
2. WHEN displaying booking details THEN the Booking_Flow_System SHALL show passenger platform fee as exactly ₹15 per seat
3. WHEN displaying booking details THEN the Booking_Flow_System SHALL calculate and display total amount as (fare per seat × seats) + (₹15 × seats)
4. WHEN a passenger selects multiple seats THEN the Booking_Flow_System SHALL update the fare breakdown to reflect the total for all seats
5. WHEN displaying fare breakdown THEN the Booking_Flow_System SHALL clearly label each component (Base Fare, Platform Fee, Total)

### Requirement 5

**User Story:** As a passenger, I want to complete the booking process with seat selection and payment, so that I can secure my ride.

#### Acceptance Criteria

1. WHEN a passenger clicks "Book" THEN the Booking_Flow_System SHALL display a seat selection interface with available seat count
2. WHEN a passenger selects seats THEN the Booking_Flow_System SHALL validate that selected seats do not exceed available seats
3. WHEN a passenger confirms booking THEN the Booking_Flow_System SHALL create a pending booking and proceed to payment
4. WHEN payment is successful THEN the Booking_Flow_System SHALL confirm the booking and display a success message with booking reference
5. IF a passenger attempts to book more seats than available THEN the Booking_Flow_System SHALL display an error message and prevent booking

### Requirement 6

**User Story:** As a driver, I want the platform fee to be deducted from my earnings transparently, so that I understand my net earnings.

#### Acceptance Criteria

1. WHEN a booking is confirmed THEN the Booking_Flow_System SHALL deduct ₹15 platform fee per seat from driver earnings
2. WHEN displaying driver earnings THEN the Booking_Flow_System SHALL show gross fare, platform fee deduction, and net earnings
3. WHEN calculating driver payout THEN the Booking_Flow_System SHALL apply the formula: net earnings = fare - (₹15 × seats booked)
