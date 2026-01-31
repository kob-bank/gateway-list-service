import { FilterService } from './src/services/filter';
import type { BatchDataResponse } from './src/services/manager-api';

// Mock data: chypay has 4 errors (should be filtered)
const mockData: BatchDataResponse = {
  gateways: [
    {
      gatewayId: '15ppb_chypay',
      provider: 'chypay',
      name: 'ChyPay Gateway',
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
    {
      gatewayId: '15ppb_mtmpayth',
      provider: 'mtmpayth',
      name: 'MTM Pay Gateway',
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
    '15ppb_chypay': 10000,
    '15ppb_mtmpayth': 20000,
  },
  errors: {
    chypay: 4, // >= 3 should be filtered
    mtmpayth: 0, // should pass
  },
  providers: [
    {
      provider: 'chypay',
      isActive: null, // Test: null should be treated as active
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
    {
      provider: 'mtmpayth',
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

console.log('=== Testing Error Filter Logic ===\n');
console.log('Mock Data:');
console.log('- chypay: 4 errors (>= ERROR_LIMIT 3) → should be FILTERED');
console.log('- mtmpayth: 0 errors → should PASS');
console.log('- Both providers have isActive=null, isDisabled=null\n');

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
console.log('  ✅ 15ppb_mtmpayth (0 errors < 3)');
console.log('  ❌ 15ppb_chypay (4 errors >= 3) - should be filtered out');

if (result.length === 1 && result[0].provider === 'mtmpayth') {
  console.log('\n✅ TEST PASSED: chypay was correctly filtered due to error count >= 3');
} else {
  console.log('\n❌ TEST FAILED');
  if (result.find((gw) => gw.provider === 'chypay')) {
    console.log('   ERROR: chypay should have been filtered out!');
  }
  if (!result.find((gw) => gw.provider === 'mtmpayth')) {
    console.log('   ERROR: mtmpayth should have passed!');
  }
}
