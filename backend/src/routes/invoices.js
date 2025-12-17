/**
 * Invoice Routes
 * API endpoints for invoice generation, retrieval, and download
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const invoiceService = require('../services/invoiceService');

const router = express.Router();

/**
 * GET /api/invoices/:invoiceId
 * Get invoice by invoice ID
 * Requirements: 13.5
 */
router.get('/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const result = await invoiceService.getInvoice(invoiceId);
    
    res.json(result);
  } catch (error) {
    console.error('[Invoice Routes] Error fetching invoice:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice'
    });
  }
});

/**
 * GET /api/invoices/booking/:bookingId
 * Get invoice by booking ID
 * Requirements: 13.5
 */
router.get('/booking/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await invoiceService.getInvoiceByBooking(bookingId);
    
    res.json(result);
  } catch (error) {
    console.error('[Invoice Routes] Error fetching invoice by booking:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice'
    });
  }
});

/**
 * GET /api/invoices/:invoiceId/pdf
 * Download invoice PDF
 * Requirements: 13.1, 13.5
 */
router.get('/:invoiceId/pdf', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const result = await invoiceService.getInvoice(invoiceId);
    
    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }
    
    const invoice = result.invoice;
    
    // Generate PDF HTML content
    const pdfHtml = invoiceService.generatePdfContent(invoice);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="HushRyd-Invoice-${invoiceId}.html"`);
    
    res.send(pdfHtml);
  } catch (error) {
    console.error('[Invoice Routes] Error downloading invoice PDF:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to download invoice'
    });
  }
});

/**
 * POST /api/invoices/:invoiceId/resend
 * Resend invoice via specified channels
 * Requirements: 13.2, 13.3
 */
router.post('/:invoiceId/resend', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { channels } = req.body;
    
    // Validate channels
    const validChannels = ['whatsapp', 'sms', 'email'];
    const requestedChannels = channels || validChannels;
    
    const invalidChannels = requestedChannels.filter(c => !validChannels.includes(c));
    if (invalidChannels.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid channels: ${invalidChannels.join(', ')}`
      });
    }
    
    const result = await invoiceService.retryInvoiceDelivery(invoiceId, requestedChannels);
    
    res.json(result);
  } catch (error) {
    console.error('[Invoice Routes] Error resending invoice:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to resend invoice'
    });
  }
});

/**
 * POST /api/invoices/generate/:bookingId
 * Generate invoice for a booking (admin/system use)
 * Requirements: 13.1
 */
router.post('/generate/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { sendImmediately = true } = req.body;
    
    let result;
    if (sendImmediately) {
      result = await invoiceService.generateAndSendInvoice(bookingId);
    } else {
      result = await invoiceService.generateInvoice(bookingId);
    }
    
    res.json(result);
  } catch (error) {
    console.error('[Invoice Routes] Error generating invoice:', error);
    
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice'
    });
  }
});

module.exports = router;
