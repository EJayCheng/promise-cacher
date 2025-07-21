import { CacheTask } from './cache-task';
import {
  DefaultCacheMillisecond,
  DefaultFlushInterval,
  DefaultMaxMemoryByte,
  MinFlushInterval,
} from './constants';
import {
  CacheKeyTransformFunction,
  CacherConfig,
  CacheTaskStatusType,
  FetchByKeyMethod,
  PromiseCacherStatistics,
} from './define';
import { cacheKeyTransformDefaultFn } from './util/cache-key-transform-default-fn';
import { sizeFormat } from './util/size-format';

/**
 * A sophisticated promise caching system that provides automatic memory management,
 * configurable expiration policies, and performance monitoring.
 *
 * This class manages cached promises with features including:
 * - Automatic memory cleanup when limits are exceeded
 * - Configurable cache expiration (time-based or idle-based)
 * - Performance statistics and monitoring
 * - Timeout handling for long-running operations
 * - Error handling policies (cache or release errors)
 * - Concurrent request limiting
 * - WeakMap optimization for object keys
 *
 * @template OUTPUT - The type of values returned by cached promises
 * @template INPUT - The type of keys used to identify cache entries
 */
export class PromiseCacher<OUTPUT = any, INPUT = any> {
  /** Map storing all active cache tasks, keyed by transformed cache keys */
  private taskMap = new Map<string, CacheTask<OUTPUT, INPUT>>();

  /** WeakMap for object key references to enable garbage collection */
  private objectKeyMap = new WeakMap<object, string>();

  /** Counter tracking how many times memory limit was exceeded */
  private overMemoryLimitCount: number = 0;

  /** Total number of cache access attempts */
  private usedCount: number = 0;

  /** Total bytes of memory released through cache cleanup */
  private releasedMemoryBytes: number = 0;

  /** Timer handle for periodic cache cleanup operations */
  private timer: ReturnType<typeof setInterval>;

  /** Performance tracking */
  private performanceMetrics = {
    responseTimes: [] as number[],
    totalFetchCount: 0,
    currentConcurrentRequests: 0,
    maxConcurrentRequestsReached: 0,
    rejectedRequestsCount: 0,
  };

  /** Set to track currently running concurrent requests */
  private concurrentRequests = new Set<string>();

  /**
   * Creates a new PromiseCacher instance.
   *
   * @param fetchFn - Function that retrieves data when not found in cache
   * @param config - Configuration options for caching behavior
   */
  public constructor(
    public fetchFn: FetchByKeyMethod<OUTPUT, INPUT>,
    public config: CacherConfig = {},
  ) {}

  /**
   * Gets the maximum memory threshold in bytes.
   * When exceeded, triggers memory cleanup operations.
   *
   * @returns Maximum memory limit in bytes (default: 10MB)
   */
  private get maxMemoryMegaByte(): number {
    return (
      this.config?.releaseMemoryPolicy?.maxMemoryByte || DefaultMaxMemoryByte
    );
  }

  /**
   * Gets the minimum memory threshold in bytes.
   * Memory cleanup continues until usage drops below this level.
   *
   * @returns Minimum memory target in bytes (default: half of max memory)
   */
  private get minMemoryByte(): number {
    const value = this.config?.releaseMemoryPolicy?.minMemoryByte;
    if (value && value < this.maxMemoryMegaByte) return value;
    return this.maxMemoryMegaByte / 2;
  }

  /**
   * Gets the interval for periodic cache cleanup operations.
   *
   * @returns Flush interval in milliseconds (minimum: MinFlushInterval)
   */
  private get flushInterval(): number {
    if (!this.config.flushInterval) return DefaultFlushInterval;
    return Math.max(MinFlushInterval, this.config.flushInterval);
  }

  /**
   * Gets the cache expiration time in milliseconds.
   *
   * @returns Cache duration in milliseconds
   */
  public get cacheMillisecond(): number {
    return this.config.cacheMillisecond || DefaultCacheMillisecond;
  }

  /**
   * Gets the timeout limit for fetch operations.
   * The timeout cannot exceed the cache duration.
   *
   * @returns Timeout in milliseconds, or undefined if not configured
   */
  public get timeoutMillisecond(): number | undefined {
    if (this.config.timeoutMillisecond !== undefined) {
      return Math.min(this.cacheMillisecond, this.config.timeoutMillisecond);
    }
    return undefined;
  }

  /**
   * Gets all cache tasks as an array.
   *
   * @returns Array of all cache tasks
   */
  private get tasks(): CacheTask<OUTPUT, INPUT>[] {
    return Array.from(this.taskMap.values());
  }

