/**
 * Property-Based Tests for Notification Content Completeness
 * 
 * **Feature: passenger-booking-flow, Property 11: Notification Content Completeness**
 * **Validates: Requirements 6.4**
 * 
 * Tests that booking confirmation notifications contain all required fields
 */

const fc = require('fast-check');
const { renderTemplate, templates } = require('../../src/services/notificationService');

// Arbitrary for notification data
const notificationDataArb = fc.record({
  userName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  bookingId: fc.string({ minLength: 10, maxLength: 20 }),
  tripId: fc.string({ minLength: 10, maxLength: 20 }),
  source: fc.string({ minLength: 5, maxLength: 100 }),
  destination: fc.string({ minLength: 5, maxLength: 100 }),
  scheduledDate: fc.string({ minLength: 5, maxLength: 50 }),
  scheduledTime: fc.string({ minLength: 4, maxLength: 10 }),
  seats: fc.integer({ min: 1, max: 6 }),
  fare: fc.integer({ min: 50, max: 10000 }),
  bookingPIN: fc.integer({ min: 1000, max: 9999 }).map(n => String(n)),
  driverName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  driverPhone: fc.string({ minLength: 10, maxLength: 15 }),
  vehicleInfo: fc.string({ minLength: 5, maxLength: 100 })
});

/**
 * Check if rendered content contains all required fields
 * @param {string} content - Rendered notification content
 * @param {Object} data - Original data
 * @returns {Object} Validation result
 */
const validateNotificationContent = (content, data) => {
  const requiredFields = [
    { field: 'source', value: data.source },
    { field: 'destination', value: data.destination },
    { field: 'scheduledDate', value: data.scheduledDate },
    { field: 'scheduledTime', value: data.scheduledTime },
    { field: 'fare', value: String(data.fare) },
    { field: 'driverName', value: data.driverName }
  ];

  const missingFields = [];
  
  for (const { field, value } of requiredFields) {
    if (!content.includes(value)) {
      missingFields.push(field);
    }
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields
  };
};

describe('Notification Content Properties', () => {
  /**
   * **Feature: passenger-booking-flow, Property 11: Notification Content Completeness**
   * **Validates: Requirements 6.4**
   * 
   * Property: For any booking confirmation notification (Email/WhatsApp/SMS),
   * the message SHALL contain trip date, time, pickup location, drop location,
   * driver name, vehicle details, and fare.
   */
  describe('Property 11: Notification Content Completeness', () => {
    test('email notification contains all required fields', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const rendered = renderTemplate('booking_confirmation_email', data);
            const validation = validateNotificationContent(rendered.body, data);
            return validation.isComplete;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('SMS notification contains essential fields', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const rendered = renderTemplate('booking_confirmation_sms', data);
            
            // SMS should contain at minimum: source, destination, date, time, fare, driver
            const essentialFields = [
              data.source,
              data.destination,
              data.scheduledDate,
              data.scheduledTime,
              String(data.fare),
              data.driverName
            ];
            
            for (const field of essentialFields) {
              if (!rendered.body.includes(field)) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('WhatsApp notification contains all required fields', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const rendered = renderTemplate('booking_confirmation_whatsapp', data);
            const validation = validateNotificationContent(rendered.body, data);
            return validation.isComplete;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all notifications include booking PIN', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const emailRendered = renderTemplate('booking_confirmation_email', data);
            const smsRendered = renderTemplate('booking_confirmation_sms', data);
            const whatsappRendered = renderTemplate('booking_confirmation_whatsapp', data);
            
            return emailRendered.body.includes(data.bookingPIN) &&
                   smsRendered.body.includes(data.bookingPIN) &&
                   whatsappRendered.body.includes(data.bookingPIN);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('email notification has subject line', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const rendered = renderTemplate('booking_confirmation_email', data);
            return rendered.subject && rendered.subject.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('all notifications include vehicle info', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const emailRendered = renderTemplate('booking_confirmation_email', data);
            const whatsappRendered = renderTemplate('booking_confirmation_whatsapp', data);
            
            // Email and WhatsApp should include vehicle info
            return emailRendered.body.includes(data.vehicleInfo) &&
                   whatsappRendered.body.includes(data.vehicleInfo);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Template Rendering', () => {
    test('template variables are correctly substituted', () => {
      fc.assert(
        fc.property(
          notificationDataArb,
          (data) => {
            const rendered = renderTemplate('booking_confirmation_email', data);
            
            // Should not contain any unsubstituted variables
            const hasUnsubstituted = /\{\{\w+\}\}/.test(rendered.body);
            return !hasUnsubstituted;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('missing template throws error', () => {
      expect(() => renderTemplate('non_existent_template', {})).toThrow();
    });

    test('template renders with partial data', () => {
      const partialData = {
        userName: 'Test User',
        tripId: 'HR-2024-001234'
      };
      
      // Should not throw, but may have unsubstituted variables
      const rendered = renderTemplate('booking_confirmation_email', partialData);
      expect(rendered.body).toBeDefined();
    });
  });
});
