/**
 * Load Testing Configuration
 * Centralized configuration for all k6 load tests
 */

// Environment configuration
export const config = {
  baseUrl: __ENV.BASE_URL || 'http://localhost:3000',
  wsUrl: __ENV.WS_URL || 'ws://localhost:3000',
  
  // Test user credentials (for authenticated endpoints)
  testUserPhone: __ENV.TEST_USER_PHONE || '+919876543210',
  testUserToken: __ENV.TEST_USER_TOKEN || '',
  
  // Target load levels from requirements
  targets: {
    concurrentUsers: 10000,      // Requirement 10.1
    concurrentUploads: 7000,     // Requirement 10.2
    concurrentTracking: 3000,   // Requirement 10.3
  },
  
  // SLA thresholds
  thresholds: {
    httpResponseTime: 2000,     // 2 seconds max (Requirement 10.1)
    httpFailureRate: 0.01,      // 1% max failure rate
    wsLatency: 500,             // 500ms WebSocket latency (Requirement 10.3)
    uploadProcessingTime: 1800, // 30 minutes in seconds (Requirement 10.2)
  }
};

// Common k6 thresholds configuration
export const standardThresholds = {
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  http_req_failed: ['rate<0.01'],
  http_reqs: ['rate>100'],
};

// Ramp-up stages for gradual load increase
export const standardStages = [
  { duration: '1m', target: 100 },    // Warm up
  { duration: '3m', target: 1000 },   // Ramp to 1K
  { duration: '5m', target: 5000 },   // Ramp to 5K
  { duration: '10m', target: 10000 }, // Ramp to 10K
  { duration: '5m', target: 10000 },  // Hold at 10K
  { duration: '3m', target: 0 },      // Ramp down
];

// Upload-specific stages
export const uploadStages = [
  { duration: '1m', target: 100 },
  { duration: '3m', target: 1000 },
  { duration: '5m', target: 3500 },
  { duration: '10m', target: 7000 },
  { duration: '5m', target: 7000 },
  { duration: '3m', target: 0 },
];

// WebSocket tracking stages
export const trackingStages = [
  { duration: '1m', target: 100 },
  { duration: '2m', target: 500 },
  { duration: '3m', target: 1500 },
  { duration: '5m', target: 3000 },
  { duration: '5m', target: 3000 },
  { duration: '2m', target: 0 },
];

// Helper to generate random test data
export function generateTestData() {
  return {
    userId: `user_${Math.random().toString(36).substring(7)}`,
    tripId: `trip_${Math.random().toString(36).substring(7)}`,
    driverId: `driver_${Math.random().toString(36).substring(7)}`,
    location: {
      lat: 12.9716 + (Math.random() - 0.5) * 0.1,
      lng: 77.5946 + (Math.random() - 0.5) * 0.1,
    },
    documentType: ['license', 'registration', 'insurance', 'photo'][Math.floor(Math.random() * 4)],
  };
}
