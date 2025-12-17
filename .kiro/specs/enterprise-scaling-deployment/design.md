# Design Document: Enterprise Scaling & Deployment

## Overview

This design document outlines the enterprise-grade architecture for scaling HushRyd to support 10 lakh to 1 crore users. The architecture follows a microservices-inspired approach with dedicated services for real-time communication, location tracking, notifications, and core business logic. The design prioritizes high availability for safety-critical features (SOS), horizontal scalability for traffic spikes, and cost efficiency through intelligent resource management.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GLOBAL EDGE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  CloudFront/Cloudflare CDN  │  WAF (DDoS Protection)  │  DNS (Route 53)         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
        ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
        │   API Gateway     │ │ WebSocket Gateway │ │  Admin Gateway    │
        │   (Kong/AWS ALB)  │ │ (Dedicated NLB)   │ │  (Separate ALB)   │
        │   Rate Limiting   │ │ Sticky Sessions   │ │  IP Whitelist     │
        └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
                  │                     │                     │
    ┌─────────────┼─────────────┐       │                     │
    │             │             │       │                     │
    ▼             ▼             ▼       ▼                     ▼
┌───────┐   ┌───────┐   ┌───────┐ ┌───────────┐   ┌───────────────────┐
│API-1  │   │API-2  │   │API-N  │ │WS Cluster │   │ Admin Service     │
│(ECS)  │   │(ECS)  │   │(ECS)  │ │(3+ nodes) │   │ (Isolated VPC)    │
└───┬───┘   └───┬───┘   └───┬───┘ └─────┬─────┘   └─────────┬─────────┘
    │           │           │           │                   │
    └───────────┴───────────┴───────────┴───────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ Redis Cluster │   │ Message Queue │   │ MongoDB       │
    │ (6 nodes)     │   │ (Bull/Kafka)  │   │ Sharded       │
    │ - Location    │   │ - SMS Queue   │   │ - Users       │
    │ - Sessions    │   │ - Email Queue │   │ - Trips       │
    │ - Pub/Sub     │   │ - Push Queue  │   │ - Bookings    │
    └───────────────┘   └───────────────┘   └───────────────┘
```

## Components and Interfaces

### 1. API Gateway Layer

**Purpose:** Single entry point for all API traffic with security, rate limiting, and routing.

```javascript
// Configuration for Kong/AWS API Gateway
const apiGatewayConfig = {
  rateLimiting: {
    default: { requests: 100, period: '1m' },
    authenticated: { requests: 500, period: '1m' },
    premium: { requests: 1000, period: '1m' }
  },
  authentication: {
    jwtValidation: true,
    apiKeyValidation: true,
    cacheTokens: true // Redis cache for token validation
  },
  routing: {
    '/api/v1/*': 'api-cluster',
    '/ws/*': 'websocket-cluster',
    '/admin/*': 'admin-service'
  }
};
```

### 2. WebSocket Cluster Service

**Purpose:** Dedicated horizontally-scalable WebSocket servers for real-time communication.

**Interface:**
```typescript
interface WebSocketClusterService {
  // Connection management
  connect(token: string): Promise<Socket>;
  disconnect(socketId: string): void;
  
  // Room management (Redis-backed)
  joinRoom(socketId: string, roomId: string): Promise<void>;
  leaveRoom(socketId: string, roomId: string): Promise<void>;
  
  // Broadcasting (via Redis Pub/Sub)
  broadcastToRoom(roomId: string, event: string, data: any): Promise<void>;
  broadcastToUser(userId: string, event: string, data: any): Promise<void>;
  
  // Metrics
  getConnectionStats(): Promise<ClusterStats>;
}
```

### 3. Location Service

**Purpose:** High-throughput location update processing and real-time broadcasting.

**Interface:**
```typescript
interface LocationService {
  // Location updates (Redis primary storage)
  updateLocation(tripId: string, coordinates: Coordinates): Promise<void>;
  getLocation(tripId: string): Promise<LocationData | null>;
  
  // Geo queries (Redis GEO commands)
  findNearbyDrivers(lat: number, lng: number, radiusKm: number): Promise<Driver[]>;
  
  // Batch operations
  batchUpdateLocations(updates: LocationUpdate[]): Promise<void>;
  
  // Persistence (async to MongoDB)
  persistLocationHistory(tripId: string): Promise<void>;
}
```

### 4. Message Queue Service

**Purpose:** Reliable async processing for notifications, emails, SMS.

**Interface:**
```typescript
interface MessageQueueService {
  // Queue management
  addJob(queue: QueueName, data: JobData, options?: JobOptions): Promise<Job>;
  processQueue(queue: QueueName, handler: JobHandler): void;
  
  // Priority queues
  addCriticalJob(data: JobData): Promise<Job>; // SOS, payments
  addHighPriorityJob(data: JobData): Promise<Job>; // Notifications
  addNormalJob(data: JobData): Promise<Job>; // Emails, reports
  
  // Monitoring
  getQueueStats(queue: QueueName): Promise<QueueStats>;
  getFailedJobs(queue: QueueName): Promise<Job[]>;
}
```

### 5. SOS High-Availability Service

**Purpose:** Zero-failure emergency alert system with multi-channel redundancy.

**Interface:**
```typescript
interface SOSHighAvailabilityService {
  // Trigger with guaranteed persistence
  triggerSOS(params: SOSTriggerParams): Promise<SOSAlert>;
  
  // Multi-channel notification
  notifyAllChannels(alertId: string): Promise<NotificationResults>;
  
  // Continuous tracking (Redis-backed, survives restarts)
  startPersistentTracking(alertId: string): Promise<void>;
  stopTracking(alertId: string): Promise<void>;
  
