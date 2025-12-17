const mongoose = require('mongoose');

/**
 * Session Schema
 * Tracks user authentication sessions across devices for security and management
 * 
 * Design Decision: Server-side session tracking with refresh token binding
 * Rationale: Enables session revocation, device management, and security auditing
 * 
 * Requirements: 4.1, 4.2 - Session management with device tracking and revocation
 */
const SessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  deviceInfo: {
    type: String,
    default: 'Unknown Device',
    trim: true,
    maxlength: [500, 'Device info cannot exceed 500 characters']
  },
  ipAddress: {
    type: String,
    required: [true, 'IP address is required'],
    trim: true
  },
  userAgent: {
    type: String,
    trim: true,
    maxlength: [1000, 'User agent cannot exceed 1000 characters']
  },
  refreshTokenHash: {
    type: String,
    required: [true, 'Refresh token hash is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required'],
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// TTL index for automatic session cleanup when expiresAt is reached
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient user session queries
SessionSchema.index({ userId: 1, isActive: 1 });

/**
 * Mask IP address for privacy
 * Shows only first two octets for IPv4 (e.g., 192.168.x.x)
 * 
 * Requirements: 4.4 - Mask sensitive information like full IP addresses
 * 
 * @returns {string} Masked IP address
 */
SessionSchema.methods.getMaskedIP = function() {
  if (!this.ipAddress) return 'Unknown';
  
  // Handle IPv4
  const ipv4Parts = this.ipAddress.split('.');
  if (ipv4Parts.length === 4) {
    return `${ipv4Parts[0]}.${ipv4Parts[1]}.x.x`;
  }
  
  // Handle IPv6 - mask last 4 groups
  const ipv6Parts = this.ipAddress.split(':');
  if (ipv6Parts.length >= 4) {
    return ipv6Parts.slice(0, 4).join(':') + ':x:x:x:x';
  }
  
  return 'Unknown';
};

/**
 * Get session info for API response (with masked IP)
 * 
 * Requirements: 4.1, 4.4 - Return session info with masked IP
 * 
 * @returns {Object} Session info safe for API response
 */
SessionSchema.methods.toSafeObject = function() {
  return {
    sessionId: this.sessionId,
    deviceInfo: this.deviceInfo,
    ipAddress: this.getMaskedIP(),
    lastActivityAt: this.lastActivityAt,
    createdAt: this.createdAt,
    isActive: this.isActive
  };
};

const Session = mongoose.model('Session', SessionSchema);

module.exports = Session;
