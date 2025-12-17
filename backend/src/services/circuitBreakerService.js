/**
 * Circuit Breaker Service
 * Design Decision: Circuit breaker pattern for external service protection
 * Rationale: Prevents cascade failures when external services are overloaded
 * 
 * Requirements: 4.2 - Circuit breaker activation when API load exceeds threshold
 * Requirements: 8.2 - Non-critical service failures don't cascade to core features
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail fast
 * - HALF-OPEN: Testing if service has recovered
 */

const EventEmitter = require('events');

/**
 * Circuit Breaker States
 */
const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF-OPEN'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  failureThreshold: 50,      // Number of failures before opening circuit
  resetTimeout: 30000,       // Time in ms before attempting recovery (30 seconds)
  halfOpenMaxAttempts: 3,    // Number of test requests in half-open state
  monitorInterval: 5000,     // Interval for monitoring metrics
  volumeThreshold: 10        // Minimum requests before circuit can trip
};

/**
 * CircuitBreaker class implementing the circuit breaker pattern
 */
class CircuitBreaker extends EventEmitter {
  /**
   * Create a new CircuitBreaker
   * @param {string} name - Name of the circuit (for logging/metrics)
   * @param {Object} config - Configuration options
   */
  constructor(name, config = {}) {
    super();
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // State management
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    this.resetTimer = null;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      lastError: null,
      stateChanges: []
    };
  }

  /**
   * Get current circuit state
   * @returns {string} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   * @returns {boolean} True if requests can pass through
   */
  isAllowed() {
    return this.state !== CircuitState.OPEN;
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Result of the function
   * @throws {Error} If circuit is open or function fails
   */
  async execute(fn) {
    this.metrics.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      this.metrics.rejectedRequests++;
      const error = new Error(`Circuit breaker '${this.name}' is OPEN`);
      error.code = 'CIRCUIT_OPEN';
      error.circuitBreaker = this.name;
      error.retryAfter = this.getRetryAfter();
      throw error;
    }

    // In half-open state, limit concurrent test requests
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.metrics.rejectedRequests++;
        const error = new Error(`Circuit breaker '${this.name}' is testing recovery`);
        error.code = 'CIRCUIT_HALF_OPEN';
        error.circuitBreaker = this.name;
        throw error;
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  onSuccess() {
    this.metrics.successfulRequests++;
    this.successes++;

    if (this.state === CircuitState.HALF_OPEN) {
      // If we've had enough successes in half-open, close the circuit
      if (this.successes >= this.config.halfOpenMaxAttempts) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
  }

  /**
   * Record a failed request
   * @param {Error} error - The error that occurred
   */
  onFailure(error) {
    this.metrics.failedRequests++;
    this.metrics.lastError = {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    };
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.open();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should trip the circuit
      if (this.shouldTrip()) {
        this.open();
      }
    }
  }

  /**
   * Check if circuit should trip based on failure threshold
   * @returns {boolean} True if circuit should open
   */
  shouldTrip() {
    // Need minimum volume before tripping
    if (this.metrics.totalRequests < this.config.volumeThreshold) {
      return false;
    }
    return this.failures >= this.config.failureThreshold;
  }

  /**
   * Open the circuit (stop allowing requests)
   */
  open() {
    if (this.state === CircuitState.OPEN) return;

    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.lastStateChange = Date.now();
    
    this.recordStateChange(previousState, CircuitState.OPEN);
    this.emit('stateChange', { 
      name: this.name, 
      from: previousState, 
      to: CircuitState.OPEN,
      failures: this.failures
    });

    console.warn(`[CircuitBreaker] '${this.name}' OPENED after ${this.failures} failures`);

    // Schedule transition to half-open
    this.scheduleReset();
  }

  /**
   * Transition to half-open state (test if service recovered)
   */
  halfOpen() {
    if (this.state === CircuitState.HALF_OPEN) return;

    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.lastStateChange = Date.now();
    this.halfOpenAttempts = 0;
    this.successes = 0;
    
    this.recordStateChange(previousState, CircuitState.HALF_OPEN);
    this.emit('stateChange', { 
      name: this.name, 
      from: previousState, 
      to: CircuitState.HALF_OPEN 
    });

    console.log(`[CircuitBreaker] '${this.name}' transitioning to HALF-OPEN`);
  }

  /**
   * Close the circuit (resume normal operation)
   */
  close() {
    if (this.state === CircuitState.CLOSED) return;

    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.lastStateChange = Date.now();
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    this.recordStateChange(previousState, CircuitState.CLOSED);
    this.emit('stateChange', { 
      name: this.name, 
      from: previousState, 
      to: CircuitState.CLOSED 
    });

    console.log(`[CircuitBreaker] '${this.name}' CLOSED - service recovered`);
  }

  /**
   * Schedule transition from OPEN to HALF-OPEN
   */
  scheduleReset() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.halfOpen();
      }
    }, this.config.resetTimeout);
  }

  /**
   * Get time until circuit might allow requests again
   * @returns {number} Milliseconds until retry
   */
  getRetryAfter() {
    if (this.state !== CircuitState.OPEN) return 0;
    
    const elapsed = Date.now() - this.lastStateChange;
    const remaining = this.config.resetTimeout - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Record state change for metrics
   * @param {string} from - Previous state
   * @param {string} to - New state
   */
  recordStateChange(from, to) {
    this.metrics.stateChanges.push({
      from,
      to,
      timestamp: new Date().toISOString(),
      failures: this.failures
    });

    // Keep only last 100 state changes
    if (this.metrics.stateChanges.length > 100) {
      this.metrics.stateChanges = this.metrics.stateChanges.slice(-100);
    }
  }

  /**
   * Get circuit breaker metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      config: this.config,
      ...this.metrics,
      retryAfter: this.getRetryAfter()
    };
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      lastError: null,
      stateChanges: []
    };

    console.log(`[CircuitBreaker] '${this.name}' has been reset`);
  }

  /**
   * Force the circuit to a specific state (for testing/admin)
   * @param {string} state - Target state
   */
  forceState(state) {
    if (!Object.values(CircuitState).includes(state)) {
      throw new Error(`Invalid state: ${state}`);
    }

    const previousState = this.state;
    this.state = state;
    this.lastStateChange = Date.now();
    
    if (state === CircuitState.OPEN) {
      this.scheduleReset();
    } else if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.recordStateChange(previousState, state);
    console.log(`[CircuitBreaker] '${this.name}' forced to ${state}`);
  }
}


