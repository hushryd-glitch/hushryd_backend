# Implementation Plan

- [x] 1. Extend User Model for Staff Accounts






  - [x] 1.1 Add staff-related fields to User schema

    - Add isStaff, permissions array, createdBy, lastLogin fields
    - Add role enum values: operations, customer_support, finance, admin, super_admin
    - _Requirements: 1.1, 2.1_
  - [ ]* 1.2 Write property test for staff account creation validation
    - **Property 1: Staff Account Creation Validation**
    - **Validates: Requirements 1.1**
  - [ ]* 1.3 Write property test for email uniqueness
    - **Property 2: Email Uniqueness Enforcement**
    - **Validates: Requirements 1.3**

- [x] 2. Implement Staff Service









  - [x] 2.1 Create staffService with CRUD operations


    - Implement createStaffAccount with bcrypt hashing (10 rounds)
    - Implement updateStaffAccount, deactivateStaffAccount, getStaffAccounts
    - _Requirements: 1.1, 1.4, 5.1, 5.2_
  - [ ]* 2.2 Write property test for password hashing
    - **Property 3: Password Hashing Security**
    - **Validates: Requirements 1.4**
  - [ ]* 2.3 Write property test for deactivated account login prevention
    - **Property 9: Deactivated Account Login Prevention**
    - **Validates: Requirements 5.2, 6.3**



- [x] 3. Implement Permission System




  - [x] 3.1 Create permissionService with role-permission mapping

    - Define ROLE_PERMISSIONS constant with all role mappings
    - Implement checkPermission, getRolePermissions, validateAccess functions
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 3.2 Write property test for role-permission mapping
    - **Property 4: Role-Permission Mapping Consistency**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 4. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Permission Middleware





  - [x] 5.1 Create requirePermission and requireRole middleware


    - Extract permissions from JWT token
    - Check against required permissions for route
    - Return 403 for unauthorized access
    - _Requirements: 4.4_
  - [ ]* 5.2 Write property test for role-based access denial
    - **Property 8: Role-Based Access Denial**
    - **Validates: Requirements 4.4**

- [x] 6. Implement Staff Authentication






  - [x] 6.1 Create staff login endpoint with JWT generation

    - Validate credentials against bcrypt hash
    - Include role and permissions in JWT payload
    - Check isActive status before allowing login
    - _Requirements: 6.1, 6.2, 6.4_
  - [ ]* 6.2 Write property test for JWT role embedding
    - **Property 11: JWT Role Embedding**
    - **Validates: Requirements 6.1, 6.4**
  - [ ]* 6.3 Write property test for authentication error opacity
    - **Property 12: Authentication Error Opacity**
    - **Validates: Requirements 6.2**

- [x] 7. Implement Staff Management API Routes





  - [x] 7.1 Create /api/admin/staff routes


    - POST /staff - Create staff account (super_admin only)
    - GET /staff - List staff accounts
    - PUT /staff/:id - Update staff account
    - DELETE /staff/:id - Deactivate staff account
    - POST /staff/:id/reset-password - Reset password
    - _Requirements: 1.1, 5.1, 5.2, 5.4_

- [x] 8. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Audit Logging for Permission Changes






  - [x] 9.1 Extend AuditLog model for permission tracking

    - Add permission_update, role_update action types
    - Store previousValue and newValue
    - _Requirements: 5.3_
  - [ ]* 9.2 Write property test for permission change audit trail
    - **Property 10: Permission Change Audit Trail**
    - **Validates: Requirements 5.3**

- [x] 10. Enhance Document Verification for Operations






  - [x] 10.1 Update document verification endpoints with permission checks

    - Add requirePermission('documents:verify') middleware
    - Ensure driver status updates when all docs approved
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 10.2 Write property test for document verification status transition
    - **Property 5: Document Verification Status Transition**
    - **Validates: Requirements 3.2, 3.3**
  - [ ]* 10.3 Write property test for driver verification completeness
    - **Property 6: Driver Verification Completeness**
    - **Validates: Requirements 3.4**

- [x] 11. Implement Sensitive Data Filtering for Support Role






  - [x] 11.1 Create filtered user lookup for customer support

    - Exclude bank details, payment info from response
    - Add support ticket access endpoints
    - _Requirements: 4.2_
  - [ ]* 11.2 Write property test for sensitive data exclusion
    - **Property 7: Sensitive Data Exclusion**
    - **Validates: Requirements 4.2**

- [x] 12. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create Staff Management Frontend





  - [x] 13.1 Create Super Admin staff management page


    - Staff list with role, status, last login
    - Create staff form with role selection
    - Edit/deactivate staff actions
    - _Requirements: 1.1, 5.1, 5.2_

- [x] 14. Create Role-Based Admin Dashboards
  - [x] 14.1 Create Operations dashboard
    - Document verification queue
    - Driver/passenger lookup
    - _Requirements: 3.1_
  - [x] 14.2 Create Customer Support dashboard
    - Support ticket list
    - User lookup (filtered)
    - _Requirements: 4.1, 4.2_
  - [x] 14.3 Create Finance dashboard

    - Payment overview
    - Transaction history
    - _Requirements: 2.4_

- [x] 15. Implement Staff Login Page






  - [x] 15.1 Create /auth/admin login page

    - Email/password form
    - Role-based redirect after login
    - _Requirements: 6.1, 6.2_

- [x] 16. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
