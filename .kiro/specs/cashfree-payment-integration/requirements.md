# Requirements Document

## Introduction

This document specifies the requirements for integrating Cashfree Payment Gateway into the HushRyd ride-sharing platform. The integration will enable secure payment processing for ride bookings across both the web application (Next.js) and mobile application (React Native/Expo). The system implements a payment hold mechanism where passenger payments are held until OTP verification at pickup, then released to drivers after all passengers are picked up and the ride starts. The platform collects a ₹10 fee from passengers and offers an optional Free Cancellation feature for flexible booking with full refund protection.

## Glossary

- **Cashfree**: A payment gateway service provider that enables online payment collection, payouts, and refunds through various payment methods including UPI, cards, net banking, and wallets
- **Payment Gateway**: A service that authorizes and processes payments between customers and merchants
- **Payment Hold**: A mechanism where payment is authorized but not captured until a specific event (OTP verification)
- **Payout**: Transfer of funds from the platform to driver bank accounts or wallet
- **Webhook**: HTTP callback that Cashfree sends to notify the platform of payment events
- **Order**: A Cashfree entity representing a payment request with a unique order_id
- **Payment Session**: A secure session created by Cashfree for processing a payment
- **Beneficiary**: A registered recipient (driver) for payouts
- **Transaction**: A record of any financial operation (collection, payout, refund)
- **Platform Fee**: Fixed ₹10 fee charged to passengers on each booking
- **Free Cancellation Fee**: Optional non-refundable fee (starting at ₹10) for full refund protection
- **Free Cancellation Window**: Time period (at least 2 hours before departure) during which full refund is available
- **OTP Verification**: One-time password verification when passenger is picked up by driver
- **Driver Wallet**: In-app wallet where driver earnings are credited before bank transfer

## Requirements

### Requirement 1

**User Story:** As a passenger, I want to pay for my ride booking securely using multiple payment methods, so that I can complete my booking conveniently.

#### Acceptance Criteria

1. WHEN a passenger initiates payment for a booking THEN the Cashfree_Payment_System SHALL create a payment order with hold/authorization mode
2. WHEN the payment session is created THEN the Cashfree_Payment_System SHALL support UPI, credit cards, debit cards, net banking, and wallet payment methods
3. WHEN a passenger completes payment on the web application THEN the Cashfree_Payment_System SHALL use the Cashfree JavaScript SDK for seamless checkout
4. WHEN a passenger completes payment on the mobile application THEN the Cashfree_Payment_System SHALL use web-based checkout compatible with Expo
5. WHEN payment authorization is successful THEN the Cashfree_Payment_System SHALL place the payment on hold and update booking status to confirmed
6. WHEN payment fails THEN the Cashfree_Payment_System SHALL display a clear error message and allow retry with the same or different payment method

### Requirement 2

**User Story:** As a platform operator, I want to charge a fixed platform fee on each booking, so that the platform generates revenue from transactions.

#### Acceptance Criteria

1. WHEN calculating the total payment amount THEN the Cashfree_Payment_System SHALL add a fixed platform fee of ₹10 to the fare
2. WHEN displaying fare breakdown THEN the Cashfree_Payment_System SHALL show the base fare and platform fee separately
3. WHEN processing payment THEN the Cashfree_Payment_System SHALL collect the total amount (fare + ₹10 platform fee) from the passenger
4. WHEN the platform fee is applied THEN the Cashfree_Payment_System SHALL apply the same ₹10 fee for both web and mobile app bookings
5. WHEN a refund is processed THEN the Cashfree_Payment_System SHALL NOT refund the platform fee under any circumstances

### Requirement 3

**User Story:** As a passenger, I want to opt for Free Cancellation protection at booking, so that I can get a full refund if my plans change.

#### Acceptance Criteria

