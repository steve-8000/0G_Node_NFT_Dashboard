# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:18-alpine AS deps

WORKDIR /app

# Install dependencies only when needed
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile && \
    npm cache clean --force

# ============================================
# Stage 2: Builder
# ============================================
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM nginx:1.25-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration directly (not as template)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create nginx directories and set permissions
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp && \
    chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx && \
    chmod -R 755 /usr/share/nginx/html /var/cache/nginx

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Expose port
EXPOSE 80

# nginx:alpine은 기본적으로 root로 실행되므로 USER 지정하지 않음
# Kubernetes securityContext에서 권한 제한

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
