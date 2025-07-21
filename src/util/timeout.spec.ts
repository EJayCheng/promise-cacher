import { limitTimeout } from './timeout';

describe('limitTimeout', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should resolve with task result when task completes before timeout', async () => {
    const expectedResult = 'success';
    const task = Promise.resolve(expectedResult);
    const timeoutError = new Error('Timeout');

    const promise = limitTimeout(task, 1000, timeoutError);

    // Fast-forward time but task should already be resolved
    jest.advanceTimersByTime(500);

    const result = await promise;
    expect(result).toBe(expectedResult);
  });

  it('should reject with timeout error when task takes longer than timeout', async () => {
    const timeoutError = new Error('Request timeout');
    const task = new Promise((resolve) => {
      setTimeout(() => resolve('late result'), 2000);
    });

    const promise = limitTimeout(task, 1000, timeoutError);

    // Fast-forward past the timeout
    jest.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow('Request timeout');
  });

  it('should return task directly when timeout is 0', async () => {
    const expectedResult = 'no timeout';
    const task = Promise.resolve(expectedResult);
    const timeoutError = new Error('Should not timeout');

    const result = await limitTimeout(task, 0, timeoutError);
    expect(result).toBe(expectedResult);
  });

  it('should return task directly when timeout is negative', async () => {
    const expectedResult = 'negative timeout';
    const task = Promise.resolve(expectedResult);
    const timeoutError = new Error('Should not timeout');

    const result = await limitTimeout(task, -100, timeoutError);
    expect(result).toBe(expectedResult);
  });

  it('should handle task that rejects before timeout', async () => {
    const taskError = new Error('Task failed');
    const task = Promise.reject(taskError);
    const timeoutError = new Error('Timeout');

    const promise = limitTimeout(task, 1000, timeoutError);

    await expect(promise).rejects.toThrow('Task failed');
  });

  it('should handle async task that completes just before timeout', async () => {
    const expectedResult = 'just in time';
    const task = new Promise<string>((resolve) => {
      setTimeout(() => resolve(expectedResult), 999);
    });
    const timeoutError = new Error('Timeout');

    const promise = limitTimeout(task, 1000, timeoutError);

    // Advance to just before timeout
    jest.advanceTimersByTime(999);

    const result = await promise;
    expect(result).toBe(expectedResult);
  });

  it('should handle async task that times out by 1ms', async () => {
    const task = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 1001);
    });
    const timeoutError = new Error('Timeout by 1ms');

    const promise = limitTimeout(task, 1000, timeoutError);

    // Advance past timeout - the delay timer should resolve first
    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('Timeout by 1ms');
  });

  it('should work with different promise types', async () => {
    // Test with number
    const numberTask = Promise.resolve(42);
    const numberResult = await limitTimeout(
      numberTask,
      1000,
      new Error('Timeout'),
    );
    expect(numberResult).toBe(42);

    // Test with object
    const objectTask = Promise.resolve({ id: 1, name: 'test' });
    const objectResult = await limitTimeout(
      objectTask,
      1000,
      new Error('Timeout'),
    );
    expect(objectResult).toEqual({ id: 1, name: 'test' });

    // Test with array
    const arrayTask = Promise.resolve([1, 2, 3]);
    const arrayResult = await limitTimeout(
      arrayTask,
      1000,
      new Error('Timeout'),
    );
    expect(arrayResult).toEqual([1, 2, 3]);
  });

  it('should preserve original error details when task rejects', async () => {
    const originalError = new Error('Original error message');
    originalError.stack = 'Original stack trace';
    const task = Promise.reject(originalError);
    const timeoutError = new Error('Timeout');

    try {
      await limitTimeout(task, 1000, timeoutError);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBe(originalError);
      expect(error.message).toBe('Original error message');
      expect(error.stack).toBe('Original stack trace');
    }
  });
});
