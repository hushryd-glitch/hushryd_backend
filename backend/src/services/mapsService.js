/**
 * Google Maps Service (Backend)
 * Server-side Google Maps API integration for geocoding and route calculation
 * 
 * Requirements: 4.1, 4.2, 12.2
 */

const { Client } = require('@googlemaps/google-maps-services-js');

class MapsService {
  constructor() {
    this.client = new Client({});
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!this.apiKey) {
      console.warn('Google Maps API key not configured');
    }
  }

  /**
   * Check if service is available
   * @returns {boolean} Service availability
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Geocode an address to get coordinates
   * @param {string} address - Address to geocode
   * @returns {Promise<Object>} Location with coordinates
   */
  async geocodeAddress(address) {
    if (!this.isAvailable()) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey,
          region: 'in' // Bias results to India
        }
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        
        return {
          address: result.formatted_address,
          coordinates: {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng
          },
          placeId: result.place_id,
          types: result.types,
          addressComponents: result.address_components
        };
      } else {
        throw new Error(`Geocoding failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
  }

  /**
   * Reverse geocode coordinates to get address
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Address information
   */
  async reverseGeocode(lat, lng) {
    if (!this.isAvailable()) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await this.client.reverseGeocode({
        params: {
          latlng: { lat, lng },
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        
        return {
          address: result.formatted_address,
          coordinates: { lat, lng },
          placeId: result.place_id,
          types: result.types,
          addressComponents: result.address_components
        };
      } else {
        throw new Error(`Reverse geocoding failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      throw new Error(`Failed to reverse geocode coordinates: ${error.message}`);
    }
  }

  /**
   * Calculate route between two locations
   * @param {Object} origin - Origin coordinates {lat, lng}
   * @param {Object} destination - Destination coordinates {lat, lng}
   * @param {Object} options - Route options
   * @returns {Promise<Object>} Route information
   */
  async calculateRoute(origin, destination, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Google Maps API key not configured');
    }

    const defaultOptions = {
      mode: 'driving',
      units: 'metric',
      avoid: [],
      ...options
    };

    try {
      const response = await this.client.directions({
        params: {
          origin,
          destination,
          mode: defaultOptions.mode,
          units: defaultOptions.units,
          avoid: defaultOptions.avoid,
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK' && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const leg = route.legs[0];

        return {
          distance: {
            value: leg.distance.value, // meters
            text: leg.distance.text
          },
          duration: {
            value: leg.duration.value, // seconds
            text: leg.duration.text
          },
          polyline: route.overview_polyline.points,
          bounds: route.bounds,
          steps: leg.steps.map(step => ({
            distance: step.distance,
            duration: step.duration,
            instructions: step.html_instructions,
            startLocation: step.start_location,
            endLocation: step.end_location,
            polyline: step.polyline.points
          })),
          warnings: route.warnings || [],
          copyrights: route.copyrights
        };
      } else {
        throw new Error(`Route calculation failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Route calculation error:', error);
      throw new Error(`Failed to calculate route: ${error.message}`);
    }
  }

  /**
   * Calculate distance matrix between multiple origins and destinations
   * @param {Array} origins - Array of origin coordinates
   * @param {Array} destinations - Array of destination coordinates
   * @param {Object} options - Calculation options
   * @returns {Promise<Object>} Distance matrix
   */
  async calculateDistanceMatrix(origins, destinations, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Google Maps API key not configured');
    }

    const defaultOptions = {
      mode: 'driving',
      units: 'metric',
      avoid: [],
      ...options
    };

    try {
      const response = await this.client.distancematrix({
        params: {
          origins,
          destinations,
          mode: defaultOptions.mode,
          units: defaultOptions.units,
          avoid: defaultOptions.avoid,
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK') {
        return {
          originAddresses: response.data.origin_addresses,
          destinationAddresses: response.data.destination_addresses,
          rows: response.data.rows.map(row => ({
            elements: row.elements.map(element => ({
              distance: element.distance,
              duration: element.duration,
              status: element.status
            }))
          }))
        };
      } else {
        throw new Error(`Distance matrix calculation failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Distance matrix error:', error);
      throw new Error(`Failed to calculate distance matrix: ${error.message}`);
    }
  }

  /**
   * Find nearby places using Places API
   * @param {Object} location - {lat, lng}
   * @param {string} type - Place type
   * @param {number} radius - Search radius in meters
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of nearby places
   */
  async findNearbyPlaces(location, type, radius = 5000, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await this.client.placesNearby({
        params: {
          location,
          radius,
          type,
          key: this.apiKey,
          ...options
        }
      });

      if (response.data.status === 'OK') {
        return response.data.results.map(place => ({
          placeId: place.place_id,
          name: place.name,
          vicinity: place.vicinity,
          coordinates: place.geometry.location,
          rating: place.rating,
          types: place.types,
          priceLevel: place.price_level,
          openingHours: place.opening_hours,
          photos: place.photos?.map(photo => ({
            photoReference: photo.photo_reference,
            width: photo.width,
            height: photo.height
          }))
        }));
      } else {
        throw new Error(`Places search failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Places search error:', error);
      throw new Error(`Failed to find nearby places: ${error.message}`);
    }
  }

  /**
   * Get place details by place ID
   * @param {string} placeId - Google Places ID
   * @param {Array} fields - Fields to retrieve
   * @returns {Promise<Object>} Place details
   */
  async getPlaceDetails(placeId, fields = ['formatted_address', 'geometry', 'name']) {
    if (!this.isAvailable()) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await this.client.placeDetails({
        params: {
          place_id: placeId,
          fields: fields.join(','),
          key: this.apiKey
        }
      });

      if (response.data.status === 'OK') {
        const place = response.data.result;
        
        return {
          placeId: place.place_id,
          name: place.name,
          address: place.formatted_address,
          coordinates: place.geometry?.location,
          types: place.types,
          rating: place.rating,
          priceLevel: place.price_level,
          openingHours: place.opening_hours,
          phoneNumber: place.formatted_phone_number,
          website: place.website,
          photos: place.photos?.map(photo => ({
            photoReference: photo.photo_reference,
            width: photo.width,
            height: photo.height
          }))
        };
      } else {
        throw new Error(`Place details failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('Place details error:', error);
      throw new Error(`Failed to get place details: ${error.message}`);
    }
  }

  /**
   * Validate coordinates
   * @param {Object} coordinates - {lat, lng}
   * @returns {boolean} Validation result
   */
  isValidCoordinates(coordinates) {
    if (!coordinates || typeof coordinates !== 'object') return false;
    
    const { lat, lng } = coordinates;
    
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180 &&
      !isNaN(lat) && !isNaN(lng)
    );
  }

  /**
   * Calculate straight-line distance between two points (Haversine formula)
   * @param {Object} point1 - {lat, lng}
   * @param {Object} point2 - {lat, lng}
   * @returns {number} Distance in meters
   */
  calculateStraightLineDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = point1.lat * Math.PI / 180;
    const lat2Rad = point2.lat * Math.PI / 180;
    const deltaLatRad = (point2.lat - point1.lat) * Math.PI / 180;
    const deltaLngRad = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Format distance for display
   * @param {number} meters - Distance in meters
   * @returns {string} Formatted distance
   */
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  /**
   * Format duration for display
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds} sec`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) {
      return `${hours} hr`;
    }
    return `${hours} hr ${remainingMins} min`;
  }
}

module.exports = new MapsService();