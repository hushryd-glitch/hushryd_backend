require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { connectDatabase } = require('./config/database');
const { connectRedis, checkRedisHealth } = require('./config/redis');
const { validateEnvironment } = require('./config/environment');
const { sanitizeResponseMiddleware, verifyApiKeysSecurity } = require('./services/securityService');
const { initializeSocketServer } = require('./services/socketService');
const { initializeDocumentQueue, getQueueStatus } = require('./queues/documentQueue');
const { initializeDocumentWorker } = require('./workers/documentWorker');
const { initializeLocationBatching, stopLocationBatching, getLocationBufferStatus } = require('./services/tripTrackingService');
const { standardLimiter, criticalLimiter, uploadLimiter, reinitializeRateLimiters, getRateLimiterStatus } = require('./middleware/rateLimiter');
const { priorityMiddleware, loadSheddingMiddleware, getLoadSheddingStatus } = require('./middleware/priorityMiddleware');
const { 
  metricsMiddleware, 
  getComprehensiveHealth, 
  startMonitoring, 
  stopMonitoring,
  getMetricsSummary,
  getActiveAlerts,
  getAlertHistory
} = require('./services/healthMonitoringService');
const { 
  responseTimeMiddleware, 
  getPerformanceSummary, 
  getSlowEndpoints 
} = require('./services/apiPerformanceService');

const app = express();
const server = http.createServer(app);

// Validate environment variables at startup
let config;
try {
  config = validateEnvironment();
  console.log('✓ Environment configuration validated');
  
  // Verify API keys are securely loaded
  const securityCheck = verifyApiKeysSecurity();
  if (!securityCheck.secure) {
    console.warn('⚠ API key security issues:', securityCheck.issues.join(', '));
  } else {
    console.log('✓ API keys security verified');
  }
} catch (error) {
  console.error('✗ Environment validation failed:', error.message);
  process.exit(1);
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()),
  credentials: true
}));

// Request parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Security middleware to sanitize responses (prevent API key exposure)
app.use(sanitizeResponseMiddleware);

// Serve static files from uploads folder (for local document storage)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Apply metrics middleware to track response times and error rates
// Requirements: 9.3 - Track response times for SLA monitoring
app.use(metricsMiddleware());

// Apply API performance monitoring middleware
// Requirements: 8.1, 8.3 - Track response times for search and autocomplete
app.use(responseTimeMiddleware());

