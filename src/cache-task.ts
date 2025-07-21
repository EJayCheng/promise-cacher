import { cloneDeep } from 'lodash';
import {
  CacherConfig,
  CacheTaskStatusType,
  CalcCacheValueMethod,
  ErrorTaskPolicyType,
  ReleaseCachePolicyType,
} from './define';
import { PromiseCacher } from './promise-cacher';
import { calcCacheScoreDefaultFn } from './util/calc-cache-score';
import { sizeof } from './util/sizeof';
import { limitTimeout } from './util/timeout';

/**
 * Represents a cache task that manages the lifecycle of a cached promise.
 * This class handles the execution, storage, and lifecycle management of asynchronous operations.
 *
 * @template OUTPUT - The type of the output value returned by the promise
 * @template INPUT - The type of the input key used to identify the cache entry
 */
export class CacheTask<OUTPUT = any, INPUT = string> {
  /** The number of bytes used by the cached output value */
  public usedBytes: number = 0;

  /** The number of times this cache entry has been accessed */
  public usedCount: number = 0;

  /** Timestamp when this cache task was created */
  public createdAt: number = Date.now();

  /** Timestamp when this cache task was last accessed */
  public lastAccessedAt: number = Date.now();

  /** Timestamp when the async operation was resolved (success or error) */
  public resolvedAt: number;

  /** Error thrown when the operation times out */
  private timeoutError = new Error(
    `Error CacheTask timeout: key#${this.safeStringify(this.input)}`,
  );

  /** Error that occurred during the async operation execution */
  private taskError: Error;

  /**
   * Safely converts input to string, handling circular references.
   *
   * @private
   * @param input - The input to stringify
   * @returns A safe string representation of the input
   */
  private safeStringify(input: any): string {
    try {
      return JSON.stringify(input);
    } catch (error) {
      // Handle circular references
      if (error instanceof TypeError && error.message.includes('circular')) {
        return '[Circular Reference]';
      }
      return String(input);
    }
  }

  /**
   * Creates a new cache task instance.
   *
   * @param cacher - The parent PromiseCacher instance that manages this task
   * @param input - The input key used to identify this cache entry
   * @param asyncOutput - The promise that will produce the cached output value
   */
  public constructor(
    private cacher: PromiseCacher<OUTPUT, INPUT>,
    public input: INPUT,
    private asyncOutput: Promise<OUTPUT>,
  ) {
    if (!(asyncOutput instanceof Promise)) {
      this.asyncOutput = Promise.resolve(this.asyncOutput);
    }
    this.asyncHandle();
  }

  /**
   * Gets the configuration object from the parent cacher.
   *
   * @returns The cacher configuration
   */
  private get config(): CacherConfig {
    return this.cacher.config;
  }

  /**
   * Removes this cache task from the parent cacher.
   * This effectively deletes the cached entry.
   */
  public release(): void {
    this.cacher.delete(this.input);
  }

  /**
   * Handles the async operation execution and manages its lifecycle.
   * Sets up promise handlers for both success and error cases.
   *
   * @private
   */
  private asyncHandle(): void {
    this.asyncOutput
      .then((value) => {
        this.usedBytes = sizeof(value);
        this.resolvedAt = Date.now();
      })
      .catch((error) => {
        this.taskError = error;
        this.resolvedAt = Date.now();
        if (this.config.errorTaskPolicy !== ErrorTaskPolicyType.CACHE) {
          this.release();
        }
      });
  }

  /**
   * Gets the current status of this cache task.
   * Determines if the task is deprecated, active, or still awaiting completion.
   *
   * @returns The current status of the cache task
   */
  public get status(): CacheTaskStatusType {
    if (
      this.taskError &&
      this.config.errorTaskPolicy !== ErrorTaskPolicyType.CACHE
    ) {
      return CacheTaskStatusType.DEPRECATED;
    }
    if (this.resolvedAt) {
      const now = Date.now();
      if (this.config.releaseCachePolicy === ReleaseCachePolicyType.IDLE) {
        if (now - this.lastAccessedAt > this.cacher.cacheMillisecond) {
          return CacheTaskStatusType.DEPRECATED;
        }
      } else {
        if (now - this.resolvedAt > this.cacher.cacheMillisecond) {
          return CacheTaskStatusType.DEPRECATED;
        }
      }
      return CacheTaskStatusType.ACTIVE;
    }
    return CacheTaskStatusType.AWAIT;
  }

  /**
   * Returns the cached output value or the promise that will resolve to it.
   * Updates access statistics and handles cloning if configured.
   *
   * @returns A promise that resolves to the cached output value
   * @throws {Error} If the task encountered an error during execution
   */
  public output(): Promise<OUTPUT> {
    this.usedCount++;
    this.lastAccessedAt = Date.now();
    if (this.taskError) {
      throw this.taskError;
    }
    let task: Promise<OUTPUT> = this.asyncOutput;
    if (this.config.useClones) {
      task = this.asyncOutput.then((output) => cloneDeep(output));
    }
    return limitTimeout(
      task,
      this.cacher.timeoutMillisecond,
      this.timeoutError,
    );
  }

  /**
   * Calculates the cache score for this task using the configured scoring method.
   * This score is used to determine which cache entries should be evicted when memory limits are exceeded.
   *
   * @returns A numeric score representing the value/priority of this cache entry
   */
  public score(): number {
    const fn: CalcCacheValueMethod =
      this.config?.releaseMemoryPolicy?.calcCacheValue ||
      calcCacheScoreDefaultFn;
    return fn(this.cacher, this as any);
  }
}
