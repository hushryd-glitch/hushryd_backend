# Implementation Plan

- [x] 1. Set up Cashfree SDK and configuration






  - [x] 1.1 Install Cashfree SDK packages for backend

    - Install `cashfree-pg` npm package for Node.js
    - Add environment variables for Cashfree credentials (APP_ID, SECRET_KEY, API_VERSION)
    - Create configuration file for sandbox/production toggle
    - _Requirements: 12.1, 12.3_

  - [x] 1.2 Create Cashfree service with API client initialization

    - Implement `cashfreeService.js` with authenticated API client
    - Add environment-based endpoint selection (sandbox vs production)
    - Implement request interceptor for idempotency keys
    - _Requirements: 7.1, 7.5, 12.1_
  - [ ]* 1.3 Write property test for idempotency key inclusion
    - **Property 15: Idempotency Key Inclusion**
    - **Validates: Requirements 7.5**

- [-] 2. Implement payment calculation and breakdown logic




  - [x] 2.1 Create payment calculation functions


    - Implement `calculatePaymentBreakdown(fare, options)` with ₹10 platform fee
    - Implement `calculateFreeCancellationFee(fare)` starting at ₹10
    - Implement `calculateTotalAmount(breakdown)` summing all components
    - _Requirements: 2.1, 2.2, 3.2_
  - [ ]* 2.2 Write property test for platform fee calculation
    - **Property 1: Platform Fee Calculation Consistency**
    - **Validates: Requirements 2.1, 2.4**
  - [ ]* 2.3 Write property test for payment breakdown completeness
    - **Property 2: Payment Breakdown Completeness**
    - **Validates: Requirements 2.2, 3.3**
  - [ ]* 2.4 Write property test for Free Cancellation total calculation
    - **Property 4: Free Cancellation Total Calculation**
    - **Validates: Requirements 3.2**

- [-] 3. Implement cancellation charges calculation




  - [x] 3.1 Create cancellation policy logic


    - Implement time-based cancellation charge tiers (>24h, 12-24h, 2-12h, <2h)
    - Implement `calculateCancellationCharges(booking, cancellationTime)`
    - Implement `calculateRefundAmount(booking, cancellationTime)` with discount deduction
    - _Requirements: 4.1, 4.3, 4.5_
  - [ ]* 3.2 Write property test for cancellation charges time-based calculation
    - **Property 7: Cancellation Charges Time-Based Calculation**
    - **Validates: Requirements 4.1, 4.3**
  - [ ]* 3.3 Write property test for platform fee non-refundability
    - **Property 3: Platform Fee Non-Refundability**
    - **Validates: Requirements 2.5**
  - [ ]* 3.4 Write property test for Free Cancellation window refund
    - **Property 5: Free Cancellation Window Refund**
    - **Validates: Requirements 3.4**
  - [ ]* 3.5 Write property test for standard cancellation outside window
    - **Property 6: Standard Cancellation Outside Window**
    - **Validates: Requirements 3.5**
  - [ ]* 3.6 Write property test for discount deduction from refund
    - **Property 8: Discount Deduction from Refund**
    - **Validates: Requirements 4.5**

- [ ] 4. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create Transaction model and database schema






  - [x] 5.1 Implement Transaction mongoose model

    - Create schema with all fields (transactionId, orderId, bookingId, tripId, type, status, amount, breakdown, paymentMethod, cashfreeData, rideDetails)
    - Add indexes for efficient querying (orderId, bookingId, tripId, status, createdAt)
    - Export model and add to models index
    - _Requirements: 9.1, 9.2_
  - [ ]* 5.2 Write property test for transaction data completeness
    - **Property 18: Transaction Data Completeness**
    - **Validates: Requirements 9.1, 9.2, 9.4**

- [x] 6. Implement Cashfree order creation and payment initiation





  - [x] 6.1 Implement order creation with authorization mode


    - Create `createOrder(orderData)` method in cashfreeService
    - Implement payment session creation for hold/authorization
    - Return order ID and payment session token
    - _Requirements: 1.1, 5.1_

  - [x] 6.2 Implement payment initiation endpoint

    - Create POST `/api/payments/initiate` route
    - Calculate payment breakdown with platform fee and optional Free Cancellation
    - Create Cashfree order and return payment session
    - _Requirements: 1.1, 1.5, 2.1, 3.2_
  - [ ]* 6.3 Write property test for payment authorization hold
    - **Property 9: Payment Authorization Hold**
    - **Validates: Requirements 5.1**

