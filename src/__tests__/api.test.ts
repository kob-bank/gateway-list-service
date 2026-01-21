import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';

// Mock Redis before importing the app
mock.module('ioredis', () => {
  return {
    default: class MockRedis {
      async get(key: string) {
        if (key.includes('primary')) {
          return JSON.stringify({
            gateways: [
              {
                gatewayId: 'gw-001',
                provider: 'provider-a',
                minLimit: 100,
                maxLimit: 50000,
              },
            ],
            timestamp: new Date().toISOString(),
            site: 'site1',
          });
        }
        return null;
      }

      async setex(key: string, ttl: number, value: string) {
        return 'OK';
      }

      async set(key: string, value: string) {
        return 'OK';
      }

      async ping() {
        return 'PONG';
      }

      async quit() {
        return 'OK';
      }

      on() {
        return this;
      }
    },
  };
});

describe('API Server', () => {
  let server: any;
  const baseUrl = 'http://localhost:3001';

  beforeAll(async () => {
    // Set required environment variables
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'test';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_DB = '0';
    process.env.CACHE_PRIMARY_TTL = '30';
    process.env.CACHE_STALE_TTL = '3600';
    process.env.MANAGER_API_URL = 'http://localhost:4000';
    process.env.INTERNAL_API_TOKEN = 'test-token';
    process.env.WORKER_INTERVAL_MS = '15000';
    process.env.WORKER_TIMEOUT_MS = '10000';
    process.env.SITES = 'site1,site2';
    process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

    // Import and start the app
    const app = await import('../api');
    server = Bun.serve({
      port: 3001,
      fetch: app.default.fetch,
    });
  });

  afterAll(() => {
    if (server) {
      server.stop();
    }
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('redis');
      expect(data).toHaveProperty('sites');
      expect(data).toHaveProperty('timestamp');
    });
  });

  describe('GET /ready', () => {
    it('should return readiness status', async () => {
      const response = await fetch(`${baseUrl}/ready`);
      // May be 200 or 503 depending on cache initialization
      expect([200, 503]).toContain(response.status);

      const data = await response.json();
      expect(data).toHaveProperty('ready');
    });
  });

  describe('GET /live', () => {
    it('should return liveness status', async () => {
      const response = await fetch(`${baseUrl}/live`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({ live: true });
    });
  });

  describe('POST /v3/gateway', () => {
    it('should return gateway list for valid site', async () => {
      const response = await fetch(`${baseUrl}/v3/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ site: 'site1' }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', true);
      expect(data).toHaveProperty('gateway');
      expect(data).toHaveProperty('correlationId');
      expect(data).toHaveProperty('cachedAt');
    });

    it('should return 400 for missing site parameter', async () => {
      const response = await fetch(`${baseUrl}/v3/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('status', false);
      expect(data).toHaveProperty('error');
    });

    it('should return 400 for invalid site parameter type', async () => {
      const response = await fetch(`${baseUrl}/v3/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ site: 123 }),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('status', false);
    });
  });
});
