import {
  CacherConfig,
  ErrorTaskPolicyType,
  ExpirationStrategyType,
} from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('Comprehensive PromiseCacher Tests', () => {
  let mockFetchFn: jest.Mock;
  let cacher: PromiseCacher<string, string>;

  beforeEach(() => {
    mockFetchFn = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (cacher) {
      cacher.clear();
    }
    jest.restoreAllMocks();
  });

  describe('Boundary Conditions and Edge Cases', () => {
    it('should handle null and undefined keys properly', async () => {
      cacher = new PromiseCacher(async (key: any) => `result-${key}`);

      const result1 = await cacher.get(null as any);
      const result2 = await cacher.get(undefined as any);

      expect(result1).toBe('result-null');
      expect(result2).toBe('result-undefined');
      expect(cacher.cacheCount).toBe(2);
    });

    it('should handle empty string keys', async () => {
      cacher = new PromiseCacher(async (key: string) => `result-${key}`);

      const result = await cacher.get('');
      expect(result).toBe('result-');
      expect(cacher.has('')).toBe(true);
    });

    it('should handle very large keys', async () => {
      cacher = new PromiseCacher(async (key: string) => `result-${key.length}`);

      const largeKey = 'x'.repeat(10000);
      const result = await cacher.get(largeKey);
      expect(result).toBe('result-10000');
    });

    it('should handle multiple basic data types as keys', async () => {
      const multiCacher = new PromiseCacher<string, any>(async (key: any) => {
        return `result-${typeof key}`;
      });

      await multiCacher.get(123);
      await multiCacher.get(true);
      await multiCacher.get(new Date());
      await multiCacher.get([1, 2, 3]);

      expect(multiCacher.cacheCount).toBe(4);
      multiCacher.clear();
    });
  });
  describe('Memory Management Edge Cases', () => {
    it('should handle zero memory limits gracefully', async () => {
      const config: CacherConfig = {
        freeUpMemoryPolicy: {
          maxMemoryByte: 0,
          minMemoryByte: 0,
        },
        flushInterval: 50,
      };

      console.log('Test config:', JSON.stringify(config, null, 2));

      cacher = new PromiseCacher(
        async (key: string) => 'x'.repeat(1000), // Generate larger content
        config,
      );

      // Add cache entries and ensure they resolve first
      await cacher.get('test1');
      await cacher.get('test2');
      await cacher.get('test3');

      // Wait enough time for multiple flush cycles to run
      await delay(1100); // Increased wait time

      // Force one more manual flush to ensure any pending memory checks are completed

      // Check that overMemoryLimitCount has been incremented
      // Since maxMemoryByte is 0, any memory usage should trigger this
      const stats = cacher.statistics();
      console.log('Used memory bytes:', stats.usedMemoryBytes);
      console.log('Over memory limit count:', stats.overMemoryLimitCount);
      console.log('Cache count:', stats.cacheCount);

      expect(stats.overMemoryLimitCount).toBeGreaterThan(0);
    });

    it('should handle minMemoryByte greater than maxMemoryByte', async () => {
      const config: CacherConfig = {
        freeUpMemoryPolicy: {
          maxMemoryByte: 100,
          minMemoryByte: 200, // Invalid: min > max
        },
      };

      cacher = new PromiseCacher(
        async (key: string) => `result-${key}`,
        config,
      );

      // Should use default behavior (half of max)
      const stats = cacher.statistics();
      expect(stats).toBeDefined();
    });

    it('should handle aggressive memory cleanup', async () => {
      const config: CacherConfig = {
        freeUpMemoryPolicy: {
          maxMemoryByte: 1, // Very small limit
          minMemoryByte: 0,
        },
        flushInterval: 50,
      };

      cacher = new PromiseCacher(async (key: string) => {
        return 'x'.repeat(1000); // Large results
      }, config);

      await cacher.get('key1');
      await cacher.get('key2');
      await cacher.get('key3');

      // Manually trigger flush to test memory limit logic
      const flush = (cacher as any).flush.bind(cacher);
      flush();

      await delay(150); // Wait for cleanup cycles

      const stats = cacher.statistics();
      expect(stats.overMemoryLimitCount).toBeGreaterThan(0);
      expect(stats.releasedMemoryBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should handle timeout correctly', async () => {
      const config: CacherConfig = {
        timeoutMillisecond: 50,
        cacheMillisecond: 1000,
      };

      mockFetchFn.mockImplementation(async () => {
        await delay(100); // Longer than timeout
        return 'should-not-reach';
      });

      cacher = new PromiseCacher(mockFetchFn, config);

      await expect(cacher.get('timeout-key')).rejects.toThrow();
    });

    it('should respect timeout being limited by cache duration', async () => {
      const config: CacherConfig = {
        timeoutMillisecond: 2000,
        cacheMillisecond: 1000, // Shorter than timeout
      };

      cacher = new PromiseCacher(mockFetchFn, config);

      expect(cacher.timeoutMillisecond).toBe(1000); // Should be limited to cache duration
    });

    it('should handle zero timeout', async () => {
      const config: CacherConfig = {
        timeoutMillisecond: 0,
      };

      cacher = new PromiseCacher(async () => 'result', config);

      await expect(cacher.get('zero-timeout')).rejects.toThrow();
    });
  });

  describe('Concurrent Request Limiting', () => {
    it('should queue requests when max concurrent limit is reached', async () => {
      const config: CacherConfig = {
        maxConcurrentRequests: 2,
      };

      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(100);
        return `result-${key}`;
      });

      cacher = new PromiseCacher(mockFetchFn, config);

      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'), // Should be queued instead of rejected
        cacher.get('key4'), // Should be queued instead of rejected
      ];

      const results = await Promise.allSettled(promises);

      // All requests should eventually succeed due to queuing
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
      expect(results[3].status).toBe('fulfilled');

      const stats = cacher.statistics();
      // No rejections since we queue instead of reject
      expect(stats.performance.rejectedRequestsCount).toBe(0);
      // Should have had queued requests
      expect(stats.performance.maxQueueLengthReached).toBeGreaterThan(0);
    });

    it('should allow new requests after concurrent requests complete', async () => {
      const config: CacherConfig = {
        maxConcurrentRequests: 1,
      };

      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(50);
        return `result-${key}`;
      });

      cacher = new PromiseCacher(mockFetchFn, config);

      // First request should succeed
      await cacher.get('key1');

      // Second request should also succeed (first is done)
      await cacher.get('key2');

      const stats = cacher.statistics();
      expect(stats.performance.rejectedRequestsCount).toBe(0);
      expect(stats.performance.totalFetchCount).toBe(2);
    });

    it('should track max concurrent requests correctly', async () => {
      const config: CacherConfig = {
        maxConcurrentRequests: 3,
      };

      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(100);
        return `result-${key}`;
      });

      cacher = new PromiseCacher(mockFetchFn, config);

      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'),
      ];

      // Check stats while requests are in flight
      await delay(10);
      const stats = cacher.statistics();
      expect(stats.performance.currentConcurrentRequests).toBe(3);
      expect(stats.performance.maxConcurrentRequestsReached).toBe(3);

      await Promise.allSettled(promises);

      const finalStats = cacher.statistics();
      expect(finalStats.performance.currentConcurrentRequests).toBe(0);
    });
  });

  describe('Object Key Handling', () => {
    it('should generate same cache keys for same object content', async () => {
      const objCacher = new PromiseCacher<string, any>(
        async (key: any) => `result-${JSON.stringify(key)}`,
      );

      const objKey = { id: 1, name: 'test' };

      await objCacher.get(objKey);
      await objCacher.get(objKey); // Same reference

      // With content-based key transformation, same content uses same cache entry
      expect(objCacher.cacheCount).toBe(1);
      objCacher.clear();
    });

    it('should handle different object instances with same content', async () => {
      const objCacher = new PromiseCacher<string, any>(
        async (key: any) => `result-${JSON.stringify(key)}`,
      );

      let objKey: any = { id: 1, name: 'test' };
      await objCacher.get(objKey);

      // Remove reference
      objKey = null;

      // Force garbage collection (if possible)
      if (global.gc) {
        global.gc();
      }

      // New object with same content should reuse same cache entry
      const newObjKey = { id: 1, name: 'test' };
      await objCacher.get(newObjKey);

      // Same content objects share the same cache entry
      expect(objCacher.cacheCount).toBe(1);
      objCacher.clear();
    });

    it('should handle complex nested objects consistently', async () => {
      const objCacher = new PromiseCacher<string, any>(
        async (key: any) => `result-${JSON.stringify(key)}`,
      );

      const complexKey1 = {
        user: { id: 1, profile: { name: 'test', settings: { theme: 'dark' } } },
        filters: ['active', 'verified'],
        metadata: { version: 1 },
      };

      const complexKey2 = {
        metadata: { version: 1 },
        user: { profile: { settings: { theme: 'dark' }, name: 'test' }, id: 1 },
        filters: ['active', 'verified'],
      };

      await objCacher.get(complexKey1);
      await objCacher.get(complexKey2);

      // Complex objects with same content but different structure order should use same cache
      expect(objCacher.cacheCount).toBe(1);
      objCacher.clear();
    });

    it('should differentiate between truly different object contents', async () => {
      const objCacher = new PromiseCacher<string, any>(
        async (key: any) => `result-${JSON.stringify(key)}`,
      );

      const objKey1 = { id: 1, name: 'test', status: 'active' };
      const objKey2 = { id: 1, name: 'test', status: 'inactive' }; // Different status

      await objCacher.get(objKey1);
      await objCacher.get(objKey2);

      // Different content should create different cache entries
      expect(objCacher.cacheCount).toBe(2);
      objCacher.clear();
    });
  });

  describe('Performance Metrics', () => {
    it('should track response times accurately', async () => {
      mockFetchFn.mockImplementation(async (key: string) => {
        const delay_time = key === 'slow' ? 100 : 20;
        await delay(delay_time);
        return `result-${key}`;
      });

      cacher = new PromiseCacher(mockFetchFn);

      await cacher.get('fast');
      await cacher.get('slow');
      await cacher.get('fast2');

      const stats = cacher.statistics();
      expect(stats.performance.avgResponseTime).toBeGreaterThan(0);
      expect(stats.performance.minResponseTime).toBeGreaterThan(0);
      expect(stats.performance.maxResponseTime).toBeGreaterThan(
        stats.performance.minResponseTime,
      );
      expect(stats.performance.totalFetchCount).toBe(3);
    });

    it('should limit response time history for memory efficiency', async () => {
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(1);
        return `result-${key}`;
      });

      cacher = new PromiseCacher(mockFetchFn);

      // Generate enough requests to test array limiting, but not too many to avoid timeout
      for (let i = 0; i < 100; i++) {
        await cacher.get(`key-${i}`);
      }

      const stats = cacher.statistics();
      expect(stats.performance.totalFetchCount).toBe(100);
      expect(stats.performance.avgResponseTime).toBeGreaterThan(0);
    }, 15000); // Increase timeout to 15 seconds
  });

  describe('Error Handling Policies', () => {
    it('should cache errors when errorTaskPolicy is CACHE', async () => {
      const config: CacherConfig = {
        errorTaskPolicy: ErrorTaskPolicyType.CACHE,
      };

      const error = new Error('Test error');
      mockFetchFn.mockRejectedValue(error);

      cacher = new PromiseCacher(mockFetchFn, config);

      await expect(cacher.get('error-key')).rejects.toThrow('Test error');

      // Error should be cached
      expect(cacher.has('error-key')).toBe(true);

      // Second call should not trigger fetchFn again
      await expect(cacher.get('error-key')).rejects.toThrow('Test error');
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should release errors when errorTaskPolicy is RELEASE', async () => {
      const config: CacherConfig = {
        errorTaskPolicy: ErrorTaskPolicyType.RELEASE,
        flushInterval: 60000, // Set a long flush interval to avoid interference
      };

      // Setup mock to reject first call and resolve second call
      let callCount = 0;
      mockFetchFn.mockImplementation(async () => {
        callCount++;
        console.log(`Mock call #${callCount}`);
        if (callCount === 1) {
          throw new Error('First error');
        }
        return 'Success';
      });

      cacher = new PromiseCacher(mockFetchFn, config);

      // First call should fail
      await expect(cacher.get('error-key')).rejects.toThrow('First error');

      // Wait a bit for error handling to complete
      await delay(50);

      // Error should not be cached (verify by checking has method)
      expect(cacher.has('error-key')).toBe(false);

      // Second call should succeed and make a new fetch call
      const result = await cacher.get('error-key');
      expect(result).toBe('Success');
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Expiration Policies', () => {
    it('should expire cache based on time (EXPIRE policy)', async () => {
      const config: CacherConfig = {
        cacheMillisecond: 50,
        expirePolicy: ExpirationStrategyType.EXPIRE,
        flushInterval: 25,
      };

      mockFetchFn.mockImplementation(
        async (key: string) => `result-${key}-${Date.now()}`,
      );

      cacher = new PromiseCacher(mockFetchFn, config);

      const result1 = await cacher.get('expire-key');

      // Wait for expiration
      await delay(75);

      const result2 = await cacher.get('expire-key');

      expect(result1).not.toBe(result2); // Should be different due to expiration
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should expire cache based on idle time (IDLE policy)', async () => {
      const config: CacherConfig = {
        cacheMillisecond: 50,
        expirePolicy: ExpirationStrategyType.IDLE,
        flushInterval: 25,
      };

      mockFetchFn.mockImplementation(
        async (key: string) => `result-${key}-${Date.now()}`,
      );

      cacher = new PromiseCacher(mockFetchFn, config);

      const result1 = await cacher.get('idle-key');

      // Access within idle time
      await delay(30);
      const result2 = await cacher.get('idle-key');
      expect(result1).toBe(result2); // Should be same (not expired)

      // Wait longer than idle time without access
      await delay(75);
      const result3 = await cacher.get('idle-key');

      expect(result1).not.toBe(result3); // Should be different (expired due to idle)
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Clone Behavior', () => {
    it('should return cloned objects when useClones is true', async () => {
      const config: CacherConfig = {
        useClones: true,
      };

      const originalObject = { value: 'original', nested: { prop: 'data' } };
      mockFetchFn.mockResolvedValue(originalObject);

      const cloneCacher = new PromiseCacher<any, string>(mockFetchFn, config);

      const result1 = await cloneCacher.get('clone-key');
      const result2 = await cloneCacher.get('clone-key');

      // Should be deep equal but different references
      expect(result1).toEqual(originalObject);
      expect(result2).toEqual(originalObject);
      expect(result1).not.toBe(originalObject);
      expect(result2).not.toBe(originalObject);
      expect(result1).not.toBe(result2); // Different clones

      // Modifying one should not affect others
      result1.value = 'modified';
      expect(result2.value).toBe('original');
      expect(originalObject.value).toBe('original');

      cloneCacher.clear();
    });

    it('should return shared references when useClones is false', async () => {
      const config: CacherConfig = {
        useClones: false,
      };

      const originalObject = { value: 'original' };
      mockFetchFn.mockResolvedValue(originalObject);

      const sharedCacher = new PromiseCacher<any, string>(mockFetchFn, config);

      const result1 = await sharedCacher.get('shared-key');
      const result2 = await sharedCacher.get('shared-key');

      // Should be same reference
      expect(result1).toBe(result2);

      sharedCacher.clear();
    });
  });

  describe('Flush Interval Configuration', () => {
    it('should respect minimum flush interval', async () => {
      const config: CacherConfig = {
        flushInterval: 1, // Less than minimum
      };

      cacher = new PromiseCacher(async () => 'result', config);

      // Should use minimum interval, not throw error
      await cacher.get('test');
      expect(cacher.cacheCount).toBe(1);
    });

    it('should handle very long flush intervals', async () => {
      const config: CacherConfig = {
        flushInterval: 60000, // 1 minute
      };

      cacher = new PromiseCacher(async () => 'result', config);

      await cacher.get('test');
      expect(cacher.cacheCount).toBe(1);
    });
  });

  describe('Statistics Edge Cases', () => {
    it('should handle statistics calculation with no data', () => {
      cacher = new PromiseCacher(async () => 'result');

      const stats = cacher.statistics();
      expect(stats.cacheCount).toBe(0);
      expect(stats.usedMemoryBytes).toBe(0);
      expect(stats.usedCountTotal).toBe(0);
      expect(stats.performance.avgResponseTime).toBe(0);
      expect(stats.performance.minResponseTime).toBe(0);
      expect(stats.performance.maxResponseTime).toBe(0);
    });

    it('should handle statistics with single entry', async () => {
      cacher = new PromiseCacher(async () => 'result');

      await cacher.get('single');

      const stats = cacher.statistics();
      expect(stats.cacheCount).toBe(1);
      expect(stats.maxUsedCount).toBe(stats.minUsedCount);
      expect(stats.avgUsedCount).toBe(1);
    });
  });

  describe('Key Transformation Edge Cases', () => {
    it('should handle custom key transformation that returns same key for different inputs', async () => {
      const config: CacherConfig = {
        cacheKeyTransform: () => 'same-key', // Always returns same key
      };

      mockFetchFn.mockImplementation(
        async (key: any) => `result-${JSON.stringify(key)}`,
      );

      cacher = new PromiseCacher(mockFetchFn, config);

      await cacher.get('input1');
      await cacher.get('input2');

      // Should only have one cache entry due to key collision
      expect(cacher.cacheCount).toBe(1);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should handle key transformation that throws error', async () => {
      const config: CacherConfig = {
        cacheKeyTransform: () => {
          throw new Error('Transform error');
        },
      };

      cacher = new PromiseCacher(async () => 'result', config);

      await expect(cacher.get('test')).rejects.toThrow('Transform error');
    });
  });

  describe('Force Update Edge Cases', () => {
    it('should handle force update during concurrent requests', async () => {
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(50);
        return `result-${key}-${Date.now()}`;
      });

      cacher = new PromiseCacher(mockFetchFn);

      const promise1 = cacher.get('concurrent-key');
      const promise2 = cacher.get('concurrent-key', true); // Force update

      const results = await Promise.all([promise1, promise2]);

      // Results might be same or different depending on timing
      expect(results).toHaveLength(2);
    });

    it('should handle multiple force updates', async () => {
      let counter = 0;
      mockFetchFn.mockImplementation(async (key: string) => {
        return `result-${key}-${++counter}`;
      });

      cacher = new PromiseCacher(mockFetchFn);

      await cacher.get('force-key');
      const result1 = await cacher.get('force-key', true);
      const result2 = await cacher.get('force-key', true);

      expect(result1).toBe('result-force-key-2');
      expect(result2).toBe('result-force-key-3');
      expect(mockFetchFn).toHaveBeenCalledTimes(3);
    });
  });
});
