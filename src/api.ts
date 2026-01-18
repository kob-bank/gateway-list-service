import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { CacheService } from './services/cache';
import { config } from './config';

const app = new Hono();
const cache = new CacheService();

// Middleware
app.use('*', logger());
app.use('*', cors());

/**
 * V3 Gateway List Endpoint
 * Returns pre-computed, filtered gateway list from cache
 * NO depositAmount parameter - removed in V3
 */
app.post('/v3/gateway', async (c) => {
  try {
    const body = await c.req.json();
    const { site } = body;

    if (!site || typeof site !== 'string') {
      return c.json(
        {
          success: false,
          error: 'Missing or invalid site parameter',
        },
        400
      );
    }

    console.log(`[API] GET /v3/gateway request for site: ${site}`);

    // Get from cache (tries primary, falls back to stale)
    const cachedData = await cache.get(site);

    if (!cachedData) {
      console.warn(`[API] Cache miss for site: ${site}`);
      return c.json(
        {
          success: false,
          error: 'Gateway list not available. Worker may be initializing.',
          code: 'CACHE_MISS',
        },
        503
      );
    }

    // Return cached, pre-filtered gateway list
    return c.json({
      success: true,
      data: {
        gateways: cachedData.gateways || [],
        cachedAt: cachedData.timestamp || null,
        site,
      },
    });
  } catch (error) {
    console.error('[API] Error processing /v3/gateway:', error);
    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * Health check endpoint
 */
app.get('/health', async (c) => {
  try {
    const redisHealthy = await cache.healthCheck();

    // Get last update times for all sites
    const siteUpdates: Record<string, string | null> = {};
    for (const site of config.sites) {
      const lastUpdate = await cache.getLastUpdate(site);
      siteUpdates[site] = lastUpdate ? lastUpdate.toISOString() : null;
    }

    const healthy = redisHealthy;

    return c.json({
      status: healthy ? 'ok' : 'degraded',
      redis: redisHealthy ? 'connected' : 'disconnected',
      sites: siteUpdates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Health check error:', error);
    return c.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * Ready check endpoint (Kubernetes readiness probe)
 */
app.get('/ready', async (c) => {
  try {
    const redisHealthy = await cache.healthCheck();

    if (!redisHealthy) {
      return c.json({ ready: false, reason: 'Redis not connected' }, 503);
    }

    // Check if at least one site has been initialized
    let initialized = false;
    for (const site of config.sites) {
      const data = await cache.get(site);
      if (data) {
        initialized = true;
        break;
      }
    }

    if (!initialized) {
      return c.json(
        { ready: false, reason: 'Cache not initialized by worker' },
        503
      );
    }

    return c.json({ ready: true });
  } catch (error) {
    return c.json(
      { ready: false, error: error instanceof Error ? error.message : 'Unknown' },
      503
    );
  }
});

/**
 * Liveness check endpoint (Kubernetes liveness probe)
 */
app.get('/live', (c) => {
  return c.json({ live: true });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[API] SIGTERM received, shutting down gracefully...');
  await cache.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[API] SIGINT received, shutting down gracefully...');
  await cache.close();
  process.exit(0);
});

// Start server
const port = config.port;
console.log(`[API] Starting server on port ${port}`);
console.log(`[API] Environment: ${config.nodeEnv}`);
console.log(`[API] Monitoring sites: ${config.sites.join(', ')}`);

export default {
  port,
  fetch: app.fetch,
};
