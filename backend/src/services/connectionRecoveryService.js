/**
 * Connection Recovery Service
 * Handles WebSocket connection recovery and state restoration
 * Requirements: 2.4 - Auto-reconnect within 3 seconds and resume tracking without data loss
 * 
 * Design Decision: Server-side connection state management
 * Rationale: Enables seamless reconnection by maintaining last known state in Redis
 */

const { getRedisClient, isRedisConnected } = require('../config/redis');
const { getTripLocationFromCache } = require('./locationPubSubService');

// Connection state storage
const CONNECTION_STATE_KEY = 'connection:state:';
const CONNECTION_STATE_TTL = 300; // 5 minutes

// Track disconnected clients for recovery
const disconnectedClients = new Map();

/**
 * Store connection state for recovery
 * Requirements: 2.4 - Resume tracking without data loss
 * 
 * @param {string} socketId - Socket ID
 * @param {Object} state - Connection state to store
 * @returns {Promise<boolean>} Whether storage was successful
 */
const storeConnectionState = async (socketId, state) => {
  const client = getRedisClient();
  
  if (!client) {
    // Fall back to in-memory storage
    disconnectedClients.set(socketId, {
      ...state,
      storedAt: Date.now()
    });
    return true;
  }

  try {
    const key = `${CONNECTION_STATE_KEY}${socketId}`;
    const payload = {
      ...state,
      storedAt: Date.now()
    };
    
    await client.setex(key, CONNECTION_STATE_TTL, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Error storing connection state:', error.message);
    // Fall back to in-memory
    disconnectedClients.set(socketId, {
      ...state,
      storedAt: Date.now()
    });
    return true;
  }
};

/**
 * Retrieve connection state for recovery
 * @param {string} socketId - Socket ID
 * @returns {Promise<Object|null>} Stored connection state or null
 */
const getConnectionState = async (socketId) => {
  const client = getRedisClient();
  
  // Check in-memory first
  if (disconnectedClients.has(socketId)) {
    const state = disconnectedClients.get(socketId);
    disconnectedClients.delete(socketId);
    return state;
  }
  
  if (!client) {
    return null;
  }

  try {
    const key = `${CONNECTION_STATE_KEY}${socketId}`;
    const data = await client.get(key);
    
    if (data) {
      await client.del(key); // Clean up after retrieval
      return JSON.parse(data);
    }
    
    return null;
  } catch (error) {
    console.error('Error retrieving connection state:', error.message);
    return null;
  }
};

/**
 * Clear connection state
 * @param {string} socketId - Socket ID
 * @returns {Promise<boolean>} Whether cleanup was successful
 */
const clearConnectionState = async (socketId) => {
  disconnectedClients.delete(socketId);
  
  const client = getRedisClient();
  if (!client) return true;

  try {
    const key = `${CONNECTION_STATE_KEY}${socketId}`;
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Error clearing connection state:', error.message);
    return false;
  }
};

/**
 * Build recovery data for a reconnecting client
 * Requirements: 2.4 - Send last known location on reconnect
 * 
 * @param {string} userId - User ID
 * @param {Array<string>} tripIds - Trip IDs the user was tracking
 * @returns {Promise<Object>} Recovery data
 */
const buildRecoveryData = async (userId, tripIds) => {
  const recoveryData = {
    userId,
    trips: {},
    recoveredAt: new Date().toISOString()
  };

  for (const tripId of tripIds) {
    try {
      const lastLocation = await getTripLocationFromCache(tripId);
      
      recoveryData.trips[tripId] = {
        lastLocation,
        hasData: !!lastLocation,
        locationAge: lastLocation ? Date.now() - lastLocation.timestamp : null
      };
    } catch (error) {
      console.error(`Error building recovery data for trip ${tripId}:`, error.message);
      recoveryData.trips[tripId] = {
        lastLocation: null,
        hasData: false,
        error: error.message
      };
    }
  }

  return recoveryData;
};

/**
 * Handle client disconnection - store state for potential recovery
 * @param {string} socketId - Socket ID
 * @param {string} userId - User ID
 * @param {Array<string>} subscribedTrips - Trips the client was subscribed to
 * @param {string} reason - Disconnection reason
 */
const handleDisconnection = async (socketId, userId, subscribedTrips, reason) => {
  // Only store state for recoverable disconnections
  const recoverableReasons = [
    'transport close',
    'transport error',
    'ping timeout',
    'client namespace disconnect'
  ];

  if (!recoverableReasons.includes(reason)) {
    return;
  }

  await storeConnectionState(socketId, {
    userId,
    subscribedTrips,
    disconnectedAt: Date.now(),
    reason
  });

  console.log(`Connection state stored for recovery: ${socketId} (${reason})`);
};

/**
 * Attempt to recover a client's previous session
 * @param {string} newSocketId - New socket ID after reconnection
 * @param {string} userId - User ID
 * @param {string} previousSocketId - Previous socket ID (if known)
 * @returns {Promise<Object>} Recovery result
 */
const attemptRecovery = async (newSocketId, userId, previousSocketId = null) => {
  let state = null;

  // Try to find previous state
  if (previousSocketId) {
    state = await getConnectionState(previousSocketId);
  }

  // If no state found by socket ID, try to find by user ID in memory
  if (!state) {
    for (const [socketId, clientState] of disconnectedClients.entries()) {
      if (clientState.userId === userId) {
        state = clientState;
        disconnectedClients.delete(socketId);
        break;
      }
    }
  }

  if (!state) {
    return {
      recovered: false,
      message: 'No previous session found'
    };
  }

  // Check if state is still valid (within TTL)
  const stateAge = Date.now() - state.storedAt;
  if (stateAge > CONNECTION_STATE_TTL * 1000) {
    return {
      recovered: false,
      message: 'Previous session expired'
    };
  }

  // Build recovery data
  const recoveryData = await buildRecoveryData(userId, state.subscribedTrips || []);

  return {
    recovered: true,
    previousState: state,
    recoveryData,
    reconnectionTime: stateAge,
    message: 'Session recovered successfully'
  };
};

/**
 * Get connection recovery statistics
 * @returns {Object} Recovery statistics
 */
const getRecoveryStats = () => {
  return {
    pendingRecoveries: disconnectedClients.size,
    oldestPending: disconnectedClients.size > 0 
      ? Math.min(...Array.from(disconnectedClients.values()).map(s => s.storedAt))
      : null
  };
};

/**
 * Clean up expired connection states
 */
const cleanupExpiredStates = () => {
  const now = Date.now();
  const expiredThreshold = CONNECTION_STATE_TTL * 1000;

  for (const [socketId, state] of disconnectedClients.entries()) {
    if (now - state.storedAt > expiredThreshold) {
      disconnectedClients.delete(socketId);
    }
  }
};

// Run cleanup every minute
setInterval(cleanupExpiredStates, 60000);

module.exports = {
  storeConnectionState,
  getConnectionState,
  clearConnectionState,
  buildRecoveryData,
  handleDisconnection,
  attemptRecovery,
  getRecoveryStats,
  cleanupExpiredStates,
  CONNECTION_STATE_TTL
};