1. WHEN a passenger is at checkout THEN the Cashfree_Payment_System SHALL display the Free Cancellation option with the fee amount (starting at ₹10 based on ticket price)
2. WHEN a passenger selects Free Cancellation THEN the Cashfree_Payment_System SHALL add the Free Cancellation fee to the total payable amount
3. WHEN displaying the fare breakdown THEN the Cashfree_Payment_System SHALL show base fare, platform fee, and Free Cancellation fee separately
4. WHEN a booking with Free Cancellation is cancelled within the allowed window (2 hours before departure) THEN the Cashfree_Payment_System SHALL refund the full ticket price (excluding platform fee and Free Cancellation fee)
5. WHEN a booking with Free Cancellation is cancelled outside the allowed window THEN the Cashfree_Payment_System SHALL apply the standard cancellation policy

### Requirement 4

**User Story:** As a passenger, I want to see the cancellation charges before and after booking, so that I understand the refund policy.

#### Acceptance Criteria

1. WHEN a passenger views booking details THEN the Cashfree_Payment_System SHALL display the applicable cancellation charges based on time remaining until departure
2. WHEN a passenger initiates cancellation THEN the Cashfree_Payment_System SHALL show the refund amount and deductions before confirmation
3. WHEN calculating cancellation charges THEN the Cashfree_Payment_System SHALL apply different rates based on cancellation timing relative to departure
4. WHEN a booking has Free Cancellation and is within the allowed window THEN the Cashfree_Payment_System SHALL show full ticket refund (minus platform fee and Free Cancellation fee)
5. WHEN any discounts or coupons were applied THEN the Cashfree_Payment_System SHALL deduct those amounts from the refund value

### Requirement 5

**User Story:** As a platform operator, I want payments to be held until passenger pickup verification, so that drivers are protected from no-shows.

#### Acceptance Criteria

1. WHEN a passenger completes payment THEN the Cashfree_Payment_System SHALL authorize and hold the payment amount without capturing
2. WHEN a passenger enters the OTP at pickup THEN the Cashfree_Payment_System SHALL verify the OTP and mark the passenger as picked up
3. WHEN all passengers for a trip have been picked up and verified THEN the Cashfree_Payment_System SHALL capture all held payments
4. WHEN the ride is started (all passengers picked up) THEN the Cashfree_Payment_System SHALL credit the driver's earnings to their wallet or bank account
5. WHEN a passenger does not show up THEN the Cashfree_Payment_System SHALL release the held payment based on cancellation policy

### Requirement 6

**User Story:** As a driver, I want to receive my earnings in my wallet or bank account after the ride starts, so that I am paid promptly for my service.

#### Acceptance Criteria

1. WHEN a driver completes registration THEN the Cashfree_Payment_System SHALL register the driver as a beneficiary with their bank account details
2. WHEN a driver has not added bank account details THEN the Cashfree_Payment_System SHALL credit earnings to the driver's in-app wallet
3. WHEN a driver has bank account details THEN the Cashfree_Payment_System SHALL transfer earnings directly to their bank account via IMPS
4. WHEN the ride starts (all passengers picked up and verified) THEN the Cashfree_Payment_System SHALL initiate payout of driver earnings (total fare minus platform fees)
5. WHEN a payout fails THEN the Cashfree_Payment_System SHALL queue the payout for retry and notify the admin

### Requirement 7

**User Story:** As a platform operator, I want all payment communications to be secure and verified, so that the system is protected against fraud and tampering.

#### Acceptance Criteria

1. WHEN the backend communicates with Cashfree API THEN the Cashfree_Payment_System SHALL use HTTPS with API key authentication
2. WHEN Cashfree sends a webhook notification THEN the Cashfree_Payment_System SHALL verify the webhook signature before processing
3. WHEN storing payment credentials THEN the Cashfree_Payment_System SHALL encrypt API keys and secrets using environment variables
4. WHEN processing payment data THEN the Cashfree_Payment_System SHALL never log or store full card numbers or CVV
5. WHEN a payment request is made THEN the Cashfree_Payment_System SHALL include an idempotency key to prevent duplicate charges

### Requirement 8

**User Story:** As an admin, I want to process refunds for cancelled or disputed rides, so that passengers receive their money back promptly.

