/**
 * API Version Middleware
 * 
 * Handles API versioning through headers.
 * Requirements: 5.2, 5.3, 5.4
 */

const { createLogger } = require('../services/loggerService');

const logger = createLogger('apiVersion');

/**
 * Current supported API version
 */
const CURRENT_VERSION = 'v1';

/**
 * Supported API versions
 */
const SUPPORTED_VERSIONS = ['v1'];

/**
 * Deprecated versions with deprecation dates
 */
const DEPRECATED_VERSIONS = {
  // Example: 'v0': { deprecationDate: '2024-06-01', sunsetDate: '2024-12-01' }
};

/**
 * Version header name
 */
const VERSION_HEADER = 'x-api-version';

/**
 * Deprecation warning header
 */
const DEPRECATION_HEADER = 'x-api-deprecation-warning';

/**
 * Sunset header (RFC 8594)
 */
const SUNSET_HEADER = 'sunset';

/**
 * Parse version from header
 * @param {string} versionHeader - Version header value
 * @returns {string|null} Parsed version or null
 */
const parseVersion = (versionHeader) => {
  if (!versionHeader) return null;
  
  // Normalize version string (remove 'v' prefix if present, then add it back)
  const normalized = versionHeader.toLowerCase().replace(/^v/, '');
  return `v${normalized}`;
};

/**
 * Check if version is supported
 * @param {string} version - Version to check
 * @returns {boolean}
 */
const isVersionSupported = (version) => {
  return SUPPORTED_VERSIONS.includes(version);
};

/**
 * Check if version is deprecated
 * @param {string} version - Version to check
 * @returns {Object|null} Deprecation info or null
 */
const getDeprecationInfo = (version) => {
  return DEPRECATED_VERSIONS[version] || null;
};

/**
 * API Version Middleware
 * 
 * Parses X-API-Version header and handles version routing.
 * Requirements: 5.2, 5.3, 5.4
 * 
 * @param {Object} options - Middleware options
 * @param {boolean} [options.strict=false] - If true, reject requests without version header
 * @param {string} [options.defaultVersion='v1'] - Default version if not specified
 * @returns {Function} Express middleware
 */
const apiVersionMiddleware = (options = {}) => {
  const { strict = false, defaultVersion = CURRENT_VERSION } = options;

  return (req, res, next) => {
    // Parse version from header
    const versionHeader = req.headers[VERSION_HEADER];
    const requestedVersion = parseVersion(versionHeader);
    
    // Use default version if not specified
    const version = requestedVersion || defaultVersion;
    
    // Strict mode: require version header
    if (strict && !requestedVersion) {
      logger.warn('Missing API version header', { path: req.path });
      return res.status(400).json({
        error: 'API version header required',
        errorCode: 'VERSION_REQUIRED',
        message: `Please include ${VERSION_HEADER} header with your request`,
        supportedVersions: SUPPORTED_VERSIONS,
      });
    }
    
    // Check if version is supported
    if (!isVersionSupported(version)) {
      // Check if it's a known but unsupported (sunset) version
      const deprecationInfo = getDeprecationInfo(version);
      
      if (deprecationInfo && deprecationInfo.sunsetDate) {
        const sunsetDate = new Date(deprecationInfo.sunsetDate);
        if (new Date() > sunsetDate) {
          // Version has been sunset - return 410 Gone
          // Requirement 5.4
          logger.warn('Unsupported API version requested', { 
            version, 
            path: req.path,
            sunsetDate: deprecationInfo.sunsetDate 
          });
          
          return res.status(410).json({
            error: 'API version no longer supported',
            errorCode: 'VERSION_UNSUPPORTED',
            message: `API version ${version} is no longer supported. Please upgrade to ${CURRENT_VERSION}.`,
            currentVersion: CURRENT_VERSION,
            supportedVersions: SUPPORTED_VERSIONS,
            upgradeInstructions: 'Update your app to the latest version from the app store.',
          });
        }
      }
      
      // Unknown version
      logger.warn('Unknown API version requested', { version, path: req.path });
      return res.status(400).json({
        error: 'Unknown API version',
        errorCode: 'VERSION_UNKNOWN',
        message: `API version ${version} is not recognized`,
        currentVersion: CURRENT_VERSION,
        supportedVersions: SUPPORTED_VERSIONS,
      });
    }
    
    // Check for deprecation warnings
    // Requirement 5.3
    const deprecationInfo = getDeprecationInfo(version);
    if (deprecationInfo) {
      // Add deprecation warning header
      res.setHeader(DEPRECATION_HEADER, 
        `API version ${version} is deprecated. Deprecation date: ${deprecationInfo.deprecationDate}. ` +
        `Please upgrade to ${CURRENT_VERSION}.`
      );
      
      // Add Sunset header if sunset date is set
      if (deprecationInfo.sunsetDate) {
        res.setHeader(SUNSET_HEADER, new Date(deprecationInfo.sunsetDate).toUTCString());
      }
      
      logger.info('Deprecated API version used', { 
        version, 
        path: req.path,
        deprecationDate: deprecationInfo.deprecationDate 
      });
    }
    
    // Attach version info to request
    req.apiVersion = version;
    req.apiVersionInfo = {
      version,
      current: CURRENT_VERSION,
      isDeprecated: !!deprecationInfo,
      deprecationInfo,
    };
    
    // Add version to response headers for client awareness
    res.setHeader('x-api-version-used', version);
    res.setHeader('x-api-version-current', CURRENT_VERSION);
    
    next();
  };
};

/**
 * Version-specific route handler
 * Routes requests to version-specific handlers
 * 
 * @param {Object} handlers - Map of version to handler function
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/users', versionRoute({
 *   v1: handleUsersV1,
 *   v2: handleUsersV2,
 * }));
 */
const versionRoute = (handlers) => {
  return (req, res, next) => {
    const version = req.apiVersion || CURRENT_VERSION;
    const handler = handlers[version];
    
    if (!handler) {
      // Fall back to current version handler
      const fallbackHandler = handlers[CURRENT_VERSION];
      if (fallbackHandler) {
        return fallbackHandler(req, res, next);
      }
      
      return res.status(500).json({
        error: 'Version handler not found',
        errorCode: 'VERSION_HANDLER_MISSING',
      });
    }
    
    return handler(req, res, next);
  };
};

/**
 * Get version compatibility info for client
 * @param {string} clientVersion - Client's API version
 * @returns {Object} Compatibility information
 */
const getVersionCompatibility = (clientVersion) => {
  const version = parseVersion(clientVersion) || CURRENT_VERSION;
  const isSupported = isVersionSupported(version);
  const deprecationInfo = getDeprecationInfo(version);
  
  return {
    clientVersion: version,
    currentVersion: CURRENT_VERSION,
    isSupported,
    isDeprecated: !!deprecationInfo,
    deprecationInfo,
    supportedVersions: SUPPORTED_VERSIONS,
    updateRequired: !isSupported,
  };
};

module.exports = {
  apiVersionMiddleware,
  versionRoute,
  getVersionCompatibility,
  parseVersion,
  isVersionSupported,
  getDeprecationInfo,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
  VERSION_HEADER,
};
