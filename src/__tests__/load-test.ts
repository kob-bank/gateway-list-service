/**
 * Simple load test to verify API performance
 * Target: >1000 req/s with <10ms response time
 *
 * Usage: bun run src/__tests__/load-test.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SITE = process.env.SITE || 'site1';
const DURATION_MS = parseInt(process.env.DURATION_MS || '10000'); // 10 seconds
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '100');

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationMs: number;
  requestsPerSecond: number;
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
}

async function makeRequest(): Promise<number> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${API_URL}/v3/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ site: SITE }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await response.json();
    return performance.now() - startTime;
  } catch (error) {
    throw error;
  }
}

async function runLoadTest(): Promise<LoadTestResult> {
  console.log('Starting load test...');
  console.log(`Target: ${API_URL}`);
  console.log(`Site: ${SITE}`);
  console.log(`Duration: ${DURATION_MS}ms`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('');

  const responseTimes: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  const startTime = Date.now();
  const endTime = startTime + DURATION_MS;

  // Create worker pool
  const workers: Promise<void>[] = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (Date.now() < endTime) {
          try {
            const responseTime = await makeRequest();
            responseTimes.push(responseTime);
            successfulRequests++;
          } catch (error) {
            failedRequests++;
          }
        }
      })()
    );
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  const durationMs = Date.now() - startTime;
  const totalRequests = successfulRequests + failedRequests;

  // Calculate statistics
  responseTimes.sort((a, b) => a - b);
  const sum = responseTimes.reduce((acc, val) => acc + val, 0);
  const avgResponseTimeMs = sum / responseTimes.length;
  const minResponseTimeMs = responseTimes[0] || 0;
  const maxResponseTimeMs = responseTimes[responseTimes.length - 1] || 0;

  const p50Index = Math.floor(responseTimes.length * 0.5);
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p99Index = Math.floor(responseTimes.length * 0.99);

  const p50ResponseTimeMs = responseTimes[p50Index] || 0;
  const p95ResponseTimeMs = responseTimes[p95Index] || 0;
  const p99ResponseTimeMs = responseTimes[p99Index] || 0;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    durationMs,
    requestsPerSecond: (successfulRequests / durationMs) * 1000,
    avgResponseTimeMs,
    minResponseTimeMs,
    maxResponseTimeMs,
    p50ResponseTimeMs,
    p95ResponseTimeMs,
    p99ResponseTimeMs,
  };
}

// Run the test
runLoadTest()
  .then((result) => {
    console.log('\n=== Load Test Results ===\n');
    console.log(`Total Requests:      ${result.totalRequests.toLocaleString()}`);
    console.log(`Successful:          ${result.successfulRequests.toLocaleString()}`);
    console.log(`Failed:              ${result.failedRequests.toLocaleString()}`);
    console.log(`Duration:            ${result.durationMs.toLocaleString()}ms`);
    console.log(`\nThroughput:          ${result.requestsPerSecond.toFixed(2)} req/s`);
    console.log(`\nResponse Times (ms):`);
    console.log(`  Average:           ${result.avgResponseTimeMs.toFixed(2)}ms`);
    console.log(`  Min:               ${result.minResponseTimeMs.toFixed(2)}ms`);
    console.log(`  Max:               ${result.maxResponseTimeMs.toFixed(2)}ms`);
    console.log(`  p50:               ${result.p50ResponseTimeMs.toFixed(2)}ms`);
    console.log(`  p95:               ${result.p95ResponseTimeMs.toFixed(2)}ms`);
    console.log(`  p99:               ${result.p99ResponseTimeMs.toFixed(2)}ms`);

    // Check if targets met
    console.log('\n=== Target Analysis ===\n');
    const targetRPS = 1000;
    const targetP95 = 10;

    if (result.requestsPerSecond >= targetRPS) {
      console.log(`✅ Throughput target met (${targetRPS} req/s)`);
    } else {
      console.log(`❌ Throughput target NOT met (${targetRPS} req/s)`);
    }

    if (result.p95ResponseTimeMs <= targetP95) {
      console.log(`✅ p95 latency target met (<${targetP95}ms)`);
    } else {
      console.log(`❌ p95 latency target NOT met (<${targetP95}ms)`);
    }

    // Exit with appropriate code
    const success =
      result.requestsPerSecond >= targetRPS &&
      result.p95ResponseTimeMs <= targetP95;

    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Load test failed:', error);
    process.exit(1);
  });
