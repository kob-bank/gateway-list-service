import { describe, it, expect, beforeEach } from 'bun:test';
import { FilterService } from '../../services/filter';
import type { BatchDataResponse, ProviderConfig } from '../../services/manager-api';

// Helper to create a raw gateway object (as returned from batch-data)
const createGateway = (overrides: Partial<any> = {}) => ({
  gatewayId: 'gw-001',
  provider: 'provider-a',
  name: 'Test Gateway',
  site: 'testsite',
  status: true,
  groupId: null,
  paymentMethods: ['QR'],
  metaConfig: {
    limit: {
      deposit: { min: 100, max: 50000 },
      withdraw: { min: 100, max: 50000 },
    },
    operateTime: {
      deposit: { openingTime: '00:00', closingTime: '23:59' },
      withdraw: { openingTime: '00:00', closingTime: '23:59' },
    },
    balanceLimit: null,
  },
  ...overrides,
});

// Helper to create a provider config
const createProvider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  provider: 'provider-a',
  limit: {
    deposit: { min: 100, max: 50000 },
    withdraw: { min: 100, max: 50000 },
  },
  operateTime: {
    deposit: { openingTime: '00:00', closingTime: '23:59' },
    withdraw: { openingTime: '00:00', closingTime: '23:59' },
  },
  option: {
    fee: {
      deposit: { type: 'percent', value: 1.5, min: 0 },
      withdraw: { type: 'percent', value: 0.5, min: 0 },
    },
  },
  ...overrides,
});

