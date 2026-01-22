import type { BatchDataResponse, RawGateway, ProviderConfig } from './manager-api';

/**
 * Gateway interface - for raw gateway data with metaConfig
 * This is what we receive from batch-data endpoint
 */
export interface Gateway {
  gatewayId: string;
  provider: string;
  name: string;
  site: string;
  status: boolean;
  groupId?: string | null;
  paymentMethods?: string[];

  // Raw metaConfig from MongoDB
  metaConfig?: {
    limit?: {
      deposit?: { min?: number; max?: number };
      withdraw?: { min?: number; max?: number };
    };
    operateTime?: {
      deposit?: { openingTime?: string; closingTime?: string };
      withdraw?: { openingTime?: string; closingTime?: string };
    };
    balanceLimit?: number | null;
  };

  // Legacy V2 fields (for backwards compatibility during transition)
  min?: number;
  max?: number;
  limit?: {
    deposit?: { min?: number; max?: number };
    withdraw?: { min?: number; max?: number };
  };
  balanceLimit?: number | null;
  type?: 'individual' | 'group';
  isGroup?: boolean;
  isInGroup?: boolean;
  group?: { groupId: string; groupName: string } | null;
  description?: string;
  currentBalance?: number;
  totalBalance?: number;
  serviceTime?: {
    deposit?: { openingTime?: string; closingTime?: string };
    withdraw?: { openingTime?: string; closingTime?: string };
  };
  option?: any;

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

  // Cache for fee estimation tables
  private feeTableCache = new Map<string, Record<string, { withdraw: number; deposit: number }>>();

