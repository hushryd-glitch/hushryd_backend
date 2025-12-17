# Design Document: Admin Role Management

## Overview

This feature implements a Role-Based Access Control (RBAC) system for the HushRyd admin panel. Super Admins can create staff accounts with specific permissions, enabling granular control over platform access. The system supports Operations, Customer Support, and Finance roles, each with tailored feature access.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                            │
├─────────────────────────────────────────────────────────────┤
│  /admin/super          │  /admin/operations  │  /admin/support│
│  - Staff Management    │  - Documents        │  - Tickets     │
│  - All Features        │  - Users            │  - Users       │
│  - Analytics           │                     │                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
├─────────────────────────────────────────────────────────────┤
│  /api/admin/staff      │  Permission Middleware              │
│  - CRUD operations     │  - Role validation                  │
│  - Auth endpoints      │  - Feature access control           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
├─────────────────────────────────────────────────────────────┤
│  staffService          │  permissionService                  │
│  - createStaff         │  - checkPermission                  │
│  - updateStaff         │  - getRolePermissions               │
│  - deactivateStaff     │  - validateAccess                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  User Model (extended)  │  AuditLog Model                    │
│  - role: enum           │  - action tracking                 │
│  - permissions: array   │  - permission changes              │
│  - isStaff: boolean     │                                    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. User Model Extension

```javascript
// Extended User schema for staff accounts
{
  // Existing fields...
  role: String,           // 'passenger', 'driver', 'operations', 'customer_support', 'finance', 'admin', 'super_admin'
  isStaff: Boolean,       // true for admin panel users
  permissions: [String],  // ['documents:read', 'documents:write', 'users:read', etc.]
  createdBy: ObjectId,    // Super Admin who created this account
  isActive: Boolean,      // Account status
  lastLogin: Date
}
```

### 2. Permission Definitions

```javascript
const ROLE_PERMISSIONS = {
  operations: [
    'drivers:read',
    'passengers:read', 
    'documents:read',
    'documents:write',
    'documents:verify'
  ],
  customer_support: [
    'drivers:read',
    'passengers:read',
    'tickets:read',
    'tickets:write'
  ],
  finance: [
    'payments:read',
    'transactions:read',
    'reports:read'
  ],
  admin: [
    // All of above plus
    'staff:read'
  ],
  super_admin: [
    // All permissions
    'staff:read',
    'staff:write',
    'staff:delete',
    'analytics:read',
    'settings:write'
  ]
};
```

### 3. Staff Service Interface

```javascript
// Staff management operations
createStaffAccount({ email, password, name, role }) → { success, staff }
updateStaffAccount(staffId, updates) → { success, staff }
deactivateStaffAccount(staffId) → { success }
resetStaffPassword(staffId) → { success }
getStaffAccounts(filters) → { success, staff[], pagination }
```

### 4. Permission Middleware

```javascript
// Middleware for route protection
requirePermission(permission) → middleware
requireRole(roles[]) → middleware
```

## Data Models

### Staff Account Fields

| Field | Type | Description |
|-------|------|-------------|
| email | String | Unique email for login |
| password | String | Bcrypt hashed (10+ rounds) |
| name | String | Display name |
| role | String | operations, customer_support, finance, admin, super_admin |
| permissions | Array | Specific permissions granted |
| isStaff | Boolean | True for admin panel users |
| isActive | Boolean | Account status |
| createdBy | ObjectId | Super Admin reference |
| lastLogin | Date | Last successful login |

### Permission Audit Log

| Field | Type | Description |
|-------|------|-------------|
| action | String | 'permission_update', 'account_created', etc. |
| targetUser | ObjectId | Affected user |
| performedBy | ObjectId | Admin who made change |
| previousValue | Mixed | Old permission/role |
| newValue | Mixed | New permission/role |
| timestamp | Date | When change occurred |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Staff Account Creation Validation
*For any* staff account creation request missing required fields (email, password, name, or role), the System SHALL reject the creation and return validation errors.
**Validates: Requirements 1.1**

