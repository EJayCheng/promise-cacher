import { RequestQueue } from './request-queue';

describe('RequestQueue', () => {
  let queue: RequestQueue<string, number>;

  beforeEach(() => {
    queue = new RequestQueue<string, number>();
  });

  describe('Basic Queue Operations', () => {
    it('should start empty', () => {
      expect(queue.isEmpty).toBe(true);
      expect(queue.length).toBe(0);
    });

    it('should enqueue requests and return promises', async () => {
      const promise1 = queue.enqueue('task1', 'key1');
      const promise2 = queue.enqueue('task2', 'key2');

      expect(queue.isEmpty).toBe(false);
      expect(queue.length).toBe(2);
      expect(promise1).toBeInstanceOf(Promise);
      expect(promise2).toBeInstanceOf(Promise);
    });

    it('should dequeue requests in FIFO order', () => {
      void queue.enqueue('task1', 'key1');
      void queue.enqueue('task2', 'key2');
      void queue.enqueue('task3', 'key3');

      const dequeued = queue.dequeue(2);

      expect(dequeued).toHaveLength(2);
      expect(dequeued[0].taskKey).toBe('task1');
      expect(dequeued[0].key).toBe('key1');
      expect(dequeued[1].taskKey).toBe('task2');
      expect(dequeued[1].key).toBe('key2');
      expect(queue.length).toBe(1);
    });

    it('should handle dequeue with more slots than available requests', () => {
      void queue.enqueue('task1', 'key1');

      const dequeued = queue.dequeue(5);

      expect(dequeued).toHaveLength(1);
      expect(queue.isEmpty).toBe(true);
    });

    it('should return empty array when dequeue from empty queue', () => {
      const dequeued = queue.dequeue(3);

      expect(dequeued).toHaveLength(0);
      expect(queue.isEmpty).toBe(true);
    });

    it('should return empty array when dequeue with zero or negative slots', () => {
      void queue.enqueue('task1', 'key1');

      expect(queue.dequeue(0)).toHaveLength(0);
      expect(queue.dequeue(-1)).toHaveLength(0);
      expect(queue.length).toBe(1);
    });
  });

  describe('Promise Resolution', () => {
    it('should resolve promises when dequeued requests are handled', async () => {
      const promise = queue.enqueue('task1', 'key1');
      const dequeued = queue.dequeue(1);

      // Simulate processing the request
      dequeued[0].resolve(42);

      const result = await promise;
      expect(result).toBe(42);
    });

    it('should reject promises when dequeued requests fail', async () => {
      const promise = queue.enqueue('task1', 'key1');
      const dequeued = queue.dequeue(1);

      // Simulate request failure
      const error = new Error('Test error');
      dequeued[0].reject(error);

      await expect(promise).rejects.toThrow('Test error');
    });
  });

  describe('Performance Metrics', () => {
    it('should track current queue length', () => {
      expect(queue.performanceMetrics.currentQueueLength).toBe(0);

      void queue.enqueue('task1', 'key1');
      expect(queue.performanceMetrics.currentQueueLength).toBe(1);

      void queue.enqueue('task2', 'key2');
      expect(queue.performanceMetrics.currentQueueLength).toBe(2);

      queue.dequeue(1);
      expect(queue.performanceMetrics.currentQueueLength).toBe(1);
    });

    it('should track maximum queue length reached', () => {
      expect(queue.performanceMetrics.maxQueueLengthReached).toBe(0);

      void queue.enqueue('task1', 'key1');
      expect(queue.performanceMetrics.maxQueueLengthReached).toBe(1);

      void queue.enqueue('task2', 'key2');
      void queue.enqueue('task3', 'key3');
      expect(queue.performanceMetrics.maxQueueLengthReached).toBe(3);

      queue.dequeue(2);
      expect(queue.performanceMetrics.maxQueueLengthReached).toBe(3); // Should remain at peak
    });

    it('should reset metrics when cleared', () => {
      void queue.enqueue('task1', 'key1');
      void queue.enqueue('task2', 'key2');

      expect(queue.performanceMetrics.currentQueueLength).toBe(2);
      expect(queue.performanceMetrics.maxQueueLengthReached).toBe(2);

      queue.clear();

      expect(queue.performanceMetrics.currentQueueLength).toBe(0);
      expect(queue.performanceMetrics.maxQueueLengthReached).toBe(0);
      expect(queue.isEmpty).toBe(true);
    });
  });

  describe('Peek Operation', () => {
    it('should return readonly view of queue without modifying it', () => {
      void queue.enqueue('task1', 'key1');
      void queue.enqueue('task2', 'key2');

      const peeked = queue.peek();

      expect(peeked).toHaveLength(2);
      expect(peeked[0].taskKey).toBe('task1');
      expect(peeked[1].taskKey).toBe('task2');
      expect(queue.length).toBe(2); // Queue should remain unchanged

      // Verify the returned array is frozen (readonly)
      expect(Object.isFrozen(peeked)).toBe(true);

      // Verify attempting to modify the frozen array fails silently or throws in strict mode
      expect(() => {
        (peeked as any).push({
          taskKey: 'task3',
          key: 'key3',
          resolve: () => {},
          reject: () => {},
        });
      }).toThrow();

      // Ensure original queue is unaffected
      expect(queue.length).toBe(2);
    });

    it('should return empty array when peeking empty queue', () => {
      const peeked = queue.peek();
      expect(peeked).toHaveLength(0);
    });
  });

  describe('Clear Operation', () => {
    it('should clear all queued requests', () => {
      void queue.enqueue('task1', 'key1');
      void queue.enqueue('task2', 'key2');

      expect(queue.length).toBe(2);

      queue.clear();

      expect(queue.isEmpty).toBe(true);
      expect(queue.length).toBe(0);
      expect(queue.peek()).toHaveLength(0);
    });
  });
});
