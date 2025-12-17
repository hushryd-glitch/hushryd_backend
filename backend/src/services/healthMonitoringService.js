/**
 * Health Monitoring Service
 * Comprehensive health monitoring, metrics collection, and alerting
 * 
 * Requirements: 9.1 - Alert operations team within 30 seconds on service degradation
 * Requirements: 9.2 - Trigger automatic investigation on error rate > 1%
 * Requirements: 9.3 - Log detailed metrics when response time exceeds SLA
 * Requirements: 9.4 - Alert on database connection pool > 80% utilization
 */

const EventEmitter = require('events');
const mongoose = require('mongoose');
const { getRedisClient, isRedisConnected, checkRedisHealth } = require('../config/redis');
const { getConnectionPoolStats, checkDatabaseHealth } = require('../config/database');
const { getQueueStatus } = require('../queues/documentQueue');
const { getCircuitBreakerStatus } = require('./circuitBreakerService');
const { getRateLimiterStatus } = require('../middleware/rateLimiter');
const { getLoadSheddingStatus } = require('../middleware/priorityMiddleware');
const { getLocationBufferStatus } = require('./tripTrackingService');

// ============================================
// Configuration
// ============================================

const CONFIG = {
  // Alert thresholds
  errorRateThreshold: 0.01,           // 1% error rate - Requirements: 9.2
  responseTimeThresholdMs: 2000,      // 2 second SLA - Requirements: 9.3
  connectionPoolThreshold: 0.8,       // 80% utilization - Requirements: 9.4
  queueDepthThreshold: 5000,          // Queue depth alert - Requirements: 9.4
  memoryThreshold: 0.85,              // 85% memory usage
  
  // Monitoring intervals
  metricsCollectionIntervalMs: 5000,  // Collect metrics every 5 seconds
  alertCheckIntervalMs: 10000,        // Check alerts every 10 seconds
  
  // Metrics retention
  metricsRetentionMs: 300000,         // Keep 5 minutes of metrics
  maxMetricsEntries: 1000
};

// ============================================
// Metrics Storage
// ============================================

