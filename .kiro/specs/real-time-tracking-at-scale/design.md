# Design Document

## Overview

This design document outlines the architecture for scaling HushRyd to handle 1 lakh concurrent users with real-time location tracking, 30K simultaneous SOS alerts, multi-channel notifications, mask calling, and real-time admin dashboard. The architecture uses Redis for caching/pub-sub, horizontally scaled WebSocket servers, priority queues for SOS, and CDN-backed document uploads.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENTS                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Web App    │  │ Mobile App  │  │ Admin Panel │  │ Driver App  │                │
│  │  (40K)      │  │  (60K)      │  │  (100)      │  │  (10K)      │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           AWS APPLICATION LOAD BALANCER                             │
│                    (Sticky Sessions for WebSocket, Health Checks)                   │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │
          ├──────────────────────────────────────────────────────────────┐
          │                                                              │
          ▼                                                              ▼
┌─────────────────────────────────────────┐    ┌─────────────────────────────────────┐
│         API SERVER CLUSTER              │    │      WEBSOCKET SERVER CLUSTER       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │    │  ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │ API-1   │ │ API-2   │ │ API-3   │   │    │  │ WS-1    │ │ WS-2    │ │ WS-8   ││
│  │ (REST)  │ │ (REST)  │ │ (REST)  │   │    │  │ (12.5K) │ │ (12.5K) │ │(12.5K) ││
│  └─────────┘ └─────────┘ └─────────┘   │    │  └─────────┘ └─────────┘ └────────┘│
└─────────────────────────────────────────┘    └─────────────────────────────────────┘
          │                                                              │
          └──────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              REDIS CLUSTER                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Sessions     │  │ Location     │  │ Pub/Sub      │  │ Rate Limit   │            │
│  │ (Hash)       │  │ (GeoSet)     │  │ (Channels)   │  │ (Sorted Set) │            │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                              │
│  │ Emergency    │  │ Socket Rooms │  │ Cache        │                              │
│  │ Contacts     │  │ (Set)        │  │ (String)     │                              │
│  └──────────────┘  └──────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MESSAGE QUEUES (Bull + Redis)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ SOS Queue        │  │ Notification     │  │ Document         │                  │
│  │ (Priority: 1)    │  │ Queue            │  │ Processing Queue │                  │
│  │ Workers: 4       │  │ Workers: 8       │  │ Workers: 4       │                  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │ Twilio      │  │ SendGrid    │  │ WhatsApp    │  │ Exotel      │                │
│  │ (SMS/Call)  │  │ (Email)     │  │ Business    │  │ (Mask Call) │                │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐                  │
│  │ MongoDB Atlas (M50 Sharded) │  │ AWS S3 + CloudFront CDN     │                  │
│  │ - Primary + 2 Replicas      │  │ - Documents, Images         │                  │
│  │ - Read from secondaries     │  │ - Edge caching              │                  │
│  └─────────────────────────────┘  └─────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Location Batch Processor

```javascript
interface LocationUpdate {
  userId: string;
  tripId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number;
  heading: number;
  timestamp: number;
}

interface LocationBatchProcessor {
  receiveLocation(update: LocationUpdate): Promise<void>;
  processBatch(): Promise<void>;
  getLatestLocation(tripId: string): Promise<LocationUpdate | null>;
}
```

### 2. SOS Priority Handler

```javascript
interface SOSAlert {
  id: string;
  userId: string;
  tripId: string;
  bookingId: string;
  location: { lat: number; lng: number; accuracy: number };
  triggeredAt: Date;
  status: 'active' | 'responding' | 'resolved';
  emergencyContacts: EmergencyContact[];
}

interface SOSPriorityHandler {
  triggerSOS(userId: string, tripId: string, location: Location): Promise<SOSAlert>;
  processSOSQueue(): Promise<void>;
  notifyEmergencyContacts(alert: SOSAlert): Promise<void>;
  notifyAdminDashboard(alert: SOSAlert): Promise<void>;
}
```

