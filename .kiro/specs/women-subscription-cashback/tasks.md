# Implementation Plan

- [x] 1. Create backend data models and configuration







  - [x] 1.1 Create Subscription model with plan, status, expiry, and benefits tracking

    - Define schema with userId, planId, status, activatedAt, expiresAt, paymentId
    - Add freeCancellationsUsed and benefitsResetAt fields
    - Create indexes for userId and expiresAt
    - _Requirements: 10.1, 3.2_
  - [x] 1.2 Create Wallet model with cashback entries and FIFO support


    - Define CashbackEntrySchema with amount, bookingId, creditedAt, expiresAt, status
    - Define WalletSchema with userId, balance, cashbackEntries array
    - Add totalEarned, totalRedeemed, totalExpired tracking
    - _Requirements: 10.2, 5.4_

  - [x] 1.3 Create subscription plans configuration file

    - Define SUBSCRIPTION_PLANS object with normal, silver, gold
    - Include price, features, and benefits for each plan
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 1.4 Write property test for subscription expiry calculation
    - **Property 3: Subscription expiry calculation**
    - **Validates: Requirements 3.2**

- [x] 2. Implement gender verification for women-only booking





  - [x] 2.1 Create gender verification middleware


    - Check if user.gender is set, return PROFILE_INCOMPLETE if not
    - Check if user.gender === 'female', return WOMEN_ONLY error if not
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 2.2 Update booking routes to use gender verification middleware

    - Add middleware to POST /api/bookings
    - Add middleware to booking-related endpoints
    - _Requirements: 1.1_

  - [x] 2.3 Update User model to require gender for booking eligibility

    - Add isEligibleForBooking() method
    - _Requirements: 1.1, 1.4_
  - [ ]* 2.4 Write property test for women-only booking enforcement
    - **Property 1: Women-only booking enforcement**
    - **Validates: Requirements 1.1, 1.2**
  - [ ]* 2.5 Write property test for gender redirect
    - **Property 2: Gender redirect for incomplete profiles**
    - **Validates: Requirements 1.4**



- [ ] 3. Checkpoint - Ensure all tests pass


  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement subscription service




  - [x] 4.1 Create subscriptionService.js with core functions
    - Implement getPlans() to return all plans
    - Implement getUserSubscription(userId) to get current subscription
    - Implement getRemainingBenefits(userId) for benefit tracking
    - _Requirements: 2.1, 3.4_

  - [x] 4.2 Implement subscription purchase flow with Cashfree
    - Create createSubscriptionOrder(userId, planId) using cashfreeService
    - Generate unique order ID for subscription
    - _Requirements: 3.1, 11.1_

  - [x] 4.3 Implement subscription activation after payment
    - Create activateSubscription(userId, planId, paymentId)
    - Set expiresAt to 30 days from activation

    - Initialize freeCancellationsUsed to 0
    - _Requirements: 3.2, 11.2_
  - [x] 4.4 Implement subscription expiry check (cron job function)

    - Create checkAndExpireSubscriptions() to find and expire old subscriptions
    - Downgrade expired users to Normal plan
    - _Requirements: 3.5_
  - [x] 4.5 Implement monthly benefits reset (cron job function)
    - Create resetMonthlyBenefits() to reset freeCancellationsUsed
    - _Requirements: 7.5_
  - [ ]* 4.6 Write property test for monthly benefits reset
    - **Property 12: Monthly benefits reset**
    - **Validates: Requirements 7.5**

- [x] 5. Implement wallet service



  - [x] 5.1 Create walletService.js with balance functions


    - Implement getWalletBalance(userId) returning total and breakdown
    - Implement getCashbackBreakdown(userId) with expiry dates
    - _Requirements: 5.1, 5.2_


  - [x] 5.2 Implement cashback credit function
    - Create creditCashback(userId, amount, bookingId, expiryDays)
    - Add new CashbackEntry with calculated expiresAt
    - Update wallet balance
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.3 Implement FIFO wallet redemption
    - Create applyWalletToPayment(userId, fareAmount)
    - Sort cashback entries by creditedAt (oldest first)
    - Consume entries until fare is covered or wallet exhausted
    - Cap redemption at fare amount
    - _Requirements: 6.2, 6.3, 6.4_
  - [x] 5.4 Implement cashback expiry function

    - Create expireCashback() to mark expired entries
    - Update wallet balance and totalExpired
    - _Requirements: 4.5_
  - [ ]* 5.5 Write property test for Silver cashback amount
    - **Property 4: Silver cashback amount**
    - **Validates: Requirements 4.1**
  - [ ]* 5.6 Write property test for Gold cashback amount
    - **Property 5: Gold cashback amount**
    - **Validates: Requirements 4.2**
  - [ ]* 5.7 Write property test for cashback expiry by plan
    - **Property 6: Cashback expiry by plan**
    - **Validates: Requirements 4.3**
  - [ ]* 5.8 Write property test for FIFO redemption
    - **Property 7: Wallet FIFO redemption**
    - **Validates: Requirements 6.2**
  - [ ]* 5.9 Write property test for wallet balance cap
    - **Property 8: Wallet balance cap at fare**
    - **Validates: Requirements 6.4**
  - [ ]* 5.10 Write property test for wallet balance consistency
    - **Property 14: Wallet balance consistency**
    - **Validates: Requirements 10.2**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement free cancellation benefits






  - [x] 7.1 Update cancellation service to check subscription benefits

    - Check user's subscription plan
    - Check freeCancellationsUsed vs plan limit
    - Apply free cancellation or standard charges
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Implement useFreeCancellation in subscription service

    - Increment freeCancellationsUsed
    - Return success/failure based on remaining count
    - _Requirements: 7.3_
  - [ ]* 7.3 Write property test for Silver free cancellation limit
    - **Property 9: Free cancellation limit - Silver**
    - **Validates: Requirements 7.1**
  - [ ]* 7.4 Write property test for Gold free cancellation limit
    - **Property 10: Free cancellation limit - Gold**
    - **Validates: Requirements 7.2**
  - [ ]* 7.5 Write property test for counter decrement
    - **Property 11: Free cancellation counter decrement**
    - **Validates: Requirements 7.3**

