# Design Document

## Overview

This design outlines the complete CI/CD pipeline architecture for HushRyd platform with separate pipelines for backend, frontend, and mobile app. It covers GitHub Actions workflows, environment management, API key security, cross-platform session sync, and automated deployments with rollback capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              GITHUB REPOSITORY                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │ backend/    │  │ frontend/   │  │ mobile-app/ │  │ .github/    │                │
│  │             │  │             │  │             │  │ workflows/  │                │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘                │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           GITHUB ACTIONS CI/CD                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ backend-ci.yml   │  │ frontend-ci.yml  │  │ mobile-ci.yml    │                  │
│  │ - Lint & Test    │  │ - Lint & Test    │  │ - Lint & Test    │                  │
│  │ - Build Docker   │  │ - Build Next.js  │  │ - EAS Build      │                  │
│  │ - Security Scan  │  │ - Lighthouse     │  │ - OTA Update     │                  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           DEPLOYMENT TARGETS                                        │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         DEVELOPMENT (develop branch)                         │   │
│  │  Backend: dev-api.hushryd.com (Render/Railway)                              │   │
│  │  Frontend: dev.hushryd.com (Vercel Preview)                                 │   │
│  │  Mobile: Development Build (EAS)                                            │   │
│  │  Database: MongoDB Atlas (dev cluster)                                      │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                              │
│                                      ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         STAGING (staging branch)                             │   │
│  │  Backend: staging-api.hushryd.com (AWS ECS)                                 │   │
│  │  Frontend: staging.hushryd.com (Vercel)                                     │   │
│  │  Mobile: TestFlight / Play Console Internal                                 │   │
│  │  Database: MongoDB Atlas (staging cluster)                                  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                              │
│                                      ▼ (Manual Approval Required)                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         PRODUCTION (main branch)                             │   │
│  │  Backend: api.hushryd.com (AWS ECS + ALB)                                   │   │
│  │  Frontend: hushryd.com (Vercel + CloudFront)                                │   │
│  │  Mobile: App Store / Play Store                                             │   │
│  │  Database: MongoDB Atlas (production cluster - sharded)                     │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Branch Strategy

```
main (production)
  │
  ├── staging (pre-production testing)
  │     │
  │     └── develop (integration)
  │           │
  │           ├── feature/user-auth
  │           ├── feature/sos-alerts
  │           ├── bugfix/booking-issue
  │           └── hotfix/critical-fix (→ main directly)
```

## Components and Interfaces

### 1. API Key Management

```javascript
// API Key Structure
interface APIKey {
  keyId: string;           // Unique identifier
  hashedKey: string;       // SHA-256 hash of actual key
  environment: 'dev' | 'staging' | 'prod';
  platform: 'mobile' | 'web' | 'admin';
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  revokedAt?: Date;
}

// API Key Validation Middleware
interface APIKeyValidator {
  validateKey(key: string): Promise<boolean>;
  getKeyMetadata(key: string): Promise<APIKey | null>;
  revokeKey(keyId: string): Promise<void>;
  rotateKey(keyId: string): Promise<{ oldKey: string; newKey: string }>;
}
```

### 2. Session Sync Service

```javascript
// Cross-Platform Session
interface UserSession {
  sessionId: string;
  userId: string;
  phone: string;
  role: 'passenger' | 'driver' | 'admin';
  devices: DeviceSession[];
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}

interface DeviceSession {
  deviceId: string;
  platform: 'web' | 'ios' | 'android';
  deviceInfo: string;
  lastActiveAt: Date;
  pushToken?: string;
}

interface SessionSyncService {
  createSession(userId: string, device: DeviceSession): Promise<UserSession>;
  syncSession(phone: string, newDevice: DeviceSession): Promise<UserSession>;
  getActiveDevices(userId: string): Promise<DeviceSession[]>;
  terminateSession(sessionId: string): Promise<void>;
  terminateAllSessions(userId: string): Promise<void>;
}
```

### 3. Environment Configuration

```javascript
// Environment Variables Structure
interface EnvironmentConfig {
  // API Configuration
  API_URL: string;
  API_KEY: string;
  API_VERSION: string;
  
  // Database
  MONGODB_URI: string;
  REDIS_URL: string;
  
  // External Services
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  SENDGRID_API_KEY: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  S3_BUCKET: string;
  
  // Security
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  
  // Feature Flags
  ENABLE_SOS: boolean;
  ENABLE_MASK_CALLING: boolean;
}
```

## Environment Files Structure

