import { CacherConfig } from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('Enhanced PromiseCacher Features', () => {
  let cacher: PromiseCacher<string, string>;

  afterEach(() => {
    if (cacher) {
      cacher.clear();
    }
    jest.restoreAllMocks();
  });

  describe('Concurrent Request Limiting', () => {
    beforeEach(() => {
      const config: CacherConfig = {
        maxConcurrentRequests: 2,
      };

      cacher = new PromiseCacher(async (key: string) => {
        await delay(100); // Simulate async work
        return `result-${key}`;
      }, config);
    });

    it('should limit concurrent requests', async () => {
      // Start 3 concurrent requests
      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'), // This should be rejected
      ];

      // The third request should be rejected
      await expect(promises[2]).rejects.toThrow(
        'Maximum concurrent requests limit reached: 2',
      );

      // The first two should succeed
      const results = await Promise.allSettled(promises.slice(0, 2));
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
    });

    it('should track concurrent request statistics', async () => {
      const promise1 = cacher.get('key1');
      const stats1 = cacher.statistics();
      expect(stats1.performance.currentConcurrentRequests).toBe(1);

      const promise2 = cacher.get('key2');
      const stats2 = cacher.statistics();
      expect(stats2.performance.currentConcurrentRequests).toBe(2);

      await Promise.all([promise1, promise2]);
      const stats3 = cacher.statistics();
      expect(stats3.performance.currentConcurrentRequests).toBe(0);
      expect(stats3.performance.maxConcurrentRequestsReached).toBe(2);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(async (key: string) => {
        const delay_time = key === 'slow' ? 200 : 50;
        await delay(delay_time);
        return `result-${key}`;
      });
    });

    it('should track response times', async () => {
      await cacher.get('fast1');
      await cacher.get('slow');
      await cacher.get('fast2');

      const stats = cacher.statistics();
      expect(stats.performance.totalFetchCount).toBe(3);
      expect(stats.performance.avgResponseTime).toBeGreaterThan(0);
      expect(stats.performance.minResponseTime).toBeGreaterThan(0);
      expect(stats.performance.maxResponseTime).toBeGreaterThan(
        stats.performance.minResponseTime,
      );
    });

    it('should provide comprehensive performance statistics', async () => {
      await cacher.get('test-key');

      const stats = cacher.statistics();
      expect(stats.performance).toEqual(
        expect.objectContaining({
          avgResponseTime: expect.any(Number),
          minResponseTime: expect.any(Number),
          maxResponseTime: expect.any(Number),
          totalFetchCount: expect.any(Number),
          currentConcurrentRequests: expect.any(Number),
          maxConcurrentRequestsReached: expect.any(Number),
          rejectedRequestsCount: expect.any(Number),
        }),
      );
    });
  });

  describe('WeakMap Optimization', () => {
    let objectCacher: PromiseCacher<string, any>;

    beforeEach(() => {
      objectCacher = new PromiseCacher(async (key: any) => {
        return `result-${JSON.stringify(key)}`;
      });
    });

    afterEach(() => {
      if (objectCacher) {
        objectCacher.clear();
      }
      jest.restoreAllMocks();
    });

    it('should handle object keys efficiently', async () => {
      const objKey1 = { id: 1, name: 'test' };
      const objKey2 = { id: 2, name: 'test2' };

      await objectCacher.get(objKey1);
      await objectCacher.get(objKey2);

      // Get the same object key again - should use cached result
      const result = await objectCacher.get(objKey1);

      expect(result).toBe('result-{"id":1,"name":"test"}');
      expect(objectCacher.cacheCount).toBe(2);
    });

    it('should work with string keys as before', async () => {
      await objectCacher.get('string-key');
      const result = await objectCacher.get('string-key');

      expect(result).toBe('result-"string-key"');
      expect(objectCacher.cacheCount).toBe(1);
    });
  });

  describe('Memory Efficiency', () => {
    beforeEach(() => {
      cacher = new PromiseCacher(async (key: string) => {
        return `result-${key}`;
      });
    });

    it('should limit response time history for memory efficiency', async () => {
      // Create many requests to test response time array limiting
      for (let i = 0; i < 1050; i++) {
        await cacher.get(`key-${i}`);
      }

      const stats = cacher.statistics();
      // The response times array should be limited to 1000 entries
      expect(stats.performance.totalFetchCount).toBe(1050);
      // We can't directly check the array length, but we can check that performance is still calculated
      expect(stats.performance.avgResponseTime).toBeGreaterThan(0);
    });
  });

  describe('Enhanced Clear Method', () => {
    beforeEach(() => {
      const config: CacherConfig = {
        maxConcurrentRequests: 5,
      };

      cacher = new PromiseCacher(async (key: string) => {
        return `result-${key}`;
      }, config);
    });

    it('should reset performance metrics when cleared', async () => {
      await cacher.get('test1');
      await cacher.get('test2');

      let stats = cacher.statistics();
      expect(stats.performance.totalFetchCount).toBe(2);

      cacher.clear();

      stats = cacher.statistics();
      expect(stats.cacheCount).toBe(0);
      expect(stats.performance.totalFetchCount).toBe(0);
      expect(stats.performance.currentConcurrentRequests).toBe(0);
      expect(stats.performance.maxConcurrentRequestsReached).toBe(0);
      expect(stats.performance.rejectedRequestsCount).toBe(0);
    });
  });
});