- [x] 7. Implement webhook handler for payment events





  - [x] 7.1 Create webhook signature verification


    - Implement `verifyWebhookSignature(payload, signature, secret)` function
    - Use Cashfree's signature verification algorithm
    - Return boolean for valid/invalid signature
    - _Requirements: 7.2_

  - [x] 7.2 Implement webhook endpoint and event handlers

    - Create POST `/api/webhooks/cashfree` route
    - Handle PAYMENT_SUCCESS_WEBHOOK - update booking status, create transaction
    - Handle PAYMENT_FAILED_WEBHOOK - update booking status, notify user
    - Implement idempotent processing using transaction ID
    - _Requirements: 1.5, 1.6, 10.3_
  - [ ]* 7.3 Write property test for webhook signature verification
    - **Property 14: Webhook Signature Verification**
    - **Validates: Requirements 7.2**
  - [ ]* 7.4 Write property test for webhook idempotency
    - **Property 21: Webhook Idempotency**
    - **Validates: Requirements 10.3**

- [ ] 8. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement OTP verification and payment capture flow



  - [x] 9.1 Implement OTP verification with pickup status update


    - Create `verifyPassengerOTP(bookingId, otp)` function
    - Update passenger pickup status to 'picked_up' with timestamp
    - Check if all passengers for trip are verified
    - _Requirements: 5.2_


  - [x] 9.2 Implement payment capture when all passengers verified

    - Create `capturePayments(tripId)` function
    - Capture all held payments for the trip via Cashfree API
    - Update transaction statuses to 'captured'
    - _Requirements: 5.3_
  - [ ]* 9.3 Write property test for OTP verification state transition
    - **Property 10: OTP Verification State Transition**
    - **Validates: Requirements 5.2**
  - [ ]* 9.4 Write property test for all passengers verified triggers capture
    - **Property 11: All Passengers Verified Triggers Capture**
    - **Validates: Requirements 5.3**

- [x] 10. Implement driver payout system





  - [x] 10.1 Implement beneficiary registration

    - Create `addBeneficiary(driverData)` function in cashfreeService
    - Register driver with bank account details on Cashfree
    - Store beneficiary ID in driver record
    - _Requirements: 6.1_

  - [x] 10.2 Implement driver earnings payout

    - Create `creditDriverEarnings(tripId, driverId)` function
    - Check if driver has bank account - use IMPS transfer or credit to wallet
    - Create payout transaction record
    - _Requirements: 5.4, 6.2, 6.3, 6.4_

  - [x] 10.3 Implement payout failure handling with queue

    - Create payout retry queue using existing queue service
    - Queue failed payouts for retry with exponential backoff
    - Send admin notification on payout failure
    - _Requirements: 6.5_
  - [ ]* 10.4 Write property test for driver earnings destination
    - **Property 12: Driver Earnings Destination**
    - **Validates: Requirements 6.2, 6.3**
  - [ ]* 10.5 Write property test for failed payout queue and notification
    - **Property 13: Failed Payout Queue and Notification**
    - **Validates: Requirements 6.5**

- [ ] 11. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement refund processing






  - [x] 12.1 Implement refund creation via Cashfree API

    - Create `createRefund(refundData)` function in cashfreeService
    - Support full and partial refund amounts
    - Validate refund amount against original payment minus non-refundable fees
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 12.2 Implement refund endpoint for admin

    - Create POST `/api/admin/refunds` route
    - Calculate refund amount based on cancellation policy
    - Process refund and update booking/transaction records
    - _Requirements: 8.4, 8.5_
  - [ ]* 12.3 Write property test for refund amount validation
    - **Property 16: Refund Amount Validation**
    - **Validates: Requirements 8.3**
  - [ ]* 12.4 Write property test for refund transaction record creation
    - **Property 17: Refund Transaction Record Creation**
    - **Validates: Requirements 8.4**

- [ ] 13. Implement circuit breaker for Cashfree API calls





  - [x] 13.1 Integrate circuit breaker with Cashfree service


    - Use existing circuitBreakerService for Cashfree API calls
    - Configure failure threshold and reset timeout
    - Implement fallback behavior for open circuit
    - _Requirements: 10.1_

  - [x] 13.2 Implement payment confirmation queue for timeouts

    - Queue payment confirmations when API times out
    - Implement reconciliation job to poll Cashfree for status
    - Process queued confirmations on system recovery
    - _Requirements: 10.2, 10.4, 10.5_
  - [ ]* 13.3 Write property test for circuit breaker activation
    - **Property 20: Circuit Breaker Activation**
    - **Validates: Requirements 10.1**

