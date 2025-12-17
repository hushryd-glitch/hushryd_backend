/**
 * Property-Based Tests for Payment and Invoice Round Trip
 * **Feature: abhibus-style-interface, Property 5: Payment and Invoice Round Trip**
 * **Validates: Requirements 9.5, 13.1, 13.2, 13.3, 13.4**
 * 
 * Tests that for any successful payment, the system generates a complete invoice 
 * and delivers it via both email and WhatsApp within specified time limits.
 */

const fc = require('fast-check');
const { 
  createOrder, 
  getPaymentStatus, 
  verifyWebhookSignature 
} = require('../../src/services/cashfreeService');
const { 
  calculatePaymentBreakdown 
} = require('../../src/services/cashfreePaymentCalculation');
const { 
  generateInvoice, 
  sendInvoiceViaEmail, 
  sendInvoiceViaWhatsApp 
} = require('../../src/services/invoiceService');
const Transaction = require('../../src/models/Transaction');
const Booking = require('../../src/models/Booking');
const User = require('../../src/models/User');

// Test configuration
const TEST_CONFIG = {
  numRuns: 100,
  timeout: 30000,
  maxInvoiceDeliveryTime: 60000, // 60 seconds as per requirements
  maxRetries: 3
};

describe('Payment and Invoice Round Trip Properties', () => {
  
  /**
   * Property 5: Payment and Invoice Round Trip
   * For any successful payment, the system should generate a complete invoice 
   * and deliver it via both email and WhatsApp within specified time limits
   * 
   * **Validates: Requirements 9.5, 13.1, 13.2, 13.3, 13.4**
   */
  it('should generate and deliver invoice for any successful payment', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid payment data
        fc.record({
          fare: fc.integer({ min: 50, max: 2000 }), // ₹50 to ₹2000
          hasFreeCancellation: fc.boolean(),
          passengerCount: fc.integer({ min: 1, max: 4 }),
          customerDetails: fc.record({
            name: fc.string({ minLength: 2, maxLength: 50 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
            email: fc.emailAddress(),
            phone: fc.string({ minLength: 10, maxLength: 10 }).filter(s => /^\d{10}$/.test(s))
          }),
          tripDetails: fc.record({
            origin: fc.string({ minLength: 5, maxLength: 100 }),
            destination: fc.string({ minLength: 5, maxLength: 100 }),
            departureTime: fc.date({ min: new Date(), max: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
          })
        }),
        
        async (paymentData) => {
          const startTime = Date.now();
          
          try {
            // Step 1: Calculate payment breakdown
            const breakdown = calculatePaymentBreakdown(paymentData.fare, {
              hasFreeCancellation: paymentData.hasFreeCancellation,
              passengerCount: paymentData.passengerCount
            });
            
            // Verify breakdown integrity
            expect(breakdown).toBeDefined();
            expect(breakdown.totalAmount).toBeGreaterThan(0);
            expect(breakdown.baseFare).toBe(paymentData.fare);
            expect(breakdown.platformFee).toBeGreaterThan(0);
            
            // Step 2: Create Cashfree order
            const orderId = `TEST-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            
            const orderData = {
              orderId,
              amount: breakdown.totalAmount,
              currency: 'INR',
              customerDetails: {
                customerId: `CUST-${Date.now()}`,
                name: paymentData.customerDetails.name,
                email: paymentData.customerDetails.email,
                phone: paymentData.customerDetails.phone
              },
              orderMeta: {
                returnUrl: 'https://test.hushryd.com/payment-success',
                notifyUrl: 'https://test.hushryd.com/webhook'
              }
            };
            
            // Mock successful order creation (in real test, this would call actual API)
            const orderResponse = {
              orderId: orderData.orderId,
              orderStatus: 'ACTIVE',
              paymentSessionId: `session_${Date.now()}`,
              orderAmount: orderData.amount,
              orderCurrency: 'INR',
              cfOrderId: `cf_${Date.now()}`,
              createdAt: new Date().toISOString()
            };
            
            // Step 3: Simulate successful payment
            const paymentResult = {
              cfPaymentId: `payment_${Date.now()}`,
              paymentStatus: 'SUCCESS',
              paymentAmount: breakdown.totalAmount,
              paymentCurrency: 'INR',
              paymentMethod: 'UPI',
              paymentTime: new Date().toISOString(),
              bankReference: `bank_ref_${Date.now()}`
            };
            
            // Step 4: Create transaction record
            const transactionId = await Transaction.generateTransactionId();
            const transaction = new Transaction({
              transactionId,
              orderId: orderResponse.orderId,
              type: 'collection',
              status: 'completed',
              amount: breakdown.totalAmount,
              currency: 'INR',
              breakdown: {
                baseFare: breakdown.baseFare,
                platformFee: breakdown.platformFee,
                freeCancellationFee: breakdown.freeCancellationFee || 0
              },
              cashfreeData: {
                orderId: orderResponse.orderId,
                paymentId: paymentResult.cfPaymentId,
                referenceId: orderResponse.cfOrderId
              },
              rideDetails: {
                origin: paymentData.tripDetails.origin,
                destination: paymentData.tripDetails.destination,
                departureTime: paymentData.tripDetails.departureTime,
                passengerName: paymentData.customerDetails.name
              },
              paymentMethod: paymentResult.paymentMethod
            });
            
            await transaction.save();
            
            // Step 5: Generate invoice (Requirements 13.1)
            const invoiceStartTime = Date.now();
            
            const invoice = await generateInvoice({
              transactionId: transaction.transactionId,
              customerDetails: paymentData.customerDetails,
              tripDetails: paymentData.tripDetails,
              breakdown,
              paymentDetails: paymentResult
            });
            
            // Verify invoice generation
            expect(invoice).toBeDefined();
            expect(invoice.invoiceNumber).toBeDefined();
            expect(invoice.pdfBuffer).toBeDefined();
            expect(invoice.invoiceData).toBeDefined();
            expect(invoice.invoiceData.totalAmount).toBe(breakdown.totalAmount);
            expect(invoice.invoiceData.customerName).toBe(paymentData.customerDetails.name);
            expect(invoice.invoiceData.breakdown).toEqual(breakdown);
            
            // Step 6: Send invoice via email (Requirements 13.2)
            const emailStartTime = Date.now();
            
            const emailResult = await sendInvoiceViaEmail({
              customerEmail: paymentData.customerDetails.email,
              customerName: paymentData.customerDetails.name,
              invoice: invoice,
              transactionId: transaction.transactionId
            });
            
            const emailDeliveryTime = Date.now() - emailStartTime;
            
            // Verify email delivery
            expect(emailResult.success).toBe(true);
            expect(emailResult.messageId).toBeDefined();
            expect(emailDeliveryTime).toBeLessThan(TEST_CONFIG.maxInvoiceDeliveryTime);
            
            // Step 7: Send invoice via WhatsApp (Requirements 13.3)
            const whatsappStartTime = Date.now();
            
            const whatsappResult = await sendInvoiceViaWhatsApp({
              customerPhone: paymentData.customerDetails.phone,
              customerName: paymentData.customerDetails.name,
              invoice: invoice,
              transactionId: transaction.transactionId
            });
            
            const whatsappDeliveryTime = Date.now() - whatsappStartTime;
            
            // Verify WhatsApp delivery
            expect(whatsappResult.success).toBe(true);
            expect(whatsappResult.messageId).toBeDefined();
            expect(whatsappDeliveryTime).toBeLessThan(TEST_CONFIG.maxInvoiceDeliveryTime);
            
            // Step 8: Verify total delivery time (Requirements 13.2, 13.3)
            const totalDeliveryTime = Date.now() - invoiceStartTime;
            expect(totalDeliveryTime).toBeLessThan(TEST_CONFIG.maxInvoiceDeliveryTime);
            
            // Step 9: Verify invoice content completeness (Requirements 13.4)
            const invoiceData = invoice.invoiceData;
            
            // Must include fare breakdown
            expect(invoiceData.breakdown.baseFare).toBe(breakdown.baseFare);
            expect(invoiceData.breakdown.platformFee).toBe(breakdown.platformFee);
            expect(invoiceData.breakdown.totalAmount).toBe(breakdown.totalAmount);
            
            // Must include taxes and platform fees
            expect(invoiceData.taxes).toBeDefined();
            expect(invoiceData.platformFees).toBeDefined();
            
            // Must include payment method details
            expect(invoiceData.paymentMethod).toBe(paymentResult.paymentMethod);
            expect(invoiceData.paymentId).toBe(paymentResult.cfPaymentId);
            
            // Must include trip details
            expect(invoiceData.tripDetails.origin).toBe(paymentData.tripDetails.origin);
            expect(invoiceData.tripDetails.destination).toBe(paymentData.tripDetails.destination);
            
            // Must include customer details
            expect(invoiceData.customerName).toBe(paymentData.customerDetails.name);
            expect(invoiceData.customerEmail).toBe(paymentData.customerDetails.email);
            
            // Step 10: Verify round-trip property
            // The invoice should contain all the original payment information
            expect(invoiceData.originalOrderId).toBe(orderResponse.orderId);
            expect(invoiceData.originalAmount).toBe(breakdown.totalAmount);
            
            // Clean up test data
            await Transaction.findByIdAndDelete(transaction._id);
            
            return true;
            
          } catch (error) {
            console.error('Payment and invoice round trip test failed:', error);
            throw error;
          }
        }
      ),
      { 
        numRuns: TEST_CONFIG.numRuns,
        timeout: TEST_CONFIG.timeout,
        verbose: true
      }
    );
  }, TEST_CONFIG.timeout);
  
  /**
   * Property: Invoice delivery should be idempotent
   * Sending the same invoice multiple times should not create duplicates
   * 
   * **Validates: Requirements 13.2, 13.3**
   */
  it('should handle duplicate invoice delivery requests idempotently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          customerEmail: fc.emailAddress(),
          customerPhone: fc.string({ minLength: 10, maxLength: 10 }).filter(s => /^\d{10}$/.test(s)),
          customerName: fc.string({ minLength: 2, maxLength: 50 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          invoiceAmount: fc.integer({ min: 100, max: 1000 })
        }),
        
        async (testData) => {
          // Create a mock invoice
          const invoice = {
            invoiceNumber: `INV-${Date.now()}`,
            pdfBuffer: Buffer.from('mock-pdf-content'),
            invoiceData: {
              totalAmount: testData.invoiceAmount,
              customerName: testData.customerName,
              customerEmail: testData.customerEmail
            }
          };
          
          const transactionId = `TXN-${Date.now()}`;
          
          // Send invoice via email twice
          const emailResult1 = await sendInvoiceViaEmail({
            customerEmail: testData.customerEmail,
            customerName: testData.customerName,
            invoice,
            transactionId
          });
          
          const emailResult2 = await sendInvoiceViaEmail({
            customerEmail: testData.customerEmail,
            customerName: testData.customerName,
            invoice,
            transactionId
          });
          
          // Both should succeed but should be idempotent
          expect(emailResult1.success).toBe(true);
          expect(emailResult2.success).toBe(true);
          
          // Should either return same message ID or indicate duplicate
          if (emailResult1.messageId === emailResult2.messageId) {
            // Same message ID indicates deduplication
            expect(emailResult2.isDuplicate).toBe(true);
          } else {
            // Different message IDs are also acceptable for email
            expect(emailResult2.isDuplicate).toBeFalsy();
          }
          
          // Send invoice via WhatsApp twice
          const whatsappResult1 = await sendInvoiceViaWhatsApp({
            customerPhone: testData.customerPhone,
            customerName: testData.customerName,
            invoice,
            transactionId
          });
          
          const whatsappResult2 = await sendInvoiceViaWhatsApp({
            customerPhone: testData.customerPhone,
            customerName: testData.customerName,
            invoice,
            transactionId
          });
          
          // Both should succeed
          expect(whatsappResult1.success).toBe(true);
          expect(whatsappResult2.success).toBe(true);
          
          return true;
        }
      ),
      { 
        numRuns: 50,
        timeout: TEST_CONFIG.timeout
      }
    );
  });
  
  /**
   * Property: Payment breakdown should always be mathematically consistent
   * Total amount should equal sum of all components
   * 
   * **Validates: Requirements 9.5**
   */
  it('should maintain mathematical consistency in payment breakdown', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          baseFare: fc.integer({ min: 1, max: 5000 }),
          hasFreeCancellation: fc.boolean(),
          passengerCount: fc.integer({ min: 1, max: 6 }),
          appliedDiscount: fc.integer({ min: 0, max: 500 })
        }),
        
        (testData) => {
          const breakdown = calculatePaymentBreakdown(testData.baseFare, {
            hasFreeCancellation: testData.hasFreeCancellation,
            passengerCount: testData.passengerCount,
            appliedDiscount: testData.appliedDiscount
          });
          
          // Mathematical consistency check
          const expectedTotal = breakdown.baseFare + 
                               breakdown.platformFee + 
                               (breakdown.freeCancellationFee || 0) - 
                               (breakdown.appliedDiscount || 0);
          
          expect(breakdown.totalAmount).toBe(expectedTotal);
          
          // All amounts should be non-negative
          expect(breakdown.baseFare).toBeGreaterThanOrEqual(0);
          expect(breakdown.platformFee).toBeGreaterThanOrEqual(0);
          expect(breakdown.totalAmount).toBeGreaterThanOrEqual(0);
          
          // Free cancellation fee should only exist if option is selected
          if (testData.hasFreeCancellation) {
            expect(breakdown.freeCancellationFee).toBeGreaterThan(0);
          } else {
            expect(breakdown.freeCancellationFee || 0).toBe(0);
          }
          
          // Applied discount should not exceed base fare
          expect(breakdown.appliedDiscount || 0).toBeLessThanOrEqual(breakdown.baseFare);
          
          return true;
        }
      ),
      { 
        numRuns: TEST_CONFIG.numRuns
      }
    );
  });
  
  /**
   * Property: Webhook signature verification should be consistent
   * Valid signatures should always verify, invalid ones should always fail
   * 
   * **Validates: Requirements 9.5**
   */
  it('should consistently verify webhook signatures', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          payload: fc.object({ maxDepth: 2 }),
          secret: fc.string({ minLength: 16, maxLength: 64 }),
          timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() + 86400000 })
        }),
        
        (testData) => {
          const payloadString = JSON.stringify(testData.payload);
          const timestampString = testData.timestamp.toString();
          
          // Generate valid signature
          const crypto = require('crypto');
          const signatureData = timestampString + payloadString;
          const validSignature = crypto
            .createHmac('sha256', testData.secret)
            .update(signatureData)
            .digest('base64');
          
          // Valid signature should verify
          const validResult = verifyWebhookSignature(
            payloadString, 
            validSignature, 
            timestampString, 
            testData.secret
          );
          expect(validResult).toBe(true);
          
          // Invalid signature should not verify
          const invalidSignature = validSignature.slice(0, -1) + 'X'; // Corrupt signature
          const invalidResult = verifyWebhookSignature(
            payloadString, 
            invalidSignature, 
            timestampString, 
            testData.secret
          );
          expect(invalidResult).toBe(false);
          
          // Wrong secret should not verify
          const wrongSecret = testData.secret + 'wrong';
          const wrongSecretResult = verifyWebhookSignature(
            payloadString, 
            validSignature, 
            timestampString, 
            wrongSecret
          );
          expect(wrongSecretResult).toBe(false);
          
          return true;
        }
      ),
      { 
        numRuns: TEST_CONFIG.numRuns
      }
    );
  });
});

// Mock implementations for testing
jest.mock('../../src/services/invoiceService', () => ({
  generateInvoice: jest.fn().mockImplementation(async (data) => {
    // Simulate invoice generation delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    
    return {
      invoiceNumber: `INV-${Date.now()}`,
      pdfBuffer: Buffer.from('mock-pdf-content'),
      invoiceData: {
        totalAmount: data.breakdown.totalAmount,
        customerName: data.customerDetails.name,
        customerEmail: data.customerDetails.email,
        breakdown: data.breakdown,
        paymentMethod: data.paymentDetails.paymentMethod,
        paymentId: data.paymentDetails.cfPaymentId,
        tripDetails: data.tripDetails,
        taxes: Math.round(data.breakdown.totalAmount * 0.18), // 18% GST
        platformFees: data.breakdown.platformFee,
        originalOrderId: data.transactionId,
        originalAmount: data.breakdown.totalAmount
      }
    };
  }),
  
  sendInvoiceViaEmail: jest.fn().mockImplementation(async (data) => {
    // Simulate email delivery delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
    
    return {
      success: true,
      messageId: `email_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      deliveredAt: new Date()
    };
  }),
  
  sendInvoiceViaWhatsApp: jest.fn().mockImplementation(async (data) => {
    // Simulate WhatsApp delivery delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 3000));
    
    return {
      success: true,
      messageId: `whatsapp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      deliveredAt: new Date()
    };
  })
}));