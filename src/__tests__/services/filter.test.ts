import { describe, it, expect, beforeEach } from 'bun:test';
import { FilterService } from '../../services/filter';
import type { BatchDataResponse } from '../../services/manager-api';

// Helper to create a valid V2 gateway object
const createGateway = (overrides: Partial<any> = {}) => ({
  gatewayId: 'gw-001',
  provider: 'provider-a',
  name: 'Test Gateway',
  site: 'testsite',
  status: true,
  min: 100,
  max: 50000,
  limit: {
    deposit: { min: 100, max: 50000 },
    withdraw: { min: 100, max: 50000 },
  },
  balanceLimit: null,
  type: 'individual' as const,
  isGroup: false,
  isInGroup: false,
  group: null,
  description: '',
  currentBalance: 0,
  totalBalance: 0,
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
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should filter out gateways with inactive status', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ status: false })],
        balances: { 'gw-001': 10000 },
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with active status', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ status: true })],
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
        gateways: [createGateway()],
        balances: { 'gw-001': 10000 },
        errors: { 'provider-a': 5 }, // Error limit reached
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with error count < 5', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway()],
        balances: { 'gw-001': 10000 },
        errors: { 'provider-a': 4 }, // Below limit
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
    });

    it('should filter out gateways with insufficient balance', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ min: 100 })],
        balances: { 'gw-001': 50 }, // Below min
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toEqual([]);
    });

    it('should include gateways with sufficient balance', () => {
      const batchData: BatchDataResponse = {
        gateways: [createGateway({ min: 100 })],
        balances: { 'gw-001': 1000 }, // Above min
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
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
        providers: [],
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
            min: 100,
            max: 50000,
            currentBalance: 1000,
            totalBalance: 5000,
            extraField: 'extra-value',
          }),
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
        status: true,
        min: 100,
        max: 50000,
        currentBalance: 1000,
        totalBalance: 5000,
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
            min: 100,
            max: 50000,
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
          }),
        ],
        balances: { 'gw-001': 1000 },
        errors: {},
        providers: [],
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

    it('should include balance fields from gateway (currentBalance, totalBalance)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-with-balance',
            provider: 'provider-a',
            currentBalance: 5000,
            totalBalance: 10000,
          }),
          createGateway({
            gatewayId: 'gw-without-balance',
            provider: 'provider-b',
            currentBalance: 0,
            totalBalance: 0,
          }),
        ],
        balances: { 'gw-with-balance': 5000 }, // Only one gateway has balance in balances map
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);

      // Only gw-with-balance should pass (has balance > min)
      expect(result).toHaveLength(1);
      expect(result[0].gatewayId).toBe('gw-with-balance');
      expect(result[0].currentBalance).toBe(5000);
      expect(result[0].totalBalance).toBe(10000);
    });

    it('should include group-related fields (V2 format)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-group',
            provider: 'provider-a',
            type: 'group',
            isGroup: true,
            isInGroup: false,
            group: { groupId: 'grp-001', groupName: 'Test Group' },
            description: 'A group gateway',
          }),
        ],
        balances: { 'gw-group': 5000 },
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('group');
      expect(result[0].isGroup).toBe(true);
      expect(result[0].isInGroup).toBe(false);
      expect(result[0].group).toEqual({ groupId: 'grp-001', groupName: 'Test Group' });
      expect(result[0].description).toBe('A group gateway');
    });

    it('should include serviceTime field (V2 format)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-time',
            provider: 'provider-a',
            serviceTime: {
              deposit: { openingTime: '08:00', closingTime: '22:00' },
              withdraw: { openingTime: '09:00', closingTime: '21:00' },
            },
          }),
        ],
        balances: { 'gw-time': 5000 },
        errors: {},
        providers: [],
      };

      const result = filterService.evaluateFilters(batchData);
      expect(result).toHaveLength(1);
      expect(result[0].serviceTime).toEqual({
        deposit: { openingTime: '08:00', closingTime: '22:00' },
        withdraw: { openingTime: '09:00', closingTime: '21:00' },
      });
    });

    it('should include limit structure (V2 format)', () => {
      const batchData: BatchDataResponse = {
        gateways: [
          createGateway({
            gatewayId: 'gw-limit',
            provider: 'provider-a',
            min: 100,
            max: 50000,
            limit: {
              deposit: { min: 100, max: 50000 },
              withdraw: { min: 200, max: 30000 },
            },
            balanceLimit: 100000,
          }),
        ],
        balances: { 'gw-limit': 5000 },
        errors: {},
        providers: [],
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
  });
});
