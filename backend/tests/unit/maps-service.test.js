/**
 * Maps Service Unit Tests
 * Tests for Google Maps integration service
 */

const mapsService = require('../../src/services/mapsService');

describe('Maps Service', () => {
  describe('Service Availability', () => {
    test('should check if service is available', () => {
      const isAvailable = mapsService.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Coordinate Validation', () => {
    test('should validate correct coordinates', () => {
      const validCoords = { lat: 19.076, lng: 72.8777 };
      expect(mapsService.isValidCoordinates(validCoords)).toBe(true);
    });

    test('should reject invalid coordinates', () => {
      expect(mapsService.isValidCoordinates({ lat: 91, lng: 72 })).toBe(false);
      expect(mapsService.isValidCoordinates({ lat: 19, lng: 181 })).toBe(false);
      expect(mapsService.isValidCoordinates({ lat: 'invalid', lng: 72 })).toBe(false);
      expect(mapsService.isValidCoordinates(null)).toBe(false);
      expect(mapsService.isValidCoordinates({})).toBe(false);
    });
  });

  describe('Distance Calculation', () => {
    test('should calculate straight-line distance between two points', () => {
      const point1 = { lat: 19.076, lng: 72.8777 }; // Mumbai
      const point2 = { lat: 28.6139, lng: 77.2090 }; // Delhi
      
      const distance = mapsService.calculateStraightLineDistance(point1, point2);
      
      expect(typeof distance).toBe('number');
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeGreaterThan(1000000); // Should be > 1000km
    });

    test('should return 0 for same coordinates', () => {
      const point = { lat: 19.076, lng: 72.8777 };
      const distance = mapsService.calculateStraightLineDistance(point, point);
      
      expect(distance).toBe(0);
    });
  });

  describe('Formatting Functions', () => {
    test('should format distance correctly', () => {
      expect(mapsService.formatDistance(500)).toBe('500 m');
      expect(mapsService.formatDistance(1000)).toBe('1.0 km');
      expect(mapsService.formatDistance(1500)).toBe('1.5 km');
      expect(mapsService.formatDistance(2000)).toBe('2.0 km');
    });

    test('should format duration correctly', () => {
      expect(mapsService.formatDuration(30)).toBe('30 sec');
      expect(mapsService.formatDuration(60)).toBe('1 min');
      expect(mapsService.formatDuration(90)).toBe('2 min');
      expect(mapsService.formatDuration(3600)).toBe('1 hr');
      expect(mapsService.formatDuration(3660)).toBe('1 hr 1 min');
      expect(mapsService.formatDuration(7200)).toBe('2 hr');
    });
  });

  describe('API Integration (when available)', () => {
    test('should handle geocoding when API key is not available', async () => {
      if (!mapsService.isAvailable()) {
        await expect(mapsService.geocodeAddress('Mumbai, India'))
          .rejects
          .toThrow('Google Maps API key not configured');
      }
    });

    test('should handle route calculation when API key is not available', async () => {
      if (!mapsService.isAvailable()) {
        const origin = { lat: 19.076, lng: 72.8777 };
        const destination = { lat: 28.6139, lng: 77.2090 };
        
        await expect(mapsService.calculateRoute(origin, destination))
          .rejects
          .toThrow('Google Maps API key not configured');
      }
    });
  });
});