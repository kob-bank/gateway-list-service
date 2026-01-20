import type { BatchDataResponse } from './manager-api';

/**
 * Gateway interface - matches V2 API field names and structure
 */
export interface Gateway {
  gatewayId: string;
  provider: string;
  name: string;
  site: string;
  status: boolean;
  paymentMethods?: string[];

  // Limit fields (V2 names)
  min: number;
  max: number;
  limit: {
    deposit: { min: number; max: number };
    withdraw: { min: number; max: number };
  };
  balanceLimit: number | null;

  // Group-related fields
  type: 'individual' | 'group';
  isGroup: boolean;
  isInGroup: boolean;
  group: { groupId: string; groupName: string } | null;
  description: string;

  // Balance fields (V2 names)
  currentBalance: number;
  totalBalance: number;

  // Service time
  serviceTime?: {
    deposit?: {
      openingTime: string;
      closingTime: string;
    };
    withdraw?: {
      openingTime: string;
      closingTime: string;
    };
  };

  // Option with fee info
  option?: {
    fee?: any;
    feeEstimationTable?: Record<string, any>;
    [key: string]: any;
  };

  [key: string]: any;
}

export interface FilterRequest {
  // No depositAmount - removed in V3
  // errorLimit is fixed at 5 - not a parameter
}

/**
 * FilteredGateway interface - matches V2 API field names and structure
 */
export interface FilteredGateway {
  gatewayId: string;
  provider: string;
  name: string;
  site: string;
  status: boolean;
  paymentMethods?: string[];

  // Limit fields (V2 names)
  min: number;
  max: number;
  limit: {
    deposit: { min: number; max: number };
    withdraw: { min: number; max: number };
  };
  balanceLimit: number | null;

  // Group-related fields
  type: 'individual' | 'group';
  isGroup: boolean;
  isInGroup: boolean;
  group: { groupId: string; groupName: string } | null;
  description: string;

  // Balance fields (V2 names)
  currentBalance: number;
  totalBalance: number;

  // Service time
  serviceTime?: {
    deposit?: {
      openingTime: string;
      closingTime: string;
    };
    withdraw?: {
      openingTime: string;
      closingTime: string;
    };
  };

  // Option with fee info
  option?: {
    fee?: any;
    feeEstimationTable?: Record<string, any>;
    [key: string]: any;
  };
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
      .map((gateway) => this.mapToResponse(gateway, balances));

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
   * Filter 1: Status must be true (boolean)
   */
  private checkStatus(gateway: Gateway): boolean {
    const isValid = gateway.status === true;

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
    if (!gateway.serviceTime || !gateway.serviceTime.deposit) {
      return true; // No time restriction
    }

    const { openingTime, closingTime } = gateway.serviceTime.deposit;
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
   * Filter 5: Balance must be greater than gateway's min limit
   * NOTE: NO depositAmount comparison - removed in V3
   * Uses V2 field name: min (not minLimit)
   */
  private checkBalanceLimit(
    gateway: Gateway,
    balances: Record<string, number>
  ): boolean {
    const balance = balances[gateway.gatewayId] || 0;
    const minLimit = gateway.min || 0;

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
   * Uses V2 field names and structure
   */
  private mapToResponse(
    gateway: Gateway,
    balances: Record<string, number>
  ): FilteredGateway {
    return {
      // Basic info
      gatewayId: gateway.gatewayId,
      provider: gateway.provider,
      name: gateway.name,
      site: gateway.site,
      status: gateway.status,
      paymentMethods: gateway.paymentMethods,

      // Limit fields (V2 names)
      min: gateway.min,
      max: gateway.max,
      limit: gateway.limit,
      balanceLimit: gateway.balanceLimit,

      // Group-related fields
      type: gateway.type,
      isGroup: gateway.isGroup,
      isInGroup: gateway.isInGroup,
      group: gateway.group,
      description: gateway.description,

      // Balance fields (V2 names)
      currentBalance: gateway.currentBalance,
      totalBalance: gateway.totalBalance,

      // Service time
      serviceTime: gateway.serviceTime,

      // Option with fee info
      option: gateway.option,
    };
  }
}
