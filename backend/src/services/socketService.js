/**
 * Socket.io WebSocket Service
 * Handles real-time communication for trip tracking and SOS alerts
 * Requirements: 2.1, 2.2, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 7.2
 * 
 * Design Decision: Redis adapter for horizontal scaling
 * Rationale: Allows multiple Socket.io instances to communicate via Redis pub/sub,
 * enabling horizontal scaling to handle 3K+ concurrent tracking sessions
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const { verifyToken } = require('./tokenService');
const { getRedisClient, isRedisConnected } = require('../config/redis');
const { 
  initializeLocationPubSub, 
  publishLocationUpdate,
  getTripLocationFromCache,
  getLocationPubSubStatus,
  cleanupLocationPubSub
} = require('./locationPubSubService');
const {
  handleDisconnection,
  attemptRecovery,
  getRecoveryStats
} = require('./connectionRecoveryService');

// Store active socket connections
const connectedClients = new Map();
const adminSockets = new Set();
const customerSupportSockets = new Set(); // Customer support dashboard sockets
const tripSubscriptions = new Map(); // tripId -> Set of socket ids
const driverLocations = new Map(); // tripId -> { coordinates, speed, timestamp, driverId }
const tripDrivers = new Map(); // tripId -> driverId (for driver tracking)
const contactTrackingRooms = new Map(); // tripId -> Map of contactPhone -> room name

// Location update interval (10 seconds as per Requirements 5.2)
const LOCATION_UPDATE_INTERVAL_MS = 10000;

let io = null;

// Redis pub/sub clients for Socket.io adapter
let pubClient = null;
let subClient = null;
let redisAdapterConfigured = false;

/**
 * Configure Redis adapter for Socket.io horizontal scaling
 * Requirements: 2.1, 2.2 - Handle 3K+ concurrent tracking sessions
 * 
 * @param {Object} ioServer - Socket.io server instance
 * @returns {boolean} Whether Redis adapter was configured successfully
 */
const configureRedisAdapter = async (ioServer) => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Create dedicated pub/sub clients for Socket.io adapter
    // These are separate from the main Redis client to avoid blocking
    pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 5) return null;
        return Math.min(times * 1000, 5000);
      }
    });

    subClient = pubClient.duplicate();

    // Wait for both clients to be ready
    await Promise.all([
      new Promise((resolve, reject) => {
        pubClient.once('ready', resolve);
        pubClient.once('error', reject);
        setTimeout(() => reject(new Error('Pub client connection timeout')), 10000);
      }),
      new Promise((resolve, reject) => {
        subClient.once('ready', resolve);
        subClient.once('error', reject);
        setTimeout(() => reject(new Error('Sub client connection timeout')), 10000);
      })
    ]);

    // Configure the Redis adapter
    ioServer.adapter(createAdapter(pubClient, subClient));
    redisAdapterConfigured = true;
    
    console.log('✓ Socket.io Redis adapter configured for horizontal scaling');
    return true;
  } catch (error) {
    console.warn('Socket.io Redis adapter not configured:', error.message);
    console.warn('Socket.io will operate in single-instance mode');
    redisAdapterConfigured = false;
    return false;
  }
};

/**
 * Check if Redis adapter is configured
 * @returns {boolean} Whether Redis adapter is active
 */
const isRedisAdapterConfigured = () => redisAdapterConfigured;

/**
 * Initialize Socket.io server with Express HTTP server
 * Requirements: 2.1, 2.2 - Maintain WebSocket connections with <100ms latency
 * 
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} Socket.io server instance
 */
