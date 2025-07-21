import {
  CacherConfig,
  ErrorTaskPolicyType,
  ReleaseCachePolicyType,
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

  describe('Basic Edge Cases', () => {
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

    it('should handle basic data types as keys', async () => {
      const multiCacher = new PromiseCacher<string, any>(async (key: any) => {
        return `result-${typeof key}`;
      });

      await multiCacher.get(123);
      await multiCacher.get(true);
      await multiCacher.get(new Date());

      expect(multiCacher.cacheCount).toBe(3);
      multiCacher.clear();
    });
  });

  describe('Concurrent Request Limiting', () => {
    beforeEach(() => {
      const config: CacherConfig = {
        maxConcurrentRequests: 2,
      };

      cacher = new PromiseCacher(async (key: string) => {
        await delay(50);
        return `result-${key}`;
      }, config);
    });

    it('should queue requests when concurrent limit is reached', async () => {
      // Start 3 requests but only 2 are allowed to run concurrently
      const startTime = Date.now();

      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'), // This should be queued instead of rejected
      ];

      const results = await Promise.allSettled(promises);

      // All requests should eventually succeed (no rejections due to queuing)
      const rejectedCount = results.filter(
        (r) => r.status === 'rejected',
      ).length;
      const successCount = results.filter(
        (r) => r.status === 'fulfilled',
      ).length;

      // All 3 should succeed since they get queued instead of rejected
      expect(successCount).toBe(3);
      expect(rejectedCount).toBe(0);
    });

    it('should track concurrent request statistics', async () => {
      const promise1 = cacher.get('key1');

      // Check stats while request is in flight
      await delay(10);
      const stats1 = cacher.statistics();
      expect(stats1.performance.currentConcurrentRequests).toBeGreaterThan(0);

      await promise1;
      const stats2 = cacher.statistics();
      expect(stats2.performance.currentConcurrentRequests).toBe(0);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(async (key: string) => {
        const delay_time = key === 'slow' ? 100 : 20;
        await delay(delay_time);
        return `result-${key}`;
      });
    });

    it('should track response times accurately', async () => {
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
      };

      mockFetchFn
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce('Success');

      cacher = new PromiseCacher(mockFetchFn, config);

      await expect(cacher.get('error-key')).rejects.toThrow('First error');

      // Wait for error handling to complete
      await delay(10);
      expect(cacher.has('error-key')).toBe(false);

      // Second call should trigger fetchFn again
      const result = await cacher.get('error-key');
      expect(result).toBe('Success');
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Expiration Policies', () => {
    it('should expire cache based on time (EXPIRE policy)', async () => {
      const config: CacherConfig = {
        cacheMillisecond: 50,
        releaseCachePolicy: ReleaseCachePolicyType.EXPIRE,
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

      expect(result1).not.toBe(result2);
      expect(mockFetchFn).toHaveBeenCalledTimes(2);
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

    it('should handle different object instances with identical content', async () => {
      const objCacher = new PromiseCacher<string, any>(
        async (key: any) => `result-${JSON.stringify(key)}`,
      );

      const objKey1 = { id: 1, name: 'test' };
      const objKey2 = { id: 1, name: 'test' }; // Different instance, same content

      await objCacher.get(objKey1);
      await objCacher.get(objKey2);

      // Same content objects should share the same cache entry
      expect(objCacher.cacheCount).toBe(1);
      objCacher.clear();
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
      expect(result1).not.toBe(result2);

      // Modifying one should not affect others
      result1.value = 'modified';
      expect(result2.value).toBe('original');
      expect(originalObject.value).toBe('original');

      cloneCacher.clear();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle reasonable configuration values', async () => {
      const config: CacherConfig = {
        cacheMillisecond: 1000,
        flushInterval: 500,
        timeoutMillisecond: 100,
        maxConcurrentRequests: 5,
      };

      cacher = new PromiseCacher(async () => 'result', config);

      const result = await cacher.get('test');
      expect(result).toBe('result');
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
});
