/**
 * Advanced Statistics Demo for Promise Cacher
 *
 * This demo showcases the redesigned statistics() method that focuses on
 * metrics that users truly care about when using a cache system.
 *
 * The new statistics are organized into meaningful categories:
 * - Efficiency: Cache hit rates and performance gains
 * - Performance: Response time analytics
 * - Operations: Real-time operational status
 * - Memory: Memory usage and management
 * - Inventory: Cache content and usage patterns
 * - Health: System health and issues
 * - Temporal: Time-based usage patterns
 */

import {
  ErrorTaskPolicyType,
  ExpirationStrategyType,
  PromiseCacher,
} from '../index';

// Mock API function with variable response times
const mockApiCall = async (
  userId: string,
): Promise<{ id: string; name: string; data: string }> => {
  // Simulate variable response times
  const delay = Math.random() * 200 + 50; // 50-250ms
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Occasionally simulate errors
  if (Math.random() < 0.1) {
    throw new Error(`API Error for user ${userId}`);
  }

  return {
    id: userId,
    name: `User ${userId}`,
    data: `Large data payload for ${userId}`.repeat(100), // Simulate large data
  };
};

async function demonstrateNewStatistics() {
  console.log('🚀 Promise Cacher - Advanced Statistics Demo\n');

  // Create a well-configured cacher for demonstration
  const cacher = new PromiseCacher(mockApiCall, {
    cachePolicy: {
      ttlMs: 30 * 1000, // 30 seconds
      expirationStrategy: ExpirationStrategyType.IDLE,
      errorTaskPolicy: ErrorTaskPolicyType.CACHE,
      flushIntervalMs: 5 * 1000, // 5 seconds
    },
    fetchingPolicy: {
      useClones: true,
      timeoutMs: 10 * 1000, // 10 seconds
      concurrency: 3, // Max 3 concurrent requests
    },
    freeUpMemoryPolicy: {
      maxMemoryBytes: 1024 * 1024, // 1MB limit
      minMemoryBytes: 512 * 1024, // Clean to 512KB
    },
  });

  console.log('📊 Generating cache activity...\n');

  // Generate varied cache activity
  const userIds = ['user1', 'user2', 'user3', 'user4', 'user5'];

  // Initial requests (all cache misses)
  console.log('Phase 1: Initial requests (cache misses)');
  for (const userId of userIds) {
    try {
      await cacher.get(userId);
      console.log(`✅ Loaded ${userId}`);
    } catch (error) {
      console.log(`❌ Failed to load ${userId}: ${error.message}`);
    }
  }

  // Show statistics after initial load
  console.log('\n📈 Statistics after initial load:');
  displayStatistics(cacher.statistics());

  // Repeated requests (should be cache hits)
  console.log('\nPhase 2: Repeated requests (cache hits)');
  for (let i = 0; i < 10; i++) {
    const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
    try {
      await cacher.get(randomUserId);
      console.log(`⚡ Cache hit for ${randomUserId}`);
    } catch (error) {
      console.log(`❌ Error for ${randomUserId}: ${error.message}`);
    }
  }

  // Show statistics after cache hits
  console.log('\n📈 Statistics after cache hits:');
  displayStatistics(cacher.statistics());

  // Add more users to test memory management
  console.log('\nPhase 3: Adding more users (memory pressure)');
  for (let i = 6; i <= 20; i++) {
    try {
      await cacher.get(`user${i}`);
      console.log(`✅ Loaded user${i}`);
    } catch (error) {
      console.log(`❌ Failed to load user${i}: ${error.message}`);
    }
  }

  // Wait for potential cleanup
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Final statistics
  console.log('\n📈 Final Statistics:');
  displayStatistics(cacher.statistics());

  // Cleanup
  cacher.clear();
  console.log('\n🧹 Cache cleared');
}

