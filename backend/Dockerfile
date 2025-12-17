# HushRyd Backend API Dockerfile
# Multi-stage build for optimized production image
# Validates: Requirements 2.1 - Build Docker image and run tests in isolated container

# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Stage 2: Production stage
FROM node:18-alpine AS production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S hushryd -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code from builder
COPY --from=builder /app/src ./src

# Create uploads directory with proper permissions
RUN mkdir -p uploads/driver-documents && \
    chown -R hushryd:nodejs uploads

# Switch to non-root user
USER hushryd

# Expose the application port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