  /**
   * Calculates total memory usage across all cache tasks.
   *
   * @returns Total memory usage in bytes
   */
  private get usedMemoryBytes(): number {
    return this.tasks.reduce((total, task) => total + task.usedBytes, 0);
  }

  /**
   * Transforms an input key into a string cache key using the configured transform function.
   * Uses WeakMap for object keys to enable better garbage collection.
   *
   * @param key - The input key to transform
   * @returns String representation of the cache key
   */
  private transformCacheKey(key: INPUT): string {
    const fn: CacheKeyTransformFunction =
      this.config.cacheKeyTransform || cacheKeyTransformDefaultFn;

    // If using custom transformation, trust the function's output for equality
    if (this.config.cacheKeyTransform) {
      return fn(key);
    }

    // For default transformation with object keys, use WeakMap for better memory management
    if (typeof key === 'object' && key !== null) {
      const existing = this.objectKeyMap.get(key);
      if (existing) {
        return existing;
      }

      // Add object identity to make each object instance unique for default transform
      const transformedKey = fn(key);
      const uniqueKey = `${transformedKey}_${Math.random().toString(36)}`;
      this.objectKeyMap.set(key, uniqueKey);
      return uniqueKey;
    }

    return fn(key);
  }

  /**
   * Retrieves a cached value or fetches it if not available.
   * This is the primary method for accessing cached data.
   *
   * @param key - The key to identify the cached item
   * @param forceUpdate - If true, bypasses cache and fetches fresh data
   * @returns Promise resolving to the cached or freshly fetched value
   */
  public async get(key: INPUT, forceUpdate: boolean = false): Promise<OUTPUT> {
    this.usedCount++;
    const taskKey = this.transformCacheKey(key);

    if (forceUpdate) {
      this.taskMap.delete(taskKey);
      this.concurrentRequests.delete(taskKey);
    }

    const isExist = this.taskMap.has(taskKey);
    let task: CacheTask<OUTPUT, INPUT>;

    if (isExist) {
      task = this.taskMap.get(taskKey);
      if (task.status === CacheTaskStatusType.DEPRECATED) {
        task.release();
        task = null;
        this.concurrentRequests.delete(taskKey);
      }
    }

    if (!task) {
      // Check concurrent request limit
      const maxConcurrent = this.config.maxConcurrentRequests;
      if (
        maxConcurrent &&
        maxConcurrent > 0 &&
        this.concurrentRequests.size >= maxConcurrent
      ) {
        this.performanceMetrics.rejectedRequestsCount++;
        throw new Error(
          `Maximum concurrent requests limit reached: ${maxConcurrent}`,
        );
      }

      // Track concurrent request
      this.concurrentRequests.add(taskKey);
      this.performanceMetrics.currentConcurrentRequests =
        this.concurrentRequests.size;
      this.performanceMetrics.maxConcurrentRequestsReached = Math.max(
        this.performanceMetrics.maxConcurrentRequestsReached,
        this.concurrentRequests.size,
      );
      this.performanceMetrics.totalFetchCount++;

      // Create wrapped fetch function that handles concurrency tracking
      const wrappedFetch = this.fetchFn(key).finally(() => {
        this.concurrentRequests.delete(taskKey);
        this.performanceMetrics.currentConcurrentRequests =
          this.concurrentRequests.size;
      });

      task = new CacheTask(this, key, wrappedFetch);
      this.taskMap.set(taskKey, task);
      // Only set timer when creating new tasks to reduce unnecessary calls
      this.setTimer();
    }

    const result = await task.output();

    // Track performance metrics
    if (task.responseTime) {
      this.performanceMetrics.responseTimes.push(task.responseTime);
      // Keep only last 1000 response times for memory efficiency
      if (this.performanceMetrics.responseTimes.length > 1000) {
        this.performanceMetrics.responseTimes =
          this.performanceMetrics.responseTimes.slice(-1000);
      }
    }

    return result;
  }

  /**
   * Initializes the periodic cleanup timer if not already running.
   * The timer triggers cache maintenance operations at regular intervals.
   */
  private setTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Manually sets a value in the cache without triggering the fetch function.
   * Useful for pre-populating cache or updating existing entries.
   *
   * @param key - The key to associate with the cached value
   * @param value - The value or promise to cache
   */
  public set(key: INPUT, value: OUTPUT | Promise<OUTPUT>): void {
    const promiseValue =
      value instanceof Promise ? value : Promise.resolve(value);
    const taskKey = this.transformCacheKey(key);
    const task = new CacheTask(this, key, promiseValue);
    this.taskMap.set(taskKey, task);
  }