  // Escalation
  scheduleEscalation(alertId: string, delayMs: number): Promise<void>;
  escalateToOnCall(alertId: string): Promise<void>;
}
```

## Data Models

### Redis Data Structures

```javascript
// Location Cache (Hash)
// Key: location:{tripId}
{
  lat: "28.6139",
  lng: "77.2090",
  speed: "45",
  timestamp: "1702123456789",
  driverId: "driver_123"
}

// Active Drivers Geo Index
// Key: active-drivers (Sorted Set with GEO)
// GEOADD active-drivers 77.2090 28.6139 "driver_123"

// Session Cache (Hash)
// Key: session:{userId}
{
  token: "jwt_token_here",
  role: "passenger",
  expiresAt: "1702209856789"
}

// SOS Tracking (Hash with TTL)
// Key: sos:tracking:{alertId}
{
  tripId: "trip_123",
  status: "active",
  startedAt: "1702123456789",
  lastLocation: "{\"lat\":28.6139,\"lng\":77.2090}"
}

// Pub/Sub Channels
// trip:{tripId} - Location updates for trip subscribers
// sos:alerts - SOS alerts to all admin dashboards
// user:{userId} - User-specific notifications
```

### MongoDB Sharding Strategy

```javascript
// Shard Key: { region: 1, createdAt: 1 }
// This distributes data by geography and time for optimal query performance

// Trips Collection Indexes
db.trips.createIndex({ status: 1, "source.city": 1, departureTime: 1 });
db.trips.createIndex({ driver: 1, status: 1 });
db.trips.createIndex({ "source.coordinates": "2dsphere" });
db.trips.createIndex({ "destination.coordinates": "2dsphere" });

// Users Collection Indexes
db.users.createIndex({ phone: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { sparse: true });

// Bookings Collection Indexes
db.bookings.createIndex({ passengerId: 1, status: 1 });
db.bookings.createIndex({ tripId: 1, status: 1 });
db.bookings.createIndex({ createdAt: -1 });
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Location Update Consistency
*For any* location update sent by a driver, if the update is acknowledged, then querying the location within 100ms should return the same coordinates.
**Validates: Requirements 2.1, 2.3**

### Property 2: WebSocket Message Delivery
*For any* message broadcast to a room, all connected clients in that room should receive the message within 500ms of broadcast initiation.
**Validates: Requirements 2.4**

### Property 3: SOS Persistence Before Notification
*For any* SOS trigger, the alert must be persisted to the database before any notification channel is attempted, ensuring no alert is lost even if all notifications fail.
**Validates: Requirements 3.1**

### Property 4: Message Queue Reliability
*For any* job added to the message queue, if the add operation returns success, the job will eventually be processed or marked as failed after all retries are exhausted.
**Validates: Requirements 5.1, 5.2**

### Property 5: Rate Limiting Fairness
*For any* two users with the same rate limit tier, exceeding the rate limit for one user should not affect the other user's ability to make requests.
**Validates: Requirements 6.1**

### Property 6: Secret Rotation Continuity
*For any* API key rotation, the system should accept both old and new keys during a 5-minute transition window, ensuring zero failed requests due to rotation.
**Validates: Requirements 7.2**

### Property 7: Deployment Zero Downtime
*For any* deployment, the total number of healthy instances serving traffic should never drop below 50% of the pre-deployment count.
**Validates: Requirements 8.3**

### Property 8: Failover Data Consistency
*For any* failover event, data written before the failure should be available after failover completes, with at most 1 hour of data loss for non-critical data.
**Validates: Requirements 12.4**

## Error Handling

### Circuit Breaker Pattern

```javascript
const circuitBreakerConfig = {
  services: {
    mongodb: { threshold: 5, timeout: 30000, resetTimeout: 60000 },
    redis: { threshold: 3, timeout: 5000, resetTimeout: 30000 },
    twilio: { threshold: 10, timeout: 10000, resetTimeout: 120000 },
    sendgrid: { threshold: 10, timeout: 10000, resetTimeout: 120000 }
  },
  fallbacks: {
    mongodb: 'return cached data or queue for retry',
    redis: 'fallback to MongoDB for critical operations',
    twilio: 'fallback to alternative SMS provider (MSG91)',
    sendgrid: 'fallback to alternative email provider (Mailgun)'
  }
};
```

### Graceful Degradation

| Service Down | Degraded Behavior | User Impact |
|--------------|-------------------|-------------|
| Redis | Use MongoDB for sessions, disable real-time features | Delayed location updates |
| MongoDB | Read from replicas, queue writes | Slower searches, delayed bookings |
| Twilio | Use MSG91 backup | SMS may be delayed |
| WebSocket | Fall back to polling | Higher latency tracking |
| Kafka/Queue | Direct processing with retry | Possible notification delays |

## Testing Strategy

### Unit Testing
- Test individual service methods with mocked dependencies
- Test Redis data structure operations
- Test circuit breaker state transitions
- Test rate limiting logic

### Property-Based Testing (fast-check)
- Location update consistency across concurrent updates
- Message queue job processing guarantees
- Rate limiting fairness under load
- Failover data consistency

### Integration Testing
- End-to-end WebSocket connection and messaging
- Redis cluster failover scenarios
- MongoDB sharding query distribution
- Message queue processing with real Redis

### Load Testing (k6/Artillery)
- 100,000 concurrent WebSocket connections
- 500,000 location updates per minute
- 10,000 API requests per second
- SOS trigger under maximum load

### Chaos Engineering
- Random pod/instance termination
- Network partition simulation
- Redis node failure
- MongoDB primary failover
