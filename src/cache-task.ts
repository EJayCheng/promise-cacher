import { cloneDeep } from 'lodash';
import {
  CacheTaskStatusType,
  CalcCacheScoreFn,
  ErrorTaskPolicyType,
  ExpirationStrategyType,
} from './define';
import { PromiseCacher } from './promise-cacher';
import { calcCacheScoreDefaultFn } from './util/calc-cache-score';
import { PromiseHolder } from './util/promise-holder';
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
  private promiseHolder = new PromiseHolder<OUTPUT>();

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

  public get order(): number {
    return this.createdAt - this.usedCount * 1000;
  }

  /** Timestamp when the fetch operation started */
  public get fetchStartedAt(): number {
    return this.promiseHolder.liberatedAt;
  }

  public get queuedTime(): number {
    if (!this.createdAt || !this.fetchStartedAt) {
      return undefined;
    }
    return this.fetchStartedAt - this.createdAt;
  }

  /** Response time in milliseconds (from fetch start to resolution) */
  public get responseTime(): number {
    if (!this.resolvedAt || !this.fetchStartedAt) {
      return undefined;
    }
    return this.resolvedAt - this.fetchStartedAt;
  }

  /** Error that occurred during the async operation execution */
  private taskError: Error;

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
    _asyncOutput?: Promise<OUTPUT> | OUTPUT | Error,
  ) {
    this.setPromiseHandle();
    if (_asyncOutput instanceof Error) {
      this.promiseHolder.reject(_asyncOutput);
    } else if (_asyncOutput != undefined) {
      this.promiseHolder.resolve(_asyncOutput);
    }
  }

  public run(): void {
    if (this.promiseHolder.isLiberated) return;
    // Create timeout error message when needed
    const timeoutError = new Error(`Error CacheTask timeout: key#`);
    const task = this.cacher.fetchFn(this.input);
    this.promiseHolder.resolve(
      limitTimeout(task, this.cacher.timeoutMs, timeoutError),
    );
  }

  /**
   * Removes this cache task from the parent cacher.
   * This effectively deletes the cached entry.
   */
  private release(): void {
    this.cacher.delete(this.input);
  }

  private done(): void {
    this.cacher.consume();
  }

  /**
   * Sets up promise handlers for the async operation lifecycle.
   * Manages success/error handling, memory tracking, and cleanup.
   *
   * When an operation completes successfully, calculates the memory usage.
   * For errors, applies the configured error policy (cache or release).
   * Always updates timing metrics and triggers cleanup when done.
   *
   * @private
   */
  private setPromiseHandle(): void {
    this.promiseHolder.promise
      .then((value) => {
        this.usedBytes = sizeof(value);
      })
      .catch((error) => {
        this.taskError = error;
        if (this.cacher.errorTaskPolicy !== ErrorTaskPolicyType.CACHE) {
          // Delay release to avoid immediate cleanup during error handling
          setTimeout(() => {
            this.release();
          }, 0);
        }
      })
      .finally(() => {
        this.resolvedAt = Date.now();
        this.done();
      });
  }

  public get isExpired(): boolean {
    const now = Date.now();
    if (this.cacher.expirationStrategy === ExpirationStrategyType.IDLE) {
      if (now - this.lastAccessedAt > this.cacher.ttlMs) {
        return true;
      }
    }
    if (this.cacher.expirationStrategy === ExpirationStrategyType.EXPIRE) {
      if (now - this.resolvedAt > this.cacher.ttlMs) {
        return true;
      }
    }
    return false;
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
      this.cacher.errorTaskPolicy !== ErrorTaskPolicyType.CACHE
    ) {
      return CacheTaskStatusType.FAILED;
    }
    if (this.isExpired) {
      return CacheTaskStatusType.EXPIRED;
    }
    if (!this.fetchStartedAt) {
      return CacheTaskStatusType.QUEUED;
    }
    if (this.resolvedAt) {
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
  public async output(): Promise<OUTPUT> {
    this.usedCount++;
    this.lastAccessedAt = Date.now();
    if (this.taskError) {
      throw this.taskError;
    }
    let task: Promise<OUTPUT> = this.promiseHolder.promise;
    if (this.cacher.useClones) {
      task = task.then((output) => cloneDeep(output));
    }
    return task;
  }

  /**
   * Calculates the cache score for this task using the configured scoring method.
   * This score is used to determine which cache entries should be evicted when memory limits are exceeded.
   *
   * @returns A numeric score representing the value/priority of this cache entry
   */
  public score(): number {
    const fn: CalcCacheScoreFn =
      this.cacher?.calcCacheScoreFn || calcCacheScoreDefaultFn;
    return fn(this.cacher, this as any);
  }
}
