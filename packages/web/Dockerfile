# Build context is the monorepo root (hackathon/)
FROM node:20-alpine

WORKDIR /app

# Copy workspace config and web package manifest
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/web/package.json ./packages/web/

# Install only web dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --filter @ara/web

# Copy source code
COPY packages/web/. ./packages/web/

WORKDIR /app/packages/web

EXPOSE 5173

CMD ["pnpm", "dev"]
