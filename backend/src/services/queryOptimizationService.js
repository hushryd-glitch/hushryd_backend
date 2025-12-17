/**
 * Database Query Optimization Service
 * Provides utilities for optimizing MongoDB queries for large datasets
 * 
 * Requirements: 8.4 - Infinite scroll or pagination for search results
 * Requirements: 8.1 - Search results within 2 seconds
 */

const mongoose = require('mongoose');

/**
 * Default pagination settings
 */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Create optimized pagination options
 * @param {Object} params - Pagination parameters
 * @returns {Object} Optimized pagination options
 */
const createPaginationOptions = (params = {}) => {
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(params.limit) || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;
  
  return {
    page,
    limit,
    skip,
    // Use lean() for read-only queries (faster)
    lean: params.lean !== false
  };
};

/**
 * Build optimized sort options
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - Sort order (asc/desc)
 * @param {Object} indexedFields - Map of indexed fields
 * @returns {Object} Sort options
 */
const buildSortOptions = (sortBy, sortOrder = 'asc', indexedFields = {}) => {
  const order = sortOrder === 'desc' ? -1 : 1;
  
  // Default indexed fields for common collections
  const defaultIndexedFields = {
    createdAt: true,
    updatedAt: true,
    _id: true,
    scheduledAt: true,
    status: true
  };
  
  const allIndexedFields = { ...defaultIndexedFields, ...indexedFields };
  
  // Prefer indexed fields for sorting
  if (sortBy && allIndexedFields[sortBy]) {
    return { [sortBy]: order };
  }
  
  // Fallback to _id for consistent ordering
  return { _id: order };
};

/**
 * Create cursor-based pagination for large datasets
 * More efficient than skip/limit for large offsets
 * 
 * @param {Object} lastItem - Last item from previous page
 * @param {string} sortField - Field used for sorting
 * @param {string} sortOrder - Sort order (asc/desc)
 * @returns {Object} Cursor query conditions
 */
const createCursorPagination = (lastItem, sortField = '_id', sortOrder = 'asc') => {
  if (!lastItem || !lastItem[sortField]) {
    return {};
  }
  
  const operator = sortOrder === 'desc' ? '$lt' : '$gt';
  return { [sortField]: { [operator]: lastItem[sortField] } };
};

/**
 * Build optimized query with projections
 * Only select fields that are needed
 * 
 * @param {Object} model - Mongoose model
 * @param {Object} query - Query conditions
 * @param {Object} options - Query options
 * @returns {Query} Mongoose query
 */
const buildOptimizedQuery = (model, query, options = {}) => {
  const {
    select,
    populate,
    sort,
    skip,
    limit,
    lean = true,
    hint
  } = options;
  
  let mongooseQuery = model.find(query);
  
  // Apply field selection (projection)
  if (select) {
    mongooseQuery = mongooseQuery.select(select);
  }
  
  // Apply population with field selection
  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach(p => {
        mongooseQuery = mongooseQuery.populate(p);
      });
    } else {
      mongooseQuery = mongooseQuery.populate(populate);
    }
  }
  
  // Apply sorting
  if (sort) {
    mongooseQuery = mongooseQuery.sort(sort);
  }
  
  // Apply pagination
  if (skip !== undefined) {
    mongooseQuery = mongooseQuery.skip(skip);
  }
  if (limit !== undefined) {
    mongooseQuery = mongooseQuery.limit(limit);
  }
  
  // Use lean for read-only queries
  if (lean) {
    mongooseQuery = mongooseQuery.lean();
  }
  
  // Apply index hint if provided
  if (hint) {
    mongooseQuery = mongooseQuery.hint(hint);
  }
  
  return mongooseQuery;
};

/**
 * Execute query with timeout
 * Prevents long-running queries from blocking
 * 
 * @param {Query} query - Mongoose query
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} Query result
 */
const executeWithTimeout = async (query, timeoutMs = 5000) => {
  return Promise.race([
    query.exec(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    )
  ]);
};

/**
 * Build aggregation pipeline with optimizations
 * @param {Array} stages - Aggregation stages
 * @param {Object} options - Options
 * @returns {Array} Optimized pipeline
 */
