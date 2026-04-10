# Build stage
# Build context is the monorepo root (hackathon/)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace config and api package manifest
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/

# Install only api dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --filter @ara/api

# Copy source code
COPY packages/api/src ./packages/api/src
COPY packages/api/tsconfig.json ./packages/api/

# Build the application
WORKDIR /app/packages/api
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace config and api package manifest
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/

# Install all dependencies (including devDependencies for tsx/dev server)
RUN pnpm install --frozen-lockfile --filter @ara/api

# Copy source (for dev hot-reload mount) and built output
COPY packages/api/src ./packages/api/src
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

USER appuser

WORKDIR /app/packages/api

EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3005/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
