/**
 * Performance Report Generator
 * Validates: Requirements 10.4
 * 
 * Generates automated performance reports with bottleneck analysis.
 */

import { SLA_THRESHOLDS } from './benchmarks.js';

/**
 * Parse k6 JSON output and generate performance report
 * Usage: k6 run --out json=results.json test.js && node report-generator.js results.json
 */

export function parseK6Results(jsonData) {
  const metrics = {
    duration: 0,
    totalRequests: 0,
    errorRate: 0,
    httpDuration: { p50: 0, p95: 0, p99: 0, avg: 0 },
    presignedUrlLatency: { p50: 0, p95: 0, p99: 0 },
    wsLatency: { p50: 0, p95: 0, p99: 0 },
    throughput: 0,
  };
  
  // Parse k6 metrics from JSON output
  if (jsonData.metrics) {
    const m = jsonData.metrics;
    
    if (m.http_req_duration) {
      metrics.httpDuration = {
        p50: m.http_req_duration.values?.['p(50)'] || 0,
        p95: m.http_req_duration.values?.['p(95)'] || 0,
        p99: m.http_req_duration.values?.['p(99)'] || 0,
        avg: m.http_req_duration.values?.avg || 0,
      };
    }
    
    if (m.http_req_failed) {
      metrics.errorRate = m.http_req_failed.values?.rate || 0;
    }
    
    if (m.http_reqs) {
      metrics.totalRequests = m.http_reqs.values?.count || 0;
      metrics.throughput = m.http_reqs.values?.rate || 0;
    }
    
    if (m.presigned_url_latency) {
      metrics.presignedUrlLatency = {
        p50: m.presigned_url_latency.values?.['p(50)'] || 0,
        p95: m.presigned_url_latency.values?.['p(95)'] || 0,
        p99: m.presigned_url_latency.values?.['p(99)'] || 0,
      };
    }
    
    if (m.location_update_latency || m.ws_message_latency) {
      const wsMetric = m.location_update_latency || m.ws_message_latency;
      metrics.wsLatency = {
        p50: wsMetric.values?.['p(50)'] || 0,
        p95: wsMetric.values?.['p(95)'] || 0,
        p99: wsMetric.values?.['p(99)'] || 0,
      };
    }
  }
  
  return metrics;
}

