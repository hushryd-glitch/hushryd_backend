/**
 * SupportTicket Model
 * Stores support tickets for user issues and inquiries
 * 
 * Requirements: 1.5
 */

const mongoose = require('mongoose');

/**
 * Message Schema
 * Stores individual messages in a ticket thread
 */
const MessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

/**
 * SupportTicket Schema
 * Main schema for support tickets
 */
const SupportTicketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    unique: true,
    required: [true, 'Ticket ID is required'],
    index: true
    // Format: TK-YYYY-NNNNNN (e.g., TK-2024-001234)
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  category: {
    type: String,
    enum: ['booking', 'payment', 'driver', 'safety', 'account', 'technical', 'other'],
    default: 'other',
    index: true
  },
  messages: {
    type: [MessageSchema],
    default: []
  },
  resolvedAt: {
    type: Date
  },
  relatedEntity: {
    type: {
      type: String,
      enum: ['trip', 'booking', 'driver', 'sos']
    },
    id: mongoose.Schema.Types.ObjectId
  },
  relatedTrip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
SupportTicketSchema.index({ status: 1, priority: -1, createdAt: -1 });
SupportTicketSchema.index({ assignedTo: 1, status: 1 });
SupportTicketSchema.index({ userId: 1, createdAt: -1 });

/**
 * Generate unique ticket ID
 * @returns {Promise<string>} Unique ticket ID in format TK-YYYY-NNNNNN
 */
SupportTicketSchema.statics.generateTicketId = async function() {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    ticketId: { $regex: `^TK-${year}-` }
  });
  const sequence = String(count + 1).padStart(6, '0');
  return `TK-${year}-${sequence}`;
};

/**
 * Get ticket by ID (MongoDB ObjectId or human-readable)
 * @param {string} id - Ticket ID
 * @returns {Promise<Object>} Ticket document
 */
SupportTicketSchema.statics.findByTicketId = async function(id) {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    const ticket = await this.findById(id);
    if (ticket) return ticket;
  }
  return this.findOne({ ticketId: id });
};

/**
 * Add a message to the ticket
 * @param {string} senderId - User ID of message sender
 * @param {string} message - Message content
 * @returns {Promise<Object>} Updated ticket
 */
SupportTicketSchema.methods.addMessage = async function(senderId, message) {
  this.messages.push({
    senderId,
    message,
    timestamp: new Date()
  });
  
  // Auto-update status to in_progress if it was open
  if (this.status === 'open') {
    this.status = 'in_progress';
  }
  
  return this.save();
};

/**
 * Resolve the ticket
 * @param {string} resolverId - User ID of resolver
 * @param {string} resolution - Resolution message
 * @returns {Promise<Object>} Updated ticket
 */
SupportTicketSchema.methods.resolve = async function(resolverId, resolution) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  
  if (resolution) {
    this.messages.push({
      senderId: resolverId,
      message: `[RESOLVED] ${resolution}`,
      timestamp: new Date()
    });
  }
  
  return this.save();
};

/**
 * Assign ticket to a team member
 * @param {string} assigneeId - User ID to assign to
 * @returns {Promise<Object>} Updated ticket
 */
SupportTicketSchema.methods.assign = async function(assigneeId) {
  this.assignedTo = assigneeId;
  if (this.status === 'open') {
    this.status = 'in_progress';
  }
  return this.save();
};

const SupportTicket = mongoose.model('SupportTicket', SupportTicketSchema);

module.exports = SupportTicket;