### 3. Notification Hub

```javascript
interface NotificationPayload {
  userId: string;
  type: 'sms' | 'email' | 'whatsapp' | 'push';
  template: string;
  data: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
}

interface NotificationHub {
  sendSMS(phone: string, message: string): Promise<boolean>;
  sendEmail(email: string, subject: string, body: string): Promise<boolean>;
  sendWhatsApp(phone: string, templateId: string, params: any[]): Promise<boolean>;
  sendPush(userId: string, title: string, body: string): Promise<boolean>;
  queueNotification(payload: NotificationPayload): Promise<string>;
}
```

### 4. Mask Calling Service

```javascript
interface MaskCallSession {
  sessionId: string;
  tripId: string;
  passengerPhone: string;
  driverPhone: string;
  virtualNumber: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired';
}

interface MaskCallingService {
  createSession(tripId: string, passengerId: string, driverId: string): Promise<MaskCallSession>;
  initiateCall(sessionId: string, caller: 'passenger' | 'driver'): Promise<string>;
  endSession(sessionId: string): Promise<void>;
  getCallLogs(tripId: string): Promise<CallLog[]>;
}
```

### 5. Document Upload Pipeline

```javascript
interface UploadRequest {
  userId: string;
  documentType: 'license' | 'rc' | 'insurance' | 'photo' | 'aadhar';
  fileName: string;
  contentType: string;
}

interface DocumentUploadPipeline {
  getPresignedUrl(request: UploadRequest): Promise<{ url: string; key: string }>;
  processUpload(key: string): Promise<void>;
  getDocumentUrl(key: string): Promise<string>;
  deleteDocument(key: string): Promise<void>;
}
```

### 6. WebSocket Manager

```javascript
interface WebSocketManager {
  joinTripRoom(socketId: string, tripId: string): Promise<void>;
  leaveTripRoom(socketId: string, tripId: string): Promise<void>;
  broadcastToTrip(tripId: string, event: string, data: any): Promise<void>;
  broadcastToAdmin(event: string, data: any): Promise<void>;
  getConnectionCount(): Promise<number>;
}
```

## Data Models

### Location Stream (Redis)
```
Key: location_stream
Type: Stream
Fields: userId, tripId, lat, lng, accuracy, speed, timestamp
TTL: 1 hour (auto-trimmed)
```

### Active Trips Geo Index (Redis)
```
Key: active_trips_geo
Type: GeoSet
Members: trip:{tripId}
Coordinates: [lng, lat]
```

### Session Store (Redis)
```
Key: session:{userId}
Type: Hash
Fields: token, role, deviceId, lastActive
TTL: 24 hours
```

### Emergency Contacts Cache (Redis)
```
Key: emergency:{userId}
Type: List
Values: JSON encoded contact objects
TTL: 1 hour
```

### SOS Alert (MongoDB)
```javascript
{
  _id: ObjectId,
  alertId: String (indexed),
  userId: ObjectId (indexed),
  tripId: ObjectId (indexed),
  bookingId: ObjectId,
  location: {
    type: "Point",
    coordinates: [lng, lat]
  },
  accuracy: Number,
  triggeredAt: Date (indexed),
  status: String (indexed),
  respondedAt: Date,
  resolvedAt: Date,
  notificationsSent: [{
    channel: String,
    recipient: String,
    sentAt: Date,
    status: String
  }],
  adminNotes: String
}
```

