# Professional Invoice System

## Overview

The HushRyd invoice system provides professional PDF invoice generation and multi-channel delivery (Email, WhatsApp, SMS) for all confirmed bookings. This system is designed to meet the requirements of the AbhiBus-style interface specification.

## Requirements Coverage

This implementation satisfies the following requirements from Requirement 13:

- **13.1**: Generate professional PDF invoice with company branding and trip details
- **13.2**: Send invoice via email within 60 seconds of booking confirmation
- **13.3**: Send invoice via WhatsApp as PDF attachment within 60 seconds
- **13.4**: Include fare breakdown, taxes, platform fees, and payment method details
- **13.5**: Allow downloading invoice from booking history

## Architecture

### Components

1. **Invoice Service** (`invoiceService.js`)
   - Core business logic for invoice generation
   - Multi-channel delivery orchestration
   - Retry logic for failed deliveries
   - Invoice validation and completeness checks

2. **Invoice Model** (`Invoice.js`)
   - MongoDB schema for invoice storage
   - Delivery status tracking
   - PDF generation status
   - Audit trail for delivery attempts

3. **Invoice Routes** (`routes/invoices.js`)
   - REST API endpoints for invoice operations
   - Authentication and authorization
   - Download and resend functionality

4. **Frontend Components**
   - `InvoiceDownload.jsx`: User interface for invoice management
   - Integration with booking history

## Features

### Automatic Invoice Generation

Invoices are automatically generated and sent when a booking is confirmed:

```javascript
// Triggered automatically in bookingService.confirmBooking()
invoiceService.generateAndSendInvoice(bookingId)
  .then(result => {
    console.log('Invoice generated and sent');
  });
```

### Multi-Channel Delivery

Invoices are delivered via three channels simultaneously:

1. **Email**: Professional HTML email with PDF attachment
2. **WhatsApp**: Formatted message with PDF attachment
3. **SMS**: Short message with invoice link and key details

### Retry Logic

The system includes automatic retry logic for failed deliveries:

- Maximum 3 retry attempts per channel
- 5-second delay between retries
- Independent retry for each channel
- Delivery status tracking in database

### Invoice Content

Each invoice includes:

- **Company Branding**: HushRyd logo and contact information
- **Invoice ID**: Unique identifier (format: INV-YYYY-NNNNNN)
- **Trip Details**: Source, destination, date, time
- **Driver Information**: Name, phone, rating
- **Vehicle Details**: Make, model, color, plate number
- **Fare Breakdown**: Base fare, distance charge, taxes, total
- **Verification Code**: 4-digit code for driver verification
- **Generation Timestamp**: When invoice was created

## API Endpoints

### Get Invoice by ID

```http
GET /api/invoices/:invoiceId
Authorization: Bearer <token>
```

### Get Invoice by Booking ID

```http
GET /api/invoices/booking/:bookingId
Authorization: Bearer <token>
```

### Download Invoice PDF

```http
GET /api/invoices/:invoiceId/pdf
Authorization: Bearer <token>
```

Returns HTML content that can be saved or printed as PDF.

### Resend Invoice

```http
POST /api/invoices/:invoiceId/resend
Authorization: Bearer <token>
Content-Type: application/json

{
  "channels": ["email", "whatsapp", "sms"]
}
```

### Generate Invoice (Admin/System)

```http
POST /api/invoices/generate/:bookingId
Authorization: Bearer <token>
Content-Type: application/json

{
  "sendImmediately": true
}
```

## Usage Examples

### Frontend: Download Invoice

```jsx
import { InvoiceDownload } from '@/components/booking';

function BookingDetails({ booking }) {
  return (
    <div>
      <h2>Booking Details</h2>
      <InvoiceDownload booking={booking} />
    </div>
  );
}
```

### Backend: Manual Invoice Generation

