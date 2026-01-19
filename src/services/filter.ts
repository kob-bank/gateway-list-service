import type { BatchDataResponse } from './manager-api';

export interface Gateway {
  gatewayId: string;
  provider: string;
  status: string;
  timeRange: {
    start: string;
    end: string;
  };
  minLimit: number;
  maxLimit: number;
  [key: string]: any;
}

export interface FilterRequest {
  // No depositAmount - removed in V3
  // errorLimit is fixed at 5 - not a parameter
}

export interface FilteredGateway {
  gatewayId: string;
  provider: string;
  minLimit: number;
  maxLimit: number;
  [key: string]: any;
}

/**
 * Filter evaluation service
 * Implements 5 filters WITHOUT depositAmount parameter
 */
export class FilterService {
  // Hardcoded error limit (not configurable)
  private readonly ERROR_LIMIT = 5;

  /**
   * Evaluate all filters and return eligible gateways
   */
  evaluateFilters(
    batchData: BatchDataResponse,
    request: FilterRequest = {}
  ): FilteredGateway[] {
    const { gateways = [], balances = {}, errors = {}, providers = {} } = batchData;

    console.log(`[Filter] Evaluating ${gateways.length} gateways`);
    console.log(`[Filter] Using errorLimit: ${this.ERROR_LIMIT} (hardcoded)`);

    const startTime = Date.now();

    const filtered = gateways
      .filter((gateway) => this.applyAllFilters(gateway, balances, errors))
      .map((gateway) => this.mapToResponse(gateway));

    const duration = Date.now() - startTime;
    console.log(`[Filter] Filtered to ${filtered.length} gateways in ${duration}ms`);

    return filtered;
  }

  /**
   * Apply all 5 filters to a gateway
   */
  private applyAllFilters(
    gateway: Gateway,
    balances: Record<string, number>,
    errors: Record<string, number>
  ): boolean {
    // Filter 1: Status check
    if (!this.checkStatus(gateway)) {
      return false;
    }

    // Filter 2: Time range check
    if (!this.checkTimeRange(gateway)) {
      return false;
    }

    // Filter 3: Provider check (implicitly passed if exists)
    if (!this.checkProvider(gateway)) {
      return false;
    }

    // Filter 4: Error limit check (hardcoded at 5)
    if (!this.checkErrorLimit(gateway, errors)) {
      return false;
    }

    // Filter 5: Balance limit check (WITHOUT depositAmount)
    if (!this.checkBalanceLimit(gateway, balances)) {
      return false;
    }

    return true;
  }

  /**
   * Filter 1: Status must be 'active' or 'enabled'
   */
  private checkStatus(gateway: Gateway): boolean {
    // Handle boolean true as valid (backend sends boolean status)
    if (gateway.status === true) {
      return true;
    }

    // Handle string statuses
    const validStatuses = ['active', 'enabled', 'online', 'true'];
    const statusStr = String(gateway.status ?? '').toLowerCase();
    const isValid = validStatuses.includes(statusStr);

    if (!isValid) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out by status: ${gateway.status}`
      );
    }

    return isValid;
  }

  /**
   * Filter 2: Current time must be within gateway's time range
   */
  private checkTimeRange(gateway: Gateway): boolean {
    if (!gateway.timeRange) {
      return true; // No time restriction
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = gateway.timeRange.start.split(':').map(Number);
    const [endHour, endMin] = gateway.timeRange.end.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    const isValid = currentTime >= startTime && currentTime <= endTime;

    if (!isValid) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out by time range: ${gateway.timeRange.start}-${gateway.timeRange.end}`
      );
    }

    return isValid;
  }

  /**
   * Filter 3: Provider must exist and be valid
   */
  private checkProvider(gateway: Gateway): boolean {
    const isValid = !!gateway.provider && gateway.provider.trim().length > 0;

    if (!isValid) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out: no provider`
      );
    }

    return isValid;
  }

  /**
   * Filter 4: Error count must be less than ERROR_LIMIT (5)
   */
  private checkErrorLimit(
    gateway: Gateway,
    errors: Record<string, number>
  ): boolean {
    const errorCount = errors[gateway.provider] || 0;
    const isValid = errorCount < this.ERROR_LIMIT;

    if (!isValid) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out by error limit: ${errorCount} >= ${this.ERROR_LIMIT}`
      );
    }

    return isValid;
  }

  /**
   * Filter 5: Balance must be greater than gateway's minLimit
   * NOTE: NO depositAmount comparison - removed in V3
   */
  private checkBalanceLimit(
    gateway: Gateway,
    balances: Record<string, number>
  ): boolean {
    const balance = balances[gateway.gatewayId] || 0;
    const minLimit = gateway.minLimit || 0;

    // Simple check: balance must exceed minimum limit
    const isValid = balance > minLimit;

    if (!isValid) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out by balance: ${balance} <= ${minLimit}`
      );
    }

    return isValid;
  }

  /**
   * Map gateway to response format
   */
  private mapToResponse(gateway: Gateway): FilteredGateway {
    return {
      gatewayId: gateway.gatewayId,
      provider: gateway.provider,
      minLimit: gateway.minLimit,
      maxLimit: gateway.maxLimit,
      // Include any other fields from original gateway
      ...gateway,
    };
  }
}