### Location History (MongoDB Time-Series)
```javascript
{
  metadata: { tripId: ObjectId, userId: ObjectId },
  timestamp: Date,
  location: { type: "Point", coordinates: [lng, lat] },
  speed: Number,
  accuracy: Number
}
// TTL: 30 days
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Location Update Delivery Consistency
*For any* location update sent by a driver, if there are N subscribers to that trip room across M WebSocket servers, all N subscribers SHALL receive the update within 100ms of the update being processed.
**Validates: Requirements 1.3, 2.5**

### Property 2: SOS Processing Time Guarantee
*For any* SOS alert triggered, the time from trigger to completion of all parallel operations (database write, admin notification, emergency SMS) SHALL be less than 500ms under any load condition up to 30,000 concurrent SOS alerts.
**Validates: Requirements 3.2, 3.3**

### Property 3: Location Batching Idempotency
*For any* sequence of location updates from the same user within a batch window, only the latest location SHALL be stored and broadcast, ensuring that processing the same batch twice produces identical results.
**Validates: Requirements 2.3**

### Property 4: Notification Delivery Guarantee
*For any* notification queued with high priority, the notification SHALL be delivered via at least one channel within 60 seconds, or a failure SHALL be logged with retry scheduled.
**Validates: Requirements 4.5, 4.6**

### Property 5: Mask Call Privacy Preservation
*For any* mask call session, neither party's real phone number SHALL be exposed to the other party at any point during or after the call.
**Validates: Requirements 6.1, 6.4**

### Property 6: Document Upload Atomicity
*For any* document upload, either the complete upload succeeds (file in S3, record in DB, admin notified) or the entire operation is rolled back with no partial state.
**Validates: Requirements 5.4**

### Property 7: WebSocket Connection Distribution
*For any* set of N concurrent WebSocket connections, the distribution across M servers SHALL be within 10% of N/M per server, ensuring balanced load.
**Validates: Requirements 1.1**

### Property 8: Redis Cache Consistency
*For any* data update (profile, emergency contacts), the corresponding Redis cache entry SHALL be invalidated within 1 second, ensuring subsequent reads return fresh data.
**Validates: Requirements 8.3**

### Property 9: Admin Dashboard Update Ordering
*For any* sequence of events (bookings, SOS, uploads), the admin dashboard SHALL display them in the exact order they occurred, with no event appearing before an earlier event.
**Validates: Requirements 7.1, 7.2, 7.3**

### Property 10: Session Consistency Across Servers
*For any* authenticated user session, the session data SHALL be accessible from any API or WebSocket server in the cluster with identical values.
**Validates: Requirements 8.1, 8.6**

## Error Handling

### Location Update Failures
- Buffer locally on client if WebSocket disconnected
- Retry connection with exponential backoff (1s, 2s, 4s, max 30s)
- Sync buffered updates on reconnection

### SOS Processing Failures
- Immediate retry on any failure (max 3 attempts)
- If all retries fail, escalate to backup notification channel
- Log all failures with full context for investigation
- Never silently fail - always notify operations team

### Notification Failures
- Primary channel failure → try secondary channel
- SMS: Twilio → MSG91 fallback
- Email: SendGrid → AWS SES fallback
- WhatsApp: Retry with exponential backoff
- Log all failures with delivery status

### Document Upload Failures
- Client-side retry for network errors
- Server validates file integrity via checksum
- Failed virus scan → reject with user notification
- S3 upload failure → return error, no partial state

### Database Failures
- Read failures → retry from replica
- Write failures → queue for retry, return optimistic response
- Connection pool exhaustion → circuit breaker pattern

## Testing Strategy

### Property-Based Testing (fast-check)
- Test location batching with random update sequences
- Test SOS processing with concurrent alert generation
- Test notification routing with random channel failures
- Test WebSocket distribution with random connection patterns

### Load Testing (k6/Artillery)
- Simulate 1 lakh concurrent WebSocket connections
- Generate 25,000 location updates per second
- Trigger 30,000 concurrent SOS alerts
- Upload 5,000 documents simultaneously

### Integration Testing
- End-to-end location tracking flow
- SOS trigger to admin notification flow
- Document upload to CDN delivery flow
- Mask call establishment and teardown

### Chaos Testing
- Kill random WebSocket servers during load
- Simulate Redis failover
- Introduce network latency between services
- Simulate notification provider outages
