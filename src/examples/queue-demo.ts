import {
  ErrorTaskPolicyType,
  ExpirationStrategyType,
  PromiseCacher,
} from '../index';

/**
 * Demo 1: Basic Caching Performance Comparison
 * Demonstrates how caching reduces redundant operations
 */
async function basicCachingDemo() {
  console.log('\n🚀 Demo 1: Basic Caching Performance Comparison');
  console.log('=================================================');

  // Simulate an expensive API call
  const expensiveApiCall = async (
    userId: string,
  ): Promise<{ id: string; name: string; email: string }> => {
    console.log(`📡 Making API call for user: ${userId}`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
    return {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
    };
  };

  // Create cacher instance
  const userCacher = new PromiseCacher<
    { id: string; name: string; email: string },
    string
  >(expensiveApiCall, {
    cachePolicy: {
      ttlMs: 30000, // 30 seconds
      expirationStrategy: ExpirationStrategyType.EXPIRE,
    },
  });

  console.log('⏱️ Without caching - making 3 requests for same user:');
  const start1 = Date.now();
  await expensiveApiCall('123');
  await expensiveApiCall('123');
  await expensiveApiCall('123');
  const time1 = Date.now() - start1;
  console.log(`   Time taken: ${time1}ms\n`);

  console.log('⚡ With caching - making 3 requests for same user:');
  const start2 = Date.now();
  await userCacher.get('123'); // First call - fetches from API
  await userCacher.get('123'); // Second call - returns cached result
  await userCacher.get('123'); // Third call - returns cached result
  const time2 = Date.now() - start2;
  console.log(`   Time taken: ${time2}ms`);
  console.log(
    `   💰 Performance improvement: ${Math.round(((time1 - time2) / time1) * 100)}%`,
  );

  console.log('\n📊 Cache statistics:');
  const stats = userCacher.statistics();

  console.log(`   Hit rate: ${stats.hitRate}%`);
  console.log(`   Total requests: ${stats.usedCountTotal}`);
  console.log(`   Cache hits: ${stats.cacheHits}`);
  console.log(`   Cache misses: ${stats.cacheMisses}`);
  console.log(`   Fresh fetches: ${stats.performance?.totalFetchCount || 0}`);

  // Clean up this demo's cacher instance
  userCacher.clear();
}

/**
 * Demo 2: Memory Management
 * Shows automatic memory cleanup when limits are exceeded
 */
async function memoryManagementDemo() {
  console.log('\n🧠 Demo 2: Memory Management');
  console.log('============================');

  const dataCacher = new PromiseCacher<{ data: number[] }, number>(
    async (size: number) => {
      console.log(`🔄 Generating large data array of size: ${size}`);
      return { data: new Array(size).fill(0).map((_, i) => i) };
    },
    {
      freeUpMemoryPolicy: {
        maxMemoryBytes: 1024 * 100, // 100KB limit (very small for demo)
        minMemoryBytes: 1024 * 50, // Clean down to 50KB
      },
      cachePolicy: {
        ttlMs: 60000, // 1 minute
      },
    },
  );

  console.log('📈 Adding data to cache until memory limit is reached...');

  // Add progressively larger datasets
  for (let i = 1; i <= 5; i++) {
    await dataCacher.get(i * 1000); // Arrays of increasing size
    const stats = dataCacher.statistics();
    console.log(
      `   Cache ${i}: ${stats.usedMemory} (${stats.cacheCount} tasks)`,
    );
  }

  console.log('\n🧹 Memory cleanup should have occurred automatically!');
  const finalStats = dataCacher.statistics();
  console.log(`   Final memory usage: ${finalStats.usedMemory}`);

  // Clean up this demo's cacher instance
  dataCacher.clear();
}

/**
 * Demo 3: Concurrent Request Management
 * Demonstrates how the library handles multiple concurrent requests
 */
async function concurrentRequestDemo() {
  console.log('\n🔄 Demo 3: Concurrent Request Management');
  console.log('========================================');

  let callCount = 0;
  const slowApiCall = async (id: string): Promise<string> => {
    const callId = ++callCount;
    console.log(`   🚀 Starting request ${callId} for ID: ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
    console.log(`   ✅ Completed request ${callId} for ID: ${id}`);
    return `Result for ${id} (call #${callId})`;
  };

  const concurrentCacher = new PromiseCacher<string, string>(slowApiCall, {
    fetchingPolicy: {
      concurrency: 2, // Limit to 2 concurrent requests
    },
  });

  console.log('🚦 Making 5 concurrent requests (limited to 2 at a time):');
  const promises = Array.from({ length: 5 }, (_, i) =>
    concurrentCacher.get(`item-${i + 1}`),
  );

  await Promise.all(promises);

  console.log('\n📊 Concurrency statistics:');
  const stats = concurrentCacher.statistics();
  console.log(
    `   Max concurrent requests reached: ${stats.performance?.maxConcurrentRequestsReached || 0}`,
  );
  console.log(
    `   Rejected requests: ${stats.performance?.rejectedRequestsCount || 0}`,
  );

  // Clean up this demo's cacher instance
  concurrentCacher.clear();
}

/**
 * Demo 4: Error Handling Strategies
 * Shows different approaches to handling and caching errors
 */
async function errorHandlingDemo() {
  console.log('\n❌ Demo 4: Error Handling Strategies');
  console.log('====================================');

  const unreliableApi = async (id: string): Promise<string> => {
    if (id === 'fail') {
      throw new Error(`API error for ID: ${id}`);
    }
    return `Success for ${id}`;
  };

  // Strategy 1: Don't cache errors (IGNORE)
  const ignoreErrorsCacher = new PromiseCacher<string, string>(unreliableApi, {
    cachePolicy: {
      errorTaskPolicy: ErrorTaskPolicyType.IGNORE,
    },
  });

  // Strategy 2: Cache errors (CACHE)
  const cacheErrorsCacher = new PromiseCacher<string, string>(unreliableApi, {
    cachePolicy: {
      errorTaskPolicy: ErrorTaskPolicyType.CACHE,
    },
  });

  console.log('🔄 Strategy 1 - IGNORE errors (retry each time):');
  try {
    await ignoreErrorsCacher.get('fail');
  } catch (e) {
    console.log(`   First attempt failed: ${e.message}`);
  }

  try {
    await ignoreErrorsCacher.get('fail'); // This will retry the API call
  } catch (e) {
    console.log(`   Second attempt also failed: ${e.message}`);
    console.log(`   ⚡ API was called twice (no error caching)`);
  }

  console.log('\n💾 Strategy 2 - CACHE errors (return cached error):');
  try {
    await cacheErrorsCacher.get('fail');
  } catch (e) {
    console.log(`   First attempt failed: ${e.message}`);
  }

  try {
    await cacheErrorsCacher.get('fail'); // This will return cached error
  } catch (e) {
    console.log(`   Second attempt failed immediately: ${e.message}`);
    console.log(`   ⚡ Error was cached, no second API call made`);
  }

  // Clean up this demo's cacher instances
  ignoreErrorsCacher.clear();
  cacheErrorsCacher.clear();
}

/**
 * Demo 5: Cache Expiration Strategies
 * Demonstrates EXPIRE vs IDLE expiration strategies
 */
async function expirationStrategiesDemo() {
  console.log('\n⏰ Demo 5: Cache Expiration Strategies');
  console.log('======================================');

  const timestampApi = async (
    id: string,
  ): Promise<{ id: string; timestamp: number }> => {
    console.log(`   📡 Fetching fresh data for: ${id}`);
    return { id, timestamp: Date.now() };
  };

  // EXPIRE strategy: Cache expires after fixed time
  const expireCacher = new PromiseCacher<
    { id: string; timestamp: number },
    string
  >(timestampApi, {
    cachePolicy: {
      ttlMs: 3000, // 3 seconds
      expirationStrategy: ExpirationStrategyType.EXPIRE,
    },
  });

  // IDLE strategy: Cache expires after idle period
  const idleCacher = new PromiseCacher<
    { id: string; timestamp: number },
    string
  >(timestampApi, {
    cachePolicy: {
      ttlMs: 3000, // 3 seconds of idle time
      expirationStrategy: ExpirationStrategyType.IDLE,
    },
  });

  console.log('📅 EXPIRE Strategy - Fixed TTL:');
  let result1 = await expireCacher.get('test');
  console.log(
    `   Initial fetch: ${new Date(result1.timestamp).toLocaleTimeString()}`,
  );

  await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait 1.5s
  result1 = await expireCacher.get('test');
  console.log(
    `   After 1.5s: ${new Date(result1.timestamp).toLocaleTimeString()} (cached)`,
  );

  await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s more (total 3.5s)
  result1 = await expireCacher.get('test');
  console.log(
    `   After 3.5s total: ${new Date(result1.timestamp).toLocaleTimeString()} (expired, new fetch)`,
  );

  console.log('\n🕐 IDLE Strategy - Idle timeout:');
  let result2 = await idleCacher.get('test');
  console.log(
    `   Initial fetch: ${new Date(result2.timestamp).toLocaleTimeString()}`,
  );

  // Keep accessing within idle period
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s
    result2 = await idleCacher.get('test');
    console.log(
      `   After ${i + 1}s: ${new Date(result2.timestamp).toLocaleTimeString()} (cached, idle timer reset)`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 4000)); // Wait 4s without access
  result2 = await idleCacher.get('test');
  console.log(
    `   After 4s idle: ${new Date(result2.timestamp).toLocaleTimeString()} (expired, new fetch)`,
  );

  // Clean up this demo's cacher instances
  expireCacher.clear();
  idleCacher.clear();
}

/**
 * Demo 6: Performance Monitoring
 * Shows comprehensive statistics and monitoring capabilities
 */
async function performanceMonitoringDemo() {
  console.log('\n📊 Demo 6: Performance Monitoring');
  console.log('==================================');

  const monitoredCacher = new PromiseCacher<number, number>(
    async (n: number): Promise<number> => {
      // Simulate variable response times
      const delay = Math.random() * 1000 + 500; // 500-1500ms
      await new Promise((resolve) => setTimeout(resolve, delay));
      return n * n;
    },
    {
      cachePolicy: {
        ttlMs: 10000, // 10 seconds
      },
    },
  );

  console.log('🔄 Making mixed requests (some cached, some fresh):');

  // Make various requests with some repetition
  const requests = [1, 2, 3, 1, 2, 4, 5, 3, 1, 6];
  for (const num of requests) {
    const result = await monitoredCacher.get(num);
    console.log(`   √ ${num}² = ${result}`);
  }

  console.log('\n📈 Performance Statistics:');
  const stats = monitoredCacher.statistics();

  console.log(`   Total requests: ${stats.usedCountTotal}`);
  console.log(`   Cache hits: ${stats.cacheHits}`);
  console.log(`   Cache misses: ${stats.cacheMisses}`);
  console.log(`   Hit rate: ${stats.hitRate}%`);
  console.log(
    `   Average response time: ${stats.performance?.avgResponseTime?.toFixed(1)}ms`,
  );
  console.log(`   Active tasks: ${stats.cacheCount}`);
  console.log(`   Memory usage: ${stats.usedMemory}`);

  console.log('\n🏆 Performance Benefits Summary:');
  console.log(`   • Reduced API calls by ${stats.hitRate}%`);
  console.log(`   • Improved average response time through caching`);
  console.log(
    `   • Automatic memory management with ${stats.cacheCount} active tasks`,
  );

  // Clean up this demo's cacher instance
  monitoredCacher.clear();
}

/**
 * Main demo runner
 */
async function runAllDemos() {
  console.log('🎯 Promise Cacher Library Demo');
  console.log('===============================');
  console.log(
    'This demo showcases the key advantages of the Promise Cacher library:\n',
  );

  try {
    await basicCachingDemo();
    await memoryManagementDemo();
    await concurrentRequestDemo();
    await errorHandlingDemo();
    await expirationStrategiesDemo();
    await performanceMonitoringDemo();

    console.log('\n🎉 All demos completed successfully!');
    console.log('\n💡 Key Takeaways:');
    console.log(
      '   • Dramatic performance improvements through intelligent caching',
    );
    console.log('   • Automatic memory management prevents memory leaks');
    console.log(
      '   • Flexible error handling strategies for different use cases',
    );
    console.log('   • Configurable expiration policies (TTL vs Idle)');
    console.log(
      '   • Concurrent request limiting prevents overwhelming backends',
    );
    console.log(
      '   • Comprehensive monitoring and statistics for optimization',
    );

    console.log(
      '\n✅ All cache instances have been cleaned up. Demo completed!',
    );
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

runAllDemos().catch(console.error);
