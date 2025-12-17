/**
 * 10K Concurrent Users Load Test
 * Validates: Requirements 10.1
 * 
 * Tests the system's ability to handle 10,000 concurrent users
 * with less than 2 second average response time.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { config, standardThresholds, standardStages, generateTestData } from './config.js';

// Custom metrics
const errorRate = new Rate('errors');
const searchLatency = new Trend('search_latency');
const profileLatency = new Trend('profile_latency');
const healthLatency = new Trend('health_latency');

export const options = {
  stages: standardStages,
  thresholds: {
    ...standardThresholds,
    errors: ['rate<0.01'],
    search_latency: ['p(95)<2000'],
    profile_latency: ['p(95)<2000'],
  },
  // Tags for result filtering
  tags: {
    test_type: 'concurrent_users',
    requirement: '10.1',
  },
};

// Setup function - runs once before test
export function setup() {
  console.log(`Starting 10K concurrent users test against ${config.baseUrl}`);
  
  // Verify server is reachable
  const healthRes = http.get(`${config.baseUrl}/api/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Server health check failed: ${healthRes.status}`);
  }
  
  return { startTime: Date.now() };
}

// Main test function - runs for each VU
export default function(data) {
  const testData = generateTestData();
  
  // Simulate realistic user behavior mix
  const scenario = Math.random();
  
  if (scenario < 0.4) {
    // 40% - Search for trips (most common action)
    searchTrips(testData);
  } else if (scenario < 0.7) {
    // 30% - View profile/dashboard
    viewProfile(testData);
  } else if (scenario < 0.85) {
    // 15% - Check bookings
    checkBookings(testData);
  } else {
    // 15% - Health/status checks
    healthCheck();
  }
  
  // Think time between requests (1-3 seconds)
  sleep(1 + Math.random() * 2);
}

function searchTrips(testData) {
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'search' },
  };
  
  const searchParams = new URLSearchParams({
    from: 'Bangalore',
    to: 'Chennai',
    date: new Date().toISOString().split('T')[0],
    seats: '1',
  });
  
  const startTime = Date.now();
  const res = http.get(`${config.baseUrl}/api/search?${searchParams}`, params);
  const duration = Date.now() - startTime;
  
  searchLatency.add(duration);
  
  const success = check(res, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 2s': (r) => r.timings.duration < 2000,
    'search returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.trips) || Array.isArray(body);
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
}

function viewProfile(testData) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.testUserToken || 'test-token'}`,
    },
    tags: { endpoint: 'profile' },
  };
  
  const startTime = Date.now();
  const res = http.get(`${config.baseUrl}/api/profile`, params);
  const duration = Date.now() - startTime;
  
  profileLatency.add(duration);
  
  const success = check(res, {
    'profile status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'profile response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(!success && res.status >= 500);
}

function checkBookings(testData) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.testUserToken || 'test-token'}`,
    },
    tags: { endpoint: 'bookings' },
  };
  
  const res = http.get(`${config.baseUrl}/api/bookings`, params);
  
  const success = check(res, {
    'bookings status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    'bookings response time < 2s': (r) => r.timings.duration < 2000,
  });
  
  errorRate.add(!success && res.status >= 500);
}

function healthCheck() {
  const startTime = Date.now();
  const res = http.get(`${config.baseUrl}/api/health`, {
    tags: { endpoint: 'health' },
  });
  const duration = Date.now() - startTime;
  
  healthLatency.add(duration);
  
  const success = check(res, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!success);
}

// Teardown function - runs once after test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration.toFixed(2)} seconds`);
}