- [x] 8. Implement priority allocation






  - [x] 8.1 Update booking service with priority logic

    - Add subscription tier to seat allocation logic
    - Prioritize Gold > Silver > Normal
    - _Requirements: 8.1_

  - [x] 8.2 Implement extended seat hold for subscribers

    - Normal: 5 minutes, Silver/Gold: 10 minutes
    - _Requirements: 8.3_
  - [ ]* 8.3 Write property test for priority ordering
    - **Property 13: Priority ordering**
    - **Validates: Requirements 8.1**

- [x] 9. Create API routes for subscription and wallet






  - [x] 9.1 Create subscription routes

    - GET /api/subscriptions/plans - Get all plans
    - GET /api/subscriptions/current - Get user's subscription
    - POST /api/subscriptions/purchase - Initiate purchase
    - _Requirements: 2.1, 3.1, 3.4_

  - [x] 9.2 Create wallet routes

    - GET /api/wallet/balance - Get balance and breakdown
    - POST /api/wallet/apply - Apply wallet to payment
    - GET /api/wallet/transactions - Get transaction history
    - _Requirements: 5.1, 6.1_

  - [x] 9.3 Add subscription webhook handler

    - Handle Cashfree payment success webhook
    - Activate subscription on successful payment
    - _Requirements: 11.2_
  - [ ]* 9.4 Write property test for subscription payment amount
    - **Property 15: Subscription payment amount**
    - **Validates: Requirements 11.1**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement website frontend components






  - [x] 11.1 Create SubscriptionPlans component for landing page

    - Display three plan cards with pricing and features
    - Highlight current plan for logged-in users
    - Add "Choose Plan" buttons
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 11.2 Create subscription purchase page
    - Show selected plan details
    - Integrate Cashfree checkout
    - Handle success/failure redirects

    - _Requirements: 3.1, 11.1_
  - [x] 11.3 Create Wallet component for profile/dashboard

    - Display total balance
    - Show cashback breakdown with expiry dates
    - Show expiry warnings for cashback expiring within 3 days
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.4 Update payment flow to include wallet option

    - Show available wallet balance
    - Add toggle to apply wallet
    - Calculate and display adjusted payment amount
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.5 Add women-only badge and messaging

    - Add "Women-Only Safe Travel" badge to booking interface
    - Show appropriate error messages for non-female users
    - _Requirements: 1.2, 1.5_

  - [x] 11.6 Update profile setup to require gender

    - Make gender field required
    - Add redirect logic for incomplete profiles
    - _Requirements: 1.3, 1.4_

- [x] 12. Implement mobile app components




  - [x] 12.1 Create SubscriptionPlans screen for mobile

    - Display three plan cards matching website design
    - Integrate with Cashfree mobile SDK
    - _Requirements: 12.1_


  - [x] 12.2 Create Wallet screen for mobile
    - Display balance and cashback breakdown
    - Show expiry warnings
    - _Requirements: 12.2_

  - [x] 12.3 Update mobile payment flow with wallet option

    - Add wallet balance display
    - Add apply wallet toggle
    - _Requirements: 12.3_

  - [x] 12.4 Add women-only messaging to mobile booking


    - Show badge and error messages
    - _Requirements: 1.2, 1.5_

- [x] 13. Implement admin dashboard features






  - [x] 13.1 Create subscription analytics dashboard

    - Display total subscribers by plan
    - Show revenue metrics
    - Display churn rate
    - _Requirements: 9.1_

  - [x] 13.2 Add user subscription management

    - View user subscription history
    - View wallet transactions
    - Options to extend/cancel/upgrade subscriptions
    - _Requirements: 9.2, 9.3_

  - [x] 13.3 Add subscription data export

    - Export subscriber list with details
    - Export revenue breakdown
    - _Requirements: 9.4_





- [x] 14. Implement cashback credit after ride completion


  - [x] 14.1 Update booking completion flow to credit cashback

    - Check user's subscription plan
    - Credit appropriate cashback amount (₹50 Silver, ₹75 Gold)
    - Set expiry based on plan (10 days Silver, 15 days Gold)
    - _Requirements: 4.1, 4.2, 4.3_


  - [x] 14.2 Send cashback notification





    - Notify user via SMS/email with amount and expiry
    - _Requirements: 4.4_

- [x] 15. Set up cron jobs for automated tasks






  - [x] 15.1 Create subscription expiry cron job

    - Run daily to check and expire subscriptions
    - Send expiry notifications
    - _Requirements: 3.5_

  - [x] 15.2 Create cashback expiry cron job

    - Run daily to expire old cashback entries
    - Send expiry notifications
    - _Requirements: 4.5_

  - [x] 15.3 Create monthly benefits reset cron job

    - Run on subscription anniversary to reset free cancellations
    - _Requirements: 7.5_

- [x] 16. Final Checkpoint - Ensure all tests pass










  - Ensure all tests pass, ask the user if questions arise.
