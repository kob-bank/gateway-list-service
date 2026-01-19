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
        providers: [],
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
        providers: [],
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
        providers: [],
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
        providers: [],
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
        providers: [],
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
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        gatewayId: 'gw-001',
        provider: 'provider-a',
        status: 'active',
        minLimit: 100,
        maxLimit: 50000,
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
        providers: [],
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
  });
});
