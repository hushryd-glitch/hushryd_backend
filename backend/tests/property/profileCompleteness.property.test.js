/**
 * Property-Based Tests for Profile Completeness Validation
 * 
 * **Feature: passenger-booking-flow, Property 5: Profile Completeness Validation**
 * **Validates: Requirements 3.4, 3.5**
 * 
 * Tests that profile completeness correctly validates name and emergency contacts
 */

const fc = require('fast-check');

/**
 * Pure function to check profile completeness
 * Mirrors the logic in User.isProfileComplete()
 * 
 * @param {Object} profile - User profile object
 * @returns {boolean} True if profile is complete
 */
const isProfileComplete = (profile) => {
  // Check name: must be a non-empty string after trimming
  const hasName = typeof profile.name === 'string' && profile.name.trim().length > 0;
  // Check emergency contacts: must be a non-empty array
  const hasEmergencyContact = Array.isArray(profile.emergencyContacts) && profile.emergencyContacts.length > 0;
  return hasName && hasEmergencyContact;
};

/**
 * Get profile completeness details
 * Mirrors the logic in User.getProfileCompleteness()
 * 
 * @param {Object} profile - User profile object
 * @returns {Object} Completeness status with missing fields
 */
const getProfileCompleteness = (profile) => {
  const missing = [];
  
  if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    missing.push('name');
  }
  
  if (!Array.isArray(profile.emergencyContacts) || profile.emergencyContacts.length === 0) {
    missing.push('emergencyContacts');
  }
  
  return {
    isComplete: missing.length === 0,
    missing
  };
};

// Arbitrary for valid emergency contact
const emergencyContactArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  phone: fc.string({ minLength: 7, maxLength: 15 }).map(s => '+1' + s.replace(/\D/g, '').slice(0, 10)),
  relationship: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
});

// Arbitrary for valid name
const validNameArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

// Arbitrary for empty/whitespace-only name
const emptyNameArb = fc.oneof(
  fc.constant(''),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant('   '),
  fc.constant('\t\n')
);

describe('Profile Completeness Properties', () => {
  /**
   * **Feature: passenger-booking-flow, Property 5: Profile Completeness Validation**
   * **Validates: Requirements 3.4, 3.5**
   * 
   * Property: For any user profile, if name is empty OR emergency contacts count is zero,
   * the profile SHALL be marked as incomplete and booking SHALL be blocked.
   */
  describe('Property 5: Profile Completeness Validation', () => {
    test('profile with valid name AND at least one emergency contact is complete', () => {
      fc.assert(
        fc.property(
          validNameArb,
          fc.array(emergencyContactArb, { minLength: 1, maxLength: 5 }),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            return isProfileComplete(profile) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile with empty name is incomplete regardless of emergency contacts', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t\n')
          ),
          fc.array(emergencyContactArb, { minLength: 0, maxLength: 5 }),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            return isProfileComplete(profile) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile with null/undefined name is incomplete', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.constant(undefined)),
          fc.array(emergencyContactArb, { minLength: 1, maxLength: 5 }),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            return isProfileComplete(profile) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile with zero emergency contacts is incomplete regardless of name', () => {
      fc.assert(
        fc.property(
          validNameArb,
          (name) => {
            const profile = { name, emergencyContacts: [] };
            return isProfileComplete(profile) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile with null/undefined emergency contacts is incomplete', () => {
      fc.assert(
        fc.property(
          validNameArb,
          fc.oneof(fc.constant(null), fc.constant(undefined)),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            return isProfileComplete(profile) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile missing both name and emergency contacts is incomplete', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined)),
          fc.oneof(fc.constant([]), fc.constant(null), fc.constant(undefined)),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            return isProfileComplete(profile) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Profile Completeness Details', () => {
    test('complete profile has empty missing array', () => {
      fc.assert(
        fc.property(
          validNameArb,
          fc.array(emergencyContactArb, { minLength: 1, maxLength: 5 }),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            const result = getProfileCompleteness(profile);
            return result.isComplete === true && result.missing.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile missing name includes "name" in missing array', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined)),
          fc.array(emergencyContactArb, { minLength: 1, maxLength: 5 }),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            const result = getProfileCompleteness(profile);
            return result.missing.includes('name');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile missing emergency contacts includes "emergencyContacts" in missing array', () => {
      fc.assert(
        fc.property(
          validNameArb,
          fc.oneof(fc.constant([]), fc.constant(null), fc.constant(undefined)),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            const result = getProfileCompleteness(profile);
            return result.missing.includes('emergencyContacts');
          }
        ),
        { numRuns: 100 }
      );
    });

    test('profile missing both has both in missing array', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined)),
          fc.oneof(fc.constant([]), fc.constant(null), fc.constant(undefined)),
          (name, emergencyContacts) => {
            const profile = { name, emergencyContacts };
            const result = getProfileCompleteness(profile);
            return result.missing.includes('name') && result.missing.includes('emergencyContacts');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
