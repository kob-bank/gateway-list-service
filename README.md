# Gateway List Service

High-performance API service for serving pre-filtered gateway lists using Bun + Hono.

## Overview

This service serves pre-computed gateway lists from Redis cache with <10ms response time:
- Reads from Redis cache (no database queries on request)
- Filters out sensitive `providerConfig` before returning to frontend
- Using Bun runtime (8-9x faster than Node.js)
- High throughput: ~130k req/s

## Architecture (Refactored)

### Components

1. **API Server** (`api.ts`) - THIS SERVICE
   - Hono web framework on Bun runtime
   - Serves `/v3/gateway` endpoint
   - Reads from Redis cache
   - Filters `providerConfig` out before returning
   - High throughput: ~130k req/s

2. **Background Worker** - MOVED TO `gateway-list-builder`
   - Separate service (not part of this repo)
   - Syncs gateway data from payment-manager
   - Applies filters and writes to Redis cache
   - See: `gateway-list-builder` repo

3. **Cache Strategy**
   - Primary cache: 30s TTL (fresh data)
   - Stale cache: 1 hour TTL (fallback)
   - Written by `gateway-list-builder`
   - Read by this service

### Data Flow

```
gateway-list-builder → Redis cache → gateway-list-service → Frontend
                                  ↘
                                   payment-ui (with config)
```

## API Endpoints

### POST /v3/gateway

Returns pre-filtered gateway list for a site.

**Request:**
```json
{
  "site": "site1"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "gateways": [
      {
        "gatewayId": "gw-001",
        "provider": "provider-a",
        "minLimit": 100,
        "maxLimit": 50000
      }
    ],
    "cachedAt": "2024-01-18T10:30:00.000Z",
    "site": "site1"
  }
}
```

**Error Response (Cache Miss):**
```json
{
  "success": false,
  "error": "Gateway list not available. Worker may be initializing.",
  "code": "CACHE_MISS"
}
```

### GET /health

Health check endpoint showing cache status and last update times.

**Response:**
```json
{
  "status": "ok",
  "redis": "connected",
  "sites": {
    "site1": "2024-01-18T10:30:15.000Z",
    "site2": "2024-01-18T10:30:16.000Z"
  },
  "timestamp": "2024-01-18T10:30:20.000Z"
}
```

### GET /ready

Kubernetes readiness probe. Returns 200 when service is ready to accept traffic.

### GET /live

Kubernetes liveness probe. Always returns 200 when process is running.

## Environment Variables

See `.env.example` for all configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | 3000 |
| `REDIS_HOST` | Redis hostname | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `CACHE_PRIMARY_TTL` | Primary cache TTL (seconds) | 30 |
| `CACHE_STALE_TTL` | Stale cache TTL (seconds) | 3600 |
| `MANAGER_API_URL` | Manager API base URL | - |
| `INTERNAL_API_TOKEN` | Authentication token for manager API | - |
| `WORKER_INTERVAL_MS` | Worker fetch interval | 15000 |
| `SITES` | Comma-separated site IDs | - |

## Development

### Prerequisites

- Bun >= 1.0.0
- Redis server
- Manager API running with internal endpoints

### Setup

```bash
# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Run API Server

```bash
# Development mode (with watch)
bun run dev:api

# Production mode
bun run api
```

### Run Worker

```bash
# Development mode (with watch)
bun run dev:worker

# Production mode
bun run worker
```

### Testing

```bash
# Run tests
bun test

# Test API endpoint
curl -X POST http://localhost:3000/v3/gateway \
  -H "Content-Type: application/json" \
  -d '{"site":"site1"}'
```

## Deployment

### Docker Build

```bash
# Build image
docker build -t gateway-list-service:latest .

# Run API
docker run -p 3000:3000 \
  --env-file .env \
  gateway-list-service:latest \
  bun run src/api.ts

# Run Worker
docker run \
  --env-file .env \
  gateway-list-service:latest \
  bun run src/worker.ts
```

### Kubernetes

The service deploys as:
1. **Deployment**: API server with HPA (Horizontal Pod Autoscaler)
2. **CronJob**: Worker running every 1 minute

See `chart/` directory for Helm charts.

## Performance

### Benchmarks

- **API Response Time**: <10ms (from cache)
- **Throughput**: ~130,000 req/s (Bun + Hono)
- **Worker Fetch Time**: ~500-800ms per site
- **Cache Hit Rate**: >99% (with 15s refresh)

### Comparison with V2

| Metric | V2 (Just-in-Time) | V3 (Pre-Computed) |
|--------|-------------------|-------------------|
| Response Time | ~1500ms | <10ms |
| Database Queries | 4-5 per request | 0 per request |
| CPU Usage | High | Low |
| Throughput | ~100 req/s | ~130k req/s |

## Monitoring

### Metrics

- Request count by site
- Response time percentiles (p50, p95, p99)
- Cache hit/miss rates
- Worker execution time
- Filter statistics (total vs filtered)

### Logging

All logs use structured format:
```
[Component] Message
```

Components:
- `[API]`: API server logs
- `[Worker]`: Worker logs
- `[Cache]`: Redis operations
- `[ManagerAPI]`: Manager API calls
- `[Filter]`: Filter evaluations

## Troubleshooting

### Cache Miss Errors

**Symptom**: 503 errors with "CACHE_MISS" code

**Causes**:
1. Worker not running
2. Worker failing to fetch from manager API
3. Redis connection issues

**Solutions**:
```bash
# Check worker logs
kubectl logs -l app=gateway-list-worker

# Check Redis connectivity
redis-cli -h $REDIS_HOST ping

# Manually run worker
bun run worker
```

### High Response Times

**Symptom**: API responses slower than expected

**Possible causes**:
1. Redis connection slow
2. Large gateway lists
3. Network latency

**Solutions**:
- Check Redis latency: `redis-cli --latency`
- Review gateway count per site
- Enable Redis pipelining if needed

### Filter Issues

**Symptom**: Wrong gateways in results

**Debug**:
1. Check filter logs in worker
2. Verify errorLimit = 5 in filter.ts:17
3. Inspect cached data in Redis:
```bash
redis-cli GET "gateway-list:site1:primary"
```

## Migration from V2

### Key Changes

1. **Removed depositAmount parameter**
   - V2: Required `depositAmount` in request body
   - V3: No depositAmount - simplified balance check

2. **Fixed errorLimit**
   - V2: Configurable errorLimit parameter
   - V3: Hardcoded at 5 (not configurable)

3. **Architecture**
   - V2: Just-in-time filtering on each request
   - V3: Pre-computed filtering with background worker

### Client Migration

**Old V2 Request:**
```json
{
  "site": "site1",
  "depositAmount": 5000,
  "errorLimit": 3
}
```

**New V3 Request:**
```json
{
  "site": "site1"
}
```

Simply remove `depositAmount` and `errorLimit` parameters.

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Update this README
4. Follow existing code patterns

## License

Internal use only - KOB Bank
