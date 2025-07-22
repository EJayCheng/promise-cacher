/**
 * Concurrent Operations Demo for Promise Cacher
 * 
 * This demo specifically focuses on demonstrating the CURRENT OPERATIONS
 * metrics in various concurrency scenarios to help users understand:
 * - Active vs Queued requests
 * - Concurrency limits and their effects
 * - Peak concurrency tracking
 * - Request rejection scenarios
 */

import { PromiseCacher, ErrorTaskPolicyType, ExpirationStrategyType } from '../index';

// Mock API with varying delays to simulate realistic scenarios
const mockSlowApiCall = async (userId: string, delay: number = 100): Promise<{ id: string; data: string }> => {
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Simulate occasional errors
  if (Math.random() < 0.15) {
    throw new Error(`API temporarily unavailable for ${userId}`);
  }
  
  return {
    id: userId,
    data: `User data for ${userId}`,
  };
};

async function demonstrateConcurrentOperations() {
  console.log('🔄 Promise Cacher - Concurrent Operations Demo\n');

  // Create cacher with limited concurrency for demonstration
  const cacher = new PromiseCacher(
    (userId: string) => mockSlowApiCall(userId, 200), // 200ms delay
    {
      fetchingPolicy: {
        concurrency: 3, // Limit to 3 concurrent requests
        timeoutMs: 5000,
      },
      cachePolicy: {
        ttlMs: 10 * 1000, // 10 seconds
        expirationStrategy: ExpirationStrategyType.EXPIRE,
        errorTaskPolicy: ErrorTaskPolicyType.IGNORE,
      },
    }
  );

  console.log('📋 Test Configuration:');
  console.log('   🎯 Concurrency Limit: 3');
  console.log('   ⏱️  API Delay: 200ms per request');
  console.log('   ❌ Error Rate: ~15%');
  console.log('   ⏰ Cache TTL: 10 seconds\n');

  // Scenario 1: Sequential requests (baseline)
  console.log('🔸 Scenario 1: Sequential Requests (Baseline)');
  console.log('Making 3 sequential requests to establish baseline...');
  
  for (let i = 1; i <= 3; i++) {
    try {
      const startTime = Date.now();
      await cacher.get(`seq-user${i}`);
      const duration = Date.now() - startTime;
      console.log(`✅ Sequential request ${i} completed in ${duration}ms`);
    } catch (error) {
      console.log(`❌ Sequential request ${i} failed: ${error.message}`);
    }
  }

  const baselineStats = cacher.statistics();
  console.log('\n📊 After Sequential Requests:');
  displayOperationsDetail(baselineStats.operations);

  // Scenario 2: Concurrent requests within limit
  console.log('\n🔸 Scenario 2: Concurrent Requests Within Limit');
  console.log('Launching 3 concurrent requests (within concurrency limit)...');

  const withinLimitPromises = [];
  for (let i = 1; i <= 3; i++) {
    const promise = trackRequest(`limit-user${i}`, cacher);
    withinLimitPromises.push(promise);
  }

  // Monitor operations while requests are active
  console.log('\n⏳ Monitoring operations during execution...');
  setTimeout(() => {
    const duringStats = cacher.statistics();
    console.log('📊 Operations Status (mid-execution):');
    displayOperationsDetail(duringStats.operations);
  }, 50); // Check shortly after requests start

  await Promise.allSettled(withinLimitPromises);

  const withinLimitStats = cacher.statistics();
  console.log('\n📊 After Concurrent Requests (Within Limit):');
  displayOperationsDetail(withinLimitStats.operations);

  // Scenario 3: Concurrent requests exceeding limit
  console.log('\n🔸 Scenario 3: Concurrent Requests Exceeding Limit');
  console.log('Launching 8 concurrent requests (exceeding concurrency limit of 3)...');

  const exceedingLimitPromises = [];
  for (let i = 1; i <= 8; i++) {
    const promise = trackRequest(`exceed-user${i}`, cacher);
    exceedingLimitPromises.push(promise);
  }

  // Monitor queue buildup
  console.log('\n⏳ Monitoring queue buildup...');
  const monitorInterval = setInterval(() => {
    const currentStats = cacher.statistics();
    console.log(`📊 Queue Status: Active=${currentStats.operations.activeRequests}, Queued=${currentStats.operations.queuedRequests}, Peak=${currentStats.operations.peakConcurrency}`);
  }, 100);

  await Promise.allSettled(exceedingLimitPromises);
  clearInterval(monitorInterval);

  const exceedingStats = cacher.statistics();
  console.log('\n📊 After Concurrent Requests (Exceeding Limit):');
  displayOperationsDetail(exceedingStats.operations);

  // Scenario 4: Mixed cache hits and new requests
  console.log('\n🔸 Scenario 4: Mixed Cache Hits and New Requests');
  console.log('Making requests for both cached and new users...');

  const mixedPromises = [];
  // Request existing users (cache hits)
  for (let i = 1; i <= 3; i++) {
    mixedPromises.push(trackRequest(`seq-user${i}`, cacher, 'cached'));
  }
  // Request new users (fresh fetches)
  for (let i = 1; i <= 5; i++) {
    mixedPromises.push(trackRequest(`mixed-user${i}`, cacher, 'new'));
  }

  await Promise.allSettled(mixedPromises);

  const mixedStats = cacher.statistics();
  console.log('\n📊 After Mixed Requests:');
  displayOperationsDetail(mixedStats.operations);

  // Scenario 5: Cache hits only (should show minimal operations)
  console.log('\n🔸 Scenario 5: Cache Hits Only');
  console.log('Requesting only cached users (should be instant)...');

  const cacheHitPromises = [];
  for (let i = 1; i <= 5; i++) {
    cacheHitPromises.push(trackRequest(`seq-user${(i % 3) + 1}`, cacher, 'hit'));
  }

  await Promise.allSettled(cacheHitPromises);

  const cacheHitStats = cacher.statistics();
  console.log('\n📊 After Cache Hits Only:');
  displayOperationsDetail(cacheHitStats.operations);

  // Final comprehensive statistics
  console.log('\n📈 Final Comprehensive Statistics:');
  displayFullStatistics(cacher.statistics());

  cacher.clear();
  console.log('\n🧹 Demo completed, cache cleared');
}

