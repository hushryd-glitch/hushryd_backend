/**
 * Models Index
 * Exports all Mongoose models for the HushRyd platform
 */

const User = require('./User');
const OTP = require('./OTP');
const Driver = require('./Driver');
const Trip = require('./Trip');
const Ride = require('./Ride');
const SOSAlert = require('./SOSAlert');
const NotificationLog = require('./NotificationLog');
const Booking = require('./Booking');
const AuditLog = require('./AuditLog');
const SupportTicket = require('./SupportTicket');
const ShareLink = require('./ShareLink');
const LocationShare = require('./LocationShare');
const Invoice = require('./Invoice');
const StationaryEvent = require('./StationaryEvent');
const Transaction = require('./Transaction');
const Subscription = require('./Subscription');
const Wallet = require('./Wallet');
const Session = require('./Session');
const AuthAuditLog = require('./AuthAuditLog');

module.exports = {
  User,
  OTP,
  Driver,
  Trip,
  Ride,
  SOSAlert,
  NotificationLog,
  Booking,
  AuditLog,
  SupportTicket,
  ShareLink,
  LocationShare,
  Invoice,
  StationaryEvent,
  Transaction,
  Subscription,
  Wallet,
  Session,
  AuthAuditLog
};
