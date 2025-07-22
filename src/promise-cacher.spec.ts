import {
  CacherConfig,
  ErrorTaskPolicyType,
  ExpirationStrategyType,
} from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('PromiseCacher', () => {
  let cacher: PromiseCacher<string, string>;
  let mockFetchFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchFn = jest.fn();
  });

  afterEach(() => {
    if (cacher) {
      cacher.clear();
      cacher = undefined;
    }
    jest.restoreAllMocks();
    // Clear any remaining timers
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      cacher = new PromiseCacher(mockFetchFn);

      expect(cacher.fetchFn).toBe(mockFetchFn);
      expect(cacher.config).toEqual({});
      expect(cacher.ttlMs).toBe(300000); // DefaultTtlMs (5 * 60 * 1000)
      expect(cacher.concurrency).toBe(0); // DefaultConcurrency (unlimited)
      expect(cacher.errorTaskPolicy).toBe(ErrorTaskPolicyType.IGNORE);
      expect(cacher.expirationStrategy).toBe(ExpirationStrategyType.EXPIRE);
      expect(cacher.useClones).toBe(false);
      expect(cacher.timeoutMs).toBeUndefined();
    });

    it('should initialize with custom configuration', () => {
      const config: CacherConfig = {
        cachePolicy: {
          ttlMs: 30000,
          flushIntervalMs: 5000,
          errorTaskPolicy: ErrorTaskPolicyType.CACHE,
          expirationStrategy: ExpirationStrategyType.IDLE,
        },
        fetchingPolicy: {
          concurrency: 5,
          timeoutMs: 10000,
          useClones: true,
        },
        freeUpMemoryPolicy: {
          maxMemoryBytes: 1024 * 1024, // 1MB
          minMemoryBytes: 512 * 1024, // 512KB
        },
      };

      cacher = new PromiseCacher(mockFetchFn, config);

      expect(cacher.config).toEqual(config);
      expect(cacher.ttlMs).toBe(30000);
      expect(cacher.concurrency).toBe(5);
      expect(cacher.errorTaskPolicy).toBe(ErrorTaskPolicyType.CACHE);
      expect(cacher.expirationStrategy).toBe(ExpirationStrategyType.IDLE);
      expect(cacher.useClones).toBe(true);
      expect(cacher.timeoutMs).toBe(10000);
    });

    it('should ensure timeout does not exceed cache duration', () => {
      const config: CacherConfig = {
        cachePolicy: {
          ttlMs: 5000,
        },
        fetchingPolicy: {
          timeoutMs: 10000, // Longer than ttlMs
        },
      };

      cacher = new PromiseCacher(mockFetchFn, config);

      // Timeout should be limited to ttlMs
      expect(cacher.timeoutMs).toBe(5000);
    });

    it('should ensure minimum flush interval', () => {
      const config: CacherConfig = {
        cachePolicy: {
          flushIntervalMs: 50, // Less than MinFlushIntervalMs (1000)
        },
      };

      cacher = new PromiseCacher(mockFetchFn, config);

      // Should use minimum flush interval
      expect((cacher as any).flushInterval).toBe(1000);
    });

    it('should compute valid memory configuration', () => {
      const config: CacherConfig = {
        freeUpMemoryPolicy: {
          maxMemoryBytes: 1000,
          minMemoryBytes: 800, // Valid: less than max
        },
      };

      cacher = new PromiseCacher(mockFetchFn, config);

      expect((cacher as any).maxMemoryMegaByte).toBe(1000);
      expect((cacher as any).minMemoryByte).toBe(800);
    });

    it('should default minMemoryBytes when invalid', () => {
      const config: CacherConfig = {
        freeUpMemoryPolicy: {
          maxMemoryBytes: 1000,
          minMemoryBytes: 1200, // Invalid: greater than max
        },
      };

      cacher = new PromiseCacher(mockFetchFn, config);

      expect((cacher as any).maxMemoryMegaByte).toBe(1000);
      expect((cacher as any).minMemoryByte).toBe(500); // Default to half of max
    });
  });

  describe('get', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should fetch and cache new values', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      const result = await cacher.get('test-key');

      expect(result).toBe('test-value');
      expect(mockFetchFn).toHaveBeenCalledWith('test-key');
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(cacher.has('test-key')).toBe(true);
    });

    it('should return cached values without refetching', async () => {
      mockFetchFn.mockResolvedValue('cached-value');

      const result1 = await cacher.get('test-key');
      const result2 = await cacher.get('test-key');

      expect(result1).toBe('cached-value');
      expect(result2).toBe('cached-value');
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should force update when requested', async () => {
      mockFetchFn
        .mockResolvedValueOnce('first-value')
        .mockResolvedValueOnce('second-value');

      const result1 = await cacher.get('test-key');
      const result2 = await cacher.get('test-key', true); // Force update

      expect(result1).toBe('first-value');
      expect(result2).toBe('second-value');
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should refetch expired cache entries', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { ttlMs: 100 },
      });

      mockFetchFn
        .mockResolvedValueOnce('first-value')
        .mockResolvedValueOnce('second-value');

      const result1 = await cacher.get('test-key');

      // Wait for cache to expire
      await delay(150);

      const result2 = await cacher.get('test-key');

      expect(result1).toBe('first-value');
      expect(result2).toBe('second-value');
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent requests for same key', async () => {
      let resolveCount = 0;
      mockFetchFn.mockImplementation(async () => {
        await delay(50);
        return `value-${++resolveCount}`;
      });

      // Start multiple concurrent requests for the same key
      const promises = [
        cacher.get('test-key'),
        cacher.get('test-key'),
        cacher.get('test-key'),
      ];

      const results = await Promise.all(promises);

      // All should return the same value (from single fetch)
      expect(results[0]).toBe('value-1');
      expect(results[1]).toBe('value-1');
      expect(results[2]).toBe('value-1');
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should increment usage statistics', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('test-key');
      await cacher.get('test-key');

      const stats = cacher.statistics();
      expect(stats.usedCountTotal).toBe(2);
    });
  });

  describe('set', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should manually set a value', async () => {
      cacher.set('test-key', 'manual-value');

      const result = await cacher.get('test-key');
      expect(result).toBe('manual-value');
      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should manually set a promise', async () => {
      const promise = Promise.resolve('promise-value');
      cacher.set('test-key', promise);

      const result = await cacher.get('test-key');
      expect(result).toBe('promise-value');
      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should replace existing cached values', async () => {
      mockFetchFn.mockResolvedValue('original-value');

      await cacher.get('test-key');
      cacher.set('test-key', 'new-value');

      const result = await cacher.get('test-key');
      expect(result).toBe('new-value');
    });

    it('should handle error values', async () => {
      const error = new Error('test-error');
      cacher.set('test-key', error);

      await expect(cacher.get('test-key')).rejects.toThrow('test-error');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should delete cached entries', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('test-key');
      expect(cacher.has('test-key')).toBe(true);

      cacher.delete('test-key');
      expect(cacher.has('test-key')).toBe(false);
    });

    it('should handle deletion of non-existent keys', () => {
      expect(() => cacher.delete('non-existent')).not.toThrow();
    });

    it('should update memory statistics on deletion', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('test-key');
      const statsBefore = cacher.statistics();

      cacher.delete('test-key');
      const statsAfter = cacher.statistics();

      expect(statsAfter.releasedMemoryBytes).toBeGreaterThan(
        statsBefore.releasedMemoryBytes,
      );
    });
  });

  describe('has', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should return false for non-existent keys', () => {
      expect(cacher.has('non-existent')).toBe(false);
    });

    it('should return true for cached keys', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('test-key');
      expect(cacher.has('test-key')).toBe(true);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should clear all cached entries', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('key1');
      await cacher.get('key2');

      expect(cacher.cacheCount).toBe(2);

      cacher.clear();

      expect(cacher.cacheCount).toBe(0);
      expect(cacher.has('key1')).toBe(false);
      expect(cacher.has('key2')).toBe(false);
    });

    it('should reset performance metrics', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('test-key');
      let stats = cacher.statistics();
      expect(stats.usedCountTotal).toBeGreaterThan(0);

      cacher.clear();
      stats = cacher.statistics();
      expect(stats.usedCountTotal).toBe(0);
      expect(stats.releasedMemoryBytes).toBe(0);
    });
  });

  describe('keys', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should return empty array when no keys cached', () => {
      expect(cacher.keys()).toEqual([]);
    });

    it('should return all cached keys', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('key1');
      await cacher.get('key2');

      const keys = cacher.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });
  });

  describe('cacheCount', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should return correct cache count', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      expect(cacher.cacheCount).toBe(0);

      await cacher.get('key1');
      expect(cacher.cacheCount).toBe(1);

      await cacher.get('key2');
      expect(cacher.cacheCount).toBe(2);

      cacher.delete('key1');
      expect(cacher.cacheCount).toBe(1);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should provide comprehensive statistics', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('key1');
      await cacher.get('key1'); // Second access to same key
      await cacher.get('key2');

      const stats = cacher.statistics();

      expect(stats.cacheCount).toBe(2);
      expect(stats.usedCountTotal).toBe(3);
      expect(stats.maxUsedCount).toBe(2); // key1 accessed twice
      expect(stats.minUsedCount).toBe(1); // key2 accessed once
      expect(stats.avgUsedCount).toBe(1.5); // (2+1)/2
      expect(stats.usedMemoryBytes).toBeGreaterThan(0);
      expect(typeof stats.usedMemory).toBe('string');
    });

    it('should handle empty cache statistics', () => {
      const stats = cacher.statistics();

      expect(stats.cacheCount).toBe(0);
      expect(stats.usedCountTotal).toBe(0);
      expect(stats.maxUsedCount).toBe(0);
      expect(stats.minUsedCount).toBe(0);
      expect(stats.avgUsedCount).toBe(0);
      expect(stats.usedMemoryBytes).toBe(0);
    });
  });

  describe('concurrency control', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 2 },
      });
    });

    it('should respect concurrency limits', async () => {
      let activeRequests = 0;
      let maxConcurrent = 0;

      mockFetchFn.mockImplementation(async () => {
        activeRequests++;
        maxConcurrent = Math.max(maxConcurrent, activeRequests);
        await delay(50);
        activeRequests--;
        return 'value';
      });

      // Start more requests than the concurrency limit
      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'),
        cacher.get('key4'),
      ];

      await Promise.all(promises);

      // Should not exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle unlimited concurrency', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 0 }, // Unlimited
      });

      let activeRequests = 0;
      let maxConcurrent = 0;

      mockFetchFn.mockImplementation(async () => {
        activeRequests++;
        maxConcurrent = Math.max(maxConcurrent, activeRequests);
        await delay(10);
        activeRequests--;
        return 'value';
      });

      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'),
        cacher.get('key4'),
      ];

      await Promise.all(promises);

      // Should allow all requests to run concurrently
      expect(maxConcurrent).toBe(4);
    });
  });

  describe('memory management', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { flushIntervalMs: 100 },
        freeUpMemoryPolicy: {
          maxMemoryBytes: 1000,
          minMemoryBytes: 500,
        },
      });
    });

    it('should trigger memory cleanup when limit exceeded', async () => {
      // Mock large values to exceed memory limit
      mockFetchFn.mockImplementation(() => 'x'.repeat(400));

      // Fill cache beyond memory limit
      await cacher.get('key1');
      await cacher.get('key2');
      await cacher.get('key3'); // Should exceed 1000 bytes

      // Manually trigger flush to test memory cleanup
      (cacher as any).flush();

      // Check if memory cleanup was triggered
      const stats = cacher.statistics();
      expect(stats.overMemoryLimitCount).toBeGreaterThan(0);
      expect(stats.releasedMemoryBytes).toBeGreaterThan(0);
    });

    it('should clean up expired tasks during flush', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          ttlMs: 50,
          flushIntervalMs: 100,
        },
      });

      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('key1');
      expect(cacher.cacheCount).toBe(1);

      // Wait for expiration and manually flush
      await new Promise((resolve) => {
        setTimeout(() => {
          // Manually trigger flush to clean expired tasks
          (cacher as any).flush();
          expect(cacher.cacheCount).toBe(0);
          resolve(void 0);
        }, 60);
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should handle fetch function errors', async () => {
      const error = new Error('Fetch failed');
      mockFetchFn.mockRejectedValue(error);

      await expect(cacher.get('test-key')).rejects.toThrow('Fetch failed');
    });

    it('should cache errors when policy is CACHE', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { errorTaskPolicy: ErrorTaskPolicyType.CACHE },
      });

      const error = new Error('Cached error');
      mockFetchFn.mockRejectedValue(error);

      await expect(cacher.get('test-key')).rejects.toThrow('Cached error');
      await expect(cacher.get('test-key')).rejects.toThrow('Cached error');

      // Should only call fetch once (error is cached)
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should not cache errors when policy is IGNORE', async () => {
      let i = 0;
      cacher = new PromiseCacher(
        async (key: string) => {
          if (i == 0) {
            i = 1;
            throw new Error('First error');
          } else {
            return 'success';
          }
        },
        {
          cachePolicy: { errorTaskPolicy: ErrorTaskPolicyType.IGNORE },
        },
      );

      // First call should throw the error
      let thrownError: Error | null = null;
      const key = 'test-key';
      try {
        await cacher.get(key);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError?.message).toBe('First error');
      await delay(50);
      // Second call should succeed (error was not cached)
      const result = await cacher.get(key);
      expect(result).toBe('success');
    });
  });

  describe('cache key transformation', () => {
    it('should use default key transformation', async () => {
      cacher = new PromiseCacher(mockFetchFn);
      mockFetchFn.mockResolvedValue('value');

      await cacher.get('simple-string');
      await cacher.get({ key: 'object' } as any);
      await cacher.get(123 as any);

      expect(mockFetchFn).toHaveBeenCalledTimes(3);
      expect(cacher.cacheCount).toBe(3);
    });

    it('should use custom key transformation', async () => {
      const customTransform = jest.fn((key: any) => `custom-${key}`);
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: { cacheKeyTransform: customTransform },
      });
      mockFetchFn.mockResolvedValue('value');

      await cacher.get('test-key');

      expect(customTransform).toHaveBeenCalledWith('test-key');
      expect(customTransform).toHaveReturnedWith('custom-test-key');
    });
  });

  describe('cloning behavior', () => {
    beforeEach(() => {
      cacher = new PromiseCacher<any, string>(mockFetchFn, {
        fetchingPolicy: { useClones: true },
      });
    });

    it('should return clones when useClones is true', async () => {
      const originalObject = { value: 'test', nested: { prop: 1 } };
      mockFetchFn.mockResolvedValue(originalObject);

      const result1 = await cacher.get('test-key');
      const result2 = await cacher.get('test-key');

      // Should be deep equal but not the same reference
      expect(result1).toEqual(originalObject);
      expect(result2).toEqual(originalObject);
      expect(result1).not.toBe(result2);
      expect((result1 as any).nested).not.toBe((result2 as any).nested);
    });
  });

  describe('timeout handling', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { timeoutMs: 100 },
      });
    });

    it('should timeout long-running fetch operations', async () => {
      mockFetchFn.mockImplementation(() => delay(200));

      await expect(cacher.get('test-key')).rejects.toThrow();
    });

    it('should not timeout fast operations', async () => {
      mockFetchFn.mockImplementation(async () => {
        await delay(50);
        return 'fast-value';
      });

      const result = await cacher.get('test-key');
      expect(result).toBe('fast-value');
    });
  });

  describe('expiration strategies', () => {
    it('should expire based on creation time (EXPIRE strategy)', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          ttlMs: 100,
          expirationStrategy: ExpirationStrategyType.EXPIRE,
        },
      });

      mockFetchFn
        .mockResolvedValueOnce('first-value')
        .mockResolvedValueOnce('second-value');

      const result1 = await cacher.get('test-key');
      expect(result1).toBe('first-value');

      await new Promise((resolve) => {
        setTimeout(async () => {
          const result2 = await cacher.get('test-key');
          expect(result2).toBe('second-value');
          expect(mockFetchFn).toHaveBeenCalledTimes(2);
          resolve(void 0);
        }, 150);
      });
    });

    it('should expire based on last access time (IDLE strategy)', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          ttlMs: 100,
          expirationStrategy: ExpirationStrategyType.IDLE,
        },
      });

      mockFetchFn
        .mockResolvedValueOnce('first-value')
        .mockResolvedValueOnce('second-value');

      await cacher.get('test-key');

      // Access within idle time - should extend lifetime
      setTimeout(async () => {
        await cacher.get('test-key');
      }, 50);

      // Check after original expiry time but within extended time
      await new Promise((resolve) => {
        setTimeout(async () => {
          const result = await cacher.get('test-key');
          expect(result).toBe('first-value'); // Should still be cached
          expect(mockFetchFn).toHaveBeenCalledTimes(1);
          resolve(void 0);
        }, 120);
      });
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should handle null and undefined return values', async () => {
      mockFetchFn.mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);

      const result1 = await cacher.get('null-key');
      const result2 = await cacher.get('undefined-key');

      expect(result1).toBeNull();
      expect(result2).toBeUndefined();
    });

    it('should handle rapid successive calls', async () => {
      let callCount = 0;
      mockFetchFn.mockImplementation(async () => {
        await delay(10);
        return `value-${++callCount}`;
      });

      const promises = Array.from({ length: 10 }, () =>
        cacher.get('rapid-key'),
      );

      const results = await Promise.all(promises);

      // All results should be the same (from single fetch)
      expect(new Set(results).size).toBe(1);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should handle very large cache keys', async () => {
      const largeKey = 'x'.repeat(10000);
      mockFetchFn.mockResolvedValue('large-key-value');

      const result = await cacher.get(largeKey);

      expect(result).toBe('large-key-value');
      expect(cacher.has(largeKey)).toBe(true);
    });

    it('should handle cache operations after clear', async () => {
      mockFetchFn.mockResolvedValue('test-value');

      await cacher.get('test-key');
      cacher.clear();

      // Should work normally after clear
      await cacher.get('new-key');
      expect(cacher.cacheCount).toBe(1);
    });
  });
});