  /**
   * Removes a specific entry from the cache.
   * Updates memory usage statistics when an entry is deleted.
   *
   * @param key - The key of the entry to remove
   */
  public delete(key: INPUT): void {
    const taskKey = this.transformCacheKey(key);
    if (this.taskMap.has(taskKey)) {
      this.releasedMemoryBytes += this.taskMap.get(taskKey).usedBytes;
    }
    this.taskMap.delete(taskKey);
    this.concurrentRequests.delete(taskKey);
  }

  /**
   * Checks if a key exists in the cache.
   *
   * @param key - The key to check for existence
   * @returns True if the key exists in cache, false otherwise
   */
  public has(key: INPUT): boolean {
    const taskKey = this.transformCacheKey(key);
    return this.taskMap.has(taskKey);
  }

  /**
   * Removes all entries from the cache and stops the cleanup timer.
   * This effectively resets the cache to an empty state.
   */
  public clear(): void {
    this.taskMap.clear();
    this.concurrentRequests.clear();
    this.performanceMetrics = {
      responseTimes: [],
      totalFetchCount: 0,
      currentConcurrentRequests: 0,
      maxConcurrentRequestsReached: 0,
      rejectedRequestsCount: 0,
    };
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined as any;
    }
  }

  /**
   * Returns all cached keys.
   *
   * @returns Array of input keys currently in the cache
   */
  public keys(): INPUT[] {
    return this.tasks.map((task) => task.input);
  }

  /**
   * Gets the current number of cached entries.
   *
   * @returns Number of items currently in cache
   */
  public get cacheCount(): number {
    return this.taskMap.size;
  }

  /**
   * Provides comprehensive statistics about cache performance and usage.
   *
   * @returns Object containing detailed cache statistics
   */
  public statistics(): PromiseCacherStatistics {
    const usedCounts = this.tasks.map((t) => t.usedCount);
    const responseTimes = this.performanceMetrics.responseTimes;

    // Calculate performance metrics
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) /
          responseTimes.length
        : 0;
    const minResponseTime =
      responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime =
      responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

    // Handle empty cache case for usedCounts
    const maxUsedCount = usedCounts.length > 0 ? Math.max(...usedCounts) : 0;
    const minUsedCount = usedCounts.length > 0 ? Math.min(...usedCounts) : 0;
    const avgUsedCount =
      this.cacheCount > 0 ? this.usedCount / this.cacheCount : 0;

    return {
      cacheCount: this.cacheCount,
      usedMemory: sizeFormat(this.usedMemoryBytes),
      usedMemoryBytes: this.usedMemoryBytes,
      usedCountTotal: this.usedCount,
      maxUsedCount,
      minUsedCount,
      avgUsedCount,
      overMemoryLimitCount: this.overMemoryLimitCount,
      releasedMemoryBytes: this.releasedMemoryBytes,
      performance: {
        avgResponseTime,
        minResponseTime,
        maxResponseTime,
        totalFetchCount: this.performanceMetrics.totalFetchCount,
        currentConcurrentRequests:
          this.performanceMetrics.currentConcurrentRequests,
        maxConcurrentRequestsReached:
          this.performanceMetrics.maxConcurrentRequestsReached,
        rejectedRequestsCount: this.performanceMetrics.rejectedRequestsCount,
      },
    };
  }

  /**
   * Performs periodic maintenance operations including:
   * - Removing deprecated cache tasks
   * - Triggering memory cleanup if usage exceeds limits
   */
  private flush(): void {
    this.tasks
      .filter((task) => task.status === CacheTaskStatusType.DEPRECATED)
      .forEach((task) => task.release());

    if (
      this.usedMemoryBytes > this.maxMemoryMegaByte ||
      (this.maxMemoryMegaByte === 0 && this.usedMemoryBytes > 0)
    ) {
      this.overMemoryLimitCount++;
      this.flushMemory(this.usedMemoryBytes - this.minMemoryByte);
    }
  }

  /**
   * Performs intelligent memory cleanup by removing the least valuable cache entries.
   * Uses a scoring algorithm to determine which entries to remove first.
   *
   * @param releaseMemoryBytes - Target amount of memory to free in bytes
   */
  private flushMemory(releaseMemoryBytes: number): void {
    const list = this.tasks
      .filter((task) => task.status === CacheTaskStatusType.ACTIVE)
      .map((task) => {
        return { task, score: task.score() };
      })
      .slice()
      .sort((a, b) => a.score - b.score);
    for (const { task } of list) {
      releaseMemoryBytes -= task.usedBytes;
      task.release();
      if (releaseMemoryBytes <= 0) break;
    }
  }
}