describe('FilterService', () => {
  let filterService: FilterService;

  beforeEach(() => {
    filterService = new FilterService();
  });

  describe('evaluateFilters', () => {
    it('should return empty array when no gateways provided', () => {
      const batchData: BatchDataResponse = {
        gateways: [],
        balances: {},
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should filter out gateways with inactive status', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ status: false })],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with active status', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ status: true })],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-001');
    });

    it('should filter out gateways with error count >= 5', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway()],
        balances: { 'gw-001': 10000 },
        errors: { 'provider-a': 5 }, // Error limit reached
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with error count < 5', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway()],
        balances: { 'gw-001': 10000 },
        errors: { 'provider-a': 4 }, // Below limit
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
    });

    it('should include gateways with low balance (balance filter removed)', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway()], // min is 100 from metaConfig
        balances: { 'gw-001': 50 }, // Below min - but still included
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].currentBalance).toBe(50);
    });

    it('should include gateways with sufficient balance', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway()], // min is 100 from metaConfig
        balances: { 'gw-001': 1000 }, // Above min
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].currentBalance).toBe(1000);
    });

    it('should filter multiple gateways correctly', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({ gatewayId: 'gw-001', provider: 'provider-a', status: true }),
          createGateway({ gatewayId: 'gw-002', provider: 'provider-b', status: false }),
          createGateway({ gatewayId: 'gw-003', provider: 'provider-c', status: true }),
        ],
        balances: {
          'gw-001': 1000,
          'gw-002': 1000,
          'gw-003': 50, // Low balance - but still included now
        },
        errors: {},
        providers: [
          createProvider({ provider: 'provider-a' }),
          createProvider({ provider: 'provider-b' }),
          createProvider({ provider: 'provider-c' }),
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(2); // gw-001 and gw-003 (gw-002 filtered by status)
      expect(result.map((g) => g.gatewayId)).toContain('gw-001');
      expect(result.map((g) => g.gatewayId)).toContain('gw-003');
    });

    it('should use errorLimit = 5 (hardcoded)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({ gatewayId: 'gw-001', provider: 'provider-a' }),
          createGateway({ gatewayId: 'gw-002', provider: 'provider-b' }),
        ],
        balances: {
          'gw-001': 1000,
          'gw-002': 1000,
        },
        errors: {
          'provider-a': 4, // Below limit
          'provider-b': 5, // At limit (should be filtered)
        },
        providers: [
          createProvider({ provider: 'provider-a' }),
          createProvider({ provider: 'provider-b' }),
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-001');
    });

    it('should filter out gateways without provider', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ provider: '' })],
        balances: { 'gw-001': 1000 },
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should return mapped gateway response with V2 field names', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-001',
            provider: 'provider-a',
            name: 'Test Gateway',
            site: 'testsite',
            status: true,
            extraField: 'extra-value',
          }),
        ],
        balances: { 'gw-001': 1000 }, // Real balance from balance service
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        gatewayId: 'gw-001',
        provider: 'provider-a',
        status: true,
        min: 100,
        max: 50000,
        // V2 behavior: both balance fields come from balances map
        currentBalance: 1000,
        totalBalance: 1000,
      });
      // Security: extraField should NOT be included (no spread operator)
      expect(result[0]).not.toHaveProperty('extraField');
    });

    it('should exclude sensitive fields (providerConfig, MongoDB metadata)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-001',
            provider: 'provider-a',
            name: 'Test Gateway',
            site: 'testsite',
            status: true,
            // Sensitive fields that should be excluded
            providerConfig: {
              secretKey: 'SECRET_KEY',
              apiKey: 'API_KEY',
              callbackKey: 'CALLBACK_KEY',
            },
            _id: '507f1f77bcf86cd799439011',
            __v: 1,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-02',
            backupSite: 'backup-site',
          }),
        ],
        balances: { 'gw-001': 1000 },
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);

      // Verify V2 fields are included
      expect(result[0]).toMatchObject({
        gatewayId: 'gw-001',
        provider: 'provider-a',
        site: 'testsite',
        name: 'Test Gateway',
        status: true,
        min: 100,
        max: 50000,
      });
      expect(result[0].option).toBeDefined();
      expect(result[0].option?.fee).toBeDefined();
      expect(result[0].option?.feeEstimationTable).toBeDefined();
      expect(result[0].paymentMethods).toBeDefined();

      // Security: Verify sensitive fields are excluded
      expect(result[0]).not.toHaveProperty('providerConfig');
      expect(result[0]).not.toHaveProperty('_id');
      expect(result[0]).not.toHaveProperty('__v');
      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('updatedAt');
      expect(result[0]).not.toHaveProperty('backupSite');
    });

    it('should include balance fields from balances map (V2 behavior)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-with-balance',
            provider: 'provider-a',
          }),
          createGateway({
            gatewayId: 'gw-without-balance',
            provider: 'provider-b',
          }),
        ],
        balances: { 'gw-with-balance': 5000 }, // Real balance from balance service
        errors: {},
        providers: [
          createProvider({ provider: 'provider-a' }),
          createProvider({ provider: 'provider-b' }),
        ],
      };

      const result = filterService.evaluateFilters(batchData);

      // Both gateways pass now (balance filter removed)
      expect(result).toHaveLength(2);
      
      // V2 behavior: both currentBalance and totalBalance come from balances map
      const withBalance = result.find((g) => g.gatewayId === 'gw-with-balance')!;
      expect(withBalance.currentBalance).toBe(5000);
      expect(withBalance.totalBalance).toBe(5000);
      
      const withoutBalance = result.find((g) => g.gatewayId === 'gw-without-balance')!;
      expect(withoutBalance.currentBalance).toBe(0);
      expect(withoutBalance.totalBalance).toBe(0);
    });

    it('should include group-related fields (V2 format)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-group',
            provider: 'provider-a',
            groupId: 'grp-001',
          }),
        ],
        balances: { 'gw-group': 5000 },
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('group'); // type derived from groupId
      expect(result[0].isGroup).toBe(true);
      expect(result[0].isInGroup).toBe(true);
      expect(result[0].group).toEqual({ groupId: 'grp-001', groupName: 'grp-001' });
      expect(result[0].description).toBe('Group provider-a gateway');
    });

    it('should include serviceTime field (V2 format) - merged from metaConfig', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-time',
            provider: 'provider-a',
            metaConfig: {
              limit: { deposit: { min: 100, max: 50000 }, withdraw: { min: 100, max: 50000 } },
              operateTime: {
                deposit: { openingTime: '08:00', closingTime: '22:00' },
                withdraw: { openingTime: '09:00', closingTime: '21:00' },
              },
              balanceLimit: null,
            },
          }),
        ],
        balances: { 'gw-time': 5000 },
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].serviceTime).toEqual({
        deposit: { openingTime: '08:00', closingTime: '22:00' },
        withdraw: { openingTime: '09:00', closingTime: '21:00' },
      });
    });

    it('should include limit structure (V2 format) - merged from metaConfig', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-limit',
            provider: 'provider-a',
            metaConfig: {
              limit: {
                deposit: { min: 100, max: 50000 },
                withdraw: { min: 200, max: 30000 },
              },
              operateTime: {
                deposit: { openingTime: '00:00', closingTime: '23:59' },
                withdraw: { openingTime: '00:00', closingTime: '23:59' },
              },
              balanceLimit: 100000,
            },
          }),
        ],
        balances: { 'gw-limit': 5000 },
        errors: {},
        providers: [createProvider()],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].min).toBe(100);
      expect(result[0].max).toBe(50000);
      expect(result[0].limit).toEqual({
        deposit: { min: 100, max: 50000 },
        withdraw: { min: 200, max: 30000 },
      });
      expect(result[0].balanceLimit).toBe(100000);
    });

    it('should merge gateway metaConfig with provider defaults', () => {
      // Gateway has no metaConfig.limit.withdraw, should use provider defaults
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-merge',
            provider: 'provider-a',
            metaConfig: {
              limit: {
                deposit: { min: 50, max: 100000 }, // Gateway specific
                // withdraw is missing - should use provider defaults
              },
              operateTime: {
                deposit: { openingTime: '00:00', closingTime: '23:59' },
                withdraw: { openingTime: '00:00', closingTime: '23:59' },
              },
              balanceLimit: null,
            },
          }),
        ],
        balances: { 'gw-merge': 5000 },
        errors: {},
        providers: [
          createProvider({
            provider: 'provider-a',
            limit: {
              deposit: { min: 100, max: 50000 }, // Provider defaults
              withdraw: { min: 200, max: 50000 }, // Should be used as fallback
            },
          }),
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      // Gateway's deposit limit (50, 100000)
      expect(result[0].limit?.deposit).toEqual({ min: 50, max: 100000 });
      // Provider's withdraw limit as fallback (200, 50000)
      expect(result[0].limit?.withdraw).toEqual({ min: 200, max: 50000 });
    });

    it('should generate feeEstimationTable from provider fee config', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway()],
        balances: { 'gw-001': 5000 },
        errors: {},
        providers: [
          createProvider({
            provider: 'provider-a',
            option: {
              fee: {
                deposit: { type: 'percent', value: 1.8, min: 0 },
                withdraw: { type: 'percent', value: 0.2, min: 0 },
              },
            },
          }),
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].option?.feeEstimationTable).toBeDefined();
      // Check specific calculations
      expect(result[0].option?.feeEstimationTable?.['100']).toEqual({
        deposit: 1.8, // 100 * 1.8% = 1.8
        withdraw: 0.2, // 100 * 0.2% = 0.2
      });
      expect(result[0].option?.feeEstimationTable?.['1000']).toEqual({
        deposit: 18, // 1000 * 1.8% = 18
        withdraw: 2, // 1000 * 0.2% = 2
      });
    });

    it('should generate description based on groupId', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-individual',
            provider: 'provider-a',
            groupId: null, // Not in a group
          }),
          createGateway({
            gatewayId: 'gw-grouped',
            provider: 'provider-b',
            groupId: 'grp-001', // In a group
          }),
        ],
        balances: {
          'gw-individual': 5000,
          'gw-grouped': 5000,
        },
        errors: {},
        providers: [
          createProvider({ provider: 'provider-a' }),
          createProvider({ provider: 'provider-b' }),
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(2);

      const individual = result.find(g => g.gatewayId === 'gw-individual');
      const grouped = result.find(g => g.gatewayId === 'gw-grouped');

      expect(individual?.description).toBe('Individual provider-a gateway');
      expect(grouped?.description).toBe('Group provider-b gateway');
    });
  });
});
