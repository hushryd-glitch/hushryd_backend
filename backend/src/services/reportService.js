/**
 * Report Service
 * Implements financial report export in CSV and PDF formats
 * 
 * Requirements: 5.5
 */

const Trip = require('../models/Trip');

/**
 * Generate CSV content from transactions
 * 
 * @param {Array} transactions - Array of transaction objects
 * @returns {string} CSV formatted string
 */
const generateCSV = (transactions) => {
  const headers = [
    'Trip ID',
    'Date',
    'Transaction Type',
    'Amount',
    'Platform Commission',
    'Driver Advance',
    'Vault Amount',
    'Vault Status',
    'Gateway',
    'Gateway Transaction ID',
    'Status'
  ];

  const rows = transactions.map(t => [
    t.tripId || '',
    t.date ? new Date(t.date).toISOString() : '',
    t.type || '',
    t.amount || 0,
    t.platformCommission || 0,
    t.driverAdvance || 0,
    t.vaultAmount || 0,
    t.vaultStatus || '',
    t.gateway || '',
    t.gatewayTransactionId || '',
    t.status || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
};

/**
 * Generate PDF content structure (returns data for PDF generation)
 * In production, this would use a library like PDFKit or Puppeteer
 * 
 * @param {Array} transactions - Array of transaction objects
 * @param {Object} summary - Summary statistics
 * @returns {Object} PDF data structure
 */
const generatePDFData = (transactions, summary) => {
  return {
    title: 'HushRyd Financial Report',
    generatedAt: new Date().toISOString(),
    summary: {
      totalRevenue: summary.totalRevenue,
      totalCommission: summary.totalCommission,
      totalPayouts: summary.totalPayouts,
      totalRefunds: summary.totalRefunds,
      transactionCount: transactions.length
    },
    transactions: transactions.map(t => ({
      tripId: t.tripId,
      date: t.date,
      type: t.type,
      amount: t.amount,
      platformCommission: t.platformCommission,
      driverAdvance: t.driverAdvance,
      vaultAmount: t.vaultAmount,
      vaultStatus: t.vaultStatus,
      status: t.status
    }))
  };
};

/**
 * Get transactions within date range
 * 
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} reportType - Type of report (transactions, revenue, payouts)
 * @returns {Promise<Array>} Array of transaction objects
 */
const getTransactionsInRange = async (startDate, endDate, reportType = 'transactions') => {
  const query = {};
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  const trips = await Trip.find(query)
    .select('tripId payment createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const transactions = [];

  for (const trip of trips) {
    if (!trip.payment || !trip.payment.transactions) continue;

    for (const txn of trip.payment.transactions) {
      // Filter by report type
      if (reportType === 'revenue' && txn.type !== 'collection') continue;
      if (reportType === 'payouts' && !['advance', 'payout'].includes(txn.type)) continue;

      transactions.push({
        tripId: trip.tripId,
        date: txn.createdAt,
        type: txn.type,
        amount: txn.amount,
        platformCommission: trip.payment.platformCommission,
        driverAdvance: trip.payment.driverAdvance,
        vaultAmount: trip.payment.vaultAmount,
        vaultStatus: trip.payment.vaultStatus,
        gateway: txn.gateway,
        gatewayTransactionId: txn.gatewayTransactionId,
        status: txn.status
      });
    }
  }

  return transactions;
};

/**
 * Calculate summary statistics from transactions
 * 
 * @param {Array} transactions - Array of transaction objects
 * @returns {Object} Summary statistics
 */
const calculateSummary = (transactions) => {
  const summary = {
    totalRevenue: 0,
    totalCommission: 0,
    totalPayouts: 0,
    totalRefunds: 0
  };

  const processedTrips = new Set();

  for (const txn of transactions) {
    if (txn.type === 'collection') {
      summary.totalRevenue += txn.amount;
      // Only count commission once per trip
      if (!processedTrips.has(txn.tripId)) {
        summary.totalCommission += txn.platformCommission || 0;
        processedTrips.add(txn.tripId);
      }
    } else if (txn.type === 'advance' || txn.type === 'payout') {
      summary.totalPayouts += txn.amount;
    } else if (txn.type === 'refund') {
      summary.totalRefunds += txn.amount;
    }
  }

  return summary;
};

/**
 * Export financial report
 * 
 * @param {Object} options - Export options
 * @param {string} options.format - Export format ('csv' or 'pdf')
 * @param {string} options.reportType - Report type ('transactions', 'revenue', 'payouts')
 * @param {Date} options.startDate - Start date filter
 * @param {Date} options.endDate - End date filter
 * @returns {Promise<Object>} Export result with content and metadata
 */
const exportReport = async ({ format, reportType = 'transactions', startDate, endDate }) => {
  if (!['csv', 'pdf'].includes(format)) {
    const error = new Error('Invalid export format');
    error.code = 'INVALID_FORMAT';
    throw error;
  }

  if (!['transactions', 'revenue', 'payouts'].includes(reportType)) {
    const error = new Error('Invalid report type');
    error.code = 'INVALID_REPORT_TYPE';
    throw error;
  }

  const transactions = await getTransactionsInRange(startDate, endDate, reportType);
  const summary = calculateSummary(transactions);

  let content;
  let contentType;
  let filename;

  const dateStr = new Date().toISOString().split('T')[0];

  if (format === 'csv') {
    content = generateCSV(transactions);
    contentType = 'text/csv';
    filename = `hushryd-${reportType}-report-${dateStr}.csv`;
  } else {
    content = generatePDFData(transactions, summary);
    contentType = 'application/json'; // In production, this would be application/pdf
    filename = `hushryd-${reportType}-report-${dateStr}.pdf`;
  }

  return {
    success: true,
    content,
    contentType,
    filename,
    recordCount: transactions.length,
    summary,
    generatedAt: new Date().toISOString()
  };
};

module.exports = {
  exportReport,
  generateCSV,
  generatePDFData,
  getTransactionsInRange,
  calculateSummary
};
