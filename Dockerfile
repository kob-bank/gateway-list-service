# Use Bun official image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Build stage (if needed for production optimizations)
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./

# Create non-root user
RUN addgroup --system --gid 1001 bunuser && \
    adduser --system --uid 1001 bunuser && \
    chown -R bunuser:bunuser /app

USER bunuser

# Expose API port
EXPOSE 3000

# Default command (can be overridden in Kubernetes)
CMD ["bun", "run", "src/api.ts"]