export function generateTextReport(metrics) {
  const lines = [];
  const timestamp = new Date().toISOString();
  
  lines.push('═'.repeat(60));
  lines.push('         HUSHRYD LOAD TEST PERFORMANCE REPORT');
  lines.push('═'.repeat(60));
  lines.push(`Generated: ${timestamp}`);
  lines.push('');
  
  // Overall Status
  const status = evaluateStatus(metrics);
  lines.push(`Overall Status: ${status}`);
  lines.push('─'.repeat(60));
  
  // Summary
  lines.push('');
  lines.push('SUMMARY');
  lines.push('─'.repeat(30));
  lines.push(`Total Requests:     ${metrics.totalRequests.toLocaleString()}`);
  lines.push(`Throughput:         ${metrics.throughput.toFixed(2)} req/s`);
  lines.push(`Error Rate:         ${(metrics.errorRate * 100).toFixed(3)}%`);
  lines.push('');
  
  // API Performance
  lines.push('API PERFORMANCE');
  lines.push('─'.repeat(30));
  lines.push(`Response Time (p50): ${metrics.httpDuration.p50.toFixed(0)}ms ${checkThreshold(metrics.httpDuration.p50, SLA_THRESHOLDS.api.responseTime.p50)}`);
  lines.push(`Response Time (p95): ${metrics.httpDuration.p95.toFixed(0)}ms ${checkThreshold(metrics.httpDuration.p95, SLA_THRESHOLDS.api.responseTime.p95)}`);
  lines.push(`Response Time (p99): ${metrics.httpDuration.p99.toFixed(0)}ms ${checkThreshold(metrics.httpDuration.p99, SLA_THRESHOLDS.api.responseTime.p99)}`);
  lines.push(`Error Rate:          ${(metrics.errorRate * 100).toFixed(3)}% ${checkThreshold(metrics.errorRate, SLA_THRESHOLDS.api.errorRate)}`);
  lines.push('');
  
  // Upload Performance
  if (metrics.presignedUrlLatency.p95 > 0) {
    lines.push('UPLOAD PERFORMANCE');
    lines.push('─'.repeat(30));
    lines.push(`Presigned URL (p95): ${metrics.presignedUrlLatency.p95.toFixed(0)}ms ${checkThreshold(metrics.presignedUrlLatency.p95, SLA_THRESHOLDS.upload.presignedUrlTime.p95)}`);
    lines.push('');
  }
  
  // WebSocket Performance
  if (metrics.wsLatency.p95 > 0) {
    lines.push('WEBSOCKET PERFORMANCE');
    lines.push('─'.repeat(30));
    lines.push(`Message Latency (p50): ${metrics.wsLatency.p50.toFixed(0)}ms ${checkThreshold(metrics.wsLatency.p50, SLA_THRESHOLDS.websocket.messageLatency.p50)}`);
    lines.push(`Message Latency (p95): ${metrics.wsLatency.p95.toFixed(0)}ms ${checkThreshold(metrics.wsLatency.p95, SLA_THRESHOLDS.websocket.messageLatency.p95)}`);
    lines.push('');
  }
  
  // SLA Compliance
  lines.push('SLA COMPLIANCE');
  lines.push('─'.repeat(30));
  const slaChecks = [
    { name: 'API Response Time (p95 < 2s)', passed: metrics.httpDuration.p95 < SLA_THRESHOLDS.api.responseTime.p95 },
    { name: 'Error Rate (< 1%)', passed: metrics.errorRate < SLA_THRESHOLDS.api.errorRate },
    { name: 'Throughput (> 100 req/s)', passed: metrics.throughput > SLA_THRESHOLDS.api.throughput },
  ];
  
  if (metrics.presignedUrlLatency.p95 > 0) {
    slaChecks.push({ name: 'Upload URL Generation (p95 < 500ms)', passed: metrics.presignedUrlLatency.p95 < SLA_THRESHOLDS.upload.presignedUrlTime.p95 });
  }
  
  if (metrics.wsLatency.p95 > 0) {
    slaChecks.push({ name: 'WebSocket Latency (p95 < 500ms)', passed: metrics.wsLatency.p95 < SLA_THRESHOLDS.websocket.messageLatency.p95 });
  }
  
  slaChecks.forEach(check => {
    lines.push(`${check.passed ? '✓' : '✗'} ${check.name}`);
  });
  
  const passedCount = slaChecks.filter(c => c.passed).length;
  lines.push('');
  lines.push(`SLA Compliance: ${passedCount}/${slaChecks.length} (${((passedCount / slaChecks.length) * 100).toFixed(0)}%)`);
  
  // Bottlenecks
  const bottlenecks = identifyBottlenecks(metrics);
  if (bottlenecks.length > 0) {
    lines.push('');
    lines.push('BOTTLENECKS IDENTIFIED');
    lines.push('─'.repeat(30));
    bottlenecks.forEach(b => {
      lines.push(`[${b.severity}] ${b.area}`);
      lines.push(`  Actual: ${b.metric} | Threshold: ${b.threshold}`);
    });
  }
  
  // Recommendations
  const recommendations = generateRecommendations(metrics);
  if (recommendations.length > 0) {
    lines.push('');
    lines.push('RECOMMENDATIONS');
    lines.push('─'.repeat(30));
    recommendations.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.priority}] ${r.action}`);
      lines.push(`   ${r.details}`);
    });
  }
  
  lines.push('');
  lines.push('═'.repeat(60));
  
  return lines.join('\n');
}

function evaluateStatus(metrics) {
  const checks = [
    metrics.httpDuration.p95 < SLA_THRESHOLDS.api.responseTime.p95,
    metrics.errorRate < SLA_THRESHOLDS.api.errorRate,
    metrics.throughput > SLA_THRESHOLDS.api.throughput,
  ];
  
  const passedCount = checks.filter(Boolean).length;
  
  if (passedCount === checks.length) return '✓ PASSED';
  if (passedCount >= checks.length * 0.7) return '⚠ WARNING';
  return '✗ FAILED';
}

function checkThreshold(value, threshold) {
  return value < threshold ? '✓' : '✗';
}

function identifyBottlenecks(metrics) {
  const bottlenecks = [];
  
  if (metrics.httpDuration.p95 > SLA_THRESHOLDS.api.responseTime.p95) {
    bottlenecks.push({
      area: 'API Response Time',
      severity: 'HIGH',
      metric: `${metrics.httpDuration.p95.toFixed(0)}ms`,
      threshold: `${SLA_THRESHOLDS.api.responseTime.p95}ms`,
    });
  }
  
  if (metrics.errorRate > SLA_THRESHOLDS.api.errorRate) {
    bottlenecks.push({
      area: 'Error Rate',
      severity: 'CRITICAL',
      metric: `${(metrics.errorRate * 100).toFixed(2)}%`,
      threshold: `${(SLA_THRESHOLDS.api.errorRate * 100).toFixed(0)}%`,
    });
  }
  
  if (metrics.wsLatency.p95 > SLA_THRESHOLDS.websocket.messageLatency.p95) {
    bottlenecks.push({
      area: 'WebSocket Latency',
      severity: 'HIGH',
      metric: `${metrics.wsLatency.p95.toFixed(0)}ms`,
      threshold: `${SLA_THRESHOLDS.websocket.messageLatency.p95}ms`,
    });
  }
  
  return bottlenecks;
}

function generateRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.httpDuration.p95 > SLA_THRESHOLDS.api.responseTime.p95) {
    recommendations.push({
      priority: 'HIGH',
      action: 'Optimize API response times',
      details: 'Review slow endpoints, add caching, optimize database queries',
    });
  }
  
  if (metrics.errorRate > SLA_THRESHOLDS.api.errorRate * 0.5) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Investigate error sources',
      details: 'Check logs for common error patterns, review rate limiting',
    });
  }
  
  if (metrics.throughput < SLA_THRESHOLDS.api.throughput * 1.5) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Consider horizontal scaling',
      details: 'Add more API instances to handle increased load',
    });
  }
  
  return recommendations;
}

export default {
  parseK6Results,
  generateTextReport,
};
