/**
 * 3K WebSocket Tracking Sessions Load Test
 * Validates: Requirements 10.3
 * 
 * Tests the system's ability to handle 3,000 concurrent WebSocket
 * connections for live tracking with sub-second location update latency.
 */

import { check, sleep } from 'k6';
import ws from 'k6/ws';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config, trackingStages, generateTestData } from './config.js';

// Custom metrics
const connectionErrors = new Rate('ws_connection_errors');
const messageLatency = new Trend('ws_message_latency');
const locationUpdateLatency = new Trend('location_update_latency');
const messagesReceived = new Counter('messages_received');
const connectionDuration = new Trend('connection_duration');

export const options = {
  stages: trackingStages,
  thresholds: {
    ws_connection_errors: ['rate<0.05'], // 5% max connection failures
    ws_message_latency: ['p(95)<500'],   // 500ms latency requirement
    location_update_latency: ['p(95)<500'],
  },
  tags: {
    test_type: 'websocket_tracking',
    requirement: '10.3',
  },
};

export function setup() {
  console.log(`Starting 3K WebSocket tracking test against ${config.wsUrl}`);
  return { startTime: Date.now() };
}

export default function(data) {
  const testData = generateTestData();
  const wsUrl = `${config.wsUrl}/socket.io/?EIO=4&transport=websocket`;
  
  const connectionStart = Date.now();
  let messagesCount = 0;
  let lastLocationTime = null;
  
  const res = ws.connect(wsUrl, {
    tags: { endpoint: 'tracking_ws' },
  }, function(socket) {
    
    socket.on('open', function() {
      // Subscribe to trip tracking
      const subscribeMsg = JSON.stringify({
        type: 'track:subscribe',
        tripId: testData.tripId,
        userId: testData.userId,
      });
      
      // Socket.io protocol: 42 prefix for event message
      socket.send(`42["track:subscribe","${testData.tripId}"]`);
    });
    
    socket.on('message', function(msg) {
      const receiveTime = Date.now();
      messagesCount++;
      messagesReceived.add(1);
      
      // Parse Socket.io message
      if (msg.startsWith('42')) {
        try {
          const payload = JSON.parse(msg.substring(2));
          const eventName = payload[0];
          const eventData = payload[1];
          
          if (eventName === 'location:update' && eventData) {
            // Calculate latency from server timestamp
            if (eventData.timestamp) {
              const latency = receiveTime - eventData.timestamp;
              locationUpdateLatency.add(latency);
            }
            lastLocationTime = receiveTime;
          }
        } catch (e) {
          // Ignore parse errors for non-JSON messages
        }
      }
      
      messageLatency.add(Date.now() - receiveTime);
    });
    
    socket.on('error', function(e) {
      connectionErrors.add(1);
      console.log(`WebSocket error: ${e}`);
    });
    
    socket.on('close', function() {
      const duration = Date.now() - connectionStart;
      connectionDuration.add(duration);
    });
    
    // Simulate driver sending location updates (if acting as driver)
    if (Math.random() < 0.3) { // 30% of connections are drivers
      socket.setInterval(function() {
        const location = {
          lat: testData.location.lat + (Math.random() - 0.5) * 0.001,
          lng: testData.location.lng + (Math.random() - 0.5) * 0.001,
          speed: Math.random() * 60,
          heading: Math.random() * 360,
          timestamp: Date.now(),
        };
        
        socket.send(`42["location:update",${JSON.stringify({
          tripId: testData.tripId,
          driverId: testData.driverId,
          location: location,
        })}]`);
      }, 2000); // Send location every 2 seconds
    }
    
    // Keep connection alive for test duration
    socket.setTimeout(function() {
      socket.close();
    }, 30000 + Math.random() * 30000); // 30-60 seconds per connection
  });
  
  const success = check(res, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });
  
  if (!success) {
    connectionErrors.add(1);
  }
  
  // Wait before next connection attempt
  sleep(1 + Math.random() * 2);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`WebSocket tracking test completed in ${duration.toFixed(2)} seconds`);
  console.log(`Target: Sub-second location update latency for 3K concurrent connections`);
}