async function trackRequest(userId: string, cacher: PromiseCacher, type: string = 'normal'): Promise<void> {
  const startTime = Date.now();
  try {
    await cacher.get(userId);
    const duration = Date.now() - startTime;
    console.log(`✅ ${type} request for ${userId} completed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${type} request for ${userId} failed in ${duration}ms: ${error.message}`);
  }
}

function displayOperationsDetail(operations: any) {
  console.log(`   🔄 Active Requests: ${operations.activeRequests}`);
  console.log(`   ⏳ Queued Requests: ${operations.queuedRequests}`);
  console.log(`   🎯 Concurrency Limit: ${operations.concurrencyLimit}`);
  console.log(`   ❌ Rejected Requests: ${operations.rejectedRequests}`);
  console.log(`   📈 Peak Concurrency: ${operations.peakConcurrency}`);
  
  // Operational insights
  const totalActive = operations.activeRequests + operations.queuedRequests;
  if (totalActive > operations.concurrencyLimit) {
    console.log(`   ⚠️  System is under load (${totalActive} requests > ${operations.concurrencyLimit} limit)`);
  } else if (operations.activeRequests === operations.concurrencyLimit) {
    console.log(`   🔥 System at full capacity (${operations.activeRequests}/${operations.concurrencyLimit})`);
  } else if (operations.activeRequests > 0) {
    console.log(`   ✅ System operating normally (${operations.activeRequests}/${operations.concurrencyLimit})`);
  } else {
    console.log(`   😴 System idle (0 active requests)`);
  }
}

function displayFullStatistics(stats: any) {
  console.log('══════════════════════════════════════════');
  
  // 🎯 EFFICIENCY METRICS
  console.log('🎯 CACHE EFFICIENCY');
  console.log(`   Hit Rate: ${stats.efficiency.hitRate}%`);
  console.log(`   Total Requests: ${stats.efficiency.totalRequests}`);
  console.log(`   Cache Hits: ${stats.efficiency.hits} | Misses: ${stats.efficiency.misses}`);

  // 🔄 OPERATIONS STATUS (DETAILED)
  console.log('\n🔄 CURRENT OPERATIONS (DETAILED)');
  displayOperationsDetail(stats.operations);

  // ⚡ PERFORMANCE INSIGHTS
  console.log('\n⚡ PERFORMANCE INSIGHTS');
  console.log(`   Cached Response Avg: ${stats.performance.avgCachedResponseTime}ms`);
  console.log(`   Fresh Fetch Avg: ${stats.performance.avgFetchResponseTime}ms`);
  console.log(`   Performance Gain: ${stats.performance.performanceGain}%`);

  // 💾 MEMORY MANAGEMENT
  console.log('\n💾 MEMORY MANAGEMENT');
  console.log(`   Current Usage: ${stats.memory.currentUsage} (${stats.memory.usagePercentage}%)`);
  console.log(`   Total Items: ${stats.inventory.totalItems}`);

  // ⚠️ SYSTEM HEALTH
  console.log('\n⚠️ SYSTEM HEALTH');
  console.log(`   Status: ${getHealthStatusEmoji(stats.health.status)} ${stats.health.status.toUpperCase()}`);
  console.log(`   Health Score: ${stats.health.score}/100`);

  console.log('══════════════════════════════════════════\n');
}

function getHealthStatusEmoji(status: string): string {
  switch (status) {
    case 'excellent': return '🟢';
    case 'good': return '🟡';
    case 'warning': return '🟠';
    case 'critical': return '🔴';
    default: return '⚪';
  }
}

// Run the demo
if (require.main === module) {
  demonstrateConcurrentOperations().catch(console.error);
}

export { demonstrateConcurrentOperations };
