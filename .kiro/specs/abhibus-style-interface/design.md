# Design Document

## Overview

This design document outlines the implementation of an AbhiBus-style landing page and passenger profile interface for the HushRyd platform. The system will feature a modern, responsive web application with integrated maps, payment processing, wallet management, women-only ride privacy features, and comprehensive booking management.

The architecture follows a component-based approach using React.js for the frontend, Node.js/Express for the backend, with MongoDB for data storage. Key integrations include Google Maps API, Cashfree Payment Gateway, and multi-channel notification services (SMS, Email, WhatsApp).

## Architecture

### System Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (React.js)    │◄──►│  (Node.js)      │◄──►│   (MongoDB)     │
│                 │    │                 │    │                 │
│ - Landing Page  │    │ - Auth Service  │    │ - Users         │
│ - Profile Mgmt  │    │ - Booking API   │    │ - Bookings      │
│ - Search/Book   │    │ - Payment API   │    │ - Transactions  │
│ - Wallet        │    │ - Wallet API    │    │ - Rides         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       
         │              ┌─────────────────┐              
         │              │ External APIs   │              
         │              │                 │              
         └──────────────┤ - Google Maps   │              
                        │ - Cashfree      │              
                        │ - SMS Gateway   │              
                        │ - Email Service │              
                        │ - WhatsApp API  │              
                        └─────────────────┘              
```

### Component Architecture
```
Frontend Components:
├── Landing/
│   ├── Hero.jsx
│   ├── SearchForm.jsx
│   ├── PromoOffers.jsx
│   └── ReferralSection.jsx
├── Search/
│   ├── SearchResults.jsx
│   ├── FilterPanel.jsx
│   ├── RideCard.jsx
│   └── MapView.jsx
├── Profile/
│   ├── ProfileForm.jsx
│   ├── WalletDashboard.jsx
│   ├── BookingHistory.jsx
│   └── ReferralDashboard.jsx
├── Booking/
│   ├── BookingForm.jsx
│   ├── SeatSelection.jsx
│   ├── PaymentForm.jsx
│   └── InvoiceView.jsx
└── Driver/
    ├── RidePosting.jsx
    ├── DocumentUpload.jsx
    └── RouteSelector.jsx
```

## Components and Interfaces

### Frontend Components

#### 1. Landing Page Components

**Hero Component**
- Search form with Google Maps autocomplete
- Promotional banners and offers
- Quick action buttons (Login, Register, Search)
- Responsive design for all devices

**SearchForm Component**
```jsx
interface SearchFormProps {
  onSearch: (searchData: SearchParams) => void;
  defaultValues?: Partial<SearchParams>;
}

interface SearchParams {
  from: Location;
  to: Location;
  departureDate: Date;
  returnDate?: Date;
  passengers: number;
}

interface Location {
  name: string;
  coordinates: [number, number];
  placeId: string;
}
```

#### 2. Profile Management Components

**ProfileForm Component**
```jsx
interface ProfileFormProps {
  user: User;
  onUpdate: (userData: Partial<User>) => Promise<void>;
}

interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: Date;
  emergencyContacts: EmergencyContact[];
  kycDocuments: KYCDocument[];
  preferences: UserPreferences;
}
```

**WalletDashboard Component**
```jsx
interface WalletDashboardProps {
  wallet: WalletData;
  transactions: Transaction[];
  onRefresh: () => void;
}

interface WalletData {
  totalBalance: number;
  promoBalance: number;
  nonPromoBalance: number;
  pendingCashback: number;
}
```

#### 3. Search and Booking Components

**SearchResults Component**
```jsx
interface SearchResultsProps {
  rides: Ride[];
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onRideSelect: (rideId: string) => void;
}

