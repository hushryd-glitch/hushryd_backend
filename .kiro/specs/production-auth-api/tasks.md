# Implementation Plan

- [x] 1. Create Session and AuthAuditLog models





  - [x] 1.1 Create Session model with TTL index


    - Create `backend/src/models/Session.js` with sessionId, userId, deviceInfo, ipAddress, refreshTokenHash, expiresAt fields
    - Add TTL index for automatic session cleanup
    - Add indexes for userId and sessionId lookups
    - _Requirements: 4.1, 4.2_
  - [ ]* 1.2 Write property test for Session model
    - **Property 7: Session Listing Completeness**
    - **Validates: Requirements 4.1, 4.4**
  - [x] 1.3 Create AuthAuditLog model


    - Create `backend/src/models/AuthAuditLog.js` with eventType, userId, identifier, ipAddress, userAgent, metadata fields
    - Add TTL index for 90-day retention
    - Add indexes for userId and timestamp queries
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 1.4 Write property test for AuthAuditLog model
    - **Property 11: Audit Log Completeness**
    - **Validates: Requirements 6.1, 6.2**

- [x] 2. Enhance Token Service with dual-token support






  - [x] 2.1 Add refresh token generation to tokenService

    - Update `backend/src/services/tokenService.js` to generate access (15 min) and refresh (7 days) tokens
    - Add `generateTokenPair()` function returning both tokens with expiry info
    - Add `verifyRefreshToken()` function for refresh token validation
    - _Requirements: 1.1, 1.3_
  - [ ]* 2.2 Write property test for token expiry
    - **Property 1: Token Expiry Correctness**
    - **Validates: Requirements 1.1**
  - [ ]* 2.3 Write property test for expired token rejection
    - **Property 2: Expired Token Rejection**
    - **Validates: Requirements 1.2**

  - [x] 2.4 Add token blacklisting functions

    - Add `blacklistToken()` to store token hash in Redis with TTL
    - Add `isTokenBlacklisted()` to check if token is blacklisted
    - Use SHA256 hash of token for storage efficiency
    - _Requirements: 2.1, 2.3_
  - [ ]* 2.5 Write property test for blacklist enforcement
    - **Property 4: Blacklist Enforcement**
    - **Validates: Requirements 2.1, 2.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create Session Service






  - [x] 4.1 Implement session service

    - Create `backend/src/services/sessionService.js`
    - Implement `createSession()` with device info extraction from user-agent
    - Implement `getActiveSessions()` with IP masking
    - Implement `revokeSession()` and `revokeAllSessions()`
    - Implement `updateSessionActivity()` for last activity tracking
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 4.2 Write property test for session revocation
    - **Property 8: Session Revocation Prevents Refresh**
    - **Validates: Requirements 4.2, 4.3**

- [x] 5. Create Auth Audit Logger






  - [x] 5.1 Implement auth audit logger service

    - Create `backend/src/services/authAuditService.js`
    - Implement `logAuthEvent()` for all auth event types
    - Implement `getAuthEvents()` for querying user's auth history
    - Add helper functions for common event types (logLoginSuccess, logLoginFailure, etc.)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 6. Create Auth Rate Limiter






  - [x] 6.1 Implement auth-specific rate limiters

    - Create `backend/src/middleware/authRateLimiter.js`
    - Implement OTP request limiter (5 per 15 min per phone)
    - Implement OTP verify limiter (10 per 15 min per phone)
    - Implement staff login limiter (5 per 15 min per IP)
    - Ensure Retry-After header is included in 429 responses
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 6.2 Write property test for Retry-After header
    - **Property 6: Rate Limit Retry-After Header**
    - **Validates: Requirements 3.4**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update Auth Routes






  - [x] 8.1 Update verify-otp endpoint for dual tokens

    - Modify `/api/auth/verify-otp` to return accessToken and refreshToken
    - Create session on successful verification
    - Log successful authentication event
    - _Requirements: 1.1, 4.1, 6.1_
  - [ ]* 8.2 Write property test for success response format
    - **Property 10: Success Response Token Format**
    - **Validates: Requirements 5.3**

  - [x] 8.3 Add refresh token endpoint





    - Create `/api/auth/refresh-token` endpoint
    - Validate refresh token and session
    - Issue new access token
    - Update session last activity
    - Log token refresh event
    - _Requirements: 1.3, 4.1, 6.1_
  - [ ]* 8.4 Write property test for refresh token round-trip
    - **Property 3: Refresh Token Round-Trip**

    - **Validates: Requirements 1.3**
  - [x] 8.5 Add logout endpoint





    - Create `/api/auth/logout` endpoint
    - Blacklist current access token
    - Support allDevices flag to revoke all sessions
    - Log logout event
    - _Requirements: 2.1, 2.2, 6.3_
  - [x]* 8.6 Write property test for logout all devices

    - **Property 5: Logout All Devices Invalidation**
    - **Validates: Requirements 2.2**
  - [x] 8.7 Add sessions management endpoints





    - Create `/api/auth/sessions` GET endpoint to list active sessions
    - Create `/api/auth/sessions/:sessionId` DELETE endpoint to revoke specific session
    - Mask IP addresses in response
    - _Requirements: 4.1, 4.2, 4.4_

- [x] 9. Update Auth Middleware






  - [x] 9.1 Update authenticate middleware for blacklist check

    - Modify `backend/src/middleware/auth.js` to check token blacklist
    - Return appropriate error for blacklisted tokens
    - _Requirements: 2.3_
  - [ ]* 9.2 Write property test for error response consistency
    - **Property 9: Error Response Consistency**
    - **Validates: Requirements 5.1**

- [x] 10. Apply Rate Limiters to Auth Routes






  - [x] 10.1 Apply auth rate limiters to routes

    - Apply OTP request limiter to `/api/auth/request-otp`
    - Apply OTP verify limiter to `/api/auth/verify-otp`
    - Apply staff login limiter to `/api/auth/staff-login`
    - Integrate audit logging for rate limit events
    - _Requirements: 3.1, 3.2, 3.3, 6.4_

- [ ] 11. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
