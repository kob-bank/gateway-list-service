import type { BatchDataResponse } from './manager-api';

export interface Gateway {
  gatewayId: string;
  provider: string;
  status: string;
  timeRange?: {
    deposit?: {
      openingTime: string;
      closingTime: string;
    };
    withdraw?: {
      openingTime: string;
      closingTime: string;
    };
  };
  minLimit: number;
  maxLimit: number;
  [key: string]: any;
}

export interface FilterRequest {
  // No depositAmount - removed in V3
  // errorLimit is fixed at 5 - not a parameter
}

export interface Provider {
  provider: string;
  isActive: boolean;
  isDisabled: boolean;
  state: string;
  [key: string]: any;
}

export interface FilteredGateway {
  gatewayId: string;
  provider: string;
  site: string;
  name: string;
  status: string | boolean;
  paymentMethods?: string[];
  metaConfig?: any;
  option?: {
    fee?: any;
    feeEstimationTable?: Record<string, any>;
    [key: string]: any;
  };
  minLimit: number;
  maxLimit: number;
  timeRange?: {
    start: string;
    end: string;
  };
  balance?: number; // Current balance from balance service
}

/**
 * Filter evaluation service
 * Implements 6 filters WITHOUT depositAmount parameter
 * Added provider status filter to hide gateways when provider is disabled
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
    const { gateways = [], balances = {}, errors = {}, providers = [] } = batchData;

    // Convert providers array to lookup map for efficient access
    const providerMap: Record<string, Provider> = {};
    if (Array.isArray(providers)) {
      for (const provider of providers) {
        if (provider.provider) {
          providerMap[provider.provider] = provider;
        }
      }
    }

    console.log(`[Filter] Evaluating ${gateways.length} gateways`);
    console.log(`[Filter] Active providers: ${Object.keys(providerMap).length}`);
    console.log(`[Filter] Using errorLimit: ${this.ERROR_LIMIT} (hardcoded)`);

    const startTime = Date.now();

    const filtered = gateways
      .filter((gateway) => this.applyAllFilters(gateway, balances, errors, providerMap))
      .map((gateway) => this.mapToResponse(gateway, balances));

    const duration = Date.now() - startTime;
    console.log(`[Filter] Filtered to ${filtered.length} gateways in ${duration}ms`);

    return filtered;
  }

  /**
   * Apply all 6 filters to a gateway
   */
  private applyAllFilters(
    gateway: Gateway,
    balances: Record<string, number>,
    errors: Record<string, number>,
    providers: Record<string, Provider>
  ): boolean {
    // Filter 1: Gateway status check
    if (!this.checkStatus(gateway)) {
      return false;
    }

    // Filter 2: Time range check
    if (!this.checkTimeRange(gateway)) {
      return false;
    }

    // Filter 3: Provider existence and status check
    if (!this.checkProvider(gateway, providers)) {
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
   * Checks deposit operating hours (openingTime - closingTime)
   */
  private checkTimeRange(gateway: Gateway): boolean {
    if (!gateway.timeRange || !gateway.timeRange.deposit) {
      return true; // No time restriction
    }

    const { openingTime, closingTime } = gateway.timeRange.deposit;
    if (!openingTime || !closingTime) {
      return true; // No time restriction
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [openHour, openMin] = openingTime.split(':').map(Number);
    const [closeHour, closeMin] = closingTime.split(':').map(Number);

    const startTime = openHour * 60 + openMin;
    const endTime = closeHour * 60 + closeMin;

    const isValid = currentTime >= startTime && currentTime <= endTime;

    if (!isValid) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out by time range: ${openingTime}-${closingTime}`
      );
    }

    return isValid;
  }

  /**
   * Filter 3: Provider must exist and be active
   * Checks both gateway's provider field AND provider's status
   */
  private checkProvider(
    gateway: Gateway,
    providers: Record<string, Provider>
  ): boolean {
    // Check 1: Gateway must have a provider field
    if (!gateway.provider || gateway.provider.trim().length === 0) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out: no provider field`
      );
      return false;
    }

    // Check 2: Provider must exist in providers list
    const provider = providers[gateway.provider];
    if (!provider) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out: provider ${gateway.provider} not found in providers list`
      );
      return false;
    }

    // Check 3: Provider must be active (isActive=true AND isDisabled=false)
    if (!provider.isActive || provider.isDisabled) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out: provider ${gateway.provider} is inactive (isActive=${provider.isActive}, isDisabled=${provider.isDisabled})`
      );
      return false;
    }

    return true;
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
   * SECURITY: Explicitly whitelist safe fields only
   * - Excludes providerConfig (contains credentials)
   * - Excludes MongoDB metadata (_id, __v, createdAt, updatedAt)
   * - Excludes internal config (backupSite)
   * - Includes option.fee and option.feeEstimationTable for BO calculations
   * - Includes balance from balance service
   */
  private mapToResponse(
    gateway: Gateway,
    balances: Record<string, number>
  ): FilteredGateway {
    return {
      gatewayId: gateway.gatewayId,
      provider: gateway.provider,
      site: gateway.site,
      name: gateway.name,
      status: gateway.status,
      paymentMethods: gateway.paymentMethods,
      metaConfig: gateway.metaConfig,
      option: gateway.option, // Contains fee and feeEstimationTable
      minLimit: gateway.minLimit,
      maxLimit: gateway.maxLimit,
      timeRange: gateway.timeRange,
      balance: balances[gateway.gatewayId] || 0, // Current balance
    };
  }
}
