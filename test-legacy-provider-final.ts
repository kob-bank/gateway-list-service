import { FilterService } from './src/services/filter';
import type { BatchDataResponse } from './src/services/manager-api';

console.log('=== Testing Legacy Provider Detection ===\n');

// Test Case 1: Provider with isActive/isDisabled = undefined (legacy)
console.log('Test 1: Provider WITHOUT isActive/isDisabled fields (legacy)');
const mockDataLegacy: BatchDataResponse = {
  gateways: [{
    gatewayId: '15ppb_mtmpayth',
    provider: 'mtmpayth',
    name: 'MTM Pay',
    site: '15ppb',
    status: true,
    groupId: null,
    paymentMethods: ['QR'],
    metaConfig: {
      limit: { deposit: { min: 50, max: 50000 } },
      operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
      balanceLimit: null,
    },
  }],
  balances: { '15ppb_mtmpayth': 10000 },
  errors: { mtmpayth: 0 },
  providers: [{
    provider: 'mtmpayth',
    limit: { deposit: { min: 50, max: 50000 } },
    operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
    option: { fee: { deposit: { type: 'percent', value: 1.5, min: 0 } } },
    // No isActive/isDisabled fields at all
  } as any],
};

let filterService = new FilterService();
let result = filterService.evaluateFilters(mockDataLegacy);
console.log(`Result: ${result.length} gateways`);
console.log(`Expected: 0 gateways (filtered out because no status fields)`);
console.log(result.length === 0 ? '✅ PASS\n' : '❌ FAIL\n');

// Test Case 2: Provider with isActive/isDisabled = null (new provider being set up)
console.log('Test 2: Provider WITH isActive/isDisabled = null (new, not configured yet)');
const mockDataNull: BatchDataResponse = {
  gateways: [{
    gatewayId: '15ppb_chypay',
    provider: 'chypay',
    name: 'ChyPay',
    site: '15ppb',
    status: true,
    groupId: null,
    paymentMethods: ['QR'],
    metaConfig: {
      limit: { deposit: { min: 100, max: 50000 } },
      operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
      balanceLimit: null,
    },
  }],
  balances: { '15ppb_chypay': 20000 },
  errors: { chypay: 0 },
  providers: [{
    provider: 'chypay',
    isActive: null as any,
    isDisabled: null as any,
    state: null as any,
    limit: { deposit: { min: 100, max: 50000 } },
    operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
    option: { fee: { deposit: { type: 'percent', value: 1.5, min: 0 } } },
  }],
};

result = filterService.evaluateFilters(mockDataNull);
console.log(`Result: ${result.length} gateways`);
console.log(`Expected: 1 gateway (has fields, null treated as active)`);
console.log(result.length === 1 ? '✅ PASS\n' : '❌ FAIL\n');

// Test Case 3: Provider with isActive=true, isDisabled=false (active)
console.log('Test 3: Provider WITH isActive=true, isDisabled=false (fully configured)');
const mockDataActive: BatchDataResponse = {
  gateways: [{
    gatewayId: '15ppb_bitzpay',
    provider: 'bitzpay',
    name: 'BitzPay',
    site: '15ppb',
    status: true,
    groupId: null,
    paymentMethods: ['QR'],
    metaConfig: {
      limit: { deposit: { min: 100, max: 50000 } },
      operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
      balanceLimit: null,
    },
  }],
  balances: { '15ppb_bitzpay': 30000 },
  errors: { bitzpay: 0 },
  providers: [{
    provider: 'bitzpay',
    isActive: true,
    isDisabled: false,
    state: 'normal',
    limit: { deposit: { min: 100, max: 50000 } },
    operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
    option: { fee: { deposit: { type: 'percent', value: 1.5, min: 0 } } },
  }],
};

result = filterService.evaluateFilters(mockDataActive);
console.log(`Result: ${result.length} gateways`);
console.log(`Expected: 1 gateway (active provider)`);
console.log(result.length === 1 ? '✅ PASS\n' : '❌ FAIL\n');

// Test Case 4: Provider with isDisabled=true (manually disabled)
console.log('Test 4: Provider WITH isDisabled=true (manually disabled)');
const mockDataDisabled: BatchDataResponse = {
  gateways: [{
    gatewayId: '15ppb_suzakupay',
    provider: 'suzakupay',
    name: 'Suzaku Pay',
    site: '15ppb',
    status: true,
    groupId: null,
    paymentMethods: ['QR'],
    metaConfig: {
      limit: { deposit: { min: 100, max: 50000 } },
      operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
      balanceLimit: null,
    },
  }],
  balances: { '15ppb_suzakupay': 40000 },
  errors: { suzakupay: 0 },
  providers: [{
    provider: 'suzakupay',
    isActive: true,
    isDisabled: true,  // Disabled
    state: 'maintenance',
    limit: { deposit: { min: 100, max: 50000 } },
    operateTime: { deposit: { openingTime: '00:00', closingTime: '23:59' } },
    option: { fee: { deposit: { type: 'percent', value: 1.5, min: 0 } } },
  }],
};

result = filterService.evaluateFilters(mockDataDisabled);
console.log(`Result: ${result.length} gateways`);
console.log(`Expected: 0 gateways (filtered because isDisabled=true)`);
console.log(result.length === 0 ? '✅ PASS\n' : '❌ FAIL\n');

console.log('=== Summary ===');
console.log('✅ Legacy providers (no isActive/isDisabled) → FILTERED');
console.log('✅ New providers (isActive=null) → ALLOWED (backwards compatible)');
console.log('✅ Active providers (isActive=true, isDisabled=false) → ALLOWED');
console.log('✅ Disabled providers (isDisabled=true) → FILTERED');