const initializeSocketServer = async (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    // Prefer WebSocket transport for lower latency
    transports: ['websocket', 'polling']
  });

  // Configure Redis adapter for horizontal scaling
  await configureRedisAdapter(io);

  // Initialize location pub/sub with callback to broadcast to Socket.io rooms
  // Requirements: 2.2 - Redis pub/sub for location updates
  await initializeLocationPubSub((tripId, locationData) => {
    // Broadcast received location updates to Socket.io rooms
    if (io) {
      io.to(`trip:${tripId}`).emit('location:update', locationData);
      io.to('admin-room').emit('trip:location', locationData);
    }
  });

  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const result = verifyToken(token);
    
    if (!result.valid) {
      return next(new Error(result.error || 'Invalid token'));
    }

    // Attach user data to socket
    socket.user = result.payload;
    next();
  });

  // Handle socket connections
  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    const userRole = socket.user.role;

    console.log(`Socket connected: ${socket.id} (User: ${userId}, Role: ${userRole})`);

    // Store connection
    connectedClients.set(socket.id, {
      socketId: socket.id,
      userId,
      role: userRole,
      connectedAt: new Date()
    });

    // Track admin connections for SOS alerts
    if (userRole === 'admin' || userRole === 'operations' || userRole === 'super_admin') {
      adminSockets.add(socket.id);
      socket.join('admin-room');
      console.log(`Admin socket joined: ${socket.id}`);
    }

    // Track customer support connections for SOS alerts - Requirements: 5.3
    if (userRole === 'support' || userRole === 'customer_support' || userRole === 'admin' || userRole === 'super_admin') {
      customerSupportSockets.add(socket.id);
      socket.join('support-room');
      console.log(`Customer support socket joined: ${socket.id}`);
    }

    // Handle trip subscription (for real-time tracking)
    // Requirements: 2.4 - Send last known location on reconnect
    socket.on('subscribe:trip', async (tripId) => {
      if (!tripId) return;
      
      socket.join(`trip:${tripId}`);
      
      if (!tripSubscriptions.has(tripId)) {
        tripSubscriptions.set(tripId, new Set());
      }
      tripSubscriptions.get(tripId).add(socket.id);
      
      console.log(`Socket ${socket.id} subscribed to trip: ${tripId}`);
      
      // Send last known location immediately from Redis cache or memory
      // Requirements: 2.4 - Resume tracking without data loss
      try {
        let lastLocation = driverLocations.get(tripId);
        
        // Try Redis cache if not in memory
        if (!lastLocation) {
          lastLocation = await getTripLocationFromCache(tripId);
        }
        
        if (lastLocation) {
          socket.emit('location:update', lastLocation);
          // Also send reconnection status
          socket.emit('tracking:reconnected', {
            tripId,
            lastLocation,
            reconnectedAt: new Date().toISOString(),
            message: 'Tracking resumed with last known location'
          });
        }
      } catch (error) {
        console.error(`Error sending last location for trip ${tripId}:`, error.message);
      }
    });

    // Handle reconnection request with last known state
    // Requirements: 2.4 - Auto-reconnect within 3 seconds and resume tracking
    socket.on('tracking:reconnect', async (data) => {
      const { tripId, lastKnownTimestamp } = data;
      
      if (!tripId) return;
      
      // Re-subscribe to trip
      socket.join(`trip:${tripId}`);
      
      if (!tripSubscriptions.has(tripId)) {
        tripSubscriptions.set(tripId, new Set());
      }
      tripSubscriptions.get(tripId).add(socket.id);
      
      // Get current location from cache
      let currentLocation = driverLocations.get(tripId);
      if (!currentLocation) {
        currentLocation = await getTripLocationFromCache(tripId);
      }
      
      // Send reconnection response with current state
      socket.emit('tracking:reconnected', {
        tripId,
        currentLocation,
        reconnectedAt: new Date().toISOString(),
        missedUpdates: lastKnownTimestamp && currentLocation 
          ? currentLocation.timestamp > lastKnownTimestamp 
          : false,
        message: currentLocation 
          ? 'Tracking resumed successfully' 
          : 'Tracking resumed, waiting for location updates'
      });
      
      console.log(`Socket ${socket.id} reconnected to trip: ${tripId}`);
    });

    // Handle full session recovery request
    // Requirements: 2.4 - Resume tracking without data loss
    socket.on('session:recover', async (data) => {
      const { previousSocketId } = data;
      
      try {
        const recoveryResult = await attemptRecovery(socket.id, userId, previousSocketId);
        
        if (recoveryResult.recovered) {
          // Re-subscribe to all previous trips
          const previousTrips = recoveryResult.previousState?.subscribedTrips || [];
          
          for (const tripId of previousTrips) {
            socket.join(`trip:${tripId}`);
            
            if (!tripSubscriptions.has(tripId)) {
              tripSubscriptions.set(tripId, new Set());
            }
            tripSubscriptions.get(tripId).add(socket.id);
          }
          
          console.log(`Session recovered for ${socket.id}: ${previousTrips.length} trips restored`);
        }
        
        socket.emit('session:recovered', recoveryResult);
      } catch (error) {
        console.error(`Session recovery error for ${socket.id}:`, error.message);
        socket.emit('session:recovered', {
          recovered: false,
          error: error.message
        });
      }
    });

    // Handle trip unsubscription
    socket.on('unsubscribe:trip', (tripId) => {
      if (!tripId) return;
      
      socket.leave(`trip:${tripId}`);
      
      if (tripSubscriptions.has(tripId)) {
        tripSubscriptions.get(tripId).delete(socket.id);
        if (tripSubscriptions.get(tripId).size === 0) {
          tripSubscriptions.delete(tripId);
        }
      }
      
      console.log(`Socket ${socket.id} unsubscribed from trip: ${tripId}`);
    });

    // Handle GPS location updates from drivers
    // Requirements: 2.1, 2.2, 5.1, 5.2 - Real-time location updates with <100ms latency
    socket.on('location:update', async (data) => {
      const { tripId, coordinates, speed, heading, timestamp } = data;
      
      if (!tripId || !coordinates) return;
      
      // Validate coordinates
      if (typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
        return;
      }
      
      if (coordinates.lat < -90 || coordinates.lat > 90 || 
          coordinates.lng < -180 || coordinates.lng > 180) {
        return;
      }
      
      const locationData = {
        tripId,
        coordinates,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: timestamp || new Date().toISOString(),
        driverId: userId
      };
      
      // Store latest driver location in memory (for quick access)
      driverLocations.set(tripId, locationData);
      tripDrivers.set(tripId, userId);
      
      // Broadcast to all subscribers via Redis pub/sub (for horizontal scaling)
      // Requirements: 2.2 - Broadcast within 500ms using Redis pub/sub
      await broadcastTripLocation(tripId, locationData);
    });

    // Handle driver starting tracking for a trip
    socket.on('tracking:start', (data) => {
      const { tripId } = data;
      if (!tripId) return;
      
      tripDrivers.set(tripId, userId);
      socket.join(`trip:${tripId}:driver`);
      console.log(`Driver ${userId} started tracking for trip: ${tripId}`);
    });

    // Handle driver stopping tracking
    socket.on('tracking:stop', (data) => {
      const { tripId } = data;
      if (!tripId) return;
      
      tripDrivers.delete(tripId);
      driverLocations.delete(tripId);
      socket.leave(`trip:${tripId}:driver`);
      console.log(`Driver ${userId} stopped tracking for trip: ${tripId}`);
    });

    // Handle disconnection
    // Requirements: 2.4 - Store state for recovery on disconnect
    socket.on('disconnect', async (reason) => {
      console.log(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
      
      // Get subscribed trips before cleanup
      const subscribedTrips = [];
      for (const [tripId, sockets] of tripSubscriptions.entries()) {
        if (sockets.has(socket.id)) {
          subscribedTrips.push(tripId);
        }
      }
      
      // Store connection state for potential recovery
      // Requirements: 2.4 - Enable reconnection within 3 seconds
      await handleDisconnection(socket.id, userId, subscribedTrips, reason);
      
      // Clean up connections
      connectedClients.delete(socket.id);
      adminSockets.delete(socket.id);
      customerSupportSockets.delete(socket.id);
      
      // Clean up trip subscriptions
      for (const [tripId, sockets] of tripSubscriptions.entries()) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          tripSubscriptions.delete(tripId);
        }
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error.message);
    });
  });

  console.log('✓ Socket.io server initialized');
  return io;
};

