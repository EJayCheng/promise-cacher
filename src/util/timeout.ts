import { delay } from './delay';

/**
 * Limits the execution time of a promise with a timeout.
 * If the promise doesn't resolve within the specified timeout, it will reject with the provided error.
 *
 * @template T - The type of the promise's resolved value
 * @param task - The promise to execute with timeout limitation
 * @param timeoutMillisecond - The timeout duration in milliseconds. If undefined or <= 0, no timeout is applied
 * @param timeoutError - The error to throw when timeout occurs
 * @returns A promise that resolves with the task result or rejects with timeoutError on timeout
 *
 * @example
 * ```typescript
 * const result = await limitTimeout(
 *   fetch('/api/data'),
 *   5000,
 *   new Error('Request timeout')
 * );
 * ```
 */
export async function limitTimeout<T = any>(
  task: Promise<T>,
  timeoutMillisecond: number | undefined,
  timeoutError: Error,
): Promise<T> {
  if (timeoutMillisecond === undefined || timeoutMillisecond <= 0) {
    // No timeout configured or non-positive timeout, return task directly
    return task;
  } else {
    // Apply timeout
    const timer = delay(timeoutMillisecond, timeoutError);
    return Promise.race([task, timer]).then((res) => {
      if (res instanceof Error) {
        throw res;
      } else {
        return res;
      }
    });
  }
}
