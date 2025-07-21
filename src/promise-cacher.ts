import { CacheTask } from './cache-task';
import {
  DefaultCacheMillisecond,
  DefaultFlushInterval,
  DefaultMaxMemoryByte,
  MinFlushInterval,
} from './constants';
import {
  CacherConfig,
  CacheTaskStatusType,
  FetchByKeyMethod,
  PromiseCacherStatistics,
} from './define';
import { cacheKeyTransformDefaultFn } from './util/cache-key-transform-default-fn';
import { sizeFormat } from './util/size-format';

/** Type definition for queued request */
interface QueuedRequest<INPUT, OUTPUT> {
  taskKey: string;
  key: INPUT;
  resolve: (result: OUTPUT) => void;
  reject: (error: any) => void;
}

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
    currentQueueLength: 0,
    maxQueueLengthReached: 0,
  };

  /** Set to track currently running concurrent requests */
  private concurrentRequests = new Set<string>();

  /** Queue for pending requests when concurrent limit is reached */
  private requestQueue: QueuedRequest<INPUT, OUTPUT>[] = [];

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
    const configured = this.config?.releaseMemoryPolicy?.maxMemoryByte;
    if (configured !== undefined) {
      return configured;
    }
    return DefaultMaxMemoryByte;
  }

  /**
   * Gets the minimum memory threshold in bytes.
   * Memory cleanup continues until usage drops below this level.
   *
   * @returns Minimum memory target in bytes (default: half of max memory)
   */
  private get minMemoryByte(): number {
    const value = this.config?.releaseMemoryPolicy?.minMemoryByte;
    if (value !== undefined && value < this.maxMemoryMegaByte) return value;
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
   * Optimized for performance with early returns and minimal function calls.
   *
   * @param key - The input key to transform
   * @returns String representation of the cache key
   */
  private transformCacheKey(key: INPUT): string {
    const customTransform = this.config.cacheKeyTransform;

    // Use custom transformation if provided
    if (customTransform) {
      return customTransform(key);
    }

    // For non-object keys, use default transformation directly
    if (typeof key !== 'object' || key === null) {
      return cacheKeyTransformDefaultFn(key);
    }

    // For object keys, check WeakMap cache first
    const cachedKey = this.objectKeyMap.get(key);
    if (cachedKey) {
      return cachedKey;
    }

    // Generate unique key for new object
    const baseKey = cacheKeyTransformDefaultFn(key);
    const uniqueKey = `${baseKey}_${this.generateUniqueId()}`;
    this.objectKeyMap.set(key, uniqueKey);

    return uniqueKey;
  }

  /**
   * Generates a unique identifier for object keys.
   * More efficient than Math.random().toString(36).
   */
  private generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  /**
   * Executes a request and handles concurrency tracking and queue processing.
   *
   * @param taskKey - The transformed cache key
   * @param key - The original input key
   * @returns Promise resolving to the cached or freshly fetched value
   */
  private async executeRequest(taskKey: string, key: INPUT): Promise<OUTPUT> {
    // Track concurrent request and update metrics
    this.trackConcurrentRequestStart(taskKey);

    try {
      // Create and execute the cache task
      const task = await this.createAndExecuteCacheTask(taskKey, key);

      // Update performance metrics with response time
      this.updateResponseTimeMetrics(task);

      return await task.output();
    } finally {
      // Always clean up concurrent tracking and process queue
      this.trackConcurrentRequestEnd(taskKey);
      this.processQueue();
    }
  }

  /**
   * Tracks the start of a concurrent request and updates metrics.
   */
  private trackConcurrentRequestStart(taskKey: string): void {
    this.concurrentRequests.add(taskKey);
    this.performanceMetrics.currentConcurrentRequests =
      this.concurrentRequests.size;
    this.performanceMetrics.maxConcurrentRequestsReached = Math.max(
      this.performanceMetrics.maxConcurrentRequestsReached,
      this.concurrentRequests.size,
    );
    this.performanceMetrics.totalFetchCount++;
  }

  /**
   * Tracks the end of a concurrent request.
   */
  private trackConcurrentRequestEnd(taskKey: string): void {
    this.concurrentRequests.delete(taskKey);
    this.performanceMetrics.currentConcurrentRequests =
      this.concurrentRequests.size;
  }

  /**
   * Creates and executes a cache task with the wrapped fetch function.
   */
  private async createAndExecuteCacheTask(
    taskKey: string,
    key: INPUT,
  ): Promise<CacheTask<OUTPUT, INPUT>> {
    const wrappedFetch = this.fetchFn(key);
    const task = new CacheTask(this, key, wrappedFetch);
    this.taskMap.set(taskKey, task);

    // Only set timer when creating new tasks to reduce unnecessary calls
    this.setTimer();

    // Wait for the task to complete to ensure responseTime is calculated
    await task.output();

    return task;
  }

  /**
   * Updates response time metrics for performance tracking.
   */
  private updateResponseTimeMetrics(task: CacheTask<OUTPUT, INPUT>): void {
    if (task.responseTime) {
      this.performanceMetrics.responseTimes.push(task.responseTime);
      // Keep only last 1000 response times for memory efficiency
      if (this.performanceMetrics.responseTimes.length > 1000) {
        this.performanceMetrics.responseTimes =
          this.performanceMetrics.responseTimes.slice(-1000);
      }
    }
  }

  /**
   * Processes queued requests when concurrent slots become available.
   * Optimized to avoid unnecessary checks and improve performance.
   */
  private processQueue(): void {
    const maxConcurrent = this.config.maxConcurrentRequests;

    // Early exit if no queue or max concurrent limit reached
    if (
      this.requestQueue.length === 0 ||
      (maxConcurrent && this.concurrentRequests.size >= maxConcurrent)
    ) {
      return;
    }

    const availableSlots = maxConcurrent
      ? maxConcurrent - this.concurrentRequests.size
      : this.requestQueue.length;

    // Process multiple requests at once if slots are available
    const requestsToProcess = this.requestQueue.splice(0, availableSlots);

    // Update queue length metrics once
    this.performanceMetrics.currentQueueLength = this.requestQueue.length;

    // Process each request
    for (const queuedRequest of requestsToProcess) {
      this.processQueuedRequest(queuedRequest);
    }
  }

  /**
   * Processes a single queued request.
   */
  private processQueuedRequest(
    queuedRequest: QueuedRequest<INPUT, OUTPUT>,
  ): void {
    const { taskKey, key, resolve, reject } = queuedRequest;

    // Check if task already exists in cache
    const existingTask = this.taskMap.get(taskKey);
    if (
      existingTask &&
      existingTask.status !== CacheTaskStatusType.DEPRECATED
    ) {
      // Use existing task instead of creating new one
      existingTask.output().then(resolve).catch(reject);
      return;
    }

    // Execute new request
    this.executeRequest(taskKey, key).then(resolve).catch(reject);
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
      this.invalidateCache(taskKey);
    }

    // Try to get existing valid task
    const existingTask = this.getValidTask(taskKey);
    if (existingTask) {
      const result = await existingTask.output();
      this.updateResponseTimeMetrics(existingTask);
      return result;
    }

    // Check if we need to queue the request due to concurrency limits
    if (this.shouldQueueRequest()) {
      return this.queueRequest(taskKey, key);
    }

    // Execute the request immediately
    return this.executeRequest(taskKey, key);
  }

  /**
   * Invalidates cache for the given task key.
   */
  private invalidateCache(taskKey: string): void {
    this.taskMap.delete(taskKey);
    this.concurrentRequests.delete(taskKey);
  }

  /**
   * Gets a valid existing task from cache, cleaning up deprecated ones.
   */
  private getValidTask(taskKey: string): CacheTask<OUTPUT, INPUT> | null {
    const existingTask = this.taskMap.get(taskKey);
    if (!existingTask) {
      return null;
    }

    if (existingTask.status === CacheTaskStatusType.DEPRECATED) {
      existingTask.release();
      this.concurrentRequests.delete(taskKey);
      return null;
    }

    return existingTask;
  }

  /**
   * Checks if the request should be queued due to concurrency limits.
   */
  private shouldQueueRequest(): boolean {
    const maxConcurrent = this.config.maxConcurrentRequests;
    return (
      maxConcurrent &&
      maxConcurrent > 0 &&
      this.concurrentRequests.size >= maxConcurrent
    );
  }

  /**
   * Queues a request when concurrency limit is reached.
   */
  private queueRequest(taskKey: string, key: INPUT): Promise<OUTPUT> {
    return new Promise<OUTPUT>((resolve, reject) => {
      this.requestQueue.push({ taskKey, key, resolve, reject });

      // Update queue length metrics
      this.performanceMetrics.currentQueueLength = this.requestQueue.length;
      this.performanceMetrics.maxQueueLengthReached = Math.max(
        this.performanceMetrics.maxQueueLengthReached,
        this.requestQueue.length,
      );
    });
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
    // Clear all cache data
    this.taskMap.clear();
    this.concurrentRequests.clear();
    this.requestQueue = [];

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
      currentQueueLength: 0,
      maxQueueLengthReached: 0,
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
      usedCountTotal: this.usedCount,
      ...this.calculateUsageStatistics(usedCounts),
      overMemoryLimitCount: this.overMemoryLimitCount,
      releasedMemoryBytes: this.releasedMemoryBytes,
      performance: this.calculatePerformanceStatistics(),
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
      avgUsedCount: this.cacheCount > 0 ? this.usedCount / this.cacheCount : 0,
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
      currentQueueLength: this.requestQueue.length,
      maxQueueLengthReached: this.performanceMetrics.maxQueueLengthReached,
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
    this.cleanupDeprecatedTasks();

    // Check if memory cleanup is needed
    if (this.shouldCleanupMemory()) {
      this.overMemoryLimitCount++;
      this.flushMemory(this.usedMemoryBytes - this.minMemoryByte);
    }
  }

  /**
   * Removes all deprecated tasks efficiently.
   */
  private cleanupDeprecatedTasks(): void {
    const deprecatedTasks = this.tasks.filter(
      (task) => task.status === CacheTaskStatusType.DEPRECATED,
    );

    deprecatedTasks.forEach((task) => task.release());
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
  private flushMemory(releaseMemoryBytes: number): void {
    // Get active tasks with their scores
    const scoredTasks = this.getActiveTasks()
      .map((task) => ({ task, score: task.score() }))
      .sort((a, b) => a.score - b.score); // Sort by score (lowest first)

    // Release tasks until we've freed enough memory
    let releasedBytes = 0;
    for (const { task } of scoredTasks) {
      releasedBytes += task.usedBytes;
      task.release();

      if (releasedBytes >= releaseMemoryBytes) {
        break;
      }
    }
  }

  /**
   * Gets all active tasks efficiently.
   */
  private getActiveTasks(): CacheTask<OUTPUT, INPUT>[] {
    return this.tasks.filter(
      (task) => task.status === CacheTaskStatusType.ACTIVE,
    );
  }
}
