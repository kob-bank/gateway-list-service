import { z } from 'zod';

const configSchema = z.object({
  // API Server
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Redis
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().default(6379),
    password: z.string().optional(),
    db: z.coerce.number().default(0),
  }),

  // Cache
  cache: z.object({
    primaryTtl: z.coerce.number().default(30),
    staleTtl: z.coerce.number().default(3600),
  }),

  // Manager API
  managerApi: z.object({
    url: z.string().url(),
    token: z.string().min(1),
  }),

  // Worker
  worker: z.object({
    intervalMs: z.coerce.number().default(15000),
    timeoutMs: z.coerce.number().default(10000),
  }),

  // Sites
  sites: z.string().transform((s) => s.split(',').map((site) => site.trim())),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const env = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB,
    },
    cache: {
      primaryTtl: process.env.CACHE_PRIMARY_TTL,
      staleTtl: process.env.CACHE_STALE_TTL,
    },
    managerApi: {
      url: process.env.MANAGER_API_URL,
      token: process.env.INTERNAL_API_TOKEN,
    },
    worker: {
      intervalMs: process.env.WORKER_INTERVAL_MS,
      timeoutMs: process.env.WORKER_TIMEOUT_MS,
    },
    sites: process.env.SITES,
    logLevel: process.env.LOG_LEVEL,
  };

  try {
    return configSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration');
    }
    throw error;
  }
}

export const config = loadConfig();