  /**
   * Evaluate all filters and return eligible gateways
   */
  evaluateFilters(
    batchData: BatchDataResponse,
    request: FilterRequest = {}
  ): FilteredGateway[] {
    const { gateways = [], balances = {}, errors = {}, providers = [] } = batchData;

    console.log(`[Filter] Evaluating ${gateways.length} gateways`);
    console.log(`[Filter] Using errorLimit: ${this.ERROR_LIMIT} (hardcoded)`);
    console.log(`[Filter] Providers available: ${providers.length}`);

    const startTime = Date.now();

    // Create provider lookup map for efficient access
    const providerMap = new Map<string, ProviderConfig>();
    for (const p of providers) {
      providerMap.set(p.provider, p);
    }

    const filtered = gateways
      .filter((gateway) => this.applyAllFilters(gateway as Gateway, balances, errors, providerMap))
      .map((gateway) => this.mapToResponse(gateway as Gateway, balances, providerMap));

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
    errors: Record<string, number>,
    providerMap: Map<string, ProviderConfig>
  ): boolean {
    // Filter 1: Status check
    if (!this.checkStatus(gateway)) {
      return false;
    }

    // Filter 2: Time range check (use merged service time)
    if (!this.checkTimeRange(gateway, providerMap)) {
      return false;
    }

    // Filter 3: Provider existence and status check
    if (!this.checkProvider(gateway, providerMap)) {
      return false;
    }

    // Filter 4: Error limit check (hardcoded at 5)
    if (!this.checkErrorLimit(gateway, errors)) {
      return false;
    }

    // Filter 5: Balance limit - REMOVED
    // Balance is informational only, not a filter criterion
    // Users should see all gateways and decide based on balance info

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
   * Merges gateway metaConfig with provider defaults
   */
  private checkTimeRange(gateway: Gateway, providerMap: Map<string, ProviderConfig>): boolean {
    const provider = providerMap.get(gateway.provider);

    // Get merged service time: gateway metaConfig ?? provider defaults
    const openingTime =
      gateway.metaConfig?.operateTime?.deposit?.openingTime ??
      gateway.serviceTime?.deposit?.openingTime ??
      provider?.operateTime?.deposit?.openingTime;

    const closingTime =
      gateway.metaConfig?.operateTime?.deposit?.closingTime ??
      gateway.serviceTime?.deposit?.closingTime ??
      provider?.operateTime?.deposit?.closingTime;

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
    providerMap: Map<string, ProviderConfig>
  ): boolean {
    // Check 1: Gateway must have a provider field
    if (!gateway.provider || gateway.provider.trim().length === 0) {
      console.debug(
        `[Filter] Gateway ${gateway.gatewayId} filtered out: no provider field`
      );
      return false;
    }

    // Check 2: Provider must exist in providers list
    const provider = providerMap.get(gateway.provider);
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
   * Filter 5: Balance must be greater than gateway's min limit
   * NOTE: NO depositAmount comparison - removed in V3
   * Merges gateway metaConfig with provider defaults
   */
  private checkBalanceLimit(
    gateway: Gateway,
    balances: Record<string, number>,
    providerMap: Map<string, ProviderConfig>
  ): boolean {
    const balance = balances[gateway.gatewayId] || 0;
    const provider = providerMap.get(gateway.provider);

    // Get merged min limit: gateway metaConfig ?? gateway.min ?? provider defaults ?? 0
    const minLimit =
      gateway.metaConfig?.limit?.deposit?.min ??
      gateway.min ??
      provider?.limit?.deposit?.min ??
      0;

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
   * Merges gateway metaConfig with provider defaults (V2 behavior)
   */
  private mapToResponse(
    gateway: Gateway,
    balances: Record<string, number>,
    providerMap: Map<string, ProviderConfig>
  ): FilteredGateway {
    const provider = providerMap.get(gateway.provider);

    // Merge limits: gateway metaConfig ?? gateway.limit ?? provider defaults ?? hardcoded defaults
    const depositMin =
      gateway.metaConfig?.limit?.deposit?.min ??
      gateway.limit?.deposit?.min ??
      provider?.limit?.deposit?.min ??
      100;
    const depositMax =
      gateway.metaConfig?.limit?.deposit?.max ??
      gateway.limit?.deposit?.max ??
      provider?.limit?.deposit?.max ??
      1000000;
    const withdrawMin =
      gateway.metaConfig?.limit?.withdraw?.min ??
      gateway.limit?.withdraw?.min ??
      provider?.limit?.withdraw?.min ??
      100;
    const withdrawMax =
      gateway.metaConfig?.limit?.withdraw?.max ??
      gateway.limit?.withdraw?.max ??
      provider?.limit?.withdraw?.max ??
      1000000;

    // Merge service time: gateway metaConfig || gateway.serviceTime || provider defaults
    // Use || instead of ?? to treat empty string as falsy
    const serviceTime = {
      deposit: {
        openingTime:
          gateway.metaConfig?.operateTime?.deposit?.openingTime ||
          gateway.serviceTime?.deposit?.openingTime ||
          provider?.operateTime?.deposit?.openingTime ||
          '00:00',
        closingTime:
          gateway.metaConfig?.operateTime?.deposit?.closingTime ||
          gateway.serviceTime?.deposit?.closingTime ||
          provider?.operateTime?.deposit?.closingTime ||
          '23:59',
      },
      withdraw: {
        openingTime:
          gateway.metaConfig?.operateTime?.withdraw?.openingTime ||
          gateway.serviceTime?.withdraw?.openingTime ||
          provider?.operateTime?.withdraw?.openingTime ||
          '00:00',
        closingTime:
          gateway.metaConfig?.operateTime?.withdraw?.closingTime ||
          gateway.serviceTime?.withdraw?.closingTime ||
          provider?.operateTime?.withdraw?.closingTime ||
          '23:59',
      },
    };

    // Build option with sanitized fee and feeEstimationTable
    const option = this.buildOption(provider?.option, gateway.option);

    // Group-related fields (V2 format)
    const isGroup = !!gateway.groupId;
    const type = gateway.type ?? (isGroup ? 'group' : 'individual');
    const description =
      gateway.description ||
      (isGroup
        ? `Group ${gateway.provider} gateway`
        : `Individual ${gateway.provider} gateway`);

    return {
      // Basic info
      gatewayId: gateway.gatewayId,
      provider: gateway.provider,
      name: gateway.name,
      site: gateway.site,
      status: gateway.status,
      paymentMethods: gateway.paymentMethods,

      // Limit fields (V2 names) - merged values
      min: depositMin,
      max: depositMax,
      limit: {
        deposit: { min: depositMin, max: depositMax },
        withdraw: { min: withdrawMin, max: withdrawMax },
      },
      balanceLimit: gateway.metaConfig?.balanceLimit ?? gateway.balanceLimit ?? null,

      // Group-related fields (V2 format)
      type: type as 'individual' | 'group',
      isGroup: isGroup,
      isInGroup: gateway.isInGroup ?? isGroup,
      group: gateway.groupId
        ? { groupId: gateway.groupId, groupName: gateway.groupId }
        : gateway.group ?? null,
      description,

      // Balance fields (V2 names) - use balance from balances map
      currentBalance: balances[gateway.gatewayId] ?? gateway.currentBalance ?? 0,
      totalBalance: balances[gateway.gatewayId] ?? gateway.totalBalance ?? 0,

      // Service time (merged)
      serviceTime,

      // Option with fee info (sanitized with feeEstimationTable)
      option,
    };
  }

  /**
   * Build option object with sanitized fee and feeEstimationTable
   */
  private buildOption(providerOption?: any, gatewayOption?: any): any {
    const option = providerOption ?? gatewayOption ?? {};

    if (!option.fee) {
      return option;
    }

    // Sanitize fee structure
    const sanitizedFee = this.sanitizeFeeStructure(option.fee);

    // Generate fee estimation table
    const feeEstimationTable = this.generateFeeEstimationTable(sanitizedFee);

    return {
      ...option,
      fee: sanitizedFee,
      feeEstimationTable,
    };
  }

  /**
   * Sanitize fee structure to consistent format
   */
  private sanitizeFeeStructure(fee: any): any {
    if (!fee) return {};

    const sanitized: any = {};

    // Handle legacy fee.value object format
    const legacyValue = fee.value && typeof fee.value === 'object' ? fee.value : null;
    const legacyType = fee.type || 'fixed';

    if (fee.deposit) {
      sanitized.deposit = {
        type: fee.deposit.type || 'fixed',
        value: fee.deposit.value || 0,
        min: fee.deposit.min || 0,
      };
    } else if (legacyValue && typeof legacyValue.deposit === 'number') {
      sanitized.deposit = {
        type: legacyType,
        value: legacyValue.deposit,
        min: legacyValue.min || 0,
      };
    }

    if (fee.withdraw) {
      sanitized.withdraw = {
        type: fee.withdraw.type || 'fixed',
        value: fee.withdraw.value || 0,
        min: fee.withdraw.min || 0,
      };
    } else if (legacyValue && typeof legacyValue.withdraw === 'number') {
      sanitized.withdraw = {
        type: legacyType,
        value: legacyValue.withdraw,
        min: legacyValue.min || 0,
      };
    }

    if (fee.settlement) {
      sanitized.settlement = {};
      if (fee.settlement.normal) {
        sanitized.settlement.normal = {
          type: fee.settlement.normal.type || 'fixed',
          value: fee.settlement.normal.value || 0,
          min: fee.settlement.normal.min || 0,
        };
      }
      if (fee.settlement.usdt) {
        sanitized.settlement.usdt = {
          type: fee.settlement.usdt.type || 'fixed',
          value: fee.settlement.usdt.value || 0,
          min: fee.settlement.usdt.min || 0,
        };
      }
    }

    return sanitized;
  }

  /**
   * Generate fee estimation table for amounts 50, 100, 150, ... 1000
   */
  private generateFeeEstimationTable(
    feeStructure: any
  ): Record<string, { withdraw: number; deposit: number }> {
    // Create cache key from fee structure
    const cacheKey = JSON.stringify({
      deposit: feeStructure?.deposit,
      withdraw: feeStructure?.withdraw,
    });

    // Check cache first
    if (this.feeTableCache.has(cacheKey)) {
      return this.feeTableCache.get(cacheKey)!;
    }

    const table: Record<string, { withdraw: number; deposit: number }> = {};

    // Generate amounts from 50 to 1000 with 50 interval
    for (let amount = 50; amount <= 1000; amount += 50) {
      const depositFee = this.calculateFee(amount, feeStructure?.deposit);
      const withdrawFee = this.calculateFee(amount, feeStructure?.withdraw);

      table[amount.toString()] = {
        withdraw: withdrawFee,
        deposit: depositFee,
      };
    }

    // Save to cache
    this.feeTableCache.set(cacheKey, table);

    return table;
  }

  /**
   * Calculate fee for given amount and fee config
   */
  private calculateFee(
    amount: number,
    feeConfig?: { type?: string; value?: number; min?: number }
  ): number {
    if (!feeConfig) return 0;

    let calculatedFee = 0;

    if (feeConfig.type === 'fixed') {
      calculatedFee = feeConfig.value || 0;
    } else if (feeConfig.type === 'percentage' || feeConfig.type === 'percent') {
      calculatedFee = Math.round(((amount * (feeConfig.value || 0)) / 100) * 100) / 100;
      calculatedFee = Math.max(calculatedFee, feeConfig.min || 0);
    }

    return calculatedFee;
  }
}
