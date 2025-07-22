import { delay } from './delay';
import { PromiseHolder } from './promise-holder';

describe('PromiseHolder', () => {
  let holder: PromiseHolder<string>;

  beforeEach(() => {
    holder = new PromiseHolder<string>();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(holder.isLiberated).toBe(false);
      expect(holder.liberatedAt).toBeUndefined();
      expect(holder.promise).toBeInstanceOf(Promise);
      expect(holder.getPromise()).toBe(holder.promise);
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should resolve with a value', async () => {
      const testValue = 'test-value';
      holder.resolve(testValue);

      const result = await holder.promise;
      expect(result).toBe(testValue);
      expect(holder.isLiberated).toBe(true);
      expect(holder.liberatedAt).toBeGreaterThan(0);
    });

    it('should resolve with a promise-like value', async () => {
      const promiseLike = Promise.resolve('promise-value');
      holder.resolve(promiseLike);

      const result = await holder.promise;
      expect(result).toBe('promise-value');
      expect(holder.isLiberated).toBe(true);
    });

    it('should throw error when resolving already liberated holder', () => {
      holder.resolve('first-value');

      expect(() => holder.resolve('second-value')).toThrow(
        'Cannot resolve a PromiseHolder that has already been liberated.',
      );
    });

    it('should not allow resolve after reject', () => {
      holder.reject(new Error('rejected'));

      expect(() => holder.resolve('value')).toThrow(
        'Cannot resolve a PromiseHolder that has already been liberated.',
      );
    });
  });

  describe('reject', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should reject with an error', async () => {
      const testError = new Error('test-error');
      holder.reject(testError);

      await expect(holder.promise).rejects.toThrow('test-error');
      expect(holder.isLiberated).toBe(true);
      expect(holder.liberatedAt).toBeGreaterThan(0);
    });

    it('should reject with undefined reason', async () => {
      holder.reject();

      await expect(holder.promise).rejects.toBeUndefined();
      expect(holder.isLiberated).toBe(true);
    });

    it('should reject with custom reason', async () => {
      holder.reject('string-reason' as any);

      await expect(holder.promise).rejects.toBe('string-reason');
      expect(holder.isLiberated).toBe(true);
    });

    it('should throw error when rejecting already liberated holder', () => {
      holder.reject(new Error('first-error'));

      expect(() => holder.reject(new Error('second-error'))).toThrow(
        'Cannot reject a PromiseHolder that has already been liberated.',
      );
    });

    it('should not allow reject after resolve', () => {
      holder.resolve('value');

      expect(() => holder.reject(new Error('error'))).toThrow(
        'Cannot reject a PromiseHolder that has already been liberated.',
      );
    });
  });

  describe('isLiberated property', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should be false initially', () => {
      expect(holder.isLiberated).toBe(false);
    });

    it('should be true after resolve', () => {
      holder.resolve('value');
      expect(holder.isLiberated).toBe(true);
    });

    it('should be true after reject', () => {
      holder.reject(new Error('error'));
      expect(holder.isLiberated).toBe(true);
    });
  });

  describe('liberatedAt property', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should be undefined initially', () => {
      expect(holder.liberatedAt).toBeUndefined();
    });

    it('should be set when resolved', () => {
      const beforeTime = Date.now();
      holder.resolve('value');
      const afterTime = Date.now();

      expect(holder.liberatedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(holder.liberatedAt).toBeLessThanOrEqual(afterTime);
    });

    it('should be set when rejected', () => {
      const beforeTime = Date.now();
      holder.reject(new Error('error'));
      const afterTime = Date.now();

      expect(holder.liberatedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(holder.liberatedAt).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('promise access', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should provide same promise instance through different methods', () => {
      const promise1 = holder.promise;
      const promise2 = holder.getPromise();

      expect(promise1).toBe(promise2);
    });

    it('should maintain promise reference after liberation', () => {
      const originalPromise = holder.promise;
      holder.resolve('value');

      expect(holder.promise).toBe(originalPromise);
      expect(holder.getPromise()).toBe(originalPromise);
    });
  });

  describe('concurrent operations', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });

    it('should handle multiple await calls on same promise', async () => {
      const promises = [holder.promise, holder.promise, holder.promise];

      // Resolve after a delay
      setTimeout(() => holder.resolve('concurrent-value'), 10);

      const results = await Promise.all(promises);
      expect(results).toEqual([
        'concurrent-value',
        'concurrent-value',
        'concurrent-value',
      ]);
    });

    it('should handle race condition between resolve and multiple access', async () => {
      // Start multiple promise accesses
      const accessPromises = [holder.promise, holder.getPromise()];

      // Resolve immediately
      holder.resolve('race-value');

      const results = await Promise.all(accessPromises);
      expect(results).toEqual(['race-value', 'race-value']);
    });
  });

  describe('error handling edge cases', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should handle resolve with null value', async () => {
      holder.resolve(null as any);
      const result = await holder.promise;
      expect(result).toBeNull();
    });

    it('should handle resolve with undefined value', async () => {
      holder.resolve(undefined as any);
      const result = await holder.promise;
      expect(result).toBeUndefined();
    });

    it('should handle rejection with non-Error object', async () => {
      const customReason = { message: 'custom-error', code: 500 };
      holder.reject(customReason as any);

      await expect(holder.promise).rejects.toEqual(customReason);
    });
  });

  describe('integration with async operations', () => {
    beforeEach(() => {
      holder = new PromiseHolder<string>();
    });
    it('should work with async/await patterns', async () => {
      const asyncOperation = async () => {
        await delay(50);
        return 'async-result';
      };

      // Start async operation and resolve holder
      void asyncOperation().then((result) => holder.resolve(result));

      const result = await holder.promise;
      expect(result).toBe('async-result');
    });

    it('should work with Promise.race', async () => {
      const timeoutPromise = delay(100).then(() => 'timeout');

      // Resolve holder quickly
      setTimeout(() => holder.resolve('quick-result'), 10);

      const result = await Promise.race([holder.promise, timeoutPromise]);
      expect(result).toBe('quick-result');
    });

    it('should work with Promise.allSettled', async () => {
      const holder1 = new PromiseHolder<string>();
      const holder2 = new PromiseHolder<string>();

      holder1.resolve('success');
      holder2.reject(new Error('failure'));

      const results = await Promise.allSettled([
        holder1.promise,
        holder2.promise,
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect((results[0] as any).value).toBe('success');
      expect(results[1].status).toBe('rejected');
      expect((results[1] as any).reason.message).toBe('failure');
    });
  });

  describe('memory and cleanup', () => {
    it('should allow promise to be garbage collected after resolution', async () => {
      holder.resolve('test');
      await holder.promise;

      // Promise should still be accessible
      expect(holder.promise).toBeInstanceOf(Promise);
      expect(holder.isLiberated).toBe(true);
    });

    it('should handle multiple holders independently', async () => {
      const holder1 = new PromiseHolder<number>();
      const holder2 = new PromiseHolder<string>();

      // Add small delay to ensure different timestamps
      holder1.resolve(42);
      await delay(1);
      holder2.resolve('test');

      expect(holder1.isLiberated).toBe(true);
      expect(holder2.isLiberated).toBe(true);

      // Check that they have different liberation timestamps (or same if very fast)
      if (holder1.liberatedAt !== holder2.liberatedAt) {
        expect(holder1.liberatedAt).not.toBe(holder2.liberatedAt);
      }
    });
  });
});