const buildOptimizedAggregation = (stages, options = {}) => {
  const optimizedStages = [];
  
  // Add $match stages early to reduce documents
  const matchStages = stages.filter(s => s.$match);
  const otherStages = stages.filter(s => !s.$match);
  
  // Put match stages first
  optimizedStages.push(...matchStages);
  
  // Add other stages
  optimizedStages.push(...otherStages);
  
  // Add pagination at the end if specified
  if (options.skip !== undefined) {
    optimizedStages.push({ $skip: options.skip });
  }
  if (options.limit !== undefined) {
    optimizedStages.push({ $limit: options.limit });
  }
  
  return optimizedStages;
};

/**
 * Get collection statistics for optimization insights
 * @param {string} collectionName - Collection name
 * @returns {Promise<Object>} Collection stats
 */
const getCollectionStats = async (collectionName) => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.collection(collectionName).stats();
    
    return {
      collection: collectionName,
      documentCount: stats.count,
      avgDocumentSize: stats.avgObjSize,
      totalSize: stats.size,
      indexCount: stats.nindexes,
      totalIndexSize: stats.totalIndexSize,
      indexes: Object.keys(stats.indexSizes || {})
    };
  } catch (error) {
    return {
      collection: collectionName,
      error: error.message
    };
  }
};

/**
 * Analyze query performance
 * @param {Object} model - Mongoose model
 * @param {Object} query - Query conditions
 * @returns {Promise<Object>} Query analysis
 */
const analyzeQuery = async (model, query) => {
  try {
    const explanation = await model.find(query).explain('executionStats');
    
    return {
      executionTimeMs: explanation.executionStats?.executionTimeMillis,
      totalDocsExamined: explanation.executionStats?.totalDocsExamined,
      totalKeysExamined: explanation.executionStats?.totalKeysExamined,
      nReturned: explanation.executionStats?.nReturned,
      indexUsed: explanation.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN',
      isIndexScan: explanation.queryPlanner?.winningPlan?.inputStage?.stage === 'IXSCAN'
    };
  } catch (error) {
    return { error: error.message };
  }
};

/**
 * Create compound index suggestion based on query patterns
 * @param {Object} queryPattern - Common query pattern
 * @returns {Object} Index suggestion
 */
const suggestIndex = (queryPattern) => {
  const fields = Object.keys(queryPattern);
  
  if (fields.length === 0) {
    return null;
  }
  
  // Build index specification
  const indexSpec = {};
  fields.forEach(field => {
    // Determine index direction based on query operator
    const value = queryPattern[field];
    if (typeof value === 'object' && (value.$gte || value.$gt || value.$lte || value.$lt)) {
      indexSpec[field] = 1; // Range queries benefit from ascending index
    } else {
      indexSpec[field] = 1;
    }
  });
  
  return {
    indexSpec,
    createCommand: `db.collection.createIndex(${JSON.stringify(indexSpec)})`
  };
};

/**
 * Batch operations for bulk updates
 * @param {Object} model - Mongoose model
 * @param {Array} operations - Array of update operations
 * @param {Object} options - Batch options
 * @returns {Promise<Object>} Batch result
 */
const batchUpdate = async (model, operations, options = {}) => {
  const { batchSize = 1000 } = options;
  const results = { modified: 0, errors: [] };
  
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    
    try {
      const bulkOps = batch.map(op => ({
        updateOne: {
          filter: op.filter,
          update: op.update,
          upsert: op.upsert || false
        }
      }));
      
      const result = await model.bulkWrite(bulkOps, { ordered: false });
      results.modified += result.modifiedCount;
    } catch (error) {
      results.errors.push({ batch: i / batchSize, error: error.message });
    }
  }
  
  return results;
};

module.exports = {
  createPaginationOptions,
  buildSortOptions,
  createCursorPagination,
  buildOptimizedQuery,
  executeWithTimeout,
  buildOptimizedAggregation,
  getCollectionStats,
  analyzeQuery,
  suggestIndex,
  batchUpdate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
};