```javascript
const invoiceService = require('./services/invoiceService');

// Generate invoice without sending
const result = await invoiceService.generateInvoice(bookingId);

// Generate and send immediately
const result = await invoiceService.generateAndSendInvoice(bookingId);

// Retry failed deliveries
const result = await invoiceService.retryInvoiceDelivery(invoiceId, ['email']);
```

## Testing

### Property-Based Tests

The system includes comprehensive property-based tests:

1. **Invoice Content Completeness** (`invoiceContent.property.test.js`)
   - Validates all required fields are present
   - Tests fare breakdown calculations
   - Verifies verification code format
   - Checks completeness validation logic

2. **Multi-Channel Delivery** (`invoiceDelivery.property.test.js`)
   - Tests message formatting for all channels
   - Validates delivery status tracking
   - Checks retry logic
   - Verifies error handling

Run tests:

```bash
npm test -- backend/tests/property/invoiceContent.property.test.js
npm test -- backend/tests/property/invoiceDelivery.property.test.js
```

## Configuration

### Environment Variables

```env
# API Base URL for PDF links
API_BASE_URL=https://api.hushryd.com

# Notification Service Credentials
SENDGRID_API_KEY=your_sendgrid_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
WHATSAPP_API_KEY=your_whatsapp_key
```

### Invoice Template

The default invoice template is defined in `invoiceService.generatePdfContent()`. To customize:

1. Modify the HTML template in the function
2. Update CSS styles for branding
3. Add company logo URL
4. Adjust layout and formatting

## Monitoring and Debugging

### Logging

The system logs all invoice operations:

```javascript
console.log('[Invoice] Invoice generated and sent for booking ${bookingId}');
console.error('[Invoice] Failed to generate invoice: ${error.message}');
```

### Delivery Status

Check delivery status in the database:

```javascript
const invoice = await Invoice.findByInvoiceId(invoiceId);
console.log(invoice.deliveryStatus);
// {
//   email: { sent: true, sentAt: Date, messageId: '...' },
//   whatsapp: { sent: true, sentAt: Date, messageId: '...' },
//   sms: { sent: false, error: 'Failed to send' }
// }
```

### Failed Deliveries

Query invoices with failed deliveries:

```javascript
const failedInvoices = await Invoice.getPendingForRetry(maxAttempts = 3);
```

## Performance Considerations

1. **Async Generation**: Invoice generation runs asynchronously to not block booking confirmation
2. **Batch Processing**: Consider implementing batch invoice generation for high-volume periods
3. **Caching**: PDF content can be cached to reduce generation time
4. **Queue System**: For production, consider using a job queue (Bull, BullMQ) for invoice processing

## Future Enhancements

1. **PDF Library Integration**: Replace HTML generation with proper PDF library (PDFKit, Puppeteer)
2. **Template System**: Support multiple invoice templates (default, premium, minimal)
3. **Internationalization**: Support multiple languages and currencies
4. **Digital Signatures**: Add digital signatures for invoice authenticity
5. **Tax Compliance**: Enhanced tax calculation and GST compliance
6. **Bulk Download**: Allow downloading multiple invoices as ZIP
7. **Invoice Customization**: Allow users to customize invoice appearance

## Troubleshooting

### Invoice Not Generated

1. Check booking status is 'confirmed'
2. Verify booking has all required fields (tripId, passengerId, fare)
3. Check database connection
4. Review error logs

### Delivery Failures

1. Verify notification service credentials
2. Check recipient contact information (email, phone)
3. Review rate limits for notification services
4. Check network connectivity
5. Verify PDF URL is accessible

### Missing Invoice Data

1. Ensure trip has driver and vehicle information
2. Verify booking has pickup/drop points
3. Check fare breakdown calculation
4. Validate verification code generation

## Support

For issues or questions:
- Email: support@hushryd.com
- Documentation: https://docs.hushryd.com/invoices
- GitHub Issues: https://github.com/hushryd/platform/issues