/**
 * Get the Socket.io server instance
 * @returns {Object|null} Socket.io server instance
 */
const getIO = () => io;

/**
 * Broadcast trip location update to all subscribers
 * Requirements: 2.2, 4.4 - Broadcast within 500ms using Redis pub/sub
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} locationData - Location data
 * @returns {Promise<Object>} Broadcast result
 */
const broadcastTripLocation = async (tripId, locationData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return { success: false, error: 'Socket.io not initialized' };
  }

  // Try Redis pub/sub first for horizontal scaling
  // Requirements: 2.2 - Use Redis pub/sub for location broadcasting
  const pubSubStatus = getLocationPubSubStatus();
  
  if (pubSubStatus.initialized && pubSubStatus.pubClientConnected) {
    // Publish via Redis - will be received by all Socket.io instances
    const result = await publishLocationUpdate(tripId, {
      driverId: locationData.driverId,
      coordinates: locationData.coordinates,
      speed: locationData.speed,
      heading: locationData.heading,
      timestamp: locationData.timestamp
    });
    
    if (result.success) {
      return result;
    }
    // Fall through to direct broadcast if pub/sub fails
    console.warn('Redis pub/sub failed, falling back to direct broadcast');
  }

  // Fallback: Direct Socket.io broadcast (single instance mode)
  io.to(`trip:${tripId}`).emit('trip:location', locationData);
  io.to('admin-room').emit('trip:location', locationData);
  
  return { success: true, fallback: true };
};

