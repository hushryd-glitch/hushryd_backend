/**
 * API Performance Monitoring Service
 * Tracks response times, identifies slow endpoints, and provides optimization insights
 * 
 * Requirements: 8.1 - Search results within 2 seconds
 * Requirements: 8.3 - Autocomplete suggestions within 500ms
 * Requirements: 8.2 - Real-time filter updates
 */

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  search: 2000,        // Requirements: 8.1 - Search < 2 seconds
  autocomplete: 500,   // Requirements: 8.3 - Autocomplete < 500ms
  filter: 1000,        // Requirements: 8.2 - Filter updates < 1 second
  default: 3000        // Default threshold for other endpoints
};

// Store for performance metrics
const performanceMetrics = {
  endpoints: new Map(),
  slowQueries: [],
  lastReset: Date.now()
};

// Maximum slow queries to store
const MAX_SLOW_QUERIES = 100;

/**
 * Get threshold for an endpoint
 * @param {string} path - Request path
 * @returns {number} Threshold in milliseconds
 */
const getThreshold = (path) => {
  if (path.includes('/search')) return PERFORMANCE_THRESHOLDS.search;
  if (path.includes('/autocomplete') || path.includes('/maps')) return PERFORMANCE_THRESHOLDS.autocomplete;
  if (path.includes('/filter')) return PERFORMANCE_THRESHOLDS.filter;
  return PERFORMANCE_THRESHOLDS.default;
};

/**
 * Record API response time
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {number} responseTime - Response time in milliseconds
 * @param {number} statusCode - HTTP status code
 */
const recordResponseTime = (method, path, responseTime, statusCode) => {
  const key = `${method}:${path}`;
  const threshold = getThreshold(path);
  
  // Get or create endpoint metrics
  if (!performanceMetrics.endpoints.has(key)) {
    performanceMetrics.endpoints.set(key, {
      method,
      path,
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      avgTime: 0,
      p95Time: 0,
      threshold,
      violations: 0,
      responseTimes: [],
      lastAccessed: Date.now()
    });
  }
  
  const metrics = performanceMetrics.endpoints.get(key);
  metrics.count++;
  metrics.totalTime += responseTime;
  metrics.minTime = Math.min(metrics.minTime, responseTime);
  metrics.maxTime = Math.max(metrics.maxTime, responseTime);
  metrics.avgTime = metrics.totalTime / metrics.count;
  metrics.lastAccessed = Date.now();
  
  // Store recent response times for percentile calculation (keep last 100)
  metrics.responseTimes.push(responseTime);
  if (metrics.responseTimes.length > 100) {
    metrics.responseTimes.shift();
  }
  
  // Calculate P95
  const sorted = [...metrics.responseTimes].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  metrics.p95Time = sorted[p95Index] || responseTime;
  
  // Track threshold violations
  if (responseTime > threshold) {
    metrics.violations++;
    
    // Store slow query details
    if (performanceMetrics.slowQueries.length < MAX_SLOW_QUERIES) {
      performanceMetrics.slowQueries.push({
        method,
        path,
        responseTime,
        threshold,
        statusCode,
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Express middleware for tracking API response times
 * @returns {Function} Express middleware
 */
const responseTimeMiddleware = () => {
  return (req, res, next) => {
    const startTime = process.hrtime.bigint();
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(...args) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1e6; // Convert to milliseconds
      
      // Normalize path (remove IDs for grouping)
      const normalizedPath = req.path
        .replace(/\/[0-9a-fA-F]{24}/g, '/:id')
        .replace(/\/HR-\d{4}-\d{6}/g, '/:tripId');
      
      recordResponseTime(req.method, normalizedPath, responseTime, res.statusCode);
      
      // Add response time header
      res.setHeader('X-Response-Time', `${responseTime.toFixed(2)}ms`);
      
      return originalEnd.apply(this, args);
    };
    
    next();
  };
};

/**
 * Get performance summary for all endpoints
 * @returns {Object} Performance summary
 */
const getPerformanceSummary = () => {
  const endpoints = [];
  
  performanceMetrics.endpoints.forEach((metrics, key) => {
    endpoints.push({
      endpoint: key,
      method: metrics.method,
      path: metrics.path,
      requests: metrics.count,
      avgResponseTime: Math.round(metrics.avgTime * 100) / 100,
      minResponseTime: metrics.minTime === Infinity ? 0 : Math.round(metrics.minTime * 100) / 100,
      maxResponseTime: Math.round(metrics.maxTime * 100) / 100,
      p95ResponseTime: Math.round(metrics.p95Time * 100) / 100,
      threshold: metrics.threshold,
      violations: metrics.violations,
      violationRate: metrics.count > 0 ? Math.round((metrics.violations / metrics.count) * 10000) / 100 : 0,
      lastAccessed: new Date(metrics.lastAccessed).toISOString()
    });
  });
  
  // Sort by violation rate (highest first)
  endpoints.sort((a, b) => b.violationRate - a.violationRate);
  
  return {
    totalEndpoints: endpoints.length,
    endpoints,
    slowQueries: performanceMetrics.slowQueries.slice(-20), // Last 20 slow queries
    thresholds: PERFORMANCE_THRESHOLDS,
    monitoringSince: new Date(performanceMetrics.lastReset).toISOString()
  };
};

/**
 * Get slow endpoints that need optimization
 * @param {number} minViolationRate - Minimum violation rate percentage
 * @returns {Array} Slow endpoints
 */
const getSlowEndpoints = (minViolationRate = 5) => {
  const summary = getPerformanceSummary();
  return summary.endpoints.filter(e => e.violationRate >= minViolationRate);
};

/**
 * Reset performance metrics
 */
const resetMetrics = () => {
  performanceMetrics.endpoints.clear();
  performanceMetrics.slowQueries = [];
  performanceMetrics.lastReset = Date.now();
};

/**
 * Check if an endpoint is meeting SLA
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @returns {Object} SLA status
 */
const checkEndpointSLA = (method, path) => {
  const key = `${method}:${path}`;
  const metrics = performanceMetrics.endpoints.get(key);
  
  if (!metrics) {
    return { exists: false, meetsSLA: true };
  }
  
  const meetsSLA = metrics.p95Time <= metrics.threshold;
  
  return {
    exists: true,
    meetsSLA,
    p95Time: metrics.p95Time,
    threshold: metrics.threshold,
    violationRate: metrics.count > 0 ? (metrics.violations / metrics.count) * 100 : 0
  };
};

module.exports = {
  responseTimeMiddleware,
  recordResponseTime,
  getPerformanceSummary,
  getSlowEndpoints,
  resetMetrics,
  checkEndpointSLA,
  PERFORMANCE_THRESHOLDS
};