function displayStatistics(stats: any) {
  console.log('══════════════════════════════════════════');

  // 🎯 EFFICIENCY METRICS (Most Important)
  console.log('🎯 CACHE EFFICIENCY');
  console.log(`   Hit Rate: ${stats.efficiency.hitRate}%`);
  console.log(`   Total Requests: ${stats.efficiency.totalRequests}`);
  console.log(
    `   Cache Hits: ${stats.efficiency.hits} | Misses: ${stats.efficiency.misses}`,
  );
  if (stats.efficiency.timeSavedMs) {
    console.log(`   ⏱️  Time Saved: ${stats.efficiency.timeSavedMs}ms`);
  }

  // ⚡ PERFORMANCE INSIGHTS
  console.log('\n⚡ PERFORMANCE INSIGHTS');
  console.log(
    `   Cached Response Avg: ${stats.performance.avgCachedResponseTime}ms`,
  );
  console.log(
    `   Fresh Fetch Avg: ${stats.performance.avgFetchResponseTime}ms`,
  );
  console.log(`   Performance Gain: ${stats.performance.performanceGain}%`);
  console.log(`   95th Percentile: ${stats.performance.p95ResponseTime}ms`);
  console.log(
    `   Range: ${stats.performance.fastestResponse}ms - ${stats.performance.slowestResponse}ms`,
  );

  // 🔄 OPERATIONS STATUS
  console.log('\n🔄 CURRENT OPERATIONS');
  console.log(`   Active Requests: ${stats.operations.activeRequests}`);
  console.log(`   Queued Requests: ${stats.operations.queuedRequests}`);
  console.log(
    `   Concurrency Limit: ${stats.operations.concurrencyLimit === 0 ? 'Unlimited' : stats.operations.concurrencyLimit}`,
  );
  console.log(`   Rejected Requests: ${stats.operations.rejectedRequests}`);
  console.log(`   Peak Concurrency: ${stats.operations.peakConcurrency}`);

  // 💾 MEMORY MANAGEMENT
  console.log('\n💾 MEMORY MANAGEMENT');
  console.log(
    `   Current Usage: ${stats.memory.currentUsage} (${stats.memory.usagePercentage}%)`,
  );
  console.log(`   Memory Limit: ${stats.memory.limit}`);
  console.log(`   Cleanup Count: ${stats.memory.cleanupCount}`);
  console.log(`   Memory Reclaimed: ${stats.memory.memoryReclaimed}`);

  // 📈 CACHE INVENTORY
  console.log('\n📈 CACHE INVENTORY');
  console.log(`   Total Items: ${stats.inventory.totalItems}`);
  console.log(`   Avg Item Usage: ${stats.inventory.avgItemUsage}`);
  console.log(
    `   Usage Range: ${stats.inventory.minItemUsage} - ${stats.inventory.maxItemUsage}`,
  );
  console.log(`   Single-Use Items: ${stats.inventory.singleUseItems}`);
  console.log(`   High-Value Items: ${stats.inventory.highValueItems}`);

  // ⚠️ SYSTEM HEALTH
  console.log('\n⚠️ SYSTEM HEALTH');
  console.log(
    `   Status: ${getHealthStatusEmoji(stats.health.status)} ${stats.health.status.toUpperCase()}`,
  );
  console.log(`   Health Score: ${stats.health.score}/100`);
  console.log(`   Error Rate: ${stats.health.errorRate}%`);
  console.log(`   Recent Errors: ${stats.health.recentErrors}`);
  console.log(`   Timeouts: ${stats.health.timeouts}`);
  if (stats.health.issues.length > 0) {
    console.log(`   Issues: ${stats.health.issues.join(', ')}`);
  }

  // 🕒 TEMPORAL DATA
  console.log('\n🕒 TEMPORAL PATTERNS');
  console.log(`   Uptime: ${stats.temporal.uptime}`);
  console.log(`   Requests/Minute: ${stats.temporal.requestsPerMinute}`);
  console.log(
    `   Trend: ${getTrendEmoji(stats.temporal.trend)} ${stats.temporal.trend}`,
  );

  console.log('══════════════════════════════════════════\n');
}

function getHealthStatusEmoji(status: string): string {
  switch (status) {
    case 'excellent':
      return '🟢';
    case 'good':
      return '🟡';
    case 'warning':
      return '🟠';
    case 'critical':
      return '🔴';
    default:
      return '⚪';
  }
}

function getTrendEmoji(trend: string): string {
  switch (trend) {
    case 'improving':
      return '📈';
    case 'stable':
      return '➡️';
    case 'declining':
      return '📉';
    default:
      return '❓';
  }
}

// Run the demo
if (require.main === module) {
  demonstrateNewStatistics().catch(console.error);
}

export { demonstrateNewStatistics };