/**
 * Broadcast ETA update for a trip
 * Requirements: 4.4
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} etaData - ETA data
 */
const broadcastTripETA = (tripId, etaData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return;
  }

  const payload = {
    tripId,
    eta: etaData.eta,
    distance: etaData.distance,
    updatedAt: new Date().toISOString()
  };

  io.to(`trip:${tripId}`).emit('trip:eta', payload);
  io.to('admin-room').emit('trip:eta', payload);
};

/**
 * Broadcast trip status change
 * @param {string} tripId - Trip ID
 * @param {Object} statusData - Status data
 */
const broadcastTripStatus = (tripId, statusData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return;
  }

  io.to(`trip:${tripId}`).emit('trip:status', {
    tripId,
    status: statusData.status,
    updatedAt: new Date().toISOString(),
    ...statusData
  });
  
  io.to('admin-room').emit('trip:status', {
    tripId,
    status: statusData.status,
    updatedAt: new Date().toISOString(),
    ...statusData
  });
};

/**
 * Send high-priority SOS alert to admin and customer support dashboards
 * Requirements: 5.2, 5.3, 7.2 - Ensure delivery within 5 seconds to both dashboards
 * 
 * @param {Object} alertData - SOS alert data
 * @returns {Object} Notification result
 */
const broadcastSOSAlert = (alertData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return { 
      success: false, 
      error: 'Socket.io not initialized',
      adminNotified: false,
      supportNotified: false
    };
  }

  const startTime = Date.now();

  const payload = {
    type: 'sos_alert',
    priority: 'critical',
    alertId: alertData.alertId,
    tripId: alertData.tripId,
    triggeredBy: alertData.triggeredBy,
    userType: alertData.userType,
    location: alertData.location,
    journeyDetails: alertData.journeyDetails || null,
    status: alertData.status || 'active',
    createdAt: alertData.createdAt || new Date().toISOString(),
    timestamp: new Date().toISOString()
  };

  // Emit to all admin sockets - Requirements: 5.2
  io.to('admin-room').emit('sos:alert', payload);
  
  // Emit to all customer support sockets - Requirements: 5.3
  io.to('support-room').emit('sos:alert', payload);

  const deliveryTime = Date.now() - startTime;
  
  // Log if delivery took longer than 5 seconds (requirement 5.2, 5.3)
  if (deliveryTime > 5000) {
    console.warn(`SOS alert delivery exceeded 5 seconds: ${deliveryTime}ms`);
  }

  return {
    success: true,
    adminNotified: adminSockets.size > 0,
    supportNotified: customerSupportSockets.size > 0,
    adminSocketsCount: adminSockets.size,
    supportSocketsCount: customerSupportSockets.size,
    deliveryTimeMs: deliveryTime
  };
};

/**
 * Broadcast SOS alert status update to both admin and customer support dashboards
 * Requirements: 5.2, 5.3
 * @param {Object} updateData - Update data
 * @returns {Object} Notification result
 */
const broadcastSOSUpdate = (updateData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return { success: false, error: 'Socket.io not initialized' };
  }

  const payload = {
    alertId: updateData.alertId,
    status: updateData.status,
    acknowledgedBy: updateData.acknowledgedBy,
    resolvedBy: updateData.resolvedBy,
    resolution: updateData.resolution,
    location: updateData.location,
    updatedAt: new Date().toISOString()
  };

  // Notify both dashboards
  io.to('admin-room').emit('sos:update', payload);
  io.to('support-room').emit('sos:update', payload);

  return {
    success: true,
    adminNotified: adminSockets.size > 0,
    supportNotified: customerSupportSockets.size > 0
  };
};