class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      responseTimes: [],
      errorRates: [],
      queueDepths: [],
      connectionPoolUsage: [],
      memoryUsage: [],
      requestCounts: []
    };
    
    this.currentWindow = {
      totalRequests: 0,
      errorCount: 0,
      totalResponseTime: 0,
      startTime: Date.now()
    };
    
    this.alerts = [];
    this.collectionInterval = null;
    this.alertCheckInterval = null;
  }

  /**
   * Start metrics collection
   */
  start() {
    if (this.collectionInterval) return;
    
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, CONFIG.metricsCollectionIntervalMs);
    
    this.alertCheckInterval = setInterval(() => {
      this.checkAlerts();
    }, CONFIG.alertCheckIntervalMs);
    
    console.log('✓ Health monitoring service started');
  }

  /**
   * Stop metrics collection
   */
  stop() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = null;
    }
    console.log('Health monitoring service stopped');
  }

  /**
   * Record a request for metrics
   * @param {Object} data - Request data
   */
  recordRequest(data) {
    const { responseTime, statusCode, path, method } = data;
    
    this.currentWindow.totalRequests++;
    this.currentWindow.totalResponseTime += responseTime;
    
    if (statusCode >= 400) {
      this.currentWindow.errorCount++;
    }
    
    // Track individual response times for SLA monitoring
    this.metrics.responseTimes.push({
      timestamp: Date.now(),
      responseTime,
      path,
      method,
      statusCode
    });
    
    // Emit event for real-time monitoring
    this.emit('request', data);
    
    // Check for SLA violation - Requirements: 9.3
    if (responseTime > CONFIG.responseTimeThresholdMs) {
      this.emit('slaViolation', {
        type: 'response_time',
        value: responseTime,
        threshold: CONFIG.responseTimeThresholdMs,
        path,
        method,
        timestamp: new Date().toISOString()
      });
    }
    
    this.pruneOldMetrics();
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();
    
    try {
      // Calculate error rate for current window
      const errorRate = this.currentWindow.totalRequests > 0
        ? this.currentWindow.errorCount / this.currentWindow.totalRequests
        : 0;
      
      this.metrics.errorRates.push({
        timestamp,
        rate: errorRate,
        totalRequests: this.currentWindow.totalRequests,
        errorCount: this.currentWindow.errorCount
      });
      
      // Collect queue depth - Requirements: 9.4
      try {
        const queueStatus = await getQueueStatus();
        this.metrics.queueDepths.push({
          timestamp,
          waiting: queueStatus.waiting,
          active: queueStatus.active,
          failed: queueStatus.failed,
          processingRate: queueStatus.processingRate
        });
      } catch (error) {
        // Queue might not be available
      }
      
      // Collect connection pool usage - Requirements: 9.4
      const poolStats = getConnectionPoolStats();
      if (poolStats.connected && typeof poolStats.poolSize === 'number') {
        const utilization = poolStats.poolSize / poolStats.maxPoolSize;
        this.metrics.connectionPoolUsage.push({
          timestamp,
          utilization,
          poolSize: poolStats.poolSize,
          maxPoolSize: poolStats.maxPoolSize,
          waitQueueSize: poolStats.waitQueueSize
        });
      }
      
      // Collect memory usage
      const memUsage = process.memoryUsage();
      const heapUtilization = memUsage.heapUsed / memUsage.heapTotal;
      this.metrics.memoryUsage.push({
        timestamp,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        utilization: heapUtilization,
        rss: memUsage.rss,
        external: memUsage.external
      });
      
      // Store request count for this window
      this.metrics.requestCounts.push({
        timestamp,
        count: this.currentWindow.totalRequests,
        avgResponseTime: this.currentWindow.totalRequests > 0
          ? this.currentWindow.totalResponseTime / this.currentWindow.totalRequests
          : 0
      });
      
      // Reset current window
      this.currentWindow = {
        totalRequests: 0,
        errorCount: 0,
        totalResponseTime: 0,
        startTime: Date.now()
      };
      
      this.pruneOldMetrics();
      
    } catch (error) {
      console.error('Error collecting metrics:', error.message);
    }
  }

  /**
   * Check for alert conditions
   * Requirements: 9.1, 9.2, 9.4
   */
  async checkAlerts() {
    const now = Date.now();
    const newAlerts = [];
    
    // Check error rate - Requirements: 9.2
    const recentErrorRates = this.metrics.errorRates.filter(
      m => now - m.timestamp < 60000
    );
    if (recentErrorRates.length > 0) {
      const avgErrorRate = recentErrorRates.reduce((sum, m) => sum + m.rate, 0) / recentErrorRates.length;
      if (avgErrorRate > CONFIG.errorRateThreshold) {
        newAlerts.push({
          type: 'error_rate',
          severity: 'critical',
          message: `Error rate ${(avgErrorRate * 100).toFixed(2)}% exceeds threshold ${CONFIG.errorRateThreshold * 100}%`,
          value: avgErrorRate,
          threshold: CONFIG.errorRateThreshold,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Check connection pool - Requirements: 9.4
    const recentPoolUsage = this.metrics.connectionPoolUsage.filter(
      m => now - m.timestamp < 60000
    );
    if (recentPoolUsage.length > 0) {
      const latestPool = recentPoolUsage[recentPoolUsage.length - 1];
      if (latestPool.utilization > CONFIG.connectionPoolThreshold) {
        newAlerts.push({
          type: 'connection_pool',
          severity: 'warning',
          message: `Connection pool utilization ${(latestPool.utilization * 100).toFixed(1)}% exceeds threshold ${CONFIG.connectionPoolThreshold * 100}%`,
          value: latestPool.utilization,
          threshold: CONFIG.connectionPoolThreshold,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Check queue depth - Requirements: 9.4
    const recentQueueDepths = this.metrics.queueDepths.filter(
      m => now - m.timestamp < 60000
    );
    if (recentQueueDepths.length > 0) {
      const latestQueue = recentQueueDepths[recentQueueDepths.length - 1];
      if (latestQueue.waiting > CONFIG.queueDepthThreshold) {
        newAlerts.push({
          type: 'queue_depth',
          severity: 'warning',
          message: `Queue depth ${latestQueue.waiting} exceeds threshold ${CONFIG.queueDepthThreshold}`,
          value: latestQueue.waiting,
          threshold: CONFIG.queueDepthThreshold,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Check memory usage
    const recentMemory = this.metrics.memoryUsage.filter(
      m => now - m.timestamp < 60000
    );
    if (recentMemory.length > 0) {
      const latestMemory = recentMemory[recentMemory.length - 1];
      if (latestMemory.utilization > CONFIG.memoryThreshold) {
        newAlerts.push({
          type: 'memory',
          severity: 'warning',
          message: `Memory utilization ${(latestMemory.utilization * 100).toFixed(1)}% exceeds threshold ${CONFIG.memoryThreshold * 100}%`,
          value: latestMemory.utilization,
          threshold: CONFIG.memoryThreshold,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Emit alerts - Requirements: 9.1
    for (const alert of newAlerts) {
      this.alerts.push(alert);
      this.emit('alert', alert);
    }
    
    // Keep only recent alerts
    this.alerts = this.alerts.filter(
      a => now - new Date(a.timestamp).getTime() < CONFIG.metricsRetentionMs
    );
  }

  /**
   * Remove old metrics to prevent memory bloat
   */
  pruneOldMetrics() {
    const cutoff = Date.now() - CONFIG.metricsRetentionMs;
    
    for (const key of Object.keys(this.metrics)) {
      this.metrics[key] = this.metrics[key].filter(m => m.timestamp > cutoff);
      
      // Also limit by count
      if (this.metrics[key].length > CONFIG.maxMetricsEntries) {
        this.metrics[key] = this.metrics[key].slice(-CONFIG.maxMetricsEntries);
      }
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Calculate averages for last minute
    const recentResponseTimes = this.metrics.responseTimes.filter(m => m.timestamp > oneMinuteAgo);
    const recentErrorRates = this.metrics.errorRates.filter(m => m.timestamp > oneMinuteAgo);
    const recentQueueDepths = this.metrics.queueDepths.filter(m => m.timestamp > oneMinuteAgo);
    const recentPoolUsage = this.metrics.connectionPoolUsage.filter(m => m.timestamp > oneMinuteAgo);
    const recentMemory = this.metrics.memoryUsage.filter(m => m.timestamp > oneMinuteAgo);
    
    return {
      timestamp: new Date().toISOString(),
      responseTimes: {
        count: recentResponseTimes.length,
        avg: recentResponseTimes.length > 0
          ? recentResponseTimes.reduce((sum, m) => sum + m.responseTime, 0) / recentResponseTimes.length
          : 0,
        max: recentResponseTimes.length > 0
          ? Math.max(...recentResponseTimes.map(m => m.responseTime))
          : 0,
        p95: this.calculatePercentile(recentResponseTimes.map(m => m.responseTime), 95)
      },
      errorRate: {
        current: recentErrorRates.length > 0
          ? recentErrorRates[recentErrorRates.length - 1].rate
          : 0,
        avg: recentErrorRates.length > 0
          ? recentErrorRates.reduce((sum, m) => sum + m.rate, 0) / recentErrorRates.length
          : 0
      },
      queueDepth: {
        current: recentQueueDepths.length > 0
          ? recentQueueDepths[recentQueueDepths.length - 1].waiting
          : 0,
        processingRate: recentQueueDepths.length > 0
          ? recentQueueDepths[recentQueueDepths.length - 1].processingRate
          : 0
      },
      connectionPool: {
        utilization: recentPoolUsage.length > 0
          ? recentPoolUsage[recentPoolUsage.length - 1].utilization
          : 0,
        waitQueueSize: recentPoolUsage.length > 0
          ? recentPoolUsage[recentPoolUsage.length - 1].waitQueueSize
          : 0
      },
      memory: {
        utilization: recentMemory.length > 0
          ? recentMemory[recentMemory.length - 1].utilization
          : 0,
        heapUsedMB: recentMemory.length > 0
          ? Math.round(recentMemory[recentMemory.length - 1].heapUsed / 1024 / 1024)
          : 0
      },
      activeAlerts: this.alerts.length
    };
  }

  /**
   * Calculate percentile from array of values
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return this.alerts;
  }

  /**
   * Get raw metrics for detailed analysis
   */
  getRawMetrics() {
    return this.metrics;
  }
}

// Singleton instance
const metricsCollector = new MetricsCollector();



// ============================================
// Comprehensive Health Check
// Requirements: 9.1 - Check MongoDB, Redis, queue health
// ============================================

/**
 * Perform comprehensive health check
 * @returns {Promise<Object>} Health status
 */
const getComprehensiveHealth = async () => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'hushryd-api',
    version: process.env.APP_VERSION || '1.0.0',
    uptime: Math.round(process.uptime()),
    checks: {}
  };

  const issues = [];

  // Check MongoDB connection
  try {
    const dbHealth = await checkDatabaseHealth();
    const poolStats = getConnectionPoolStats();
    
    healthStatus.checks.mongodb = {
      status: dbHealth.status === 'healthy' ? 'ok' : 'error',
      readyState: mongoose.connection.readyState,
      message: dbHealth.message,
      pool: {
        size: poolStats.poolSize,
        maxSize: poolStats.maxPoolSize,
        utilization: typeof poolStats.poolSize === 'number' && poolStats.maxPoolSize > 0
          ? (poolStats.poolSize / poolStats.maxPoolSize * 100).toFixed(1) + '%'
          : 'unknown',
        waitQueueSize: poolStats.waitQueueSize
      }
    };
    
    if (dbHealth.status !== 'healthy') {
      issues.push('MongoDB connection unhealthy');
    }
    
    // Check pool utilization - Requirements: 9.4
    if (typeof poolStats.poolSize === 'number' && poolStats.maxPoolSize > 0) {
      const utilization = poolStats.poolSize / poolStats.maxPoolSize;
      if (utilization > CONFIG.connectionPoolThreshold) {
        healthStatus.checks.mongodb.status = 'warning';
        issues.push(`Connection pool utilization high: ${(utilization * 100).toFixed(1)}%`);
      }
    }
  } catch (error) {
    healthStatus.checks.mongodb = {
      status: 'error',
      message: error.message
    };
    issues.push('MongoDB check failed');
  }

  // Check Redis connection
  try {
    const redisHealth = await checkRedisHealth();
    
    healthStatus.checks.redis = {
      status: redisHealth.status === 'healthy' ? 'ok' : 'warning',
      connected: redisHealth.connected,
      latency: redisHealth.latency || null,
      message: redisHealth.message
    };
    
    // Redis is optional - don't mark as critical failure
    if (!redisHealth.connected) {
      issues.push('Redis not connected (degraded caching)');
    }
  } catch (error) {
    healthStatus.checks.redis = {
      status: 'warning',
      connected: false,
      message: error.message
    };
    issues.push('Redis check failed');
  }

  // Check document processing queue - Requirements: 9.4
  try {
    const queueStatus = await getQueueStatus();
    
    healthStatus.checks.documentQueue = {
      status: 'ok',
      waiting: queueStatus.waiting,
      active: queueStatus.active,
      failed: queueStatus.failed,
      delayed: queueStatus.delayed,
      processingRate: queueStatus.processingRate,
      estimatedWaitMinutes: queueStatus.estimatedWaitMinutes
    };
    
    // Check queue depth threshold
    if (queueStatus.waiting > CONFIG.queueDepthThreshold) {
      healthStatus.checks.documentQueue.status = 'warning';
      issues.push(`Queue depth high: ${queueStatus.waiting} waiting`);
    }
    
    // Check for high failure rate
    if (queueStatus.failed > 100) {
      healthStatus.checks.documentQueue.status = 'warning';
      issues.push(`High queue failure count: ${queueStatus.failed}`);
    }
  } catch (error) {
    healthStatus.checks.documentQueue = {
      status: 'warning',
      message: error.message
    };
  }

  // Check circuit breakers
  try {
    const circuitStatus = getCircuitBreakerStatus();
    const openCircuits = Object.entries(circuitStatus)
      .filter(([_, status]) => status.state === 'OPEN')
      .map(([name]) => name);
    
    healthStatus.checks.circuitBreakers = {
      status: openCircuits.length > 0 ? 'warning' : 'ok',
      total: Object.keys(circuitStatus).length,
      open: openCircuits.length,
      openCircuits
    };
    
    if (openCircuits.length > 0) {
      issues.push(`Circuit breakers open: ${openCircuits.join(', ')}`);
    }
  } catch (error) {
    healthStatus.checks.circuitBreakers = {
      status: 'warning',
      message: error.message
    };
  }

  // Check rate limiters
  try {
    const rateLimiterStatus = getRateLimiterStatus();
    healthStatus.checks.rateLimiter = {
      status: 'ok',
      storeType: rateLimiterStatus.storeType,
      limiters: Object.keys(rateLimiterStatus.limiters)
    };
  } catch (error) {
    healthStatus.checks.rateLimiter = {
      status: 'warning',
      message: error.message
    };
  }

  // Check load shedding status
  try {
    const loadSheddingStatus = await getLoadSheddingStatus();
    healthStatus.checks.loadShedding = {
      status: loadSheddingStatus.sheddingLevel > 0 ? 'warning' : 'ok',
      enabled: loadSheddingStatus.enabled,
      currentRate: loadSheddingStatus.currentRate,
      sheddingLevel: loadSheddingStatus.sheddingLevel
    };
    
    if (loadSheddingStatus.sheddingLevel > 0) {
      issues.push(`Load shedding active: level ${loadSheddingStatus.sheddingLevel}`);
    }
  } catch (error) {
    healthStatus.checks.loadShedding = {
      status: 'warning',
      message: error.message
    };
  }

  // Check location buffer
  try {
    const bufferStatus = getLocationBufferStatus();
    healthStatus.checks.locationBuffer = {
      status: bufferStatus.size < bufferStatus.maxSize * 0.9 ? 'ok' : 'warning',
      size: bufferStatus.size,
      maxSize: bufferStatus.maxSize,
      timerActive: bufferStatus.timerActive
    };
    
    if (bufferStatus.size >= bufferStatus.maxSize * 0.9) {
      issues.push('Location buffer near capacity');
    }
  } catch (error) {
    healthStatus.checks.locationBuffer = {
      status: 'warning',
      message: error.message
    };
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const heapUtilization = memUsage.heapUsed / memUsage.heapTotal;
  healthStatus.checks.memory = {
    status: heapUtilization < CONFIG.memoryThreshold ? 'ok' : 'warning',
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    utilization: `${(heapUtilization * 100).toFixed(1)}%`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
  };
  
  if (heapUtilization >= CONFIG.memoryThreshold) {
    issues.push(`Memory utilization high: ${(heapUtilization * 100).toFixed(1)}%`);
  }

  // Get metrics summary
  healthStatus.metrics = metricsCollector.getMetricsSummary();
  
  // Get active alerts
  healthStatus.alerts = metricsCollector.getActiveAlerts();

  // Determine overall status
  if (healthStatus.checks.mongodb?.status === 'error') {
    healthStatus.status = 'unhealthy';
  } else if (issues.length > 0) {
    healthStatus.status = 'degraded';
  }
  
  healthStatus.issues = issues;

  return healthStatus;
};

// ============================================
// Alerting Service
// Requirements: 9.1, 9.2
// ============================================

/**
 * Alert handler interface
 * Implementations can send alerts via email, Slack, PagerDuty, etc.
 */
class AlertHandler {
  constructor(name) {
    this.name = name;
    this.enabled = true;
  }

  async send(alert) {
    // Override in subclass
    console.log(`[Alert:${this.name}]`, alert);
  }
}

/**
 * Console alert handler (default)
 */
class ConsoleAlertHandler extends AlertHandler {
  constructor() {
    super('console');
  }

  async send(alert) {
    const prefix = alert.severity === 'critical' ? '🚨' : '⚠️';
    console.log(`${prefix} [ALERT] ${alert.type}: ${alert.message}`);
  }
}

/**
 * Webhook alert handler
 */
class WebhookAlertHandler extends AlertHandler {
  constructor(webhookUrl) {
    super('webhook');
    this.webhookUrl = webhookUrl;
  }

  async send(alert) {
    if (!this.webhookUrl) return;
    
    try {
      const fetch = require('node-fetch');
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'hushryd-api',
          alert,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error.message);
    }
  }
}

/**
 * Alerting service that manages alert handlers
 */
class AlertingService {
  constructor() {
    this.handlers = [new ConsoleAlertHandler()];
    this.alertHistory = [];
    this.maxHistorySize = 1000;
    
    // Subscribe to metrics collector alerts
    metricsCollector.on('alert', (alert) => this.handleAlert(alert));
    metricsCollector.on('slaViolation', (violation) => this.handleSLAViolation(violation));
  }

  /**
   * Add an alert handler
   */
  addHandler(handler) {
    this.handlers.push(handler);
  }

  /**
   * Handle an alert
   * Requirements: 9.1 - Alert within 30 seconds
   */
  async handleAlert(alert) {
    // Add to history
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }
    
    // Send to all handlers
    for (const handler of this.handlers) {
      if (handler.enabled) {
        try {
          await handler.send(alert);
        } catch (error) {
          console.error(`Alert handler ${handler.name} failed:`, error.message);
        }
      }
    }
  }

  /**
   * Handle SLA violation
   * Requirements: 9.3 - Log detailed metrics when response time exceeds SLA
   */
  async handleSLAViolation(violation) {
    console.warn('[SLA Violation]', JSON.stringify(violation));
    
    // Could trigger additional actions like:
    // - Detailed logging
    // - Performance profiling
    // - Auto-scaling triggers
  }

  /**
   * Get alert history
   */
  getHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Clear alert history
   */
  clearHistory() {
    this.alertHistory = [];
  }
}

// Singleton alerting service
const alertingService = new AlertingService();

// ============================================
// Metrics Middleware
// ============================================

/**
 * Express middleware to track request metrics
 */
const metricsMiddleware = () => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Capture response
    const originalEnd = res.end;
    res.end = function(...args) {
      const responseTime = Date.now() - startTime;
      
      // Record metrics
      metricsCollector.recordRequest({
        responseTime,
        statusCode: res.statusCode,
        path: req.path,
        method: req.method
      });
      
      originalEnd.apply(res, args);
    };
    
    next();
  };
};

// ============================================
// Exports
// ============================================

module.exports = {
  // Core services
  metricsCollector,
  alertingService,
  
  // Health check
  getComprehensiveHealth,
  
  // Middleware
  metricsMiddleware,
  
  // Alert handlers
  AlertHandler,
  ConsoleAlertHandler,
  WebhookAlertHandler,
  
  // Configuration
  CONFIG,
  
  // Utility functions
  startMonitoring: () => metricsCollector.start(),
  stopMonitoring: () => metricsCollector.stop(),
  getMetricsSummary: () => metricsCollector.getMetricsSummary(),
  getActiveAlerts: () => metricsCollector.getActiveAlerts(),
  getRawMetrics: () => metricsCollector.getRawMetrics(),
  getAlertHistory: (limit) => alertingService.getHistory(limit)
};
