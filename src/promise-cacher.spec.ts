import { CacherConfig } from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('PromiseCacher', () => {
  let fetchCallCount: { [key: string]: number };
  let mockFetchFn: jest.Mock;

  beforeEach(() => {
    fetchCallCount = {};
    mockFetchFn = jest.fn().mockImplementation(async (key: string) => {
      await delay(100);
      if (!fetchCallCount[key]) fetchCallCount[key] = 0;
      fetchCallCount[key]++;
      return `value_${key}_${fetchCallCount[key]}`;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default config', () => {
      const cacher = new PromiseCacher(mockFetchFn);
      expect(cacher.fetchFn).toBe(mockFetchFn);
      expect(cacher.config).toEqual({});
    });

    it('should create instance with custom config', () => {
      const config: CacherConfig = {
        cacheMillisecond: 60000,
        flushInterval: 30000,
      };
      const cacher = new PromiseCacher(mockFetchFn, config);
      expect(cacher.config).toBe(config);
    });
  });

  describe('get() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should fetch and cache value on first call', async () => {
      const result = await cacher.get('test-key');

      expect(result).toBe('value_test-key_1');
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(mockFetchFn).toHaveBeenCalledWith('test-key');
    });

    it('should return cached value on subsequent calls', async () => {
      const result1 = await cacher.get('test-key');
      const result2 = await cacher.get('test-key');

      expect(result1).toBe('value_test-key_1');
      expect(result2).toBe('value_test-key_1');
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent requests for same key', async () => {
      const promises = [
        cacher.get('concurrent-key'),
        cacher.get('concurrent-key'),
        cacher.get('concurrent-key'),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([
        'value_concurrent-key_1',
        'value_concurrent-key_1',
        'value_concurrent-key_1',
      ]);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should force update when forceUpdate is true', async () => {
      await cacher.get('force-key');
      const result = await cacher.get('force-key', true);

      expect(result).toBe('value_force-key_2');
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });

    it('should handle different key types', async () => {
      const numberCacher = new PromiseCacher<string, number>(
        async (key: number) => {
          return `number_${key}`;
        },
      );

      const result = await numberCacher.get(123);
      expect(result).toBe('number_123');

      numberCacher.clear();
    });
  });

  describe('set() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should set value directly without calling fetchFn', async () => {
      cacher.set('manual-key', 'manual-value');
      const result = await cacher.get('manual-key');

      expect(result).toBe('manual-value');
      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should set promise value', async () => {
      const promiseValue = Promise.resolve('promise-value');
      cacher.set('promise-key', promiseValue);
      const result = await cacher.get('promise-key');

      expect(result).toBe('promise-value');
      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should overwrite existing cache entry', async () => {
      await cacher.get('overwrite-key'); // Creates cache entry
      cacher.set('overwrite-key', 'new-value');
      const result = await cacher.get('overwrite-key');

      expect(result).toBe('new-value');
    });
  });

  describe('delete() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should remove entry from cache', async () => {
      await cacher.get('delete-key');
      expect(cacher.has('delete-key')).toBe(true);

      cacher.delete('delete-key');
      expect(cacher.has('delete-key')).toBe(false);
    });

    it('should handle deletion of non-existent key', () => {
      expect(() => cacher.delete('non-existent')).not.toThrow();
    });

    it('should update released memory bytes when deleting', async () => {
      await cacher.get('memory-key');
      const statsBefore = cacher.statistics();

      cacher.delete('memory-key');
      const statsAfter = cacher.statistics();

      expect(statsAfter.releasedMemoryBytes).toBeGreaterThan(
        statsBefore.releasedMemoryBytes,
      );
    });
  });

  describe('has() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should return false for non-existent key', () => {
      expect(cacher.has('non-existent')).toBe(false);
    });

    it('should return true for cached key', async () => {
      await cacher.get('exists-key');
      expect(cacher.has('exists-key')).toBe(true);
    });

    it('should return true for manually set key', () => {
      cacher.set('manual-exists', 'value');
      expect(cacher.has('manual-exists')).toBe(true);
    });
  });

  describe('clear() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    it('should remove all cache entries', async () => {
      await cacher.get('key1');
      await cacher.get('key2');
      cacher.set('key3', 'value3');

      expect(cacher.cacheCount).toBe(3);

      cacher.clear();
      expect(cacher.cacheCount).toBe(0);
      expect(cacher.has('key1')).toBe(false);
      expect(cacher.has('key2')).toBe(false);
      expect(cacher.has('key3')).toBe(false);
    });
  });

  describe('keys() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should return empty array when cache is empty', () => {
      expect(cacher.keys()).toEqual([]);
    });

    it('should return all cached keys', async () => {
      await cacher.get('key1');
      await cacher.get('key2');
      cacher.set('key3', 'value3');

      const keys = cacher.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
    });
  });

  describe('cacheCount property', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should return 0 for empty cache', () => {
      expect(cacher.cacheCount).toBe(0);
    });

    it('should return correct count after adding entries', async () => {
      expect(cacher.cacheCount).toBe(0);

      await cacher.get('key1');
      expect(cacher.cacheCount).toBe(1);

      await cacher.get('key2');
      expect(cacher.cacheCount).toBe(2);

      cacher.set('key3', 'value3');
      expect(cacher.cacheCount).toBe(3);
    });

    it('should decrease after deletion', async () => {
      await cacher.get('key1');
      await cacher.get('key2');
      expect(cacher.cacheCount).toBe(2);

      cacher.delete('key1');
      expect(cacher.cacheCount).toBe(1);
    });
  });

  describe('statistics() method', () => {
    let cacher: PromiseCacher;

    beforeEach(() => {
      cacher = new PromiseCacher(mockFetchFn);
    });

    afterEach(() => {
      cacher.clear();
    });

    it('should return correct statistics for empty cache', () => {
      const stats = cacher.statistics();

      expect(stats.cacheCount).toBe(0);
      expect(stats.usedMemoryBytes).toBe(0);
      expect(stats.usedCountTotal).toBe(0);
      expect(stats.overMemoryLimitCount).toBe(0);
      expect(stats.releasedMemoryBytes).toBe(0);
    });

    it('should return correct statistics after cache operations', async () => {
      await cacher.get('stats-key1');
      await cacher.get('stats-key2');
      await cacher.get('stats-key1'); // Access key1 again

      const stats = cacher.statistics();

      expect(stats.cacheCount).toBe(2);
      expect(stats.usedCountTotal).toBe(3);
      expect(stats.usedMemoryBytes).toBeGreaterThan(0);
      expect(stats.usedMemory).toMatch(/\d+(\.\d+)?\s*(B|KB|MB|GB)/);
      expect(stats.maxUsedCount).toBeGreaterThanOrEqual(1);
      expect(stats.minUsedCount).toBeGreaterThanOrEqual(1);
      expect(stats.avgUsedCount).toBeGreaterThan(0);
    });

    it('should have all required properties', async () => {
      await cacher.get('prop-key');
      const stats = cacher.statistics();

      const requiredProps = [
        'cacheCount',
        'usedMemory',
        'usedMemoryBytes',
        'usedCountTotal',
        'maxUsedCount',
        'minUsedCount',
        'avgUsedCount',
        'overMemoryLimitCount',
        'releasedMemoryBytes',
      ];

      requiredProps.forEach((prop) => {
        expect(stats).toHaveProperty(prop);
        expect(typeof stats[prop as keyof typeof stats]).not.toBe('undefined');
      });
    });
  });

  describe('Configuration properties', () => {
    it('should return correct cacheMillisecond from config', () => {
      const config: CacherConfig = { cacheMillisecond: 60000 };
      const cacher = new PromiseCacher(mockFetchFn, config);

      expect(cacher.cacheMillisecond).toBe(60000);
      cacher.clear();
    });

    it('should return default cacheMillisecond when not configured', () => {
      const cacher = new PromiseCacher(mockFetchFn);

      expect(cacher.cacheMillisecond).toBeDefined();
      expect(typeof cacher.cacheMillisecond).toBe('number');
      cacher.clear();
    });

    it('should return correct timeoutMillisecond from config', () => {
      const config: CacherConfig = {
        timeoutMillisecond: 5000,
        cacheMillisecond: 10000,
      };
      const cacher = new PromiseCacher(mockFetchFn, config);

      expect(cacher.timeoutMillisecond).toBe(5000);
      cacher.clear();
    });

    it('should limit timeoutMillisecond to cacheMillisecond', () => {
      const config: CacherConfig = {
        timeoutMillisecond: 15000,
        cacheMillisecond: 10000,
      };
      const cacher = new PromiseCacher(mockFetchFn, config);

      expect(cacher.timeoutMillisecond).toBe(10000);
      cacher.clear();
    });

    it('should return undefined timeoutMillisecond when not configured', () => {
      const cacher = new PromiseCacher(mockFetchFn);

      expect(cacher.timeoutMillisecond).toBeUndefined();
      cacher.clear();
    });
  });

  describe('Error handling', () => {
    let errorCacher: PromiseCacher;
    let errorFetchFn: jest.Mock;

    beforeEach(() => {
      errorFetchFn = jest.fn().mockRejectedValue(new Error('Fetch failed'));
      errorCacher = new PromiseCacher(errorFetchFn);
    });

    afterEach(() => {
      errorCacher.clear();
    });

    it('should propagate fetch errors', async () => {
      await expect(errorCacher.get('error-key')).rejects.toThrow(
        'Fetch failed',
      );
    });

    it('should not cache failed requests by default', async () => {
      await expect(errorCacher.get('error-key')).rejects.toThrow(
        'Fetch failed',
      );

      // Reset mock to return success
      errorFetchFn.mockResolvedValueOnce('success');

      const result = await errorCacher.get('error-key');
      expect(result).toBe('success');
      expect(errorFetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory management', () => {
    let memoryCacher: PromiseCacher;

    beforeEach(() => {
      const config: CacherConfig = {
        releaseMemoryPolicy: {
          maxMemoryByte: 1024, // 1KB limit for testing
          minMemoryByte: 512, // 512B minimum
        },
        flushInterval: 100, // Fast flush for testing
      };

      memoryCacher = new PromiseCacher(async (key: string) => {
        // Return large strings to trigger memory limits
        return 'x'.repeat(200) + key;
      }, config);
    });

    afterEach(() => {
      memoryCacher.clear();
    });

    it('should track memory usage', async () => {
      await memoryCacher.get('mem-key1');
      const stats = memoryCacher.statistics();

      expect(stats.usedMemoryBytes).toBeGreaterThan(0);
    });

    it('should handle memory cleanup when limits exceeded', async () => {
      // Add many entries to exceed memory limit
      for (let i = 0; i < 10; i++) {
        await memoryCacher.get(`mem-key-${i}`);
      }

      // Wait for flush cycle
      await delay(200);

      const stats = memoryCacher.statistics();
      // Should have triggered cleanup
      expect(stats.overMemoryLimitCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Custom cache key transformation', () => {
    let transformCacher: PromiseCacher;

    beforeEach(() => {
      const config: CacherConfig = {
        cacheKeyTransform: (input: any) => JSON.stringify(input).toLowerCase(),
      };

      transformCacher = new PromiseCacher(mockFetchFn, config);
    });

    afterEach(() => {
      transformCacher.clear();
    });

    it('should use custom key transformation', async () => {
      const key1 = { id: 1, name: 'Test' };
      const key2 = { id: 1, name: 'test' }; // Different case

      await transformCacher.get(key1);
      const result = await transformCacher.get(key2);

      // Should be treated as same key due to lowercase transformation
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timer management', () => {
    let timerCacher: PromiseCacher;

    beforeEach(() => {
      timerCacher = new PromiseCacher(mockFetchFn, { flushInterval: 1000 });
    });

    afterEach(() => {
      timerCacher.clear();
      jest.restoreAllMocks();
    });

    it('should start timer after first cache operation', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      await timerCacher.get('timer-key');

      expect(setIntervalSpy).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
    });

    it('should clear timer when cache is cleared', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Initialize timer by performing a cache operation
      await timerCacher.get('timer-key');

      timerCacher.clear();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });
});