/**
 * Send notification to specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const sendToUser = (userId, event, data) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return;
  }

  // Find all sockets for this user
  for (const [socketId, client] of connectedClients.entries()) {
    if (client.userId === userId) {
      io.to(socketId).emit(event, data);
    }
  }
};

/**
 * Get connection statistics
 * @returns {Object} Connection stats
 */
const getConnectionStats = () => {
  const recoveryStats = getRecoveryStats();
  
  return {
    totalConnections: connectedClients.size,
    adminConnections: adminSockets.size,
    supportConnections: customerSupportSockets.size,
    activeTrips: tripSubscriptions.size,
    tripSubscribers: Array.from(tripSubscriptions.entries()).map(([tripId, sockets]) => ({
      tripId,
      subscriberCount: sockets.size
    })),
    recovery: recoveryStats
  };
};

/**
 * Get dashboard notification stats for SOS alerts
 * Requirements: 5.2, 5.3
 * @returns {Object} Dashboard stats
 */
const getDashboardStats = () => {
  return {
    adminDashboard: {
      connected: adminSockets.size > 0,
      socketCount: adminSockets.size
    },
    supportDashboard: {
      connected: customerSupportSockets.size > 0,
      socketCount: customerSupportSockets.size
    }
  };
};

/**
 * Check if Socket.io is initialized
 * @returns {boolean}
 */
const isInitialized = () => io !== null;

/**
 * Get current driver location for a trip
 * Requirements: 5.1
 * 
 * @param {string} tripId - Trip ID
 * @returns {Object|null} Current location data or null
 */
const getDriverLocation = (tripId) => {
  return driverLocations.get(tripId) || null;
};

/**
 * Send proximity notification to passenger
 * Requirements: 5.4 - Notify when driver approaches pickup point
 * 
 * @param {string} tripId - Trip ID
 * @param {string} passengerId - Passenger user ID
 * @param {Object} notificationData - Notification data
 */
const sendProximityNotification = (tripId, passengerId, notificationData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return;
  }

  const payload = {
    type: 'proximity_alert',
    tripId,
    message: notificationData.message || 'Driver is approaching your pickup point',
    distance: notificationData.distance,
    eta: notificationData.eta,
    timestamp: new Date().toISOString()
  };

  // Send to specific passenger
  sendToUser(passengerId, 'trip:proximity', payload);
  
  // Also broadcast to trip room
  io.to(`trip:${tripId}`).emit('trip:proximity', payload);
};

/**
 * Broadcast driver info to trip subscribers
 * Requirements: 5.5 - Display driver details, vehicle info, and contact option
 * 
 * @param {string} tripId - Trip ID
 * @param {Object} driverInfo - Driver information
 */
const broadcastDriverInfo = (tripId, driverInfo) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return;
  }

  const payload = {
    tripId,
    driver: {
      name: driverInfo.name,
      phone: driverInfo.phone,
      rating: driverInfo.rating,
      photo: driverInfo.photo
    },
    vehicle: {
      make: driverInfo.vehicle?.make,
      model: driverInfo.vehicle?.model,
      color: driverInfo.vehicle?.color,
      registrationNumber: driverInfo.vehicle?.registrationNumber
    },
    timestamp: new Date().toISOString()
  };

  io.to(`trip:${tripId}`).emit('trip:driver_info', payload);
};

/**
 * Get trip subscribers count
 * @param {string} tripId - Trip ID
 * @returns {number} Number of subscribers
 */
const getTripSubscribersCount = (tripId) => {
  const subscribers = tripSubscriptions.get(tripId);
  return subscribers ? subscribers.size : 0;
};

/**
 * Check if a trip has active tracking
 * @param {string} tripId - Trip ID
 * @returns {boolean}
 */
const isTripBeingTracked = (tripId) => {
  return tripDrivers.has(tripId);
};

/**
 * Create a contact-specific tracking room
 * Requirements: 2.3, 2.4 - Contact-specific tracking rooms for location sharing
 * 
 * @param {string} tripId - Trip ID
 * @param {string} contactPhone - Contact phone number
 * @returns {string} Room name
 */
const createContactTrackingRoom = (tripId, contactPhone) => {
  const roomName = `contact:${tripId}:${contactPhone}`;
  
  if (!contactTrackingRooms.has(tripId)) {
    contactTrackingRooms.set(tripId, new Map());
  }
  contactTrackingRooms.get(tripId).set(contactPhone, roomName);
  
  return roomName;
};

