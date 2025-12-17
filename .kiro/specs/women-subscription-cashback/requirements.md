# Requirements Document

## Introduction

This specification covers three critical features for the HushRyd platform launch: Women-Only Booking (safety feature restricting bookings to female passengers only), Subscription Plans (tiered membership with Normal ₹0, Silver ₹299/month, Gold ₹499/month), and Cashback Wallet System (rewards credited to wallet and claimable on next ride payment). These features integrate with the existing Cashfree payment gateway for subscription payments and wallet transactions. The implementation spans both website (Next.js frontend) and mobile app (React Native/Expo).

## Glossary

- **HushRyd Platform**: The web-based and mobile ride-sharing application connecting passengers and drivers
- **Women-Only Booking**: Safety feature that restricts ride bookings exclusively to female passengers
- **Subscription Plan**: Monthly membership tier providing benefits like priority allocation, free cancellations, and cashback
- **Normal Plan**: Free tier (₹0/month) with standard features
- **Silver Plan**: Mid-tier subscription (₹299/month) with enhanced benefits
- **Gold Plan**: Premium subscription (₹499/month) with maximum benefits
- **Cashback**: Reward amount credited to user's wallet after completing a ride
- **Wallet Balance**: Virtual currency stored in user account, claimable during payment
- **Cashback Validity**: Number of days within which cashback must be claimed before expiry
- **Priority Allocation**: Preferential seat allocation for subscribed users during high-demand periods
- **Free Cancellation**: Ability to cancel bookings without penalty charges

## Requirements

### Requirement 1: Women-Only Booking Restriction

**User Story:** As a platform operator, I want to restrict bookings to women only, so that the platform provides a safe travel environment exclusively for female passengers.

#### Acceptance Criteria

1. WHEN a user attempts to book a ride THEN the HushRyd Platform SHALL verify that the user's gender is set to "female" before allowing the booking
2. WHEN a male or unspecified gender user attempts to book THEN the HushRyd Platform SHALL display a message "HushRyd is currently available for women travelers only" and prevent the booking
3. WHEN a new user registers THEN the HushRyd Platform SHALL require gender selection during profile setup
4. WHEN a user's gender is not set THEN the HushRyd Platform SHALL redirect to profile completion before allowing booking
5. WHEN displaying the booking interface THEN the HushRyd Platform SHALL show "Women-Only Safe Travel" badge prominently

### Requirement 2: Subscription Plan Display

**User Story:** As a user, I want to view available subscription plans, so that I can choose a plan that fits my travel needs and budget.

#### Acceptance Criteria

1. WHEN a user visits the subscription page THEN the HushRyd Platform SHALL display three plans: Normal (₹0/month), Silver (₹299/month), and Gold (₹499/month)
2. WHEN displaying the Normal plan THEN the HushRyd Platform SHALL show: Standard Allocation, 24/7 Support, Access to Core Features
3. WHEN displaying the Silver plan THEN the HushRyd Platform SHALL show: Priority Allocation, Free Cancellation (2x/month), ₹50 cashback per booking, 10 days cashback validity, 24/7 Premium Support, Extended Benefits
4. WHEN displaying the Gold plan THEN the HushRyd Platform SHALL show: Priority Allocation, Free Cancellation (5x/month), ₹75 cashback per booking, 15 days cashback validity, 24/7 Premium Support, Exclusive Member Perks
5. WHEN a user views plans THEN the HushRyd Platform SHALL highlight the user's current active plan

### Requirement 3: Subscription Purchase Flow

**User Story:** As a user, I want to purchase a subscription plan, so that I can access premium benefits and cashback rewards.

#### Acceptance Criteria

1. WHEN a user clicks "Choose Plan" on Silver or Gold THEN the HushRyd Platform SHALL initiate payment flow for the selected plan amount
2. WHEN payment is successful THEN the HushRyd Platform SHALL activate the subscription immediately and set expiry to 30 days from activation
3. WHEN subscription is activated THEN the HushRyd Platform SHALL send confirmation via SMS and email with plan details and benefits
4. WHEN a user has an active subscription THEN the HushRyd Platform SHALL display subscription status, expiry date, and remaining benefits in profile
5. WHEN subscription expires THEN the HushRyd Platform SHALL downgrade user to Normal plan and notify via SMS and email

### Requirement 4: Cashback Credit System

**User Story:** As a subscribed user, I want to receive cashback after completing rides, so that I can save money on future bookings.

#### Acceptance Criteria

1. WHEN a Silver subscriber completes a ride THEN the HushRyd Platform SHALL credit ₹50 cashback to the user's wallet within 24 hours
2. WHEN a Gold subscriber completes a ride THEN the HushRyd Platform SHALL credit ₹75 cashback to the user's wallet within 24 hours
3. WHEN cashback is credited THEN the HushRyd Platform SHALL set expiry based on plan (Silver: 10 days, Gold: 15 days)
4. WHEN cashback is credited THEN the HushRyd Platform SHALL send notification with amount, expiry date, and wallet balance
5. WHEN cashback expires THEN the HushRyd Platform SHALL remove the expired amount from wallet and notify the user

### Requirement 5: Wallet Balance Management

**User Story:** As a user, I want to view and manage my wallet balance, so that I can track my cashback rewards and use them for payments.

#### Acceptance Criteria

1. WHEN a user accesses wallet section THEN the HushRyd Platform SHALL display total available balance, pending cashback, and transaction history
2. WHEN displaying wallet balance THEN the HushRyd Platform SHALL show breakdown of cashback amounts with their expiry dates
3. WHEN a user has expiring cashback within 3 days THEN the HushRyd Platform SHALL display warning notification
4. WHEN wallet transaction occurs THEN the HushRyd Platform SHALL record transaction type, amount, timestamp, and related booking ID

