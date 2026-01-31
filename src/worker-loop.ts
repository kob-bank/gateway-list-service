import { CacheService } from './services/cache';
import { ManagerApiService } from './services/manager-api';
import { FilterService } from './services/filter';
import { config } from './config';

/**
 * Background Worker - Deployment Version
 * Runs as Kubernetes Deployment with infinite loop
 * Syncs gateway data every WORKER_INTERVAL_MS (default: 5000ms)
 */
class GatewayListWorker {
  private cache: CacheService;
  private managerApi: ManagerApiService;
  private filter: FilterService;
  private shouldStop = false;
  private sites: string[] = [];

  constructor() {
    this.cache = new CacheService();
    this.managerApi = new ManagerApiService();
    this.filter = new FilterService();
  }

  /**
   * Main worker loop - runs indefinitely until SIGTERM/SIGINT
   */
  async run(): Promise<void> {
    console.log('[Worker] Starting gateway list worker (Deployment mode)');
    console.log(`[Worker] Interval: ${config.worker.intervalMs}ms`);
    console.log(`[Worker] Error limit: 3`);

    // Initial fetch of sites
    await this.refreshSites();

    if (this.sites.length === 0) {
      console.error('[Worker] No sites found, worker will exit');
      await this.shutdown();
      return;
    }

    // Infinite loop - runs until SIGTERM/SIGINT
    while (!this.shouldStop) {
      const iterationStart = Date.now();

      try {
        await this.fetchAndUpdate();
      } catch (error) {
        console.error('[Worker] Error in fetch cycle:', error);
      }

      const iterationDuration = Date.now() - iterationStart;
      const sleepTime = Math.max(0, config.worker.intervalMs - iterationDuration);

      if (sleepTime > 0 && !this.shouldStop) {
        await this.sleep(sleepTime);
      }
    }

    console.log('[Worker] Worker loop ended');
    await this.shutdown();
  }

  /**
   * Refresh sites list from manager API
   * Called on startup and can be called periodically if needed
   */
  private async refreshSites(): Promise<void> {
    try {
      console.log('[Worker] Fetching sites from manager API...');
      this.sites = await this.managerApi.fetchSites();
      console.log(`[Worker] Found ${this.sites.length} sites: ${this.sites.join(', ')}`);
    } catch (error) {
      console.error('[Worker] Failed to fetch sites from manager API:', error);
      // Keep existing sites if refresh fails
      if (this.sites.length === 0) {
        throw error;
      }
      console.warn('[Worker] Continuing with existing sites');
    }
  }

  /**
   * Fetch data for all sites and update cache
   */
  private async fetchAndUpdate(): Promise<void> {
    const cycleStart = Date.now();

    // Process all sites in parallel
    await Promise.all(this.sites.map((site) => this.processSite(site)));

    const cycleDuration = Date.now() - cycleStart;
    console.log(`[Worker] Fetch cycle completed in ${cycleDuration}ms`);
  }

  /**
   * Process a single site: fetch, filter, cache
   */
  private async processSite(site: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Step 1: Fetch batch data from manager API
      const batchData = await this.managerApi.fetchBatchData(site);

      // Step 2: Apply filters (errorLimit = 3 from FilterService)
      const filteredGateways = this.filter.evaluateFilters(batchData);

      // Step 3: Prepare cache data
      const cacheData = {
        gateways: filteredGateways,
        timestamp: new Date().toISOString(),
        site,
        stats: {
          total: batchData.gateways?.length || 0,
          filtered: filteredGateways.length,
        },
      };

      // Step 4: Update cache (both primary and stale)
      await this.cache.set(site, cacheData);
      await this.cache.setLastUpdate(site);

      const duration = Date.now() - startTime;
      console.log(
        `[Worker] Site ${site}: ${cacheData.stats.filtered}/${cacheData.stats.total} gateways (${duration}ms)`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Worker] Error processing site ${site} after ${duration}ms:`, error);
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

// Handle signals for graceful shutdown
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
worker
  .run()
  .then(() => {
    console.log('[Worker] Worker finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Worker] Worker crashed:', error);
    process.exit(1);
  });
