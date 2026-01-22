# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:18-alpine AS deps

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production --frozen-lockfile && \
    npm cache clean --force

# ============================================
# Stage 2: Production
# ============================================
FROM node:18-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache sqlite

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create data directory
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data

# Health check script
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo 'wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health || exit 1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/nft_data.db

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health || exit 1

# Run as non-root user
USER nodejs

# Start the application
CMD ["node", "server.js"]