/**
 * Get contact tracking room name
 * @param {string} tripId - Trip ID
 * @param {string} contactPhone - Contact phone number
 * @returns {string|null} Room name or null if not found
 */
const getContactTrackingRoom = (tripId, contactPhone) => {
  const tripRooms = contactTrackingRooms.get(tripId);
  return tripRooms ? tripRooms.get(contactPhone) : null;
};

/**
 * Broadcast location update to all contacts for a trip
 * Requirements: 2.3, 3.3 - Broadcast GPS coordinates to selected contacts every 10 seconds
 * 
 * @param {string} tripId - Trip ID
 * @param {Array} contacts - Array of contacts to broadcast to
 * @param {Object} locationData - Location data to broadcast
 * @returns {Object} Broadcast result with count of contacts notified
 */
const broadcastToContacts = (tripId, contacts, locationData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return { success: false, error: 'Socket.io not initialized', notifiedCount: 0 };
  }

  if (!contacts || !Array.isArray(contacts)) {
    return { success: false, error: 'Invalid contacts array', notifiedCount: 0 };
  }

  const payload = {
    type: 'location_update',
    tripId,
    coordinates: locationData.coordinates,
    timestamp: locationData.timestamp || new Date().toISOString(),
    speed: locationData.speed || 0
  };

  let notifiedCount = 0;

  // Broadcast to each contact's tracking room
  for (const contact of contacts) {
    const roomName = getContactTrackingRoom(tripId, contact.phone) || 
                     createContactTrackingRoom(tripId, contact.phone);
    
    io.to(roomName).emit('location:shared', payload);
    notifiedCount++;
  }

  // Also broadcast to the main trip room for any subscribers
  io.to(`trip:${tripId}`).emit('location:shared', payload);

  return {
    success: true,
    tripId,
    notifiedCount,
    contactCount: contacts.length,
    timestamp: payload.timestamp
  };
};

/**
 * Subscribe a socket to a contact tracking room
 * @param {Object} socket - Socket instance
 * @param {string} tripId - Trip ID
 * @param {string} contactPhone - Contact phone number
 */
const subscribeToContactTracking = (socket, tripId, contactPhone) => {
  const roomName = getContactTrackingRoom(tripId, contactPhone) || 
                   createContactTrackingRoom(tripId, contactPhone);
  
  socket.join(roomName);
  console.log(`Socket ${socket.id} subscribed to contact tracking: ${roomName}`);
};

/**
 * Unsubscribe a socket from a contact tracking room
 * @param {Object} socket - Socket instance
 * @param {string} tripId - Trip ID
 * @param {string} contactPhone - Contact phone number
 */
const unsubscribeFromContactTracking = (socket, tripId, contactPhone) => {
  const roomName = getContactTrackingRoom(tripId, contactPhone);
  
  if (roomName) {
    socket.leave(roomName);
    console.log(`Socket ${socket.id} unsubscribed from contact tracking: ${roomName}`);
  }
};

/**
 * Clean up contact tracking rooms for a trip
 * Requirements: 2.5 - Cleanup when trip ends
 * 
 * @param {string} tripId - Trip ID
 */