### Requirement 6: Cashback Redemption During Payment

**User Story:** As a user with wallet balance, I want to apply cashback during ride payment, so that I can reduce my out-of-pocket expense.

#### Acceptance Criteria

1. WHEN a user proceeds to payment THEN the HushRyd Platform SHALL display available wallet balance with option to apply
2. WHEN user applies wallet balance THEN the HushRyd Platform SHALL deduct applicable amount from total fare (oldest cashback first - FIFO)
3. WHEN wallet balance is less than fare THEN the HushRyd Platform SHALL apply full wallet balance and charge remaining via payment gateway
4. WHEN wallet balance exceeds fare THEN the HushRyd Platform SHALL apply only the fare amount and retain remaining balance
5. WHEN payment with wallet is successful THEN the HushRyd Platform SHALL update wallet balance and record redemption transaction

### Requirement 7: Free Cancellation Benefit

**User Story:** As a subscribed user, I want to use my free cancellation benefit, so that I can cancel bookings without penalty when needed.

#### Acceptance Criteria

1. WHEN a Silver subscriber cancels a booking THEN the HushRyd Platform SHALL check if free cancellations remain (max 2/month) before applying charges
2. WHEN a Gold subscriber cancels a booking THEN the HushRyd Platform SHALL check if free cancellations remain (max 5/month) before applying charges
3. WHEN free cancellation is used THEN the HushRyd Platform SHALL decrement remaining count and process full refund
4. WHEN free cancellations are exhausted THEN the HushRyd Platform SHALL apply standard cancellation charges
5. WHEN subscription month resets THEN the HushRyd Platform SHALL restore free cancellation count to plan limit

### Requirement 8: Priority Allocation for Subscribers

**User Story:** As a subscribed user, I want priority seat allocation, so that I get preference during high-demand periods.

#### Acceptance Criteria

1. WHEN multiple users request same seats THEN the HushRyd Platform SHALL prioritize Gold subscribers over Silver over Normal users
2. WHEN displaying available rides THEN the HushRyd Platform SHALL show "Priority Access" badge for subscribed users
3. WHEN seats are limited THEN the HushRyd Platform SHALL hold seats for 5 minutes longer for subscribed users during checkout

### Requirement 9: Admin Subscription Management

**User Story:** As an admin, I want to manage user subscriptions, so that I can handle support requests and monitor subscription metrics.

#### Acceptance Criteria

1. WHEN admin accesses subscription dashboard THEN the HushRyd Platform SHALL display total subscribers by plan, revenue, and churn metrics
2. WHEN admin views a user THEN the HushRyd Platform SHALL display subscription history, wallet transactions, and benefit usage
3. WHEN admin needs to adjust subscription THEN the HushRyd Platform SHALL provide options to extend, cancel, or upgrade user subscription
4. WHEN admin exports subscription data THEN the HushRyd Platform SHALL generate reports with subscriber details and revenue breakdown

### Requirement 10: Subscription Data Persistence

**User Story:** As a system, I want to reliably store subscription and wallet data, so that user benefits are accurately tracked.

#### Acceptance Criteria

1. WHEN subscription is created or updated THEN the HushRyd Platform SHALL persist plan type, activation date, expiry date, and payment reference
2. WHEN wallet transaction occurs THEN the HushRyd Platform SHALL record with atomic operations to prevent balance inconsistencies
3. WHEN querying subscription status THEN the HushRyd Platform SHALL return accurate real-time status including remaining benefits
4. WHEN system restarts THEN the HushRyd Platform SHALL maintain all subscription and wallet state without data loss

### Requirement 11: Cashfree Payment Integration for Subscriptions

**User Story:** As a user, I want to pay for subscriptions using the existing payment gateway, so that I can securely purchase plans.

#### Acceptance Criteria

1. WHEN user initiates subscription purchase THEN the HushRyd Platform SHALL create a Cashfree order with subscription amount and plan details
2. WHEN Cashfree payment is successful THEN the HushRyd Platform SHALL activate subscription via webhook confirmation
3. WHEN payment fails THEN the HushRyd Platform SHALL display error message and allow retry without duplicate charges
4. WHEN subscription payment is recorded THEN the HushRyd Platform SHALL create a Transaction record with type "subscription"

### Requirement 12: Mobile App Subscription and Wallet

**User Story:** As a mobile app user, I want to access subscription plans and wallet features, so that I can manage my membership on the go.

#### Acceptance Criteria

1. WHEN user opens subscription section in mobile app THEN the HushRyd Platform SHALL display same three plans as website with identical pricing
2. WHEN user views wallet in mobile app THEN the HushRyd Platform SHALL display balance, cashback history, and expiry warnings
3. WHEN user applies wallet during mobile payment THEN the HushRyd Platform SHALL deduct from wallet and charge remaining via Cashfree
4. WHEN subscription status changes THEN the HushRyd Platform SHALL sync across website and mobile app in real-time

### Requirement 13: Phone Number Collection for Booking

**User Story:** As a platform operator, I want to collect phone numbers during booking, so that I can contact passengers and process payments.

#### Acceptance Criteria

1. WHEN user proceeds to book THEN the HushRyd Platform SHALL verify phone number is registered and verified
2. WHEN phone number is not verified THEN the HushRyd Platform SHALL require OTP verification before allowing booking
3. WHEN booking is confirmed THEN the HushRyd Platform SHALL associate phone number with booking for communication

