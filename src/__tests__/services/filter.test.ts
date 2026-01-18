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
        minLimit: 100,
        maxLimit: 50000,
        extraField: 'extra-value',
      });
    });
  });
});
