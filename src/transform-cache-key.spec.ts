import { PromiseCacher } from './promise-cacher';

describe('TransformCacheKey - Same Key Same Cache', () => {
  let mockFetchFn: jest.Mock;
  let cacher: PromiseCacher<string, any>;

  beforeEach(() => {
    mockFetchFn = jest
      .fn()
      .mockImplementation(async (key: any) => `result-${JSON.stringify(key)}`);
    cacher = new PromiseCacher(mockFetchFn);
  });

  afterEach(() => {
    cacher.clear();
  });

  describe('Content-Based Cache Key Generation', () => {
    it('should use same cache for identical object content with different references', async () => {
      const key1 = { id: 1, name: 'test', type: 'user' };
      const key2 = { id: 1, name: 'test', type: 'user' }; // Different object, same content

      const result1 = await cacher.get(key1);
      const result2 = await cacher.get(key2);

      expect(result1).toBe(result2);
      expect(mockFetchFn).toHaveBeenCalledTimes(1); // Only called once
      expect(cacher.cacheCount).toBe(1); // Only one cache entry
    });

    it('should handle property order independence', async () => {
      const key1 = { name: 'test', id: 1, type: 'user' };
      const key2 = { id: 1, type: 'user', name: 'test' }; // Different order
      const key3 = { type: 'user', name: 'test', id: 1 }; // Another order

      const result1 = await cacher.get(key1);
      const result2 = await cacher.get(key2);
      const result3 = await cacher.get(key3);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(mockFetchFn).toHaveBeenCalledTimes(1); // Only called once
      expect(cacher.cacheCount).toBe(1); // Only one cache entry
    });

    it('should differentiate between different content', async () => {
      const key1 = { id: 1, name: 'test1' };
      const key2 = { id: 1, name: 'test2' }; // Different name
      const key3 = { id: 2, name: 'test1' }; // Different id

      await cacher.get(key1);
      await cacher.get(key2);
      await cacher.get(key3);

      expect(mockFetchFn).toHaveBeenCalledTimes(3); // Called three times
      expect(cacher.cacheCount).toBe(3); // Three cache entries
    });

    it('should handle nested object consistency', async () => {
      const key1 = {
        user: { id: 1, profile: { name: 'test', settings: { theme: 'dark' } } },
        filters: ['active', 'verified'],
      };
      const key2 = {
        filters: ['active', 'verified'],
        user: { profile: { settings: { theme: 'dark' }, name: 'test' }, id: 1 },
      };

      const result1 = await cacher.get(key1);
      const result2 = await cacher.get(key2);

      expect(result1).toBe(result2);
      expect(mockFetchFn).toHaveBeenCalledTimes(1); // Only called once
      expect(cacher.cacheCount).toBe(1); // Only one cache entry
    });

    it('should handle array order consistency', async () => {
      const key1 = { tags: ['javascript', 'typescript', 'react'] };
      const key2 = { tags: ['javascript', 'typescript', 'react'] }; // Same order

      const result1 = await cacher.get(key1);
      const result2 = await cacher.get(key2);

      expect(result1).toBe(result2);
      expect(mockFetchFn).toHaveBeenCalledTimes(1);
      expect(cacher.cacheCount).toBe(1);
    });

    it('should differentiate between different array orders', async () => {
      const key1 = { tags: ['javascript', 'typescript', 'react'] };
      const key2 = { tags: ['react', 'typescript', 'javascript'] }; // Different order

      await cacher.get(key1);
      await cacher.get(key2);

      expect(mockFetchFn).toHaveBeenCalledTimes(2); // Different arrays create different cache entries
      expect(cacher.cacheCount).toBe(2);
    });

    it('should handle primitive type consistency', async () => {
      // String keys
      await cacher.get('test-key');
      await cacher.get('test-key');
      expect(cacher.cacheCount).toBe(1);

      // Number keys
      const numberCacher = new PromiseCacher<string, number>(
        async (key: number) => `number-${key}`,
      );
      await numberCacher.get(123);
      await numberCacher.get(123);
      expect(numberCacher.cacheCount).toBe(1);
      numberCacher.clear();

      // Boolean keys
      const boolCacher = new PromiseCacher<string, boolean>(
        async (key: boolean) => `bool-${key}`,
      );
      await boolCacher.get(true);
      await boolCacher.get(true);
      expect(boolCacher.cacheCount).toBe(1);
      boolCacher.clear();
    });

    it('should handle null and undefined consistently', async () => {
      const nullUndefinedCacher = new PromiseCacher<string, any>(
        async (key: any) => `value-${key}`,
      );

      await nullUndefinedCacher.get(null);
      await nullUndefinedCacher.get(null);
      expect(nullUndefinedCacher.cacheCount).toBe(1);

      await nullUndefinedCacher.get(undefined);
      await nullUndefinedCacher.get(undefined);
      expect(nullUndefinedCacher.cacheCount).toBe(2); // null and undefined are different

      nullUndefinedCacher.clear();
    });

    it('should work with custom cacheKeyTransform configuration', async () => {
      const customCacher = new PromiseCacher(
        async (key: any) => `result-${JSON.stringify(key)}`,
        {
          cacheKeyTransform: (input: any) => {
            // Custom transform that ignores case for string values
            if (typeof input === 'string') {
              return input.toLowerCase();
            }
            if (typeof input === 'object' && input !== null) {
              const normalized = JSON.stringify(input).toLowerCase();
              return normalized;
            }
            return String(input);
          },
        },
      );

      const key1 = { Name: 'TEST', Type: 'USER' };
      const key2 = { name: 'test', type: 'user' }; // Different case

      const result1 = await customCacher.get(key1);
      const result2 = await customCacher.get(key2);

      expect(result1).toBe(result2);
      expect(customCacher.cacheCount).toBe(1); // Should use same cache due to custom transform
      customCacher.clear();
    });
  });

  describe('Performance Implications', () => {
    it('should avoid redundant fetch calls for equivalent keys', async () => {
      const performanceTracker = {
        fetchCount: 0,
        totalTime: 0,
      };

      const performanceCacher = new PromiseCacher(async (key: any) => {
        performanceTracker.fetchCount++;
        const start = Date.now();
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        performanceTracker.totalTime += Date.now() - start;
        return `result-${JSON.stringify(key)}`;
      });

      // Make multiple requests with equivalent but different object instances
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          performanceCacher.get({ id: 1, name: 'test', iteration: i % 2 }),
        );
      }

      await Promise.all(requests);

      // Should only make 2 unique fetch calls (for iteration 0 and 1)
      expect(performanceTracker.fetchCount).toBe(2);
      expect(performanceCacher.cacheCount).toBe(2);

      performanceCacher.clear();
    });
  });
});
