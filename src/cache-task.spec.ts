import { CacheTask } from './cache-task';
import {
  CacheTaskStatusType,
  ErrorTaskPolicyType,
  ExpirationStrategyType,
} from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('CacheTask', () => {
  let cacher: PromiseCacher<any, string>;
  let mockFetchFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchFn = jest.fn();
    cacher = new PromiseCacher(mockFetchFn, {
      cachePolicy: {
        ttlMs: 1000,
        expirationStrategy: ExpirationStrategyType.EXPIRE,
        errorTaskPolicy: ErrorTaskPolicyType.IGNORE,
      },
      fetchingPolicy: {
        useClones: false,
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      expect(task.usedBytes).toBe(0);
      expect(task.usedCount).toBe(0);
      expect(task.input).toBe('test-key');
      expect(task.createdAt).toBeGreaterThan(0);
      expect(task.lastAccessedAt).toBeGreaterThan(0);
      expect(task.resolvedAt).toBeUndefined();
    });

    it('should convert non-promise values to promises', () => {
      const task = new CacheTask(cacher, 'test-key', 'direct-value' as any);
      expect(task.output()).toBeInstanceOf(Promise);
    });
  });

  describe('status', () => {
    it('should return "await" when task is not resolved', () => {
      const promise = new Promise(() => {}); // Never resolves
      const task = new CacheTask(cacher, 'test-key', promise);

      expect(task.status).toBe(CacheTaskStatusType.AWAIT);
    });

    it('should return "active" when task is resolved and not expired', async () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      await delay(10); // Allow task to resolve
      expect(task.status).toBe(CacheTaskStatusType.ACTIVE);
    });

    it('should return "expired" when task is expired (EXPIRE policy)', async () => {
      const shortCacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          ttlMs: 10,
          expirationStrategy: ExpirationStrategyType.EXPIRE,
        },
      });
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(shortCacher, 'test-key', promise);

      await delay(15); // Wait for expiration
      expect(task.status).toBe(CacheTaskStatusType.EXPIRED);
    });

    it('should return "expired" when task is idle too long (IDLE policy)', async () => {
      const idleCacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          ttlMs: 10,
          expirationStrategy: ExpirationStrategyType.IDLE,
        },
      });
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(idleCacher, 'test-key', promise);

      await delay(5); // Allow task to resolve
      await delay(15); // Wait for idle expiration
      expect(task.status).toBe(CacheTaskStatusType.EXPIRED);
    });

    it('should return "failed" when task has error and errorTaskPolicy is IGNORE', async () => {
      const errorCacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          expirationStrategy: ExpirationStrategyType.EXPIRE,
          errorTaskPolicy: ErrorTaskPolicyType.IGNORE,
        },
      });
      const promise = Promise.reject(new Error('Test error'));
      const task = new CacheTask(errorCacher, 'test-key', promise);

      await delay(10); // Allow error to be caught
      expect(task.status).toBe(CacheTaskStatusType.FAILED);
    });

    it('should return "active" when task has error but errorTaskPolicy is CACHE', async () => {
      const errorCacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          expirationStrategy: ExpirationStrategyType.EXPIRE,
          errorTaskPolicy: ErrorTaskPolicyType.CACHE,
          ttlMs: 1000,
        },
      });
      const promise = Promise.reject(new Error('Test error'));
      const task = new CacheTask(errorCacher, 'test-key', promise);

      await delay(10); // Allow error to be caught
      expect(task.status).toBe(CacheTaskStatusType.ACTIVE);
    });
  });

  describe('output', () => {
    it('should return the cached value', async () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      const result = await task.output();
      expect(result).toBe('test-output');
    });

    it('should increment usedCount on each call', async () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      expect(task.usedCount).toBe(0);

      await task.output();
      expect(task.usedCount).toBe(1);

      await task.output();
      expect(task.usedCount).toBe(2);
    });

    it('should update lastAccessedAt on each call', async () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);
      await delay(5);

      await task.output();
      expect(task.lastAccessedAt).toBeDefined();
    });

    it('should return cloned output when useClones is true', async () => {
      const cloneCacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: {
          useClones: true,
        },
      });
      const originalObject = { value: 'test', nested: { prop: 'data' } };
      const promise = Promise.resolve(originalObject);
      const task = new CacheTask(cloneCacher, 'test-key', promise);

      const result = await task.output();

      // Should be deep equal but not the same reference
      expect(result).toEqual(originalObject);
      expect(result).not.toBe(originalObject);

      // Modifying result should not affect original
      result.value = 'modified';
      expect(originalObject.value).toBe('test');
    });
  });

  describe('score', () => {
    it('should return score using default calculation', () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      const score = task.score();
      expect(typeof score).toBe('number');
    });

    it('should use custom calc function when provided', () => {
      const customCalc = jest.fn().mockReturnValue(999);
      const customCacher = new PromiseCacher(mockFetchFn, {
        freeUpMemoryPolicy: {
          calcCacheScoreFn: customCalc,
        },
      });
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(customCacher, 'test-key', promise);

      const score = task.score();

      expect(customCalc).toHaveBeenCalledWith(customCacher, task);
      expect(score).toBe(999);
    });
  });

  describe('async handling', () => {
    it('should update usedBytes when promise resolves', async () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      expect(task.usedBytes).toBe(0);

      await delay(10); // Allow promise to resolve
      expect(task.usedBytes).toBeGreaterThan(0);
      expect(task.resolvedAt).toBeGreaterThan(0);
    });

    it('should set resolvedAt when promise resolves', async () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, 'test-key', promise);

      expect(task.resolvedAt).toBeUndefined();

      await delay(10); // Allow promise to resolve
      expect(task.resolvedAt).toBeGreaterThan(0);
    });

    it('should handle errors and set resolvedAt', async () => {
      const promise = Promise.reject(new Error('Test error'));
      const task = new CacheTask(cacher, 'test-key', promise);

      expect(task.resolvedAt).toBeUndefined();

      await delay(10); // Allow error to be caught
      expect(task.resolvedAt).toBeGreaterThan(0);
    });

    it('should call releaseSelf when error occurs and errorTaskPolicy is IGNORE', async () => {
      const releaseCacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          expirationStrategy: ExpirationStrategyType.EXPIRE,
          errorTaskPolicy: ErrorTaskPolicyType.IGNORE,
        },
      });
      const deleteSpy = jest.spyOn(releaseCacher, 'delete');
      const promise = Promise.reject(new Error('Test error'));
      const task = new CacheTask(releaseCacher, 'test-key', promise);

      await delay(10); // Allow error to be caught

      expect(deleteSpy).toHaveBeenCalledWith('test-key');
    });

    it('should not call releaseSelf when error occurs and errorTaskPolicy is CACHE', async () => {
      const cacheCacher = new PromiseCacher(mockFetchFn, {
        cachePolicy: {
          expirationStrategy: ExpirationStrategyType.EXPIRE,
          errorTaskPolicy: ErrorTaskPolicyType.CACHE,
        },
      });
      const deleteSpy = jest.spyOn(cacheCacher, 'delete');
      const promise = Promise.reject(new Error('Test error'));
      const task = new CacheTask(cacheCacher, 'test-key', promise);

      await delay(10); // Allow error to be caught

      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined/null inputs gracefully', () => {
      const promise = Promise.resolve('test-output');
      const task = new CacheTask(cacher, null as any, promise);

      expect(task.input).toBe(null);
      expect(() => task.score()).not.toThrow();
    });

    it('should handle large objects', async () => {
      const largeObject = { data: 'x'.repeat(1000000) }; // 1MB string
      const promise = Promise.resolve(largeObject);
      const task = new CacheTask(cacher, 'large-key', promise);

      await delay(10); // Allow promise to resolve
      expect(task.usedBytes).toBeGreaterThan(1000000);
    });

    it('should handle circular references in error messages', () => {
      const circularInput: any = { ref: null };
      circularInput.ref = circularInput;

      expect(() => {
        new CacheTask(cacher, circularInput, Promise.resolve('test'));
      }).not.toThrow();
    });
  });
});
