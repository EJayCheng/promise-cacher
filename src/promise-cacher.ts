import { CacheTask } from './cache-task';
import {
  DefaultConcurrency,
  DefaultFlushIntervalMs,
  DefaultMaxMemoryBytes,
  DefaultTtlMs,
  MinFlushIntervalMs,
} from './constants';
import {
  CacherConfig,
  CacheTaskStatusType,
  CalcCacheScoreFn,
  ErrorTaskPolicyType,
  ExpirationStrategyType,
  FetchByKeyMethod,
  PerformanceMetrics,
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
 *
 * @template OUTPUT - The type of values returned by cached promises
 * @template INPUT - The type of keys used to identify cache entries
 */
export class PromiseCacher<OUTPUT = any, INPUT = any> {
  /** Map storing all active cache tasks, keyed by transformed cache keys */
  private taskMap = new Map<string, CacheTask<OUTPUT, INPUT>>();

  /** Timer handle for periodic cache cleanup operations */
  private timer: ReturnType<typeof setInterval>;

  /** Performance and usage tracking */
  private performanceMetrics: PerformanceMetrics = {
    responseTimes: [],
    totalFetchCount: 0,
    currentConcurrentRequests: 0,
    maxConcurrentRequestsReached: 0,
    rejectedRequestsCount: 0,
    overMemoryLimitCount: 0,
    usedCount: 0,
    releasedMemoryBytes: 0,
  };

  /** Pre-computed configuration values for optimal performance */
  private readonly computedConfig: {
    flushInterval: number;
    ttlMs: number;
    timeoutMs: number;
    maxMemoryBytes: number;
    minMemoryBytes: number;
  };

  /**
   * Creates a new PromiseCacher instance.
   *
   * @param fetchFn - Function that retrieves data when not found in cache
   * @param config - Configuration options for caching behavior
   */
  public constructor(
    public fetchFn: FetchByKeyMethod<OUTPUT, INPUT>,
    public config: CacherConfig = {},
  ) {
    this.computedConfig = this.computeOptimizedConfig();
    this.setTimer();
  }

  /**
   * Computes and optimizes configuration values for better performance.
   * Pre-calculates frequently used config values to avoid repeated computations.
   *
   * @returns Pre-computed configuration object with optimized values
   */
  private computeOptimizedConfig() {
    const memoryConfig = this.computeMemoryConfiguration();
    const timingConfig = this.computeTimingConfiguration();

    return {
      ...memoryConfig,
      ...timingConfig,
    };
  }

  /**
   * Computes memory-related configuration values.
   * Ensures minMemoryByte is always valid and less than maxMemoryByte.
   *
   * @returns Memory configuration with maxMemoryByte and minMemoryByte
   */
  private computeMemoryConfiguration() {
    const maxMemoryBytes =
      this.config?.freeUpMemoryPolicy?.maxMemoryBytes ?? DefaultMaxMemoryBytes;

    const userMinMemoryByte = this.config?.freeUpMemoryPolicy?.minMemoryBytes;

    // Ensure minMemoryByte is valid: defined, positive, and less than maxMemoryByte
    const minMemoryBytes =
      userMinMemoryByte !== undefined &&
      userMinMemoryByte > 0 &&
      userMinMemoryByte < maxMemoryBytes
        ? userMinMemoryByte
        : maxMemoryBytes / 2; // Default to half of max memory

    return {
      maxMemoryBytes,
      minMemoryBytes,
    };
  }

  /**
   * Computes timing-related configuration values.
   * Ensures flushInterval meets minimum requirements and timeout doesn't exceed cache duration.
   *
   * @returns Timing configuration with flushInterval, cacheMillisecond, and timeoutMillisecond
   */
  private computeTimingConfiguration() {
    // Ensure flush interval meets minimum requirement
    const flushInterval = Math.max(
      MinFlushIntervalMs,
      this.config?.cachePolicy?.flushIntervalMs ?? DefaultFlushIntervalMs,
    );

    // Use configured cache duration or default
    const ttlMs = this.config?.cachePolicy?.ttlMs ?? DefaultTtlMs;

    // Timeout cannot exceed cache duration, and should be undefined if not configured
    const timeoutMs =
      typeof this.config?.fetchingPolicy?.timeoutMs == 'number'
        ? Math.min(ttlMs, this.config?.fetchingPolicy?.timeoutMs)
        : undefined;

    return {
      flushInterval,
      ttlMs,
      timeoutMs,
    };
  }

  /**
   * Gets the maximum memory threshold in bytes.
   * When exceeded, triggers memory cleanup operations.
   *
   * @returns Maximum memory limit in bytes (default: 10MB)
   */
  private get maxMemoryMegaByte(): number {
    return this.computedConfig.maxMemoryBytes;
  }

  /**
   * Gets the minimum memory threshold in bytes.
   * Memory cleanup continues until usage drops below this level.
   *
   * @returns Minimum memory target in bytes (default: half of max memory)
   */
  private get minMemoryByte(): number {
    return this.computedConfig.minMemoryBytes;
  }

  /**
   * Gets the interval for periodic cache cleanup operations.
   *
   * @returns Flush interval in milliseconds (minimum: MinFlushInterval)
   */
  private get flushInterval(): number {
    return this.computedConfig.flushInterval;
  }

  /**
   * Gets the cache expiration time in milliseconds.
   *
   * @returns Cache duration in milliseconds
   */
  public get ttlMs(): number {
    return this.computedConfig.ttlMs;
  }

  public get concurrency(): number {
    return this.config?.fetchingPolicy?.concurrency ?? DefaultConcurrency;
  }

  public get errorTaskPolicy(): ErrorTaskPolicyType {
    return (
      this.config?.cachePolicy?.errorTaskPolicy ?? ErrorTaskPolicyType.IGNORE
    );
  }

  public get expirationStrategy(): ExpirationStrategyType {
    return (
      this.config?.cachePolicy?.expirationStrategy ??
      ExpirationStrategyType.EXPIRE
    );
  }

  public get useClones(): boolean {
    return this.config?.fetchingPolicy?.useClones === true;
  }

  public get calcCacheScoreFn(): CalcCacheScoreFn {
    return this.config?.freeUpMemoryPolicy?.calcCacheScoreFn;
  }

  /**
   * Gets the timeout limit for fetch operations.
   * The timeout cannot exceed the cache duration.
   *
   * @returns Timeout in milliseconds, or undefined if not configured
   */
  public get timeoutMs(): number | undefined {
    return this.computedConfig.timeoutMs;
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
   * Optimized for performance with early returns and minimal function calls.
   *
   * @param key - The input key to transform
   * @returns String representation of the cache key
   */
  private transformCacheKey(key: INPUT): string {
    // Use custom transformation if provided
    if (this.config?.cachePolicy?.cacheKeyTransform) {
      return this.config.cachePolicy.cacheKeyTransform(key);
    }
    return cacheKeyTransformDefaultFn(key);
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
    this.performanceMetrics.usedCount++;
    const taskKey = this.transformCacheKey(key);
    if (forceUpdate || !this.taskMap.has(taskKey)) {
      this.set(key);
    }
    if (this.taskMap.has(taskKey)) {
      const cacheItem = this.taskMap.get(taskKey);
      if (cacheItem.status == CacheTaskStatusType.EXPIRED) {
        this.set(key);
      }
    }

    return this.taskMap.get(taskKey).output();
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
  public set(key: INPUT, value?: OUTPUT | Promise<OUTPUT> | Error): void {
    const taskKey = this.transformCacheKey(key);
    this.deleteByCacheKey(taskKey);
    this.taskMap.set(taskKey, new CacheTask(this, key, value));
    this.consume();
    this.setTimer();
  }

  public consume(): void {
    const queuedTasks = this.tasks
      .filter((t) => t.status == CacheTaskStatusType.QUEUED)
      .sort((a, b) => a.order - b.order);
    if (queuedTasks.length == 0) return;
    const awaitedTasks = this.tasks.filter(
      (t) => t.status == CacheTaskStatusType.AWAIT,
    );
    if (!this.concurrency) {
      queuedTasks.forEach((task) => task.run());
      return;
    }
    const availableSlots = this.concurrency - awaitedTasks.length;
    if (availableSlots <= 0) return;
    const tasksToRun = queuedTasks.slice(0, availableSlots);
    tasksToRun.forEach((task) => {
      task.run();
    });
  }

  /**
   * Removes a specific entry from the cache.
   * Updates memory usage statistics when an entry is deleted.
   *
   * @param key - The key of the entry to remove
   */
  public delete(key: INPUT): void {
    const taskKey = this.transformCacheKey(key);
    this.deleteByCacheKey(taskKey);
  }

  public deleteByCacheKey(taskKey: string): void {
    if (this.taskMap.has(taskKey)) {
      this.performanceMetrics.releasedMemoryBytes +=
        this.taskMap.get(taskKey).usedBytes;
    }
    this.taskMap.delete(taskKey);
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
    // Clear all cache data
    this.taskMap.clear();

    // Reset performance metrics to initial state
    this.resetPerformanceMetrics();

    // Stop the cleanup timer
    this.stopTimer();
  }

  /**
   * Resets all performance metrics to their initial state.
   */
  private resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      responseTimes: [],
      totalFetchCount: 0,
      currentConcurrentRequests: 0,
      maxConcurrentRequestsReached: 0,
      rejectedRequestsCount: 0,
      overMemoryLimitCount: 0,
      usedCount: 0,
      releasedMemoryBytes: 0,
    };
  }

  /**
   * Stops the cleanup timer if it's running.
   */
  private stopTimer(): void {
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

    return {
      cacheCount: this.cacheCount,
      usedMemory: sizeFormat(this.usedMemoryBytes),
      usedMemoryBytes: this.usedMemoryBytes,
      usedCountTotal: this.performanceMetrics.usedCount,
      ...this.calculateUsageStatistics(usedCounts),
      overMemoryLimitCount: this.performanceMetrics.overMemoryLimitCount,
      releasedMemoryBytes: this.performanceMetrics.releasedMemoryBytes,
      // performance: this.calculatePerformanceStatistics(),
    };
  }

  /**
   * Calculates usage statistics from usage count data.
   */
  private calculateUsageStatistics(usedCounts: number[]) {
    const hasData = usedCounts.length > 0;

    return {
      maxUsedCount: hasData ? Math.max(...usedCounts) : 0,
      minUsedCount: hasData ? Math.min(...usedCounts) : 0,
      avgUsedCount:
        this.cacheCount > 0
          ? this.performanceMetrics.usedCount / this.cacheCount
          : 0,
    };
  }

  /**
   * Calculates performance statistics from response time data.
   */
  private calculatePerformanceStatistics() {
    const responseTimes = this.performanceMetrics.responseTimes;
    const hasResponseTimes = responseTimes.length > 0;

    let avgResponseTime = 0;
    let minResponseTime = 0;
    let maxResponseTime = 0;

    if (hasResponseTimes) {
      const sum = responseTimes.reduce((acc, time) => acc + time, 0);
      avgResponseTime = sum / responseTimes.length;
      minResponseTime = Math.min(...responseTimes);
      maxResponseTime = Math.max(...responseTimes);
    }

    return {
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      totalFetchCount: this.performanceMetrics.totalFetchCount,
      currentConcurrentRequests:
        this.performanceMetrics.currentConcurrentRequests,
      maxConcurrentRequestsReached:
        this.performanceMetrics.maxConcurrentRequestsReached,
      rejectedRequestsCount: this.performanceMetrics.rejectedRequestsCount,
      // currentQueueLength: queueMetrics.currentQueueLength,
      // maxQueueLengthReached: queueMetrics.maxQueueLengthReached,
    };
  }

  /**
   * Performs periodic maintenance operations including:
   * - Removing deprecated cache tasks
   * - Triggering memory cleanup if usage exceeds limits
   * Optimized to minimize unnecessary operations.
   */
  private flush(): void {
    // Clean up deprecated tasks first
    this.cleanupExpiredTasks();

    // Check if memory cleanup is needed
    if (this.shouldCleanupMemory()) {
      this.performanceMetrics.overMemoryLimitCount++;
      this.flushMemory(this.usedMemoryBytes - this.minMemoryByte);
    }
  }

  /**
   * Removes all deprecated tasks efficiently.
   */
  private cleanupExpiredTasks(): void {
    const expiredTasks = this.tasks.filter(
      (task) => task.status === CacheTaskStatusType.EXPIRED,
    );

    expiredTasks.forEach((task) => this.delete(task.input));
  }

  /**
   * Checks if memory cleanup is needed based on current usage.
   */
  private shouldCleanupMemory(): boolean {
    return (
      this.usedMemoryBytes > this.maxMemoryMegaByte ||
      (this.maxMemoryMegaByte === 0 && this.usedMemoryBytes > 0)
    );
  }

  /**
   * Performs intelligent memory cleanup by removing the least valuable cache entries.
   * Uses a scoring algorithm to determine which entries to remove first.
   * Optimized to avoid unnecessary array operations.
   *
   * @param releaseMemoryBytes - Target amount of memory to free in bytes
   */
  private flushMemory(memoryToBeReleasedBytes: number): void {
    // Get active tasks with their scores
    const scoredTasks = this.getActiveTasks()
      .map((task) => ({ task, score: task.score() }))
      .sort((a, b) => a.score - b.score); // Sort by score (lowest first)

    // Release tasks until we've freed enough memory
    let releasedBytes = 0;
    for (const { task } of scoredTasks) {
      releasedBytes += task.usedBytes;
      this.delete(task.input);

      if (releasedBytes >= memoryToBeReleasedBytes) {
        break;
      }
    }
  }

  /**
   * Gets all active tasks efficiently.
   */
  private getActiveTasks(): CacheTask<OUTPUT, INPUT>[] {
    return this.tasks.filter(
      (task) =>
        task.status === CacheTaskStatusType.ACTIVE ||
        task.status === CacheTaskStatusType.FAILED,
    );
  }
}
