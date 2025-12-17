# Design Document: Mobile App Flow Fixes

## Overview

This design addresses critical mobile app flow issues affecting driver ride posting, trip tracking, search filtering, payment flow, wallet functionality, KYC visibility, and ride pricing options. The fixes ensure a seamless user experience across all major app flows.

## Architecture

The mobile app follows a React Native architecture with Expo Router for navigation. Key architectural components:

```
mobile-app/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── publish.jsx    # Driver ride posting
│   │   └── search.jsx     # Passenger search
│   └── (stack)/           # Stack navigation screens
│       ├── track/[bookingId].jsx  # Trip tracking
│       ├── driver/kyc.jsx         # KYC screen
│       └── wallet/index.jsx       # Wallet screen
├── src/
│   ├── components/        # Reusable UI components
│   ├── services/          # API and business logic
│   └── utils/             # Utility functions
```

## Components and Interfaces

### 1. Track Ride Screen Fix

**Problem:** Page Not Found error when accessing track ride with booking ID.

**Root Cause:** The booking ID parameter validation is missing, and the route may not be properly registered in the stack layout.

**Solution:**

```javascript
// mobile-app/app/(stack)/track/[bookingId].jsx

// Add booking ID validation
const validateBookingId = (bookingId) => {
  if (!bookingId || typeof bookingId !== 'string') {
    return { valid: false, error: 'Booking ID is required' };
  }
  // Check for valid format (alphanumeric with hyphens)
  const validFormat = /^[a-zA-Z0-9-]+$/.test(bookingId);
  if (!validFormat) {
    return { valid: false, error: 'Invalid booking ID format' };
  }
  return { valid: true };
};

// Use validation before API call
useEffect(() => {
  const validation = validateBookingId(bookingId);
  if (!validation.valid) {
    setError(validation.error);
    setLoading(false);
    return;
  }
  fetchTracking();
}, [bookingId]);
```

### 2. Driver Post Ride Accessibility

**Problem:** Drivers cannot access the "Post a Ride" section.

**Solution:** Ensure the Publish tab correctly detects driver status and shows TripCreator.

```javascript
// Enhanced driver status detection
const loadProfile = useCallback(async () => {
  try {
    const demoEnabled = await isDemoMode();
    
    if (demoEnabled) {
      const demoRole = await getDemoRole();
      setIsDriver(demoRole === 'driver');
    } else {
      const token = await getToken();
      if (token) {
        const profileResponse = await getProfile();
        if (profileResponse.success) {
          const profile = profileResponse.profile;
          // Check multiple driver indicators
          setIsDriver(
            profile.isDriver === true ||
            profile.role === 'driver' ||
            profile.driverStatus === 'verified' ||
            profile.driverStatus === 'pending'
          );
        }
      }
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    setError('Failed to load profile. Please try again.');
  } finally {
    setLoading(false);
  }
}, []);
```

### 3. Search Filter Implementation

**Problem:** Filters not working and unable to select rides.

**Solution:** Fix filter application and ride card navigation.

```javascript
// Enhanced filter application in rideFilters.js
export const filterRides = (rides, filters) => {
  if (!rides || !Array.isArray(rides)) return [];
  
  return rides.filter(ride => {
    // Women-only filter
    if (filters.womenOnly && !ride.isWomenOnly && !ride.ladiesOnly) {
      return false;
    }
    
    // Instant booking filter
    if (filters.instantBooking && !ride.instantBooking) {
      return false;
    }
    
    // Price range filter
    const price = ride.farePerSeat || ride.pricePerSeat || 0;
    if (filters.minPrice !== null && price < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice !== null && price > filters.maxPrice) {
      return false;
    }
    
    // Time filter
    if (filters.departureTimeFrom && filters.departureTimeTo) {
      const departureTime = new Date(ride.scheduledAt || ride.departureTime);
      const fromTime = new Date(filters.departureTimeFrom);
      const toTime = new Date(filters.departureTimeTo);
      
      const rideHour = departureTime.getHours();
      const fromHour = fromTime.getHours();
      const toHour = toTime.getHours();
      
      if (rideHour < fromHour || rideHour >= toHour) {
        return false;
      }
    }
    
    return true;
  });
};
```

