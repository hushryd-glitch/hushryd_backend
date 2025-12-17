# HushRyd Load Testing Infrastructure

This directory contains k6 load testing scripts for validating system performance under high load.

## Prerequisites

1. Install k6: https://k6.io/docs/getting-started/installation/
   - Windows: `choco install k6` or `winget install k6`
   - macOS: `brew install k6`
   - Linux: See k6 documentation

2. Set environment variables:
   ```bash
   export BASE_URL=http://localhost:3000
   export WS_URL=ws://localhost:3000
   ```

## Test Scripts

| Script | Description | Target |
|--------|-------------|--------|
| `concurrent-users.js` | 10K concurrent users simulation | Requirements 10.1 |
| `document-upload.js` | 7K concurrent document uploads | Requirements 10.2 |
| `websocket-tracking.js` | 3K WebSocket tracking sessions | Requirements 10.3 |
| `full-load-test.js` | Combined load test scenario | All requirements |

## Running Tests

### Individual Tests
```bash
# 10K concurrent users test
k6 run load-tests/concurrent-users.js

# 7K document upload test
k6 run load-tests/document-upload.js

# 3K WebSocket tracking test
k6 run load-tests/websocket-tracking.js
```

### Full Load Test
```bash
k6 run load-tests/full-load-test.js
```

### With Custom Options
```bash
# Override VUs and duration
k6 run --vus 100 --duration 30s load-tests/concurrent-users.js

# Output to JSON for analysis
k6 run --out json=results.json load-tests/full-load-test.js
```

## SLA Thresholds

| Metric | Threshold | Requirement |
|--------|-----------|-------------|
| HTTP response time (p95) | < 2000ms | 10.1 |
| HTTP failure rate | < 1% | 10.1 |
| WebSocket latency (p95) | < 500ms | 10.3 |
| Upload processing time | < 30 min total | 10.2 |

## CI/CD Integration

Load tests are integrated into the deployment pipeline:
- Runs before production deployment
- Blocks deployment if SLA thresholds are breached
- Generates performance reports for analysis
