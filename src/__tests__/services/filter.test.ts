import { describe, it, expect, beforeEach } from 'bun:test';
import { FilterService } from '../../services/filter';
import type { BatchDataResponse } from '../../services/manager-api';

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
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should filter out gateways with inactive status', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'inactive',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with active status', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-001');
    });

    it('should filter out gateways with error count >= 5', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: { 'provider-a': 5 }, // Error limit reached
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with error count < 5', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: { 'provider-a': 4 }, // Below limit
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
    });

    it('should filter out gateways with insufficient balance', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 50 }, // Below minLimit
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with sufficient balance', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 1000 }, // Above minLimit
        errors: {},
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
    });

    it('should filter multiple gateways correctly', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
          {
            gatewayId: 'gw-002',
            provider: 'provider-b',
            status: 'inactive',
            minLimit: 100,
            maxLimit: 50000,
          },
          {
            gatewayId: 'gw-003',
            provider: 'provider-c',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: {
          'gw-001': 1000,
          'gw-002': 1000,
          'gw-003': 50, // Insufficient
        },
        errors: {},
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
          { provider: 'provider-b', isActive: true, isDisabled: false, state: 'normal' },
          { provider: 'provider-c', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-001');
    });

    it('should use errorLimit = 5 (hardcoded)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
          {
            gatewayId: 'gw-002',
            provider: 'provider-b',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
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
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
          { provider: 'provider-b', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-001');
    });

    it('should filter out gateways without provider', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: '',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 1000 },
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should return mapped gateway response', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            extraField: 'extra-value',
          },
        ],
        balances: { 'gw-001': 1000 },
        errors: {},
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        gatewayId: 'gw-001',
        provider: 'provider-a',
        status: 'active',
        minLimit: 100,
        maxLimit: 50000,
        balance: 1000, // Should include balance from balances map
      });
      // Security: extraField should NOT be included (no spread operator)
      expect(result[0]).not.toHaveProperty('extraField');
    });

    it('should exclude sensitive fields (providerConfig, MongoDB metadata)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Test Gateway',
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
            // Safe fields that should be included
            option: {
              fee: { deposit: { type: 'percent', value: 1.5 } },
              feeEstimationTable: { '100': { deposit: 1.5 } },
            },
            paymentMethods: ['deposit', 'withdraw'],
            metaConfig: { key: 'value' },
          },
        ],
        balances: { 'gw-001': 1000 },
        errors: {},
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);

      // Verify safe fields are included
      expect(result[0]).toMatchObject({
        gatewayId: 'gw-001',
        provider: 'provider-a',
        site: 'testsite',
        name: 'Test Gateway',
        status: 'active',
        minLimit: 100,
        maxLimit: 50000,
        balance: 1000, // Should include balance
      });
      expect(result[0].option).toBeDefined();
      expect(result[0].option?.fee).toBeDefined();
      expect(result[0].option?.feeEstimationTable).toBeDefined();
      expect(result[0].paymentMethods).toBeDefined();
      expect(result[0].metaConfig).toBeDefined();

      // Security: Verify sensitive fields are excluded
      expect(result[0]).not.toHaveProperty('providerConfig');
      expect(result[0]).not.toHaveProperty('_id');
      expect(result[0]).not.toHaveProperty('__v');
      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('updatedAt');
      expect(result[0]).not.toHaveProperty('backupSite');
    });

    it('should include balance field from balances map', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-with-balance',
            provider: 'provider-a',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Test Gateway With Balance',
          },
          {
            gatewayId: 'gw-without-balance',
            provider: 'provider-b',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Test Gateway Without Balance',
          },
        ],
        balances: { 'gw-with-balance': 5000 }, // Only one gateway has balance
        errors: {},
        providers: [
          { provider: 'provider-a', isActive: true, isDisabled: false, state: 'normal' },
          { provider: 'provider-b', isActive: true, isDisabled: false, state: 'normal' },
        ],
      };

      const result = filterService.evaluateFilters(batchData);

      // Only gw-with-balance should pass (has balance > minLimit)
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-with-balance');
      expect(result[0].balance).toBe(5000);
    });

    it('should filter out gateways when provider is disabled (isDisabled=true)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-disabled',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [
          {
            provider: 'provider-disabled',
            isActive: true,
            isDisabled: true, // Provider is disabled
            state: 'normal',
          },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should filter out gateways when provider is inactive (isActive=false)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-inactive',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [
          {
            provider: 'provider-inactive',
            isActive: false, // Provider is inactive
            isDisabled: false,
            state: 'normal',
          },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should filter out gateways when provider is both inactive and disabled', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-dead',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [
          {
            provider: 'provider-dead',
            isActive: false, // Inactive
            isDisabled: true, // AND disabled
            state: 'normal',
          },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways when provider is active and not disabled', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-active',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Test Gateway',
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [
          {
            provider: 'provider-active',
            isActive: true,
            isDisabled: false,
            state: 'normal',
          },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-001');
    });

    it('should filter out gateways when provider not found in providers list', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-nonexistent',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
          },
        ],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [
          {
            provider: 'provider-other',
            isActive: true,
            isDisabled: false,
            state: 'normal',
          },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should handle multiple gateways with mixed provider statuses', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          {
            gatewayId: 'gw-001',
            provider: 'provider-active',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Gateway 1',
          },
          {
            gatewayId: 'gw-002',
            provider: 'provider-disabled',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Gateway 2',
          },
          {
            gatewayId: 'gw-003',
            provider: 'provider-active',
            status: 'active',
            minLimit: 100,
            maxLimit: 50000,
            site: 'testsite',
            name: 'Gateway 3',
          },
        ],
        balances: {
          'gw-001': 10000,
          'gw-002': 10000,
          'gw-003': 10000,
        },
        errors: {},
        providers: [
          {
            provider: 'provider-active',
            isActive: true,
            isDisabled: false,
            state: 'normal',
          },
          {
            provider: 'provider-disabled',
            isActive: true,
            isDisabled: true, // This provider is disabled
            state: 'normal',
          },
        ],
      };

      const result = filterService.evaluateFilters(batchData);
      // Only gw-001 and gw-003 should pass (provider-active)
      expect(result).toHaveLength(2);
      expect(result[0].gatewayId).toBe('gw-001');
      expect(result[1].gatewayId).toBe('gw-003');
    });
  });
});