interface Ride {
  id: string;
  operator: Operator;
  route: Route;
  departureTime: Date;
  arrivalTime: Date;
  availableSeats: number;
  fare: number;
  amenities: string[];
  isWomenOnly: boolean;
  boardingPoints: BoardingPoint[];
}
```

### Backend API Interfaces

#### 1. Authentication Service
```typescript
interface AuthService {
  sendOTP(contact: string, type: 'sms' | 'email'): Promise<OTPResponse>;
  verifyOTP(contact: string, otp: string): Promise<AuthResponse>;
  refreshToken(token: string): Promise<TokenResponse>;
}
```

#### 2. Booking Service
```typescript
interface BookingService {
  searchRides(params: SearchParams): Promise<Ride[]>;
  createBooking(bookingData: BookingRequest): Promise<Booking>;
  cancelBooking(bookingId: string, reason: string): Promise<CancellationResponse>;
  getBookingHistory(userId: string, filters: HistoryFilters): Promise<Booking[]>;
}
```

#### 3. Payment Service
```typescript
interface PaymentService {
  initiateCashfreePayment(amount: number, bookingId: string): Promise<PaymentSession>;
  processWalletPayment(userId: string, amount: number): Promise<PaymentResult>;
  processCashback(userId: string, bookingId: string): Promise<CashbackResult>;
  generateInvoice(bookingId: string): Promise<Invoice>;
}
```

#### 4. Wallet Service
```typescript
interface WalletService {
  getWalletBalance(userId: string): Promise<WalletData>;
  addCashback(userId: string, amount: number, source: string): Promise<Transaction>;
  deductAmount(userId: string, amount: number, type: 'promo' | 'regular'): Promise<Transaction>;
  getTransactionHistory(userId: string, pagination: Pagination): Promise<Transaction[]>;
}
```

## Data Models

### User Model
```typescript
interface User {
  _id: ObjectId;
  name: string;
  email: string;
  mobile: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth?: Date;
  isVerified: boolean;
  referralCode: string;
  referredBy?: string;
  emergencyContacts: EmergencyContact[];
  kycDocuments: KYCDocument[];
  preferences: {
    emailAlerts: boolean;
    mobileAlerts: boolean;
    language: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### Wallet Model
```typescript
interface Wallet {
  _id: ObjectId;
  userId: ObjectId;
  promoBalance: number;
  nonPromoBalance: number;
  totalEarned: number;
  totalSpent: number;
  transactions: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Transaction Model
```typescript
interface Transaction {
  _id: ObjectId;
  userId: ObjectId;
  type: 'credit' | 'debit';
  category: 'cashback' | 'referral' | 'booking' | 'refund' | 'promo';
  amount: number;
  description: string;
  bookingId?: ObjectId;
  expiryDate?: Date;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  metadata: Record<string, any>;
  createdAt: Date;
}
```

### Booking Model
```typescript
interface Booking {
  _id: ObjectId;
  userId: ObjectId;
  rideId: ObjectId;
  passengerDetails: PassengerDetail[];
  boardingPoint: BoardingPoint;
  droppingPoint: DroppingPoint;
  seatNumbers: string[];
  totalFare: number;
  platformFee: number;
  taxes: number;
  finalAmount: number;
  paymentMethod: string;
  paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded';
  bookingStatus: 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  cancellationReason?: string;
  invoice: Invoice;
  createdAt: Date;
  updatedAt: Date;
}
```

### Ride Model
```typescript
interface Ride {
  _id: ObjectId;
  driverId: ObjectId;
  route: {
    from: Location;
    to: Location;
    distance: number;
    estimatedDuration: number;
    waypoints: Location[];
  };
  departureTime: Date;
  arrivalTime: Date;
  vehicle: {
    type: string;
    model: string;
    registrationNumber: string;
    amenities: string[];
  };
  pricing: {
    baseFare: number;
    perKmRate: number;
    totalSeats: number;
    availableSeats: number;
  };
  isWomenOnly: boolean;
  boardingPoints: BoardingPoint[];
  droppingPoints: DroppingPoint[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas where properties can be consolidated to eliminate redundancy:

- **Maps Integration Properties**: Properties for autocomplete, route preview, and location handling can be combined into comprehensive maps integration properties
- **Wallet Operations**: Cashback crediting, balance display, and transaction handling can be unified into wallet consistency properties  
- **Notification Properties**: Email, WhatsApp, and SMS notifications can be combined into multi-channel delivery properties
- **Booking Flow Properties**: Search, filter, and booking operations can be consolidated into booking workflow properties
- **Women-Only Ride Properties**: All gender-based restrictions can be unified into comprehensive privacy enforcement properties

### Core Properties

**Property 1: Location Autocomplete Consistency**
*For any* valid location input in search fields, the system should provide Google Maps autocomplete suggestions and display route preview with accurate distance and time estimates
**Validates: Requirements 1.2, 4.1, 4.2**

**Property 2: Search and Filter Integrity**  
*For any* search query and filter combination, the system should return accurate results within performance thresholds and maintain filter state consistency
**Validates: Requirements 4.3, 4.4, 8.1, 8.2**

**Property 3: Referral Reward Consistency**
*For any* successful referral completion, the system should credit rewards to both referrer and referee accounts and send notifications to both parties
**Validates: Requirements 2.3, 2.4, 2.5**

**Property 4: Wallet Balance Integrity**
*For any* wallet operation (credit, debit, cashback), the system should maintain accurate balance calculations and transaction history with proper categorization
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 9.2**

**Property 5: Payment and Invoice Round Trip**
*For any* successful payment, the system should generate a complete invoice and deliver it via both email and WhatsApp within specified time limits
**Validates: Requirements 9.5, 13.1, 13.2, 13.3, 13.4**

**Property 6: Women-Only Ride Privacy Enforcement**
*For any* women-only ride, the system should restrict bookings to female passengers only and prevent male users from booking with appropriate messaging
**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

**Property 7: Document Validation Completeness**
*For any* driver registration, the system should validate all required documents (license, RC, Aadhaar, vehicle photos) and process verification workflow correctly
**Validates: Requirements 11.3, 11.4, 11.5**

**Property 8: Route Data Persistence**
*For any* driver-created ride with route data, the system should save complete route information and display it accurately to passengers during booking
**Validates: Requirements 12.2, 12.3, 12.4, 12.5**

**Property 9: Booking Management Consistency**
*For any* booking operation (create, cancel, view), the system should maintain data consistency and provide appropriate user feedback and notifications
**Validates: Requirements 6.3, 6.4, 6.5**

**Property 10: Performance Threshold Compliance**
*For any* user interaction requiring timed responses, the system should meet specified performance thresholds (search < 2s, autocomplete < 500ms)
**Validates: Requirements 8.1, 8.3**

**Property 11: Multi-Channel Notification Delivery**
*For any* notification event, the system should deliver messages via appropriate channels (email, SMS, WhatsApp) with retry logic and delivery confirmation
**Validates: Requirements 9.3, 13.2, 13.3**

**Property 12: Profile Update Consistency**
*For any* profile modification, the system should validate input data, save changes securely, and provide immediate confirmation feedback
**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

**Property 13: Responsive Layout Adaptation**
*For any* device orientation change, the system should adjust layouts smoothly while preserving user input and maintaining functionality
**Validates: Requirements 7.4, 7.5**

**Property 14: Error Handling and User Feedback**
*For any* user action or system error, the system should provide appropriate feedback messages and suggested next steps
**Validates: Requirements 14.2, 14.3, 14.5**

## Error Handling

### Frontend Error Handling
- **Network Errors**: Implement retry logic with exponential backoff
- **Validation Errors**: Real-time form validation with clear error messages
- **Payment Failures**: Graceful fallback to alternative payment methods
- **Maps API Errors**: Fallback to text-based location input
- **Session Expiry**: Automatic token refresh with seamless re-authentication

### Backend Error Handling
- **Database Connection**: Connection pooling with automatic reconnection
- **External API Failures**: Circuit breaker pattern for third-party services
- **Payment Gateway Errors**: Comprehensive error mapping and user-friendly messages
- **File Upload Errors**: Validation, size limits, and format checking
- **Concurrent Booking**: Optimistic locking to prevent double bookings

### Error Recovery Strategies
```typescript
interface ErrorRecoveryStrategy {
  retryAttempts: number;
  backoffStrategy: 'linear' | 'exponential';
  fallbackAction?: () => void;
  userNotification: string;
}
```

## Testing Strategy

### Unit Testing
- **Component Testing**: Test individual React components with Jest and React Testing Library
- **Service Testing**: Test backend services with comprehensive mocking
- **Utility Function Testing**: Test helper functions and data transformations
- **API Endpoint Testing**: Test REST endpoints with various input scenarios

### Property-Based Testing
The system will use **fast-check** for JavaScript/TypeScript property-based testing. Each property-based test will run a minimum of 100 iterations to ensure comprehensive coverage.

**Property Test Configuration:**
```typescript
import fc from 'fast-check';

// Example property test structure
describe('Property Tests', () => {
  it('should maintain wallet balance integrity', () => {
    fc.assert(fc.property(
      fc.record({
        initialBalance: fc.float({ min: 0, max: 10000 }),
        transaction: fc.record({
          amount: fc.float({ min: 0, max: 1000 }),
          type: fc.constantFrom('credit', 'debit')
        })
      }),
      (data) => {
        // Property test implementation
        const result = processWalletTransaction(data.initialBalance, data.transaction);
        return result.balance >= 0 && result.isValid;
      }
    ), { numRuns: 100 });
  });
});
```

### Integration Testing
- **End-to-End Booking Flow**: Complete user journey from search to payment
- **Payment Gateway Integration**: Test Cashfree payment processing
- **Maps API Integration**: Test Google Maps autocomplete and route calculation
- **Multi-Channel Notifications**: Test email, SMS, and WhatsApp delivery
- **Women-Only Ride Restrictions**: Test gender-based booking enforcement

### Performance Testing
- **Load Testing**: Simulate concurrent users for search and booking operations
- **API Response Times**: Ensure all endpoints meet specified performance thresholds
- **Database Query Optimization**: Test query performance with large datasets
- **Frontend Bundle Size**: Optimize JavaScript bundle size for fast loading
- **Image Optimization**: Test responsive image loading across devices

### Security Testing
- **Authentication Testing**: Test OTP generation, validation, and session management
- **Authorization Testing**: Test role-based access control for admin features
- **Input Validation**: Test SQL injection, XSS, and other injection attacks
- **Payment Security**: Test PCI compliance and secure payment processing
- **Data Privacy**: Test women-only ride privacy and data protection measures