/**
 * CircuitBreakerRegistry - Manages multiple circuit breakers
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   * @param {string} name - Circuit breaker name
   * @param {Object} config - Configuration options
   * @returns {CircuitBreaker} Circuit breaker instance
   */
  get(name, config = {}) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name);
  }

  /**
   * Check if a circuit breaker exists
   * @param {string} name - Circuit breaker name
   * @returns {boolean} True if exists
   */
  has(name) {
    return this.breakers.has(name);
  }

  /**
   * Remove a circuit breaker
   * @param {string} name - Circuit breaker name
   */
  remove(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      this.breakers.delete(name);
    }
  }

  /**
   * Get all circuit breakers
   * @returns {Map} Map of all circuit breakers
   */
  getAll() {
    return this.breakers;
  }

  /**
   * Get status of all circuit breakers
   * @returns {Object} Status object with all breakers
   */
  getStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getMetrics();
    }
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Singleton registry instance
const registry = new CircuitBreakerRegistry();

/**
 * Pre-configured circuit breakers for external services
 */
const CircuitBreakers = {
  // Payment gateway circuit breaker
  PAYMENT: 'payment-gateway',
  // Cashfree payment gateway circuit breaker
  CASHFREE: 'cashfree-payment',
  // Notification services circuit breaker
  NOTIFICATION: 'notification-service',
  // SMS service circuit breaker
  SMS: 'sms-service',
  // Email service circuit breaker
  EMAIL: 'email-service',
  // WhatsApp service circuit breaker
  WHATSAPP: 'whatsapp-service',
  // External API circuit breaker
  EXTERNAL_API: 'external-api'
};

/**
 * Get a circuit breaker by name with default config
 * @param {string} name - Circuit breaker name
 * @param {Object} config - Optional custom config
 * @returns {CircuitBreaker} Circuit breaker instance
 */
const getCircuitBreaker = (name, config = {}) => {
  return registry.get(name, {
    failureThreshold: 50,
    resetTimeout: 30000,
    ...config
  });
};

/**
 * Wrap an async function with circuit breaker protection
 * @param {string} breakerName - Name of the circuit breaker to use
 * @param {Function} fn - Async function to wrap
 * @param {Object} config - Optional circuit breaker config
 * @returns {Function} Wrapped function
 */
const withCircuitBreaker = (breakerName, fn, config = {}) => {
  const breaker = getCircuitBreaker(breakerName, config);
  
  return async (...args) => {
    return breaker.execute(() => fn(...args));
  };
};

/**
 * Create a circuit breaker middleware for Express
 * @param {string} breakerName - Name of the circuit breaker
 * @param {Object} config - Optional circuit breaker config
 * @returns {Function} Express middleware
 */
const circuitBreakerMiddleware = (breakerName, config = {}) => {
  const breaker = getCircuitBreaker(breakerName, config);
  
  return (req, res, next) => {
    if (!breaker.isAllowed()) {
      const retryAfter = breaker.getRetryAfter();
      res.set('Retry-After', retryAfter);
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: `Circuit breaker '${breakerName}' is open`,
        retryAfter,
        code: 'CIRCUIT_OPEN'
      });
    }
    next();
  };
};

/**
 * Get status of all circuit breakers
 * @returns {Object} Status of all circuit breakers
 */
const getCircuitBreakerStatus = () => {
  return registry.getStatus();
};

/**
 * Reset a specific circuit breaker
 * @param {string} name - Circuit breaker name
 */
const resetCircuitBreaker = (name) => {
  const breaker = registry.breakers.get(name);
  if (breaker) {
    breaker.reset();
  }
};

/**
 * Reset all circuit breakers
 */
const resetAllCircuitBreakers = () => {
  registry.resetAll();
};

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  CircuitBreakers,
  getCircuitBreaker,
  withCircuitBreaker,
  circuitBreakerMiddleware,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  registry,
  DEFAULT_CONFIG
};
