/**
 * Request Priority Middleware
 * Design Decision: Tag requests by priority for graceful degradation
 * Rationale: Under extreme load, shed low priority requests while maintaining critical features
 * 
 * Requirements: 8.1 - Prioritize SOS alerts, live tracking, and active bookings over other features
 * 
 * Priority Levels:
 * - CRITICAL: SOS, tracking - must always work
 * - NORMAL: Search, profile, bookings - standard operations
 * - LOW: Analytics, reports - can be shed under load
 */

const { getRedisClient, isRedisConnected } = require('../config/redis');

/**
 * Priority levels enum
 */
const PriorityLevel = {
  CRITICAL: 'critical',
  NORMAL: 'normal',
  LOW: 'low'
};

/**
 * Priority weights for sorting/comparison
 */
const PriorityWeight = {
  [PriorityLevel.CRITICAL]: 3,
  [PriorityLevel.NORMAL]: 2,
  [PriorityLevel.LOW]: 1
};

/**
 * Route priority mappings
 * Maps route patterns to priority levels
 */
const routePriorityMap = {
  // Critical routes - SOS, tracking (Requirements: 8.1)
  '/api/sos': PriorityLevel.CRITICAL,
  '/api/tracking': PriorityLevel.CRITICAL,
  '/api/bookings/active': PriorityLevel.CRITICAL,
  
  // Normal routes - core functionality
  '/api/search': PriorityLevel.NORMAL,
  '/api/profile': PriorityLevel.NORMAL,
  '/api/bookings': PriorityLevel.NORMAL,
  '/api/trips': PriorityLevel.NORMAL,
  '/api/driver': PriorityLevel.NORMAL,
  '/api/auth': PriorityLevel.NORMAL,
  '/api/notifications': PriorityLevel.NORMAL,
  
  // Low priority routes - analytics, reports
  '/api/admin/analytics': PriorityLevel.LOW,
  '/api/admin/reports': PriorityLevel.LOW,
  '/api/super-admin/analytics': PriorityLevel.LOW,
  '/api/super-admin/reports': PriorityLevel.LOW
};

/**
 * Load shedding configuration
 */
const loadSheddingConfig = {
  enabled: true,
  // Thresholds for load shedding (requests per second)
  thresholds: {
    warning: 5000,    // Start monitoring
    shedLow: 8000,    // Shed LOW priority requests
    shedNormal: 10000 // Shed NORMAL priority requests (only CRITICAL passes)
  },
  // Window for calculating request rate (ms)
  windowMs: 1000,
  // Redis key for tracking request count
  redisKey: 'load:request_count',
  // TTL for Redis counter (seconds)
  redisTTL: 5
};

/**
 * In-memory request counter (fallback when Redis unavailable)
 */
let memoryRequestCounter = {
  count: 0,
  windowStart: Date.now()
};

/**
 * Determine priority level for a request based on its path
 * @param {string} path - Request path
 * @returns {string} Priority level
 */
const determinePriority = (path) => {
  // Check exact matches first
  if (routePriorityMap[path]) {
    return routePriorityMap[path];
  }
  
  // Check prefix matches
  for (const [route, priority] of Object.entries(routePriorityMap)) {
    if (path.startsWith(route)) {
      return priority;
    }
  }
  
  // Default to NORMAL priority
  return PriorityLevel.NORMAL;
};

/**
 * Get current request rate from Redis or memory
 * @returns {Promise<number>} Current requests per second
 */
const getCurrentRequestRate = async () => {
  const redisClient = getRedisClient();
  
  if (redisClient && isRedisConnected()) {
    try {
      const count = await redisClient.get(loadSheddingConfig.redisKey);
      return parseInt(count || '0', 10);
    } catch (error) {
      console.warn('Priority middleware: Redis error, using memory counter', error.message);
    }
  }
  
  // Fallback to memory counter
  const now = Date.now();
  if (now - memoryRequestCounter.windowStart >= loadSheddingConfig.windowMs) {
    // Reset window
    const rate = memoryRequestCounter.count;
    memoryRequestCounter = { count: 0, windowStart: now };
    return rate;
  }
  
  return memoryRequestCounter.count;
};

/**
 * Increment request counter
 * @returns {Promise<void>}
 */
const incrementRequestCounter = async () => {
  const redisClient = getRedisClient();
  
  if (redisClient && isRedisConnected()) {
    try {
      const key = loadSheddingConfig.redisKey;
      const multi = redisClient.multi();
      multi.incr(key);
      multi.expire(key, loadSheddingConfig.redisTTL);
      await multi.exec();
      return;
    } catch (error) {
      // Fall through to memory counter
    }
  }
  
  // Memory fallback
  memoryRequestCounter.count++;
};

/**
 * Check if request should be shed based on current load
 * @param {string} priority - Request priority level
 * @param {number} currentRate - Current request rate
 * @returns {boolean} True if request should be shed
 */