### Property 2: Email Uniqueness Enforcement
*For any* staff account creation with an email that already exists in the system, the System SHALL reject the creation with a duplicate email error.
**Validates: Requirements 1.3**

### Property 3: Password Hashing Security
*For any* created staff account, the stored password SHALL be a bcrypt hash (not plaintext) and SHALL NOT equal the original password string.
**Validates: Requirements 1.4**

### Property 4: Role-Permission Mapping Consistency
*For any* staff account with a specific role, the account SHALL have exactly the permissions defined for that role in the permission configuration.
**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 5: Document Verification Status Transition
*For any* document approval action, the document status SHALL change from 'pending' to 'approved', and for rejection, SHALL change to 'rejected' with a non-empty reason.
**Validates: Requirements 3.2, 3.3**

### Property 6: Driver Verification Completeness
*For any* driver with all required documents (license, registration, insurance, kyc) approved, the driver verification status SHALL be 'verified'.
**Validates: Requirements 3.4**

### Property 7: Sensitive Data Exclusion
*For any* user lookup by Customer Support role, the response SHALL NOT contain bank details, payment information, or other sensitive financial data.
**Validates: Requirements 4.2**

### Property 8: Role-Based Access Denial
*For any* request to a protected endpoint by a user without the required permission, the System SHALL return a 403 Forbidden response.
**Validates: Requirements 4.4**

### Property 9: Deactivated Account Login Prevention
*For any* login attempt by a deactivated staff account, the System SHALL deny authentication regardless of correct credentials.
**Validates: Requirements 5.2, 6.3**

### Property 10: Permission Change Audit Trail
*For any* permission or role update on a staff account, the System SHALL create an audit log entry with the previous value, new value, and performer.
**Validates: Requirements 5.3**

### Property 11: JWT Role Embedding
*For any* successful staff authentication, the returned JWT token SHALL contain the user's role and permissions array.
**Validates: Requirements 6.1, 6.4**

### Property 12: Authentication Error Opacity
*For any* failed login attempt (wrong email or wrong password), the System SHALL return the same generic error message without revealing which field was incorrect.
**Validates: Requirements 6.2**

## Error Handling

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| MISSING_REQUIRED_FIELDS | 400 | Email, password, name, or role missing |
| DUPLICATE_EMAIL | 409 | Email already exists |
| INVALID_ROLE | 400 | Role not in allowed list |
| STAFF_NOT_FOUND | 404 | Staff account doesn't exist |
| ACCOUNT_DEACTIVATED | 403 | Account is deactivated |
| PERMISSION_DENIED | 403 | User lacks required permission |
| INVALID_CREDENTIALS | 401 | Email or password incorrect |
| UNAUTHORIZED | 401 | Not authenticated |

## Testing Strategy

### Property-Based Testing Library
- **Library**: fast-check (JavaScript)
- **Minimum iterations**: 100 per property test

### Unit Tests
- Staff account creation validation
- Password hashing verification
- Permission assignment logic
- Role-based access control

### Property-Based Tests
Each correctness property will be implemented as a property-based test:

1. **Property 1 Test**: Generate random staff data with missing fields, verify rejection
2. **Property 2 Test**: Create accounts, attempt duplicates, verify rejection
3. **Property 3 Test**: Create accounts, verify password is hashed and not equal to input
4. **Property 4 Test**: Create accounts with each role, verify permissions match config
5. **Property 5 Test**: Approve/reject documents, verify status transitions
6. **Property 6 Test**: Approve all required docs, verify driver becomes verified
7. **Property 7 Test**: Query users as support role, verify no sensitive data in response
8. **Property 8 Test**: Access protected endpoints without permission, verify 403
9. **Property 9 Test**: Deactivate accounts, attempt login, verify denial
10. **Property 10 Test**: Update permissions, verify audit log created
11. **Property 11 Test**: Authenticate staff, decode JWT, verify role/permissions present
12. **Property 12 Test**: Login with wrong email vs wrong password, verify same error

### Test Annotations
Each property-based test MUST be tagged with:
```javascript
// **Feature: admin-role-management, Property {number}: {property_text}**
// **Validates: Requirements X.Y**
```
