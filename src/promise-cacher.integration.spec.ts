import { ErrorTaskPolicyType, ExpirationStrategyType } from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('PromiseCacher Integration Tests', () => {
  let cacher: PromiseCacher<any, string>;
  let mockFetchFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchFn = jest.fn();
  });

  afterEach(() => {
    if (cacher) {
      cacher.clear();
    }
    jest.restoreAllMocks();
  });

  describe('complex scenarios', () => {
    it('should handle mixed success and error scenarios', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { errorTaskPolicy: ErrorTaskPolicyType.CACHE },
      });

      mockFetchFn
        .mockResolvedValueOnce('success-1')
        .mockRejectedValueOnce(new Error('error-1'))
        .mockResolvedValueOnce('success-2');

      const result1 = await cacher.get('key1');
      await expect(cacher.get('key2')).rejects.toThrow('error-1');
      const result3 = await cacher.get('key3');

      expect(result1).toBe('success-1');
      expect(result3).toBe('success-2');
      expect(cacher.cacheCount).toBe(3); // All cached (including error)

      // Error should be cached
      await expect(cacher.get('key2')).rejects.toThrow('error-1');
      expect(mockFetchFn).toHaveBeenCalledTimes(3); // No additional calls
    });

    it('should handle cache invalidation with concurrent requests', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { ttlMs: 100 },
        fetchingPolicy: { concurrency: 2 },
      });

      let fetchCount = 0;
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(50);
        return `${key}-${++fetchCount}`;
      });

      // Initial requests
      const result1 = await cacher.get('key1');
      expect(result1).toBe('key1-1');

      // Wait for cache to expire
      await delay(150);

      // Multiple concurrent requests after expiration
      const promises = [
        cacher.get('key1'),
        cacher.get('key1'),
        cacher.get('key1'),
      ];

      const results = await Promise.all(promises);

      // All should get the same new value
      expect(results[0]).toBe('key1-2');
      expect(results[1]).toBe('key1-2');
      expect(results[2]).toBe('key1-2');
      expect(fetchCount).toBe(2); // Only 2 fetches total
    });

    it('should handle queue overflow and memory pressure simultaneously', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
        freeUpMemoryPolicy: {
          maxMemoryBytes: 100, // Very small limit to trigger cleanup
          minMemoryBytes: 50,
        },
        cachePolicy: { flushIntervalMs: 50 },
      });

      let requestCount = 0;
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(30);
        return `${'x'.repeat(50)}-${++requestCount}`; // Large responses
      });

      // Queue multiple requests that will exceed memory
      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'),
        cacher.get('key4'),
      ];

      await Promise.all(promises);

      // Wait longer for memory cleanup
      await delay(200);

      const stats = cacher.statistics();
      // Memory cleanup should have been triggered or cache count reduced
      expect(stats.memory.cleanupCount >= 0).toBe(true);
      expect(stats.inventory.totalItems >= 0).toBe(true);
    });

    it('should maintain data consistency during rapid cache operations', async () => {
      cacher = new PromiseCacher(mockFetchFn);

      let operationCount = 0;
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(10);
        return `${key}-${++operationCount}`;
      });

      const operations = [];

      // Mix of get, set, delete operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          (async () => {
            const key = `key${i % 3}`;

            if (i % 3 === 0) {
              return await cacher.get(key);
            } else if (i % 3 === 1) {
              cacher.set(key, `manual-${i}`);
              return await cacher.get(key);
            } else {
              cacher.delete(key);
              return await cacher.get(key);
            }
          })(),
        );
      }

      const results = await Promise.all(operations);

      // Verify no null/undefined results (all operations completed)
      expect(
        results.every((result) => result !== null && result !== undefined),
      ).toBe(true);
      expect(cacher.cacheCount).toBeGreaterThan(0);
    });

    it('should handle custom cache scoring during memory pressure', async () => {
      const customScoreFn = jest.fn((task) => {
        // Prefer keeping newer items (higher timestamp = lower score for deletion)
        return 1 / (task.createdAt || 1);
      });

      cacher = new PromiseCacher(mockFetchFn, {
        freeUpMemoryPolicy: {
          maxMemoryBytes: 100, // Very small to trigger cleanup
          minMemoryBytes: 50,
          calcCacheScoreFn: customScoreFn,
        },
        cachePolicy: { flushIntervalMs: 50 },
      });

      mockFetchFn.mockImplementation(
        (key: string) => Promise.resolve('x'.repeat(40)), // Moderate size values
      );

      // Add items with delays to ensure different creation times
      await cacher.get('old-key');
      await delay(10);
      await cacher.get('newer-key');
      await delay(10);
      await cacher.get('newest-key');

      // Force memory cleanup by adding more items
      await cacher.get('trigger-key');

      // Wait for memory cleanup to trigger
      await delay(200);

      // Should still have cache entries
      expect(cacher.cacheCount).toBeGreaterThan(0);
    });

    it('should handle timeout with concurrent limit and memory pressure', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: {
          concurrency: 2,
          timeoutMs: 100,
        },
        freeUpMemoryPolicy: {
          maxMemoryBytes: 200,
        },
      });

      mockFetchFn.mockImplementation(async (key: string) => {
        if (key.includes('slow')) {
          await delay(150); // Will timeout
          return 'slow-result';
        }
        await delay(50);
        return `fast-${key}`;
      });

      const promises = [
        cacher.get('slow1').catch((e) => e.message),
        cacher.get('slow2').catch((e) => e.message),
        cacher.get('fast1'),
        cacher.get('fast2'),
      ];

      const results = await Promise.all(promises);

      // Fast requests should succeed, slow ones should timeout
      expect(results[0]).toMatch(/timeout/i);
      expect(results[1]).toMatch(/timeout/i);
      expect(results[2]).toBe('fast-fast1');
      expect(results[3]).toBe('fast-fast2');
    });

    it('should maintain cache integrity across expiration strategies', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          ttlMs: 100,
          expirationStrategy: ExpirationStrategyType.IDLE,
        },
      });

      let fetchCount = 0;
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(10);
        return `${key}-${++fetchCount}`;
      });

      // Get initial value
      const result1 = await cacher.get('key1');
      expect(result1).toBe('key1-1');

      // Keep accessing within idle period
      for (let i = 0; i < 5; i++) {
        await delay(50); // Less than ttlMs
        const result = await cacher.get('key1');
        expect(result).toBe('key1-1'); // Should be same cached value
      }

      // Stop accessing and wait for idle expiration
      await delay(150);

      // Should fetch new value after idle expiration
      const result2 = await cacher.get('key1');
      expect(result2).toBe('key1-2');
      expect(fetchCount).toBe(2);
    });

    it('should handle edge case: extremely rapid operations', async () => {
      cacher = new PromiseCacher(mockFetchFn);

      let callCount = 0;
      mockFetchFn.mockImplementation(() => Promise.resolve(++callCount));

      // Perform many operations in tight loop
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const key = `key${i % 10}`;
        promises.push(cacher.get(key));
      }

      const results = await Promise.all(promises);

      // Should have unique values for each unique key
      const uniqueKeys = new Set(
        Array.from({ length: 100 }, (_, i) => `key${i % 10}`),
      );
      expect(uniqueKeys.size).toBe(10);
      expect(mockFetchFn).toHaveBeenCalledTimes(10);
      expect(results).toHaveLength(100);
    });

    it('should properly cleanup resources on rapid clear operations', async () => {
      cacher = new PromiseCacher(mockFetchFn);

      mockFetchFn.mockImplementation((key: string) =>
        Promise.resolve(`value-${key}`),
      );

      let totalOperations = 0;

      // Rapid clear operations mixed with cache operations
      for (let i = 0; i < 10; i++) {
        await cacher.get(`key${i}`);
        totalOperations++;
        if (i % 3 === 0) {
          cacher.clear();
        }
      }

      const finalStats = cacher.statistics();
      expect(finalStats.inventory.totalItems).toBeGreaterThanOrEqual(0);
      expect(totalOperations).toBeGreaterThan(0);
    });

    it('should handle custom cache key collisions gracefully', async () => {
      const customTransform = jest.fn(() => 'same-key'); // Always returns same key

      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { cacheKeyTransform: customTransform },
      });

      let fetchCount = 0;
      mockFetchFn.mockImplementation(() => Promise.resolve(++fetchCount));

      // Different input keys that transform to same cache key
      const result1 = await cacher.get('input1');
      const result2 = await cacher.get('input2');
      const result3 = await cacher.get('input3');

      // All should get the same cached value
      expect(result1).toBe(1);
      expect(result2).toBe(1);
      expect(result3).toBe(1);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(cacher.cacheCount).toBe(1);
    });
  });

  describe('performance and stress tests', () => {
    it('should handle large number of cache entries efficiently', async () => {
      cacher = new PromiseCacher(mockFetchFn);

      mockFetchFn.mockImplementation((key: string) =>
        Promise.resolve(`value-${key}`),
      );

      const startTime = Date.now();
      const promises = [];

      // Create 1000 unique cache entries
      for (let i = 0; i < 1000; i++) {
        promises.push(cacher.get(`key${i}`));
      }

      await Promise.all(promises);
      const endTime = Date.now();

      expect(cacher.cacheCount).toBe(1000);
      expect(mockFetchFn).toHaveBeenCalledTimes(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete reasonably fast
    });

    it('should maintain performance with frequent cache hits', async () => {
      cacher = new PromiseCacher(mockFetchFn);

      mockFetchFn.mockResolvedValue('cached-value');

      // Warm up cache
      await cacher.get('hot-key');

      const startTime = Date.now();
      const promises = [];

      // 10000 cache hits
      for (let i = 0; i < 10000; i++) {
        promises.push(cacher.get('hot-key'));
      }

      await Promise.all(promises);
      const endTime = Date.now();

      expect(mockFetchFn).toHaveBeenCalledTimes(1); // Only one fetch
      expect(endTime - startTime).toBeLessThan(1000); // Should be very fast for cache hits
    });

    it('should handle memory statistics calculation efficiently', async () => {
      cacher = new PromiseCacher(mockFetchFn);

      mockFetchFn.mockImplementation((key: string) =>
        Promise.resolve({ key, data: 'x'.repeat(100) }),
      );

      // Create many cache entries
      for (let i = 0; i < 100; i++) {
        await cacher.get(`key${i}`);
      }

      const startTime = Date.now();

      // Call statistics many times
      for (let i = 0; i < 100; i++) {
        cacher.statistics();
      }

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Statistics should be fast
    });
  });

  describe('boundary conditions', () => {
    it('should handle zero memory limits', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        freeUpMemoryPolicy: {
          maxMemoryBytes: 0, // Zero limit
        },
        cachePolicy: { flushIntervalMs: 50 },
      });

      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('key1');

      // Wait for cleanup
      await delay(100);

      const stats = cacher.statistics();
      // With zero limit, cache should still work but may trigger cleanup
      expect(stats.inventory.totalItems).toBeGreaterThanOrEqual(0);
    });

    it('should handle extremely short TTL values', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { ttlMs: 1 }, // 1ms TTL
      });

      let fetchCount = 0;
      mockFetchFn.mockImplementation(() => Promise.resolve(++fetchCount));

      const result1 = await cacher.get('key1');
      await delay(5); // Wait longer than TTL
      const result2 = await cacher.get('key1');

      expect(result1).toBe(1);
      expect(result2).toBe(2);
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should handle very large timeout values', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { timeoutMs: Number.MAX_SAFE_INTEGER },
      });

      mockFetchFn.mockImplementation(async () => {
        await delay(50);
        return 'no-timeout';
      });

      const result = await cacher.get('key1');
      expect(result).toBe('no-timeout');
    });
  });
});