### 4. Ride Card Navigation Fix

```javascript
// RideCard.jsx - Ensure proper navigation
const handlePress = useCallback(() => {
  const rideId = ride.id || ride.tripId || ride._id;
  if (rideId && onPress) {
    onPress(ride);
  }
}, [ride, onPress]);

// search.jsx - Handle ride press with proper navigation
const handleRidePress = useCallback((ride) => {
  const rideId = ride.id || ride.tripId || ride._id;
  if (rideId) {
    router.push(`/(stack)/book/${rideId}`);
  } else {
    Alert.alert('Error', 'Unable to open ride details');
  }
}, [router]);
```

### 5. KYC Status Display Enhancement

**Problem:** Unable to see KYC details on driver page.

**Solution:** Fetch and display actual KYC data from API.

```javascript
// Enhanced KYC screen with API integration
const fetchKYCStatus = async () => {
  try {
    setLoading(true);
    const response = await get('/api/driver/documents');
    
    if (response.success) {
      setDocuments(response.documents || []);
      setKycStatus(response.verificationStatus || KYC_STATUS.NOT_STARTED);
      setSubmittedAt(response.submittedAt);
      
      // Map uploaded documents
      const uploaded = {};
      response.documents?.forEach(doc => {
        uploaded[doc.type] = {
          url: doc.url,
          documentId: doc._id,
          status: doc.status,
          rejectionReason: doc.rejectionReason,
        };
      });
      setUploadedDocuments(uploaded);
    }
  } catch (error) {
    setError('Failed to load KYC status');
  } finally {
    setLoading(false);
  }
};
```

### 6. Post Ride Distance and Pricing Options

**Problem:** Missing min/max km fields and editable pricing.

**Solution:** Add distance fields to TripCreator form.

```javascript
// New state for distance limits
const [minDistance, setMinDistance] = useState('');
const [maxDistance, setMaxDistance] = useState('');

// Distance input fields JSX
<View style={styles.section}>
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>Distance Limits (Optional)</Text>
  </View>
  
  <View style={styles.distanceRow}>
    <View style={styles.distanceInput}>
      <Text style={styles.inputLabel}>Min Distance (km)</Text>
      <TextInput
        style={styles.input}
        value={minDistance}
        onChangeText={setMinDistance}
        keyboardType="numeric"
        placeholder="No minimum"
        placeholderTextColor={colors.neutral[400]}
      />
    </View>
    
    <View style={styles.distanceInput}>
      <Text style={styles.inputLabel}>Max Distance (km)</Text>
      <TextInput
        style={styles.input}
        value={maxDistance}
        onChangeText={setMaxDistance}
        keyboardType="numeric"
        placeholder="No maximum"
        placeholderTextColor={colors.neutral[400]}
      />
    </View>
  </View>
</View>

// Include in trip data
const tripData = {
  // ... existing fields
  minDistance: minDistance ? parseFloat(minDistance) : null,
  maxDistance: maxDistance ? parseFloat(maxDistance) : null,
};
```

### 7. Wallet Screen Fix

**Problem:** Wallet pages not displaying correctly.

**Solution:** Ensure proper API integration and error handling.

```javascript
// wallet/index.jsx - Enhanced data fetching
const fetchWalletData = async () => {
  try {
    setLoading(true);
    setError(null);
    
    const response = await get('/api/wallet');
    
    if (response.success) {
      setWalletData({
        balance: response.balance || 0,
        currency: response.currency || 'INR',
        transactions: response.transactions || [],
      });
    } else {
      setError(response.error || 'Failed to load wallet');
    }
  } catch (err) {
    setError('Unable to connect to server');
  } finally {
    setLoading(false);
  }
};
```

## Data Models

### Booking ID Validation Schema

```javascript
const BookingIdSchema = {
  type: 'string',
  pattern: '^[a-zA-Z0-9-]+$',
  minLength: 1,
  maxLength: 100,
};
```

### Trip Creation Data Model (Enhanced)