```
backend/
├── .env.example          # Template with all required vars (committed)
├── .env.development      # Local dev (gitignored)
├── .env.test            # Test environment (gitignored)
└── .env                 # Production secrets (gitignored, from Secrets Manager)

frontend/
├── .env.example
├── .env.local           # Local dev (gitignored)
└── .env.production      # Production (injected by Vercel)

mobile-app/
├── .env.example
├── .env.development     # Dev builds
├── .env.staging         # Staging builds
└── .env.production      # Production builds (EAS secrets)
```

## CI/CD Workflow Files

### Backend CI/CD (.github/workflows/backend.yml)

```yaml
name: Backend CI/CD

on:
  push:
    branches: [develop, staging, main]
    paths: ['backend/**']
  pull_request:
    branches: [develop]
    paths: ['backend/**']

env:
  NODE_VERSION: '18'
  
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - name: Install dependencies
        run: cd backend && npm ci
      - name: Run linting
        run: cd backend && npm run lint
      - name: Run tests
        run: cd backend && npm test
      - name: Security scan
        run: cd backend && npm audit --audit-level=high

  deploy-dev:
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: development
    steps:
      - name: Deploy to Development
        # Deploy to Render/Railway

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Staging
        # Deploy to AWS ECS Staging

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Production
        # Blue-green deployment to AWS ECS
```

### Frontend CI/CD (.github/workflows/frontend.yml)

```yaml
name: Frontend CI/CD

on:
  push:
    branches: [develop, staging, main]
    paths: ['frontend/**']
  pull_request:
    branches: [develop]
    paths: ['frontend/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
      - name: Install & Test
        run: cd frontend && npm ci && npm run lint && npm test
      - name: Build
        run: cd frontend && npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

### Mobile CI/CD (.github/workflows/mobile.yml)

```yaml
name: Mobile CI/CD

on:
  push:
    branches: [develop, staging, main]
    paths: ['mobile-app/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
      - name: Install & Test
        run: cd mobile-app && npm ci && npm test

  build-dev:
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - name: Build Development
        run: cd mobile-app && eas build --platform all --profile development --non-interactive

  build-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - name: Build & Submit to TestFlight/Internal
        run: cd mobile-app && eas build --platform all --profile preview --non-interactive

  build-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Build & Submit to Stores
        run: cd mobile-app && eas build --platform all --profile production --auto-submit --non-interactive
```

## Data Models

### Deployment Record (MongoDB)

```javascript
{
  _id: ObjectId,
  deploymentId: String,
  service: 'backend' | 'frontend' | 'mobile-ios' | 'mobile-android',
  environment: 'development' | 'staging' | 'production',
  version: String,
  gitCommit: String,
  gitBranch: String,
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back',
  startedAt: Date,
  completedAt: Date,
  deployedBy: String,
  rollbackOf: ObjectId, // Reference to deployment being rolled back
  metrics: {
    buildTime: Number,
    deployTime: Number,
    testsPassed: Number,
    testsFailed: Number
  },
  error: String
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system.*

### Property 1: API Key Validation Consistency
*For any* API request with a valid API key, the request SHALL be accepted; for any request with invalid/missing key, the request SHALL be rejected with 401.
**Validates: Requirements 5.1, 5.2**

### Property 2: Session Sync Integrity
*For any* user logging in on a new device with the same phone number, all existing bookings and profile data SHALL be accessible within 5 seconds.
**Validates: Requirements 6.2, 6.3**

### Property 3: Environment Isolation
*For any* deployment, secrets from one environment SHALL never be accessible in another environment.
**Validates: Requirements 7.1, 7.4**

### Property 4: Deployment Atomicity
*For any* deployment, either all steps complete successfully OR the system rolls back to previous state with no partial deployment.
**Validates: Requirements 2.4, 12.1**

### Property 5: Secret Protection
*For any* code commit, if secrets are detected in the diff, the CI pipeline SHALL fail and block merge.
**Validates: Requirements 7.2, 11.4**

## Error Handling

### Deployment Failures
- Build failure → Block deployment, notify team, provide logs
- Test failure → Block deployment, show failing tests
- Health check failure → Auto-rollback within 60 seconds
- Migration failure → Halt deployment, preserve database state

### API Key Errors
- Invalid key → Return 401 with generic message (no key details)
- Expired key → Return 401, log for monitoring
- Rate limited → Return 429 with retry-after header

### Session Sync Errors
- Device limit exceeded → Prompt to logout other devices
- Session expired → Redirect to login on all platforms
- Sync conflict → Use server state as source of truth

## Testing Strategy

### CI Pipeline Tests
- Unit tests for all services
- Integration tests for API endpoints
- Security scans (npm audit, Snyk)
- Linting and type checking

### Deployment Tests
- Smoke tests after each deployment
- Health check endpoints
- Database connectivity verification
- External service connectivity

### Mobile Specific
- Build verification on both platforms
- OTA update integrity checks
- API connectivity tests