const shouldShedRequest = (priority, currentRate) => {
  if (!loadSheddingConfig.enabled) {
    return false;
  }
  
  const { thresholds } = loadSheddingConfig;
  
  // CRITICAL requests are never shed
  if (priority === PriorityLevel.CRITICAL) {
    return false;
  }
  
  // Shed NORMAL and LOW when above shedNormal threshold
  if (currentRate >= thresholds.shedNormal) {
    return priority === PriorityLevel.NORMAL || priority === PriorityLevel.LOW;
  }
  
  // Shed only LOW when above shedLow threshold
  if (currentRate >= thresholds.shedLow) {
    return priority === PriorityLevel.LOW;
  }
  
  return false;
};

/**
 * Calculate retry-after time based on current load
 * @param {number} currentRate - Current request rate
 * @returns {number} Seconds to wait before retry
 */
const calculateRetryAfter = (currentRate) => {
  const { thresholds } = loadSheddingConfig;
  
  if (currentRate >= thresholds.shedNormal) {
    return 30; // High load - wait longer
  }
  
  if (currentRate >= thresholds.shedLow) {
    return 10; // Moderate load
  }
  
  return 5; // Default
};

/**
 * Priority tagging middleware
 * Tags each request with its priority level
 * Requirements: 8.1 - Tag requests by priority
 * 
 * @returns {Function} Express middleware
 */
const priorityMiddleware = () => {
  return (req, res, next) => {
    // Determine and attach priority to request
    const priority = determinePriority(req.path);
    req.priority = priority;
    req.priorityWeight = PriorityWeight[priority];
    
    // Add priority to response headers for debugging
    res.set('X-Request-Priority', priority);
    
    // Increment request counter (async, don't wait)
    incrementRequestCounter().catch(() => {});
    
    next();
  };
};

/**
 * Load shedding middleware
 * Rejects low priority requests under extreme load
 * Requirements: 8.1 - Shed non-critical requests under extreme load
 * 
 * @returns {Function} Express middleware
 */
const loadSheddingMiddleware = () => {
  return async (req, res, next) => {
    // Skip if load shedding is disabled
    if (!loadSheddingConfig.enabled) {
      return next();
    }
    
    // Get current request rate
    const currentRate = await getCurrentRequestRate();
    
    // Determine priority (may already be set by priorityMiddleware)
    const priority = req.priority || determinePriority(req.path);
    
    // Check if request should be shed
    if (shouldShedRequest(priority, currentRate)) {
      const retryAfter = calculateRetryAfter(currentRate);
      
      // Set headers for client retry logic
      res.set('Retry-After', retryAfter);
      res.set('X-Load-Shedding', 'true');
      res.set('X-Request-Priority', priority);
      
      // Return 503 Service Unavailable
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Server is under heavy load. Please retry later.',
        code: 'LOAD_SHEDDING',
        priority,
        retryAfter,
        currentLoad: currentRate
      });
    }
    
    next();
  };
};

/**
 * Combined priority and load shedding middleware
 * Convenience function that applies both middlewares
 * 
 * @returns {Function[]} Array of Express middlewares
 */
const priorityAndLoadShedding = () => {
  return [priorityMiddleware(), loadSheddingMiddleware()];
};

/**
 * Get current load shedding status
 * @returns {Promise<Object>} Load shedding status
 */
const getLoadSheddingStatus = async () => {
  const currentRate = await getCurrentRequestRate();
  const { thresholds } = loadSheddingConfig;
  
  let status = 'normal';
  let sheddingLevel = 'none';
  
  if (currentRate >= thresholds.shedNormal) {
    status = 'critical';
    sheddingLevel = 'normal_and_low';
  } else if (currentRate >= thresholds.shedLow) {
    status = 'high';
    sheddingLevel = 'low_only';
  } else if (currentRate >= thresholds.warning) {
    status = 'warning';
    sheddingLevel = 'none';
  }
  
  return {
    enabled: loadSheddingConfig.enabled,
    status,
    currentRate,
    thresholds,
    sheddingLevel,
    priorities: {
      critical: 'SOS, tracking - always allowed',
      normal: `Search, profile, bookings - ${sheddingLevel === 'normal_and_low' ? 'SHEDDING' : 'allowed'}`,
      low: `Analytics, reports - ${sheddingLevel !== 'none' ? 'SHEDDING' : 'allowed'}`
    }
  };
};

/**
 * Update load shedding configuration
 * @param {Object} config - New configuration values
 */
const updateLoadSheddingConfig = (config) => {
  if (typeof config.enabled === 'boolean') {
    loadSheddingConfig.enabled = config.enabled;
  }
  
  if (config.thresholds) {
    Object.assign(loadSheddingConfig.thresholds, config.thresholds);
  }
};

/**
 * Reset request counters (for testing)
 */
const resetRequestCounters = async () => {
  memoryRequestCounter = { count: 0, windowStart: Date.now() };
  
  const redisClient = getRedisClient();
  if (redisClient && isRedisConnected()) {
    try {
      await redisClient.del(loadSheddingConfig.redisKey);
    } catch (error) {
      // Ignore
    }
  }
};

module.exports = {
  PriorityLevel,
  PriorityWeight,
  priorityMiddleware,
  loadSheddingMiddleware,
  priorityAndLoadShedding,
  determinePriority,
  shouldShedRequest,
  getCurrentRequestRate,
  getLoadSheddingStatus,
  updateLoadSheddingConfig,
  resetRequestCounters,
  loadSheddingConfig,
  routePriorityMap
};