const cleanupContactTrackingRooms = (tripId) => {
  const tripRooms = contactTrackingRooms.get(tripId);
  
  if (tripRooms) {
    // Notify all contacts that tracking has ended
    for (const [contactPhone, roomName] of tripRooms.entries()) {
      if (io) {
        io.to(roomName).emit('tracking:ended', {
          tripId,
          message: 'Trip has ended',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    contactTrackingRooms.delete(tripId);
    console.log(`Cleaned up contact tracking rooms for trip: ${tripId}`);
  }
};

/**
 * Notify contacts that trip has completed
 * Requirements: 2.5, 3.4 - Notify contacts of trip completion
 * 
 * @param {string} tripId - Trip ID
 * @param {Array} contacts - Array of contacts to notify
 * @returns {Object} Notification result
 */
const notifyContactsTripEnded = (tripId, contacts) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return { success: false, error: 'Socket.io not initialized', notifiedCount: 0 };
  }

  const payload = {
    type: 'trip_ended',
    tripId,
    message: 'The trip has been completed',
    timestamp: new Date().toISOString()
  };

  let notifiedCount = 0;

  for (const contact of contacts) {
    const roomName = getContactTrackingRoom(tripId, contact.phone);
    if (roomName) {
      io.to(roomName).emit('tracking:ended', payload);
      notifiedCount++;
    }
  }

  // Clean up rooms after notification
  cleanupContactTrackingRooms(tripId);

  return {
    success: true,
    tripId,
    notifiedCount,
    timestamp: payload.timestamp
  };
};

/**
 * Get contact tracking room statistics
 * @param {string} tripId - Trip ID
 * @returns {Object} Room statistics
 */
const getContactTrackingStats = (tripId) => {
  const tripRooms = contactTrackingRooms.get(tripId);
  
  if (!tripRooms) {
    return { tripId, roomCount: 0, rooms: [] };
  }

  return {
    tripId,
    roomCount: tripRooms.size,
    rooms: Array.from(tripRooms.entries()).map(([phone, room]) => ({
      contactPhone: phone,
      roomName: room
    }))
  };
};

/**
 * Broadcast support escalation to customer support dashboard
 * Requirements: 8.7 - Escalate to customer support with trip details
 * 
 * @param {Object} escalationData - Escalation data
 * @returns {Object} Broadcast result
 */
const broadcastSupportEscalation = (escalationData) => {
  if (!io) {
    console.warn('Socket.io not initialized');
    return { success: false, error: 'Socket.io not initialized' };
  }

  const payload = {
    type: 'safety_escalation',
    ticketId: escalationData.ticketId,
    tripId: escalationData.tripId,
    passengerId: escalationData.passengerId,
    location: escalationData.location,
    priority: escalationData.priority || 'critical',
    timestamp: new Date().toISOString()
  };

  // Emit to customer support room
  io.to('support-room').emit('support:escalation', payload);
  
  // Also emit to admin room for visibility
  io.to('admin-room').emit('support:escalation', payload);

  return {
    success: true,
    supportNotified: customerSupportSockets.size > 0,
    adminNotified: adminSockets.size > 0
  };
};

/**
 * Cleanup Redis adapter connections
 * @returns {Promise<void>}
 */
const cleanupRedisAdapter = async () => {
  try {
    // Cleanup location pub/sub first
    await cleanupLocationPubSub();
    
    if (pubClient) {
      await pubClient.quit();
      pubClient = null;
    }
    if (subClient) {
      await subClient.quit();
      subClient = null;
    }
    redisAdapterConfigured = false;
    console.log('Socket.io Redis adapter connections closed');
  } catch (error) {
    console.error('Error cleaning up Redis adapter:', error.message);
  }
};

/**
 * Get Redis adapter status
 * @returns {Object} Redis adapter status
 */
const getRedisAdapterStatus = () => {
  const locationStatus = getLocationPubSubStatus();
  
  return {
    configured: redisAdapterConfigured,
    pubClientConnected: pubClient ? pubClient.status === 'ready' : false,
    subClientConnected: subClient ? subClient.status === 'ready' : false,
    locationPubSub: locationStatus
  };
};

module.exports = {
  initializeSocketServer,
  getIO,
  broadcastTripLocation,
  broadcastTripETA,
  broadcastTripStatus,
  broadcastSOSAlert,
  broadcastSOSUpdate,
  sendToUser,
  getConnectionStats,
  getDashboardStats,
  isInitialized,
  getDriverLocation,
  sendProximityNotification,
  broadcastDriverInfo,
  getTripSubscribersCount,
  isTripBeingTracked,
  // Contact tracking functions (Requirements: 2.3, 2.4, 2.5, 3.3, 3.4)
  createContactTrackingRoom,
  getContactTrackingRoom,
  broadcastToContacts,
  subscribeToContactTracking,
  unsubscribeFromContactTracking,
  cleanupContactTrackingRooms,
  notifyContactsTripEnded,
  getContactTrackingStats,
  // Support escalation (Requirements: 8.7)
  broadcastSupportEscalation,
  // Redis adapter functions (Requirements: 2.1, 2.2)
  configureRedisAdapter,
  isRedisAdapterConfigured,
  cleanupRedisAdapter,
  getRedisAdapterStatus,
  LOCATION_UPDATE_INTERVAL_MS
};
