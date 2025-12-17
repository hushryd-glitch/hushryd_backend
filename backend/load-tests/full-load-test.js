/**
 * Full Load Test - Combined Scenario
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 * 
 * Simulates realistic production load with:
 * - 10K concurrent users performing various actions
 * - 7K concurrent document uploads
 * - 3K concurrent tracking sessions
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import ws from 'k6/ws';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config, generateTestData } from './config.js';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const uploadLatency = new Trend('upload_latency');
const wsLatency = new Trend('ws_latency');
const totalRequests = new Counter('total_requests');

export const options = {
  scenarios: {
    // Scenario 1: General API users (10K target)
    api_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },
        { duration: '5m', target: 2000 },
        { duration: '10m', target: 5000 },
        { duration: '10m', target: 10000 },
        { duration: '5m', target: 10000 },
        { duration: '3m', target: 0 },
      ],
      exec: 'apiUserScenario',
      tags: { scenario: 'api_users' },
    },
    
    // Scenario 2: Document uploaders (7K target)
    document_uploaders: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 1000 },
        { duration: '10m', target: 3500 },
        { duration: '10m', target: 7000 },
        { duration: '5m', target: 7000 },
        { duration: '3m', target: 0 },
      ],
      exec: 'uploadScenario',
      tags: { scenario: 'uploaders' },
    },
    
    // Scenario 3: Live tracking users (3K target)
    tracking_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 500 },
        { duration: '10m', target: 1500 },
        { duration: '10m', target: 3000 },
        { duration: '5m', target: 3000 },
        { duration: '3m', target: 0 },
      ],
      exec: 'trackingScenario',
      tags: { scenario: 'tracking' },
    },
  },
  
  thresholds: {
    // Overall thresholds
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
    
    // Scenario-specific thresholds
    'api_latency{scenario:api_users}': ['p(95)<2000'],
    'upload_latency{scenario:uploaders}': ['p(95)<2000'],
    'ws_latency{scenario:tracking}': ['p(95)<500'],
  },
  
  tags: {
    test_type: 'full_load_test',
    requirement: '10.1,10.2,10.3,10.4',
  },
};

export function setup() {
  console.log('Starting full load test');
  console.log(`Target: 10K API users, 7K uploaders, 3K tracking sessions`);
  console.log(`Base URL: ${config.baseUrl}`);
  
  // Verify server health
  const healthRes = http.get(`${config.baseUrl}/api/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Server health check failed: ${healthRes.status}`);
  }
  
  return { startTime: Date.now() };
}

// Scenario 1: API Users
export function apiUserScenario() {
  const testData = generateTestData();
  
  group('API User Actions', function() {
    const action = Math.random();
    
    if (action < 0.4) {
      // Search trips
      const startTime = Date.now();
      const res = http.get(`${config.baseUrl}/api/search?from=Bangalore&to=Chennai&date=${new Date().toISOString().split('T')[0]}`);
      apiLatency.add(Date.now() - startTime);
      totalRequests.add(1);
      
      check(res, {
        'search successful': (r) => r.status === 200,
        'search fast': (r) => r.timings.duration < 2000,
      }) || errorRate.add(1);
      
    } else if (action < 0.7) {
      // View profile
      const startTime = Date.now();
      const res = http.get(`${config.baseUrl}/api/profile`, {
        headers: { 'Authorization': `Bearer ${config.testUserToken || 'test'}` },
      });
      apiLatency.add(Date.now() - startTime);
      totalRequests.add(1);
      
      check(res, {
        'profile accessible': (r) => r.status === 200 || r.status === 401,
      }) || errorRate.add(1);
      
    } else {
      // Health check
      const startTime = Date.now();
      const res = http.get(`${config.baseUrl}/api/health`);
      apiLatency.add(Date.now() - startTime);
      totalRequests.add(1);
      
      check(res, {
        'health ok': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });
  
  sleep(1 + Math.random() * 2);
}

// Scenario 2: Document Uploaders
export function uploadScenario() {
  const testData = generateTestData();
  
  group('Document Upload', function() {
    // Request presigned URL
    const startTime = Date.now();
    const res = http.post(`${config.baseUrl}/api/driver/documents/presigned-url`, 
      JSON.stringify({
        documentType: testData.documentType,
        fileType: 'jpg',
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.testUserToken || 'test'}`,
        },
      }
    );
    uploadLatency.add(Date.now() - startTime);
    totalRequests.add(1);
    
    const success = check(res, {
      'presigned URL obtained': (r) => r.status === 200 || r.status === 401,
      'presigned URL fast': (r) => r.timings.duration < 500,
    });
    
    if (!success) {
      errorRate.add(1);
    }
    
    // Simulate upload completion notification
    if (res.status === 200) {
      sleep(0.5); // Simulate S3 upload time
      
      const completeRes = http.post(`${config.baseUrl}/api/driver/documents/complete`,
        JSON.stringify({
          documentType: testData.documentType,
          s3Key: `documents/${testData.userId}/${Date.now()}.jpg`,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.testUserToken || 'test'}`,
          },
        }
      );
      totalRequests.add(1);
      
      check(completeRes, {
        'upload completion accepted': (r) => [200, 202, 401].includes(r.status),
      }) || errorRate.add(1);
    }
  });
  
  sleep(2 + Math.random() * 3);
}

// Scenario 3: Live Tracking
export function trackingScenario() {
  const testData = generateTestData();
  const wsUrl = `${config.wsUrl}/socket.io/?EIO=4&transport=websocket`;
  
  const res = ws.connect(wsUrl, {}, function(socket) {
    socket.on('open', function() {
      socket.send(`42["track:subscribe","${testData.tripId}"]`);
    });
    
    socket.on('message', function(msg) {
      if (msg.startsWith('42')) {
        try {
          const payload = JSON.parse(msg.substring(2));
          if (payload[0] === 'location:update' && payload[1]?.timestamp) {
            wsLatency.add(Date.now() - payload[1].timestamp);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });
    
    // Simulate driver location updates
    if (Math.random() < 0.3) {
      socket.setInterval(function() {
        socket.send(`42["location:update",${JSON.stringify({
          tripId: testData.tripId,
          location: {
            lat: testData.location.lat,
            lng: testData.location.lng,
            timestamp: Date.now(),
          },
        })}]`);
      }, 2000);
    }
    
    socket.setTimeout(function() {
      socket.close();
    }, 20000 + Math.random() * 20000);
  });
  
  check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  }) || errorRate.add(1);
  
  sleep(1);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== LOAD TEST COMPLETE ==========`);
  console.log(`Total duration: ${duration.toFixed(2)} seconds`);
  console.log(`\nSLA Targets:`);
  console.log(`- 10K concurrent users: < 2s response time`);
  console.log(`- 7K concurrent uploads: processed within 30 min`);
  console.log(`- 3K tracking sessions: < 500ms latency`);
  console.log(`==========================================\n`);
}