```javascript
const TripDataSchema = {
  source: {
    address: String,
    coordinates: { lat: Number, lng: Number },
    placeId: String,
  },
  destination: {
    address: String,
    coordinates: { lat: Number, lng: Number },
    placeId: String,
  },
  scheduledAt: Date,
  availableSeats: Number, // 1-6
  farePerSeat: Number, // > 0
  minDistance: Number, // optional, in km
  maxDistance: Number, // optional, in km
  instantBooking: Boolean,
  ladiesOnly: Boolean,
  description: String,
};
```

### Filter State Model

```javascript
const FilterStateSchema = {
  womenOnly: Boolean,
  instantBooking: Boolean,
  minPrice: Number | null,
  maxPrice: Number | null,
  departureTimeFrom: Date | null,
  departureTimeTo: Date | null,
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Booking ID Validation
*For any* string input as booking ID, the validation function should return valid=true only if the string is non-empty and matches the alphanumeric-with-hyphens pattern
**Validates: Requirements 2.2, 2.4, 8.2**

### Property 2: Filter Results Subset
*For any* list of rides and any filter configuration, the filtered results should be a subset of the original rides where every ride in the result matches all active filter criteria
**Validates: Requirements 3.1, 3.5**

### Property 3: Active Filter Count Accuracy
*For any* filter state, the active filter count should equal the number of filter properties that differ from their default values
**Validates: Requirements 3.3**

### Property 4: Driver Role UI Rendering
*For any* user profile with isDriver=true or driverStatus='verified', the Publish tab should render the TripCreator component instead of the BecomeDriverPrompt
**Validates: Requirements 1.1, 1.2**

### Property 5: Wallet Role-Based Display
*For any* user with driver role, the wallet screen should display earnings and withdrawal options; for any user with passenger role, the wallet screen should display balance and add money options
**Validates: Requirements 5.4, 5.5**

### Property 6: KYC Document Display Completeness
*For any* set of uploaded KYC documents, the KYC screen should display all documents with their respective verification status
**Validates: Requirements 6.1**

### Property 7: Distance Validation - Minimum
*For any* trip with minDistance set and any booking request, the booking should be accepted only if the booking distance is greater than or equal to minDistance
**Validates: Requirements 7.4**

### Property 8: Distance Validation - Maximum
*For any* trip with maxDistance set and any route distance, the trip creation should succeed only if the route distance is less than or equal to maxDistance
**Validates: Requirements 7.5**

### Property 9: Earnings Calculation Accuracy
*For any* price per seat value and seat count, the displayed estimated earnings should equal price * seats
**Validates: Requirements 7.7**

### Property 10: Payment Button Idempotence
*For any* payment initiation, the submit button should be disabled during the loading state, preventing duplicate submissions
**Validates: Requirements 4.2**

## Error Handling

### Track Ride Error States

| Error Type | User Message | Action |
|------------|--------------|--------|
| Invalid booking ID | "Invalid booking ID format" | Show back button |
| Booking not found | "Booking not found" | Navigate to bookings list |
| API error | "Unable to load tracking" | Show retry button |
| Network error | "No internet connection" | Show retry button |

### KYC Error States

| Error Type | User Message | Action |
|------------|--------------|--------|
| API failure | "Failed to load documents" | Show retry button |
| Upload failure | "Upload failed: [reason]" | Allow re-upload |
| Validation error | "Invalid document format" | Show requirements |

## Testing Strategy

### Unit Testing

Unit tests will cover:
- Booking ID validation function
- Filter logic in rideFilters.js
- Active filter count calculation
- Distance validation functions
- Earnings calculation
- Driver status detection logic

### Property-Based Testing

We will use `fast-check` library for property-based testing in React Native/Jest environment.

**Test Configuration:**
- Minimum 100 iterations per property test
- Tests tagged with property reference from design document

**Property Tests to Implement:**
1. Booking ID validation (Property 1)
2. Filter results subset (Property 2)
3. Active filter count (Property 3)
4. Distance validation - min (Property 7)
5. Distance validation - max (Property 8)
6. Earnings calculation (Property 9)

### Integration Testing

Integration tests will verify:
- Track ride screen loads with valid booking ID
- Search filters apply correctly to API results
- Ride card navigation works end-to-end
- KYC document upload and status display
- Wallet data fetching and display