#### Acceptance Criteria

1. WHEN an admin initiates a refund THEN the Cashfree_Payment_System SHALL process the refund through Cashfree Refunds API
2. WHEN a refund is processed THEN the Cashfree_Payment_System SHALL support both full and partial refund amounts
3. WHEN a refund is initiated THEN the Cashfree_Payment_System SHALL validate that the refund amount does not exceed the original payment minus non-refundable fees
4. WHEN a refund is completed THEN the Cashfree_Payment_System SHALL update the booking payment status and create a refund transaction record
5. WHEN a refund fails THEN the Cashfree_Payment_System SHALL log the failure reason and allow admin to retry

### Requirement 9

**User Story:** As a super admin, I want to view all transaction details in the dashboard with ride information, so that I can monitor platform finances and investigate issues.

#### Acceptance Criteria

1. WHEN a super admin accesses the transactions page THEN the Cashfree_Payment_System SHALL display all transactions with type, amount, status, and timestamp
2. WHEN viewing transactions THEN the Cashfree_Payment_System SHALL show the associated ride details including trip ID, driver name, passenger name, route, and pickup/drop locations
3. WHEN filtering transactions THEN the Cashfree_Payment_System SHALL support filtering by date range, transaction type, status, payment method, and driver/passenger
4. WHEN viewing a transaction THEN the Cashfree_Payment_System SHALL display the Cashfree reference ID, payment method used, and complete fare breakdown
5. WHEN exporting transactions THEN the Cashfree_Payment_System SHALL generate CSV and PDF reports with all transaction and ride details

### Requirement 10

**User Story:** As a platform operator, I want the payment system to handle failures gracefully, so that rides can proceed even when payment confirmation is delayed.

#### Acceptance Criteria

1. WHEN Cashfree API is unavailable THEN the Cashfree_Payment_System SHALL use circuit breaker pattern to prevent cascading failures
2. WHEN payment confirmation times out THEN the Cashfree_Payment_System SHALL queue the confirmation for later verification
3. WHEN a webhook is received THEN the Cashfree_Payment_System SHALL process it idempotently to handle duplicate deliveries
4. WHEN payment status is uncertain THEN the Cashfree_Payment_System SHALL poll Cashfree API to reconcile the payment status
5. WHEN the system recovers from failure THEN the Cashfree_Payment_System SHALL process all queued payments and update transaction statuses

### Requirement 11

**User Story:** As a passenger, I want to view my payment history and receipts, so that I can track my ride expenses.

#### Acceptance Criteria

1. WHEN a passenger views their bookings THEN the Cashfree_Payment_System SHALL display payment status, amount, and cancellation charges for each booking
2. WHEN a payment is completed THEN the Cashfree_Payment_System SHALL generate a digital receipt with complete fare breakdown including platform fee and Free Cancellation fee
3. WHEN a passenger requests a receipt THEN the Cashfree_Payment_System SHALL provide a downloadable PDF receipt
4. WHEN viewing payment history on mobile THEN the Cashfree_Payment_System SHALL store receipts locally for offline access
5. WHEN a refund is processed THEN the Cashfree_Payment_System SHALL update the receipt to show the refund details and deductions

### Requirement 12

**User Story:** As a developer, I want the Cashfree integration to be testable, so that I can verify payment flows without real transactions.

#### Acceptance Criteria

1. WHEN running in test mode THEN the Cashfree_Payment_System SHALL use Cashfree sandbox environment with test credentials
2. WHEN testing payments THEN the Cashfree_Payment_System SHALL support Cashfree test card numbers and UPI IDs
3. WHEN switching environments THEN the Cashfree_Payment_System SHALL use environment variables to toggle between sandbox and production
4. WHEN testing webhooks THEN the Cashfree_Payment_System SHALL validate webhook signatures using the appropriate environment secret
5. WHEN serializing payment data for storage THEN the Cashfree_Payment_System SHALL produce valid JSON that can be deserialized back to the original structure

