import { config } from '../config';

export interface BatchDataRequest {
  site: string;
  include: ('gateways' | 'balances' | 'errors' | 'providers')[];
}

export interface BatchDataResponse {
  gateways?: any[];
  balances?: Record<string, number>;
  errors?: Record<string, number>;
  providers?: any[];
}

export class ManagerApiService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    this.baseUrl = config.managerApi.url;
    this.token = config.managerApi.token;
  }

  /**
   * Fetch batch data from manager API
   */
  async fetchBatchData(site: string): Promise<BatchDataResponse> {
    const url = `${this.baseUrl}/internal/gateway/batch-data`;
    const payload: BatchDataRequest = {
      site,
      include: ['gateways', 'balances', 'errors', 'providers'],
    };

    console.log(`[ManagerAPI] Fetching batch data for site: ${site}`);
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': this.token,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.worker.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Manager API returned ${response.status}: ${errorText}`
        );
      }

      const data: BatchDataResponse = await response.json();
      const duration = Date.now() - startTime;

      console.log(`[ManagerAPI] Fetched batch data for site ${site} in ${duration}ms`);
      console.log(`[ManagerAPI] - Gateways: ${data.gateways?.length || 0}`);
      console.log(`[ManagerAPI] - Balances: ${Object.keys(data.balances || {}).length}`);
      console.log(`[ManagerAPI] - Errors: ${Object.keys(data.errors || {}).length}`);
      console.log(`[ManagerAPI] - Providers: ${data.providers?.length || 0}`);

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[ManagerAPI] Error fetching batch data for site ${site} after ${duration}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Health check - verify manager API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/health`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error('[ManagerAPI] Health check failed:', error);
      return false;
    }
  }
}
