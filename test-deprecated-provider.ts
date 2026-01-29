import { FilterService } from './src/services/filter';
import type { BatchDataResponse } from './src/services/manager-api';

// Mock data: Test deprecated providers vs new providers
const mockData: BatchDataResponse = {
  gateways: [
    {
      gatewayId: '15ppb_mtmpayth',
      provider: 'mtmpayth',
      name: 'MTM Pay (Deprecated)',
      site: '15ppb',
      status: true,
      groupId: null,
      paymentMethods: ['QR'],
      metaConfig: {
        limit: {
          deposit: { min: 50, max: 50000 },
          withdraw: { min: 100, max: 100000 },
        },
        operateTime: {
          deposit: { openingTime: '00:00', closingTime: '23:59' },
          withdraw: { openingTime: '00:00', closingTime: '23:59' },
        },
        balanceLimit: null,
      },
    },
    {
      gatewayId: '15ppb_chypay',
      provider: 'chypay',
      name: 'ChyPay (New)',
      site: '15ppb',
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
    },
  ],
  balances: {
    '15ppb_mtmpayth': 10000,
    '15ppb_chypay': 20000,
  },
  errors: {
    mtmpayth: 0,
    chypay: 0,
  },
  providers: [
    {
      // Deprecated provider - ไม่มี isActive/isDisabled
      provider: 'mtmpayth',
      limit: {
        deposit: { min: 50, max: 50000 },
        withdraw: { min: 100, max: 100000 },
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
    } as any,
    {
      // New provider - มี isActive/isDisabled (แม้จะเป็น null)
      provider: 'chypay',
      isActive: null,
      isDisabled: null,
      state: null,
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
    },
  ],
};

console.log('=== Testing Deprecated Provider Filter ===\n');
console.log('Providers:');
console.log('1. mtmpayth: NO isActive/isDisabled → should be FILTERED (deprecated)');
console.log('2. chypay: HAS isActive/isDisabled (null) → should PASS (new provider)\n');

const filterService = new FilterService();
const result = filterService.evaluateFilters(mockData);

console.log('=== Filter Results ===');
console.log(`Total input gateways: ${mockData.gateways.length}`);
console.log(`Total filtered gateways: ${result.length}\n`);

console.log('Filtered gateways:');
result.forEach((gw) => {
  console.log(`  ✅ ${gw.gatewayId} (${gw.provider})`);
});

console.log('\nExpected behavior:');
console.log('  ✅ 15ppb_chypay (new provider with isActive field)');
console.log('  ❌ 15ppb_mtmpayth (deprecated provider without isActive field)');

if (result.length === 1 && result[0].provider === 'chypay') {
  console.log('\n✅ TEST PASSED: Deprecated provider filtered out correctly!');
} else {
  console.log('\n❌ TEST FAILED');
  if (result.find((gw) => gw.provider === 'mtmpayth')) {
    console.log('   ERROR: mtmpayth should have been filtered out!');
  }
  if (!result.find((gw) => gw.provider === 'chypay')) {
    console.log('   ERROR: chypay should have passed!');
  }
}
