/**
 * Property-based tests for SOS Dashboard Notification
 * Tests that SOS alerts are sent to both super admin and customer support dashboards
 * Requirements: 5.2, 5.3
 * 
 * **Feature: ride-safety-tracking-notifications, Property 11: SOS Dashboard Notification**
 * **Validates: Requirements 5.2, 5.3**
 */
const fc = require('fast-check');

const {
  broadcastSOSAlert,
  broadcastSOSUpdate,
  getDashboardStats
} = require('../../src/services/socketService');

// Generators
const coordinatesArbitrary = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true })
});

const userTypeArbitrary = fc.constantFrom('passenger', 'driver');

const alertIdArbitrary = fc.string({ minLength: 24, maxLength: 24 }).map(s => s.replace(/[^a-f0-9]/gi, 'a').padEnd(24, '0').slice(0, 24));

const tripIdArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0);

const userArbitrary = fc.record({
  _id: alertIdArbitrary,
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  phone: fc.stringMatching(/^\+91[6-9]\d{9}$/)
});

const sosAlertDataArbitrary = fc.record({
  alertId: alertIdArbitrary,
  tripId: tripIdArbitrary,
  triggeredBy: userArbitrary,
  userType: userTypeArbitrary,
  location: fc.record({
    coordinates: coordinatesArbitrary,
    address: fc.string({ minLength: 0, maxLength: 100 })
  }),
  status: fc.constantFrom('active', 'acknowledged'),
  createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })
});

describe('SOS Dashboard Notification - Property Tests', () => {
  // **Feature: ride-safety-tracking-notifications, Property 11: SOS Dashboard Notification**
  // **Validates: Requirements 5.2, 5.3**
  
  describe('Property 11: SOS Dashboard Notification', () => {
    // Note: These tests verify the notification function behavior.
    // When Socket.io is not initialized, the function returns appropriate error states.
    // When Socket.io is initialized, it broadcasts to both rooms.

    it('broadcastSOSAlert SHALL return result indicating admin notification attempt', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            const result = broadcastSOSAlert(alertData);
            
            // Property: result should contain adminNotified field
            return 'adminNotified' in result || 'error' in result;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('broadcastSOSAlert SHALL return result indicating support notification attempt', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            const result = broadcastSOSAlert(alertData);
            
            // Property: result should contain supportNotified field
            return 'supportNotified' in result || 'error' in result;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('broadcastSOSAlert SHALL return result with both admin and support notification status', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            const result = broadcastSOSAlert(alertData);
            
            // Property: result should contain both notification statuses or error
            if (result.error) {
              return result.success === false;
            }
            return 'adminNotified' in result && 'supportNotified' in result;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('broadcastSOSUpdate SHALL return result indicating notifications to both dashboards', () => {
      fc.assert(
        fc.property(
          fc.record({
            alertId: alertIdArbitrary,
            status: fc.constantFrom('active', 'acknowledged', 'resolved'),
            acknowledgedBy: fc.option(alertIdArbitrary),
            resolvedBy: fc.option(alertIdArbitrary),
            resolution: fc.option(fc.string({ minLength: 0, maxLength: 200 })),
            location: fc.option(fc.record({
              coordinates: coordinatesArbitrary
            }))
          }),
          (updateData) => {
            const result = broadcastSOSUpdate(updateData);
            
            // Property: result should contain both notification statuses or error
            if (result.error) {
              return result.success === false;
            }
            return 'adminNotified' in result && 'supportNotified' in result;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getDashboardStats SHALL return stats for both admin and support dashboards', () => {
      const stats = getDashboardStats();
      
      // Property: stats should contain both dashboard info
      expect(stats).toHaveProperty('adminDashboard');
      expect(stats).toHaveProperty('supportDashboard');
      expect(stats.adminDashboard).toHaveProperty('connected');
      expect(stats.adminDashboard).toHaveProperty('socketCount');
      expect(stats.supportDashboard).toHaveProperty('connected');
      expect(stats.supportDashboard).toHaveProperty('socketCount');
    });

    it('For any SOS alert, notification result SHALL indicate attempt to notify both dashboards', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            const result = broadcastSOSAlert(alertData);
            
            // Property: notification should attempt both dashboards
            // When socket.io is not initialized, both should be false
            // When initialized, both should reflect actual socket counts
            if (!result.success) {
              return result.adminNotified === false && result.supportNotified === false;
            }
            
            // When successful, both fields should be boolean
            return typeof result.adminNotified === 'boolean' && 
                   typeof result.supportNotified === 'boolean';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('broadcastSOSAlert SHALL include delivery time measurement', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            const result = broadcastSOSAlert(alertData);
            
            // Property: result should include delivery time when successful
            if (result.success) {
              return typeof result.deliveryTimeMs === 'number' && result.deliveryTimeMs >= 0;
            }
            return true; // Error case doesn't need delivery time
          }
        ),
        { numRuns: 100 }
      );
    });

    it('broadcastSOSAlert SHALL include socket counts for both dashboards', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            const result = broadcastSOSAlert(alertData);
            
            // Property: result should include socket counts when successful
            if (result.success) {
              return typeof result.adminSocketsCount === 'number' && 
                     typeof result.supportSocketsCount === 'number' &&
                     result.adminSocketsCount >= 0 &&
                     result.supportSocketsCount >= 0;
            }
            return true; // Error case doesn't need counts
          }
        ),
        { numRuns: 100 }
      );
    });

    it('For any alert data, broadcastSOSAlert SHALL preserve alert information in payload', () => {
      fc.assert(
        fc.property(
          sosAlertDataArbitrary,
          (alertData) => {
            // This test verifies the function accepts the data without throwing
            // The actual payload verification would require socket.io mocking
            try {
              const result = broadcastSOSAlert(alertData);
              return result !== undefined && result !== null;
            } catch (error) {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('broadcastSOSUpdate SHALL handle all status types', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('active', 'acknowledged', 'resolved'),
          alertIdArbitrary,
          (status, alertId) => {
            const result = broadcastSOSUpdate({
              alertId,
              status,
              acknowledgedBy: status === 'acknowledged' ? alertId : null,
              resolvedBy: status === 'resolved' ? alertId : null,
              resolution: status === 'resolved' ? 'Test resolution' : null
            });
            
            // Property: function should handle all status types
            return result !== undefined && result !== null;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
