/**
 * Performance Benchmarks and SLA Thresholds
 * Validates: Requirements 10.4
 * 
 * Defines SLA thresholds and generates automated performance reports.
 */

// SLA Thresholds based on requirements
export const SLA_THRESHOLDS = {
  // Requirement 10.1: 10K concurrent users
  api: {
    responseTime: {
      p50: 500,    // 50th percentile: 500ms
      p95: 2000,   // 95th percentile: 2 seconds
      p99: 5000,   // 99th percentile: 5 seconds
    },
    errorRate: 0.01,           // 1% max error rate
    throughput: 100,           // Minimum 100 req/sec
  },
  
  // Requirement 10.2: 7K concurrent uploads
  upload: {
    presignedUrlTime: {
      p50: 200,
      p95: 500,
      p99: 1000,
    },
    processingTime: 1800,      // 30 minutes max for all uploads
    errorRate: 0.01,
    queueDepthMax: 10000,
  },
  
  // Requirement 10.3: 3K WebSocket connections
  websocket: {
    connectionSuccessRate: 0.95, // 95% connection success
    messageLatency: {
      p50: 100,
      p95: 500,
      p99: 1000,
    },
    reconnectTime: 3000,       // 3 seconds max reconnect
  },
  
  // Database performance
  database: {
    queryTime: {
      p50: 50,
      p95: 200,
      p99: 500,
    },
    connectionPoolUtilization: 0.8, // 80% max
  },
  
  // Cache performance
  cache: {
    hitRate: 0.8,              // 80% cache hit rate
    latency: {
      p50: 5,
      p95: 20,
      p99: 50,
    },
  },
};

// k6 threshold configuration derived from SLA
export const K6_THRESHOLDS = {
  // HTTP thresholds
  http_req_duration: [
    `p(50)<${SLA_THRESHOLDS.api.responseTime.p50}`,
    `p(95)<${SLA_THRESHOLDS.api.responseTime.p95}`,
    `p(99)<${SLA_THRESHOLDS.api.responseTime.p99}`,
  ],
  http_req_failed: [`rate<${SLA_THRESHOLDS.api.errorRate}`],
  http_reqs: [`rate>${SLA_THRESHOLDS.api.throughput}`],
  
  // WebSocket thresholds
  ws_connecting: [`p(95)<${SLA_THRESHOLDS.websocket.messageLatency.p95}`],
  ws_session_duration: ['p(95)>10000'], // Sessions should last > 10s
  
  // Custom metric thresholds
  presigned_url_latency: [
    `p(50)<${SLA_THRESHOLDS.upload.presignedUrlTime.p50}`,
    `p(95)<${SLA_THRESHOLDS.upload.presignedUrlTime.p95}`,
  ],
  location_update_latency: [
    `p(50)<${SLA_THRESHOLDS.websocket.messageLatency.p50}`,
    `p(95)<${SLA_THRESHOLDS.websocket.messageLatency.p95}`,
  ],
};

// Performance report template
export function generateReport(metrics) {
  const timestamp = new Date().toISOString();
  
  return {
    timestamp,
    summary: {
      status: evaluateOverallStatus(metrics),
      duration: metrics.duration,
      totalRequests: metrics.totalRequests,
      errorRate: metrics.errorRate,
    },
    
    slaCompliance: {
      api: {
        responseTime: {
          p95: metrics.httpDuration?.p95 || 0,
          threshold: SLA_THRESHOLDS.api.responseTime.p95,
          passed: (metrics.httpDuration?.p95 || 0) < SLA_THRESHOLDS.api.responseTime.p95,
        },
        errorRate: {
          actual: metrics.errorRate || 0,
          threshold: SLA_THRESHOLDS.api.errorRate,
          passed: (metrics.errorRate || 0) < SLA_THRESHOLDS.api.errorRate,
        },
      },
      upload: {
        presignedUrlTime: {
          p95: metrics.presignedUrlLatency?.p95 || 0,
          threshold: SLA_THRESHOLDS.upload.presignedUrlTime.p95,
          passed: (metrics.presignedUrlLatency?.p95 || 0) < SLA_THRESHOLDS.upload.presignedUrlTime.p95,
        },
      },
      websocket: {
        latency: {
          p95: metrics.wsLatency?.p95 || 0,
          threshold: SLA_THRESHOLDS.websocket.messageLatency.p95,
          passed: (metrics.wsLatency?.p95 || 0) < SLA_THRESHOLDS.websocket.messageLatency.p95,
        },
      },
    },
    
    bottlenecks: identifyBottlenecks(metrics),
    recommendations: generateRecommendations(metrics),
  };
}

function evaluateOverallStatus(metrics) {
  const checks = [
    (metrics.httpDuration?.p95 || 0) < SLA_THRESHOLDS.api.responseTime.p95,
    (metrics.errorRate || 0) < SLA_THRESHOLDS.api.errorRate,
    (metrics.wsLatency?.p95 || Infinity) < SLA_THRESHOLDS.websocket.messageLatency.p95,
  ];
  
  const passedCount = checks.filter(Boolean).length;
  
  if (passedCount === checks.length) return 'PASSED';
  if (passedCount >= checks.length * 0.7) return 'WARNING';
  return 'FAILED';
}

function identifyBottlenecks(metrics) {
  const bottlenecks = [];
  
  if ((metrics.httpDuration?.p95 || 0) > SLA_THRESHOLDS.api.responseTime.p95) {
    bottlenecks.push({
      area: 'API Response Time',
      severity: 'HIGH',
      metric: `p95: ${metrics.httpDuration?.p95}ms`,
      threshold: `${SLA_THRESHOLDS.api.responseTime.p95}ms`,
    });
  }
  
  if ((metrics.errorRate || 0) > SLA_THRESHOLDS.api.errorRate) {
    bottlenecks.push({
      area: 'Error Rate',
      severity: 'CRITICAL',
      metric: `${(metrics.errorRate * 100).toFixed(2)}%`,
      threshold: `${SLA_THRESHOLDS.api.errorRate * 100}%`,
    });
  }
  
  if ((metrics.dbPoolUtilization || 0) > SLA_THRESHOLDS.database.connectionPoolUtilization) {
    bottlenecks.push({
      area: 'Database Connection Pool',
      severity: 'HIGH',
      metric: `${(metrics.dbPoolUtilization * 100).toFixed(1)}%`,
      threshold: `${SLA_THRESHOLDS.database.connectionPoolUtilization * 100}%`,
    });
  }
  
  return bottlenecks;
}

function generateRecommendations(metrics) {
  const recommendations = [];
  
  if ((metrics.httpDuration?.p95 || 0) > SLA_THRESHOLDS.api.responseTime.p95) {
    recommendations.push({
      priority: 'HIGH',
      action: 'Optimize slow API endpoints',
      details: 'Consider adding caching, optimizing database queries, or scaling horizontally',
    });
  }
  
  if ((metrics.cacheHitRate || 1) < SLA_THRESHOLDS.cache.hitRate) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Improve cache hit rate',
      details: 'Review cache TTLs and consider caching more frequently accessed data',
    });
  }
  
  if ((metrics.wsConnectionErrors || 0) > 0.05) {
    recommendations.push({
      priority: 'HIGH',
      action: 'Investigate WebSocket connection failures',
      details: 'Check Socket.io server capacity and Redis pub/sub performance',
    });
  }
  
  return recommendations;
}

// Export for use in k6 tests
export default {
  SLA_THRESHOLDS,
  K6_THRESHOLDS,
  generateReport,
};