// Health check endpoint - basic (for ALB)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'hushryd-api',
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Deep health check endpoint - comprehensive (for deployment validation)
// Requirements: 9.1 - Check MongoDB, Redis, queue health and return degraded status
app.get('/health/deep', async (req, res) => {
  try {
    const healthStatus = await getComprehensiveHealth();
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                       healthStatus.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint - for monitoring dashboards
// Requirements: 9.3, 9.4 - Track response times, error rates, queue depths
app.get('/health/metrics', (req, res) => {
  try {
    const metrics = getMetricsSummary();
    res.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Alerts endpoint - for monitoring active alerts
// Requirements: 9.1, 9.2 - Alert on error rate > 1%, response time > SLA
app.get('/health/alerts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const activeAlerts = getActiveAlerts();
    const alertHistory = getAlertHistory(limit);
    
    res.json({
      success: true,
      active: activeAlerts,
      history: alertHistory,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API Performance endpoint - for monitoring response times
// Requirements: 8.1, 8.3 - Track search and autocomplete performance
app.get('/health/performance', (req, res) => {
  try {
    const summary = getPerformanceSummary();
    const slowEndpoints = getSlowEndpoints(5); // Endpoints with >5% violation rate
    
    res.json({
      success: true,
      summary,
      slowEndpoints,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Readiness probe - for Kubernetes/ECS
app.get('/ready', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ready: false, reason: 'Database not connected' });
    }
    
    // Check Redis (optional - warn but don't fail readiness)
    const redisHealth = await checkRedisHealth();
    
    res.json({ 
      ready: true,
      services: {
        database: 'connected',
        redis: redisHealth.connected ? 'connected' : 'unavailable'
      }
    });
  } catch (error) {
    res.status(503).json({ ready: false, reason: error.message });
  }
});

// Liveness probe - for Kubernetes/ECS
app.get('/live', (req, res) => {
  res.json({ live: true, timestamp: new Date().toISOString() });
});

// Apply priority tagging and load shedding middleware to all API routes
// Requirements: 8.1 - Prioritize SOS alerts, live tracking, and active bookings
app.use('/api', priorityMiddleware());
app.use('/api', loadSheddingMiddleware());

// Apply standard rate limiter to all API routes
// Requirements: 4.1 - 100 requests per minute per user
app.use('/api', standardLimiter);

// API routes with tiered rate limiting
// Requirements: 4.4 - Higher rate limits for critical endpoints (SOS, tracking)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/super-admin', require('./routes/superAdmin'));
app.use('/api/sos', criticalLimiter, require('./routes/sos')); // Critical: 300 req/min
app.use('/api/driver', require('./routes/driver'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/search', require('./routes/search'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/webhooks', require('./routes/webhooks')); // Cashfree webhooks (no rate limiting)
app.use('/api/subscriptions', require('./routes/subscriptions')); // Subscription management
app.use('/api/wallet', require('./routes/wallet')); // Wallet management
app.use('/api/referral', require('./routes/referral')); // Referral system
app.use('/api/tracking', criticalLimiter, require('./routes/tracking')); // Critical: 300 req/min
app.use('/api/maps', require('./routes/maps')); // Google Maps integration
app.use('/api/invoices', require('./routes/invoices')); // Invoice generation and delivery

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Don't expose internal errors in production
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;
  
  res.status(statusCode).json({ error: message });
});

const PORT = process.env.PORT || 5000;

// Start server
const startServer = async () => {
  try {
    await connectDatabase();
    console.log('✓ Database connected');
    
    // Connect to Redis (non-blocking - server continues if Redis unavailable)
    try {
      await connectRedis();
      
      // Reinitialize rate limiters with Redis store
      // Requirements: 4.1 - Distributed rate limiting across instances
      reinitializeRateLimiters();
      
      // Initialize document processing queue and worker (requires Redis)
      // Requirements: 1.3, 1.5 - Queue document processing with guaranteed delivery
      try {
        initializeDocumentQueue();
        initializeDocumentWorker();
      } catch (queueError) {
        console.warn('⚠ Document queue initialization failed:', queueError.message);
      }
    } catch (redisError) {
      console.warn('⚠ Redis connection failed, continuing without caching:', redisError.message);
    }
    
    // Initialize notification channels
    // Requirements: 3.1 - Register SendGrid for email notifications
    try {
      const { registerChannel } = require('./services/notificationService');
      const { getInstance: getSendGridService } = require('./services/sendgridService');
      const { getInstance: getTwilioService } = require('./services/twilioService');
      
      // Register email channel (SendGrid)
      registerChannel('email', getSendGridService());
      console.log('✓ Email notification channel registered (SendGrid)');
      
      // Register SMS channel (Twilio)
      registerChannel('sms', getTwilioService());
      console.log('✓ SMS notification channel registered (Twilio)');
      
      // WhatsApp channel would be registered here when implemented
      // registerChannel('whatsapp', getWhatsAppService());
      
    } catch (notificationError) {
      console.warn('⚠ Notification service initialization failed:', notificationError.message);
    }
    
    // Initialize Socket.io with HTTP server and Redis adapter
    // Requirements: 2.1, 2.2 - Redis-backed Socket.io for horizontal scaling
    await initializeSocketServer(server);
    
    // Initialize location batching for MongoDB writes
    // Requirements: 2.5, 6.3 - Buffer location updates, batch write every 30 seconds
    try {
      initializeLocationBatching();
    } catch (batchError) {
      console.warn('⚠ Location batching initialization failed:', batchError.message);
    }
    
    // Start health monitoring service
    // Requirements: 9.1, 9.2, 9.3, 9.4 - Real-time monitoring and alerting
    startMonitoring();
    
    // Initialize and start cron jobs
    // Requirements: 3.5, 4.5, 7.5 - Automated subscription and cashback management
    try {
      const { startCronJobs } = require('./jobs');
      startCronJobs();
    } catch (cronError) {
      console.warn('⚠ Cron jobs initialization failed:', cronError.message);
    }
    
    server.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ WebSocket server ready (Redis adapter: ${require('./services/socketService').isRedisAdapterConfigured() ? 'enabled' : 'disabled'})`);
      console.log(`✓ Health monitoring active`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Stop health monitoring
    try {
      stopMonitoring();
      console.log('✓ Health monitoring stopped');
    } catch (error) {
      console.error('Error stopping health monitoring:', error.message);
    }
    
    // Stop cron jobs
    try {
      const { stopCronJobs } = require('./jobs');
      stopCronJobs();
      console.log('✓ Cron jobs stopped');
    } catch (error) {
      console.error('Error stopping cron jobs:', error.message);
    }
    
    // Flush location buffer before shutdown (Requirements: 2.5)
    try {
      await stopLocationBatching();
      console.log('✓ Location buffer flushed');
    } catch (error) {
      console.error('Error flushing location buffer:', error.message);
    }
    
    // Close database connection
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      console.log('✓ Database connection closed');
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
    
    // Close Redis connection
    try {
      const { disconnectRedis } = require('./config/redis');
      await disconnectRedis();
      console.log('✓ Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis:', error.message);
    }
    
    console.log('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
