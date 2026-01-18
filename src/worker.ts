import { CacheService } from './services/cache';
import { ManagerApiService } from './services/manager-api';
import { FilterService } from './services/filter';
import { config } from './config';

/**
 * Background Worker
 * Runs as Kubernetes CronJob (every 1 minute)
 * Internally loops every 15 seconds for 1 minute
 */
class GatewayListWorker {
  private cache: CacheService;
  private managerApi: ManagerApiService;
  private filter: FilterService;
  private shouldStop = false;

  constructor() {
    this.cache = new CacheService();
    this.managerApi = new ManagerApiService();
    this.filter = new FilterService();
  }

  /**
   * Main worker loop
   * Runs for 1 minute (CronJob duration), fetches every 15 seconds
   */
  async run(): Promise<void> {
    console.log('[Worker] Starting gateway list worker');
    console.log(`[Worker] Sites: ${config.sites.join(', ')}`);
    console.log(`[Worker] Interval: ${config.worker.intervalMs}ms`);

    // Run for approximately 60 seconds (4 iterations at 15s each)
    const maxDuration = 60000; // 1 minute
    const startTime = Date.now();

    while (!this.shouldStop && Date.now() - startTime < maxDuration) {
      const iterationStart = Date.now();

      try {
        await this.fetchAndUpdate();
      } catch (error) {
        console.error('[Worker] Error in fetch cycle:', error);
      }

      const iterationDuration = Date.now() - iterationStart;
      const sleepTime = Math.max(0, config.worker.intervalMs - iterationDuration);

      if (sleepTime > 0 && Date.now() - startTime + sleepTime < maxDuration) {
        console.log(`[Worker] Sleeping for ${sleepTime}ms`);
        await this.sleep(sleepTime);
      }
    }

    console.log('[Worker] Worker cycle completed');
    await this.shutdown();
  }

  /**
   * Fetch data for all sites and update cache
   */
  private async fetchAndUpdate(): Promise<void> {
    console.log('[Worker] Starting fetch cycle');
    const cycleStart = Date.now();

    // Process all sites in parallel
    await Promise.all(
      config.sites.map((site) => this.processSite(site))
    );

    const cycleDuration = Date.now() - cycleStart;
    console.log(`[Worker] Fetch cycle completed in ${cycleDuration}ms`);
  }

  /**
   * Process a single site: fetch, filter, cache
   */
  private async processSite(site: string): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(`[Worker] Processing site: ${site}`);

      // Step 1: Fetch batch data from manager API
      const batchData = await this.managerApi.fetchBatchData(site);

      // Step 2: Apply filters (errorLimit = 5 hardcoded)
      const filteredGateways = this.filter.evaluateFilters(batchData);

      // Step 3: Prepare cache data
      const cacheData = {
        gateways: filteredGateways,
        timestamp: new Date().toISOString(),
        site,
        stats: {
          total: batchData.gateways?.length || 0,
          filtered: filteredGateways.length,
          errorLimit: 5, // Document the hardcoded value
        },
      };

      // Step 4: Update cache (both primary and stale)
      await this.cache.set(site, cacheData);
      await this.cache.setLastUpdate(site);

      const duration = Date.now() - startTime;
      console.log(`[Worker] Site ${site} processed in ${duration}ms`);
      console.log(`[Worker] - Total gateways: ${cacheData.stats.total}`);
      console.log(`[Worker] - Filtered gateways: ${cacheData.stats.filtered}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[Worker] Error processing site ${site} after ${duration}ms:`,
        error
      );
      // Continue processing other sites even if one fails
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    console.log('[Worker] Shutting down...');
    await this.cache.close();
    console.log('[Worker] Shutdown complete');
  }

  /**
   * Stop the worker
   */
  stop(): void {
    console.log('[Worker] Stop signal received');
    this.shouldStop = true;
  }
}

// Handle signals
const worker = new GatewayListWorker();

process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received');
  worker.stop();
});

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received');
  worker.stop();
});

// Start worker
worker.run().then(() => {
  console.log('[Worker] Worker finished normally');
  process.exit(0);
}).catch((error) => {
  console.error('[Worker] Worker crashed:', error);
  process.exit(1);
});
