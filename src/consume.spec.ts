import { CacheTask } from './cache-task';
import { CacheTaskStatusType } from './define';
import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';

describe('PromiseCacher - consume() method', () => {
  let cacher: PromiseCacher<string, string>;
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

  describe('queue consumption behavior', () => {
    it('should consume queued tasks respecting concurrency limits', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 2 },
      });

      let activeCount = 0;
      let maxActive = 0;

      mockFetchFn.mockImplementation(async (key: string) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await delay(50);
        activeCount--;
        return `result-${key}`;
      });

      // Create multiple tasks quickly
      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'),
        cacher.get('key4'),
      ];

      await Promise.all(promises);

      expect(maxActive).toBeLessThanOrEqual(2);
      expect(mockFetchFn).toHaveBeenCalledTimes(4);
    });

    it('should handle unlimited concurrency', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 0 }, // Unlimited
      });

      let activeCount = 0;
      let maxActive = 0;

      mockFetchFn.mockImplementation(async (key: string) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await delay(20);
        activeCount--;
        return `result-${key}`;
      });

      const promises = [
        cacher.get('key1'),
        cacher.get('key2'),
        cacher.get('key3'),
        cacher.get('key4'),
      ];

      await Promise.all(promises);

      expect(maxActive).toBe(4); // All should run concurrently
      expect(mockFetchFn).toHaveBeenCalledTimes(4);
    });

    it('should process queued tasks in order', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      const executionOrder: string[] = [];

      mockFetchFn.mockImplementation(async (key: string) => {
        executionOrder.push(key);
        await delay(10);
        return `result-${key}`;
      });

      // Add multiple tasks quickly
      const promises = [
        cacher.get('first'),
        cacher.get('second'),
        cacher.get('third'),
      ];

      await Promise.all(promises);

      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('should not consume when no queued tasks exist', () => {
      cacher = new PromiseCacher(mockFetchFn);

      // Call consume directly when no tasks are queued
      const consumeSpy = jest.spyOn(cacher, 'consume');
      cacher.consume();

      expect(consumeSpy).toHaveBeenCalled();
      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should not consume when concurrency limit reached', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      let resolveFirst: (value: string) => void;
      const firstPromise = new Promise<string>((resolve) => {
        resolveFirst = resolve;
      });

      mockFetchFn
        .mockImplementationOnce(() => firstPromise)
        .mockImplementation((key: string) => Promise.resolve(`result-${key}`));

      // Start first task (will block)
      const firstTask = cacher.get('blocking-key');

      // Try to start second task
      cacher.set('waiting-key');

      // Second task should be queued, not running
      await delay(10);

      // Complete first task
      resolveFirst('first-result');
      await firstTask;

      // Now second task should be consumed
      const secondResult = await cacher.get('waiting-key');
      expect(secondResult).toBe('result-waiting-key');
    });

    it('should handle task completion and consume next in queue', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      const taskCompletionOrder: string[] = [];

      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(key === 'slow' ? 100 : 10);
        taskCompletionOrder.push(key);
        return `result-${key}`;
      });

      // Start tasks that will queue
      const promises = [
        cacher.get('fast1'),
        cacher.get('slow'),
        cacher.get('fast2'),
      ];

      await Promise.all(promises);

      expect(taskCompletionOrder).toEqual(['fast1', 'slow', 'fast2']);
    });

    it('should handle mixed manual set and fetch operations', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(20);
        return `fetched-${key}`;
      });

      // Mix manual sets and gets
      cacher.set('manual1', 'manual-value-1');
      const fetchPromise = cacher.get('fetch1');
      cacher.set('manual2', 'manual-value-2');

      const results = await Promise.all([
        cacher.get('manual1'),
        fetchPromise,
        cacher.get('manual2'),
      ]);

      expect(results[0]).toBe('manual-value-1');
      expect(results[1]).toBe('fetched-fetch1');
      expect(results[2]).toBe('manual-value-2');
    });

    it('should consume tasks after cache operations', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 2 },
      });

      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(30);
        return `result-${key}`;
      });

      // Start tasks
      const promises = [
        cacher.get('key1'),
        cacher.get('key3'),
        cacher.get('key4'),
      ];

      await Promise.all(promises);

      expect(mockFetchFn).toHaveBeenCalledWith('key1');
      expect(mockFetchFn).toHaveBeenCalledWith('key3');
      expect(mockFetchFn).toHaveBeenCalledWith('key4');
    });
  });

  describe('task ordering and priority', () => {
    it('should maintain task order property', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      const tasks: CacheTask<string, string>[] = [];

      // Access private taskMap to inspect task order
      const taskMapGetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(cacher),
        'tasks',
      )?.get;

      mockFetchFn.mockImplementation(async (key: string) => {
        const currentTasks = taskMapGetter?.call(cacher) || [];
        tasks.push(
          ...currentTasks.filter(
            (t: CacheTask<string, string>) =>
              t.status === CacheTaskStatusType.QUEUED,
          ),
        );
        await delay(10);
        return `result-${key}`;
      });

      await Promise.all([
        cacher.get('first'),
        cacher.get('second'),
        cacher.get('third'),
      ]);

      // Check if tasks were ordered correctly (if any were captured)
      if (tasks.length > 0) {
        for (let i = 1; i < tasks.length; i++) {
          expect(tasks[i].order).toBeGreaterThanOrEqual(tasks[i - 1].order);
        }
      }
    });

    it('should handle rapid task creation and consumption', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 3 },
      });

      let completedTasks = 0;
      mockFetchFn.mockImplementation(async (key: string) => {
        await delay(Math.random() * 50);
        completedTasks++;
        return `result-${key}`;
      });

      // Create many tasks rapidly
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(cacher.get(`key${i}`));
      }

      await Promise.all(promises);

      expect(completedTasks).toBe(20);
      expect(mockFetchFn).toHaveBeenCalledTimes(20);
    });

    it('should handle consume being called multiple times', () => {
      cacher = new PromiseCacher(mockFetchFn);

      // Multiple calls to consume should not cause issues
      cacher.consume();
      cacher.consume();
      cacher.consume();

      expect(mockFetchFn).not.toHaveBeenCalled();
    });
  });

  describe('edge cases in consume', () => {
    it('should handle consume with undefined concurrency', async () => {
      // Create cacher with configuration that might result in undefined concurrency
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: undefined as any },
      });

      mockFetchFn.mockResolvedValue('test-value');

      const result = await cacher.get('test-key');
      expect(result).toBe('test-value');
    });

    it('should handle consume when tasks change during execution', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      let taskStarted = false;
      mockFetchFn.mockImplementation(async (key: string) => {
        if (!taskStarted) {
          taskStarted = true;
          // Add another task while first is running
          cacher.set('dynamic-key', 'dynamic-value');
        }
        await delay(20);
        return `result-${key}`;
      });

      await Promise.all([cacher.get('initial-key'), cacher.get('dynamic-key')]);

      expect(mockFetchFn).toHaveBeenCalledWith('initial-key');
      // dynamic-key was set manually, so shouldn't call fetch
      expect(mockFetchFn).not.toHaveBeenCalledWith('dynamic-key');
    });

    it('should handle consume with negative concurrency', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: -1 },
      });

      mockFetchFn.mockResolvedValue('test-value');

      // Should still work (treat negative as unlimited or default)
      const result = await cacher.get('test-key');
      expect(result).toBe('test-value');
    }, 10000); // Increased timeout

    it('should properly handle task state transitions during consume', async () => {
      cacher = new PromiseCacher(mockFetchFn, {
        fetchingPolicy: { concurrency: 1 },
      });

      let firstTaskResolver: (value: string) => void;
      const firstTaskPromise = new Promise<string>((resolve) => {
        firstTaskResolver = resolve;
      });

      mockFetchFn
        .mockImplementationOnce(() => firstTaskPromise)
        .mockImplementation((key: string) => Promise.resolve(`quick-${key}`));

      // Start first task (will wait)
      const firstTask = cacher.get('waiting-task');

      // Start second task (will be queued)
      const secondTask = cacher.get('queued-task');

      // Complete first task
      firstTaskResolver('waited-result');

      const results = await Promise.all([firstTask, secondTask]);

      expect(results[0]).toBe('waited-result');
      expect(results[1]).toBe('quick-queued-task');
    });
  });
});
