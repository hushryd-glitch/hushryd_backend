/**
 * Permission Service
 * Implements role-based permission management for admin panel RBAC
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

/**
 * Role-Permission mapping for staff accounts
 * Centralized permission definitions per role
 * 
 * Requirements:
 * - 2.1: Allow selection from predefined permission sets based on role
 * - 2.2: Operations role permissions
 * - 2.3: Customer Support role permissions
 * - 2.4: Finance role permissions
 */
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
    'drivers:read',
    'passengers:read',
    'documents:read',
    'documents:write',
    'documents:verify',
    'tickets:read',
    'tickets:write',
    'payments:read',
    'transactions:read',
    'reports:read',
    'staff:read'
  ],
  super_admin: [
    'drivers:read',
    'passengers:read',
    'documents:read',
    'documents:write',
    'documents:verify',
    'tickets:read',
    'tickets:write',
    'payments:read',
    'transactions:read',
    'reports:read',
    'staff:read',
    'staff:write',
    'staff:delete',
    'analytics:read',
    'settings:write'
  ]
};

/**
 * Valid staff roles
 */
const VALID_ROLES = ['operations', 'customer_support', 'finance', 'admin', 'super_admin'];

/**
 * All available permissions in the system
 */
const ALL_PERMISSIONS = [
  'drivers:read',
  'passengers:read',
  'documents:read',
  'documents:write',
  'documents:verify',
  'tickets:read',
  'tickets:write',
  'payments:read',
  'transactions:read',
  'reports:read',
  'staff:read',
  'staff:write',
  'staff:delete',
  'analytics:read',
  'settings:write'
];

/**
 * Check if a user has a specific permission
 * 
 * @param {Object} user - User object with permissions array
 * @param {string} permission - Permission to check (e.g., 'documents:verify')
 * @returns {boolean} True if user has the permission
 * 
 * Requirements: 2.1
 */
const checkPermission = (user, permission) => {
  if (!user || !permission) {
    return false;
  }

  // Super admin has all permissions
  if (user.role === 'super_admin') {
    return true;
  }

  // Check user's permissions array first (if it has entries)
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions.includes(permission);
  }

  // Fallback: check role-based permissions (when permissions array is empty or not set)
  if (user.role && ROLE_PERMISSIONS[user.role]) {
    return ROLE_PERMISSIONS[user.role].includes(permission);
  }

  return false;
};

/**
 * Get all permissions for a specific role
 * 
 * @param {string} role - Role name (operations, customer_support, finance, admin, super_admin)
 * @returns {string[]} Array of permissions for the role, empty array if role is invalid
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
const getRolePermissions = (role) => {
  if (!role || typeof role !== 'string') {
    return [];
  }

  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? [...permissions] : [];
};

/**
 * Validate if a user can access a resource based on required permissions
 * 
 * @param {Object} user - User object with role and permissions
 * @param {string|string[]} requiredPermissions - Single permission or array of permissions required
 * @param {Object} options - Validation options
 * @param {boolean} [options.requireAll=false] - If true, user must have ALL permissions; if false, ANY permission is sufficient
 * @returns {Object} Validation result with allowed status and details
 * 
 * Requirements: 2.1
 */
const validateAccess = (user, requiredPermissions, options = {}) => {
  const { requireAll = false } = options;

  // Handle invalid inputs
  if (!user) {
    return {
      allowed: false,
      reason: 'User not provided',
      missingPermissions: Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions]
    };
  }

  if (!requiredPermissions || (Array.isArray(requiredPermissions) && requiredPermissions.length === 0)) {
    return {
      allowed: true,
      reason: 'No permissions required'
    };
  }

  // Normalize to array
  const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  // Check if user is active
  if (user.isActive === false) {
    return {
      allowed: false,
      reason: 'Account is deactivated',
      missingPermissions: permissions
    };
  }

  // Super admin has all permissions
  if (user.role === 'super_admin') {
    return {
      allowed: true,
      reason: 'Super admin access'
    };
  }

  // Check permissions
  const hasPermissions = permissions.map(perm => ({
    permission: perm,
    granted: checkPermission(user, perm)
  }));

  const grantedPermissions = hasPermissions.filter(p => p.granted).map(p => p.permission);
  const missingPermissions = hasPermissions.filter(p => !p.granted).map(p => p.permission);

  let allowed;
  if (requireAll) {
    allowed = missingPermissions.length === 0;
  } else {
    allowed = grantedPermissions.length > 0;
  }

  return {
    allowed,
    reason: allowed 
      ? 'Access granted' 
      : `Missing required permission${missingPermissions.length > 1 ? 's' : ''}: ${missingPermissions.join(', ')}`,
    grantedPermissions,
    missingPermissions
  };
};

/**
 * Check if a role is valid
 * 
 * @param {string} role - Role to validate
 * @returns {boolean} True if role is valid
 */
const isValidRole = (role) => {
  return VALID_ROLES.includes(role);
};

/**
 * Check if a permission is valid
 * 
 * @param {string} permission - Permission to validate
 * @returns {boolean} True if permission is valid
 */
const isValidPermission = (permission) => {
  return ALL_PERMISSIONS.includes(permission);
};

/**
 * Get all valid roles
 * 
 * @returns {string[]} Array of valid role names
 */
const getValidRoles = () => {
  return [...VALID_ROLES];
};

/**
 * Get all available permissions
 * 
 * @returns {string[]} Array of all permission strings
 */
const getAllPermissions = () => {
  return [...ALL_PERMISSIONS];
};

/**
 * Check if a role has a specific permission by default
 * 
 * @param {string} role - Role name
 * @param {string} permission - Permission to check
 * @returns {boolean} True if the role includes this permission by default
 */
const roleHasPermission = (role, permission) => {
  if (!role || !permission) {
    return false;
  }

  const rolePerms = ROLE_PERMISSIONS[role];
  return rolePerms ? rolePerms.includes(permission) : false;
};

module.exports = {
  ROLE_PERMISSIONS,
  VALID_ROLES,
  ALL_PERMISSIONS,
  checkPermission,
  getRolePermissions,
  validateAccess,
  isValidRole,
  isValidPermission,
  getValidRoles,
  getAllPermissions,
  roleHasPermission
};