- [ ] 14. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement super admin transaction dashboard

  - [x] 15.1 Create transaction listing API with filters


    - Create GET `/api/super-admin/transactions` route
    - Support filtering by date range, type, status, payment method, driver, passenger
    - Include pagination and sorting
    - Return transactions with ride details
    - _Requirements: 9.1, 9.2, 9.3_


  - [x] 15.2 Create transaction detail API
    - Create GET `/api/super-admin/transactions/:id` route
    - Return complete transaction with Cashfree reference, payment method, fare breakdown
    - Include associated ride details (origin, destination, driver, passenger)
    - _Requirements: 9.4_
  - [x] 15.3 Implement transaction export (CSV/PDF)

    - Create GET `/api/super-admin/transactions/export` route
    - Generate CSV with all transaction and ride details
    - Generate PDF report with summary and details
    - _Requirements: 9.5_
  - [ ]* 15.4 Write property test for transaction filter accuracy
    - **Property 19: Transaction Filter Accuracy**
    - **Validates: Requirements 9.3**

- [x] 16. Implement frontend payment components (Web)





  - [x] 16.1 Create Cashfree checkout component for web


    - Install Cashfree JavaScript SDK
    - Create `CashfreeCheckout.jsx` component with SDK integration
    - Handle payment success/failure callbacks
    - _Requirements: 1.3_
  - [x] 16.2 Create payment breakdown and Free Cancellation components


    - Create `PaymentBreakdown.jsx` showing fare, platform fee, Free Cancellation fee
    - Create `FreeCancellationOption.jsx` toggle component
    - Create `CancellationChargesModal.jsx` for cancellation flow
    - _Requirements: 2.2, 3.1, 3.3, 4.2_

  - [x] 16.3 Update booking flow to integrate payment

    - Integrate payment initiation in booking confirmation
    - Show payment breakdown before checkout
    - Handle payment success/failure states
    - _Requirements: 1.1, 1.5, 1.6_

- [x] 17. Implement frontend payment components (Mobile)






  - [x] 17.1 Create payment WebView for mobile checkout

    - Create `PaymentWebView.jsx` for Expo-compatible checkout
    - Handle deep linking for payment callbacks
    - Implement loading and error states
    - _Requirements: 1.4_

  - [x] 17.2 Create mobile fare breakdown components

    - Create `FareBreakdown.jsx` component
    - Create `FreeCancellationToggle.jsx` component
    - Update booking flow to show breakdown
    - _Requirements: 2.2, 3.1, 3.3_

  - [x] 17.3 Implement receipt storage and display

    - Create `ReceiptView.jsx` component
    - Store receipts locally using AsyncStorage
    - Display receipt with fare breakdown and refund details
    - _Requirements: 11.1, 11.2, 11.4, 11.5_
  - [ ]* 17.4 Write property test for receipt data completeness
    - **Property 22: Receipt Data Completeness**
    - **Validates: Requirements 11.1, 11.2**
  - [ ]* 17.5 Write property test for receipt refund update
    - **Property 23: Receipt Refund Update**
    - **Validates: Requirements 11.5**

- [x] 18. Implement super admin transaction UI





  - [x] 18.1 Create transaction list page with filters


    - Create `/admin/super/transactions` page
    - Implement filter controls (date, type, status, payment method)
    - Display transaction table with ride details
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 18.2 Create transaction detail modal/page






    - Show complete transaction details with Cashfree reference
    - Display fare breakdown and payment method
    - Show associated ride information

    - _Requirements: 9.4_
  - [x] 18.3 Implement export functionality






    - Add CSV export button with date range selection
    - Add PDF report generation
    - _Requirements: 9.5_

- [x] 19. Implement payment data serialization






  - [x] 19.1 Create serialization utilities for payment data

    - Implement `serializePaymentData(data)` function
    - Implement `deserializePaymentData(json)` function
    - Handle all payment data types (breakdown, transaction, receipt)
    - _Requirements: 12.5_
  - [ ]* 19.2 Write property test for payment data serialization round-trip
    - **Property 24: Payment Data Serialization Round-Trip**
    - **Validates: Requirements 12.5**

- [ ] 20. Final Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

