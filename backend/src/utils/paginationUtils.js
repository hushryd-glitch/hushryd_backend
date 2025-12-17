/**
 * Pagination Utilities
 * 
 * Provides consistent pagination response format across all API endpoints.
 * Requirements: 19.3
 */

/**
 * Default pagination values
 */
const DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
};

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Request query object
 * @param {Object} [options] - Options
 * @param {number} [options.defaultLimit] - Default limit (default: 20)
 * @param {number} [options.maxLimit] - Maximum allowed limit (default: 100)
 * @returns {Object} Parsed pagination parameters
 */
const parsePaginationParams = (query, options = {}) => {
  const { defaultLimit = DEFAULTS.LIMIT, maxLimit = DEFAULTS.MAX_LIMIT } = options;
  
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  
  // Validate and set defaults
  page = isNaN(page) || page < 1 ? DEFAULTS.PAGE : page;
  limit = isNaN(limit) || limit < 1 ? defaultLimit : Math.min(limit, maxLimit);
  
  const skip = (page - 1) * limit;
  
  return {
    page,
    limit,
    skip,
  };
};

/**
 * Create consistent pagination metadata
 * Requirements: 19.3 - Return total count and ensure sum of pages equals total
 * 
 * @param {Object} params - Pagination parameters
 * @param {number} params.page - Current page number
 * @param {number} params.limit - Items per page
 * @param {number} params.total - Total number of items
 * @returns {Object} Pagination metadata
 */
const createPaginationMeta = ({ page, limit, total }) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
    // Additional metadata for consistency verification
    startIndex: (page - 1) * limit + 1,
    endIndex: Math.min(page * limit, total),
  };
};

/**
 * Create paginated response object
 * @param {Array} data - Array of items for current page
 * @param {Object} pagination - Pagination metadata
 * @returns {Object} Paginated response
 */
const createPaginatedResponse = (data, pagination) => {
  return {
    success: true,
    data,
    pagination,
  };
};

/**
 * Apply pagination to a MongoDB query
 * @param {Object} query - Mongoose query object
 * @param {Object} params - Pagination parameters
 * @param {number} params.skip - Number of documents to skip
 * @param {number} params.limit - Number of documents to return
 * @returns {Object} Query with pagination applied
 */
const applyPagination = (query, { skip, limit }) => {
  return query.skip(skip).limit(limit);
};

/**
 * Execute paginated query with total count
 * @param {Object} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} paginationParams - Pagination parameters
 * @param {Object} [options] - Additional options
 * @param {Object} [options.sort] - Sort options
 * @param {string} [options.select] - Fields to select
 * @param {string|Object} [options.populate] - Population options
 * @returns {Promise<Object>} Paginated result with data and pagination metadata
 */
const executePaginatedQuery = async (Model, filter, paginationParams, options = {}) => {
  const { page, limit, skip } = paginationParams;
  const { sort = { createdAt: -1 }, select, populate } = options;
  
  // Execute count and data queries in parallel
  const [total, data] = await Promise.all([
    Model.countDocuments(filter),
    (() => {
      let query = Model.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit);
      
      if (select) {
        query = query.select(select);
      }
      
      if (populate) {
        query = query.populate(populate);
      }
      
      return query.lean();
    })(),
  ]);
  
  const pagination = createPaginationMeta({ page, limit, total });
  
  return {
    data,
    pagination,
  };
};

/**
 * Validate pagination consistency
 * Ensures that the sum of all pages equals the total count
 * @param {Object} pagination - Pagination metadata
 * @param {number} dataLength - Length of data array in current page
 * @returns {boolean} Whether pagination is consistent
 */
const validatePaginationConsistency = (pagination, dataLength) => {
  const { page, limit, total, totalPages } = pagination;
  
  // Check if this is the last page
  const isLastPage = page === totalPages;
  
  // Expected items on this page
  const expectedItems = isLastPage 
    ? total - (page - 1) * limit 
    : limit;
  
  // For empty results, both should be 0
  if (total === 0) {
    return dataLength === 0;
  }
  
  // Validate data length matches expected
  return dataLength === expectedItems || (dataLength <= limit && page <= totalPages);
};

/**
 * Create cursor-based pagination metadata
 * For large datasets where offset pagination is inefficient
 * Requirements: 20.4 - Cursor-based pagination for consistent performance
 * 
 * @param {Array} data - Array of items
 * @param {string} cursorField - Field to use as cursor (e.g., '_id', 'createdAt')
 * @param {number} limit - Items per page
 * @param {boolean} hasMore - Whether there are more items
 * @returns {Object} Cursor pagination metadata
 */
const createCursorPaginationMeta = (data, cursorField, limit, hasMore) => {
  const lastItem = data[data.length - 1];
  const firstItem = data[0];
  
  return {
    limit,
    hasMore,
    nextCursor: hasMore && lastItem ? lastItem[cursorField]?.toString() : null,
    prevCursor: firstItem ? firstItem[cursorField]?.toString() : null,
    count: data.length,
  };
};

/**
 * Parse cursor from request
 * @param {string} cursor - Cursor string
 * @param {string} cursorField - Field the cursor represents
 * @returns {Object|null} Query filter for cursor
 */
const parseCursor = (cursor, cursorField = '_id') => {
  if (!cursor) return null;
  
  // For ObjectId cursors
  if (cursorField === '_id') {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(cursor)) {
      return { [cursorField]: { $lt: new mongoose.Types.ObjectId(cursor) } };
    }
  }
  
  // For date cursors
  if (cursorField === 'createdAt' || cursorField === 'updatedAt') {
    const date = new Date(cursor);
    if (!isNaN(date.getTime())) {
      return { [cursorField]: { $lt: date } };
    }
  }
  
  // For string/number cursors
  return { [cursorField]: { $lt: cursor } };
};

module.exports = {
  DEFAULTS,
  parsePaginationParams,
  createPaginationMeta,
  createPaginatedResponse,
  applyPagination,
  executePaginatedQuery,
  validatePaginationConsistency,
  createCursorPaginationMeta,
  parseCursor,
};
