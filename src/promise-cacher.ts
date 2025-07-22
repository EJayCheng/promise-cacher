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
    cachedResponseTimes: [],
    fetchResponseTimes: [],
    totalFetchCount: 0,
    currentConcurrentRequests: 0,
    maxConcurrentRequestsReached: 0,
    rejectedRequestsCount: 0,
    overMemoryLimitCount: 0,
    usedCount: 0,
    releasedMemoryBytes: 0,
    timeoutCount: 0,
    errorCount: 0,
    createdAt: Date.now(),
    recentResponseTimes: [],
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
    const configConcurrency =
      this.config?.fetchingPolicy?.concurrency ?? DefaultConcurrency;
    // Treat negative concurrency as 0 (unlimited)
    return configConcurrency < 0 ? 0 : configConcurrency;
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
    const startTime = Date.now();
    this.performanceMetrics.usedCount++;

    const taskKey = this.transformCacheKey(key);
    let isNewTask = false;
    let isFromCache = false;

    // Determine if we need to create a new task or can use existing cache
    if (forceUpdate || !this.taskMap.has(taskKey)) {
      // No existing task or force update - create new task
      this.set(key);
      isNewTask = true;
    } else {
      // Check existing task status
      const existingTask = this.taskMap.get(taskKey);
      const status = existingTask.status;

      if (status === CacheTaskStatusType.EXPIRED) {
        // Task expired - create new task
        this.set(key);
        isNewTask = true;
      } else if (status === CacheTaskStatusType.ACTIVE) {
        // Task is active (resolved and cached) - this is a cache hit
        isFromCache = true;
      } else if (
        status === CacheTaskStatusType.AWAIT ||
        status === CacheTaskStatusType.QUEUED
      ) {
        // Task is still pending - wait for it to complete
        // This is not exactly a cache hit, but also not a new fetch
        isFromCache = false;
        isNewTask = false;
      }
    }

    // If this is a new task, increment fetch count
    if (isNewTask) {
      this.performanceMetrics.totalFetchCount++;
    }

    // Get the result
    const result = await this.taskMap.get(taskKey).output();

    // Record response time
    const responseTime = Date.now() - startTime;
    this.performanceMetrics.responseTimes.push(responseTime);

    // Limit arrays to prevent memory growth (keep last 1000 entries)
    if (this.performanceMetrics.responseTimes.length > 1000) {
      this.performanceMetrics.responseTimes.shift();
    }

    // Maintain recent response times for trend analysis (keep last 100)
    this.performanceMetrics.recentResponseTimes.push(responseTime);
    if (this.performanceMetrics.recentResponseTimes.length > 100) {
      this.performanceMetrics.recentResponseTimes.shift();
    }

    // Record specific type of response time
    if (isFromCache) {
      this.performanceMetrics.cachedResponseTimes.push(responseTime);
      // Limit cached response times array
      if (this.performanceMetrics.cachedResponseTimes.length > 1000) {
        this.performanceMetrics.cachedResponseTimes.shift();
      }
    } else {
      this.performanceMetrics.fetchResponseTimes.push(responseTime);
      // Limit fetch response times array
      if (this.performanceMetrics.fetchResponseTimes.length > 1000) {
        this.performanceMetrics.fetchResponseTimes.shift();
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
      cachedResponseTimes: [],
      fetchResponseTimes: [],
      totalFetchCount: 0,
      currentConcurrentRequests: 0,
      maxConcurrentRequestsReached: 0,
      rejectedRequestsCount: 0,
      overMemoryLimitCount: 0,
      usedCount: 0,
      releasedMemoryBytes: 0,
      timeoutCount: 0,
      errorCount: 0,
      createdAt: Date.now(),
      recentResponseTimes: [],
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
   * Reorganized to focus on metrics that users truly care about.
   *
   * @returns Object containing detailed cache statistics grouped by importance
   */
  public statistics(): PromiseCacherStatistics {
    const totalRequests = this.performanceMetrics.usedCount;
    const totalFetches = this.performanceMetrics.totalFetchCount;
    const cacheHits = totalRequests - totalFetches;
    const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

    // Calculate efficiency metrics
    const efficiency = this.calculateEfficiencyMetrics(
      totalRequests,
      cacheHits,
      totalFetches,
      hitRate,
    );

    // Calculate performance metrics
    const performance = this.calculateAdvancedPerformanceMetrics();

    // Calculate operational status
    const operations = this.calculateOperationalMetrics();

    // Calculate memory metrics
    const memory = this.calculateMemoryMetrics();

    // Calculate inventory metrics
    const inventory = this.calculateInventoryMetrics();

    // Calculate health metrics
    const health = this.calculateHealthMetrics(hitRate);

    // Calculate temporal metrics
    const temporal = this.calculateTemporalMetrics(totalRequests);

    return {
      efficiency,
      performance,
      operations,
      memory,
      inventory,
      health,
      temporal,
    };
  }

  /**
   * Calculates cache efficiency metrics.
   */
  private calculateEfficiencyMetrics(
    totalRequests: number,
    cacheHits: number,
    cacheMisses: number,
    hitRate: number,
  ) {
    // Estimate time saved based on average response times
    const avgFetchTime =
      this.performanceMetrics.fetchResponseTimes?.length > 0
        ? this.performanceMetrics.fetchResponseTimes.reduce(
            (sum, time) => sum + time,
            0,
          ) / this.performanceMetrics.fetchResponseTimes.length
        : 0;

    const avgCachedTime =
      this.performanceMetrics.cachedResponseTimes?.length > 0
        ? this.performanceMetrics.cachedResponseTimes.reduce(
            (sum, time) => sum + time,
            0,
          ) / this.performanceMetrics.cachedResponseTimes.length
        : 0;

    const timeSavedMs =
      avgFetchTime > 0 && cacheHits > 0
        ? cacheHits * (avgFetchTime - avgCachedTime)
        : undefined;

    return {
      hitRate: Number(hitRate.toFixed(2)),
      hits: cacheHits,
      misses: cacheMisses,
      totalRequests,
      timeSavedMs: timeSavedMs ? Number(timeSavedMs.toFixed(0)) : undefined,
    };
  }

  /**
   * Calculates advanced performance metrics.
   */
  private calculateAdvancedPerformanceMetrics() {
    const { cachedResponseTimes = [], fetchResponseTimes = [] } =
      this.performanceMetrics;

    const avgCachedResponseTime =
      cachedResponseTimes.length > 0
        ? cachedResponseTimes.reduce((sum, time) => sum + time, 0) /
          cachedResponseTimes.length
        : 0;

    const avgFetchResponseTime =
      fetchResponseTimes.length > 0
        ? fetchResponseTimes.reduce((sum, time) => sum + time, 0) /
          fetchResponseTimes.length
        : 0;

    const performanceGain =
      avgFetchResponseTime > 0
        ? Number(
            (
              ((avgFetchResponseTime - avgCachedResponseTime) /
                avgFetchResponseTime) *
              100
            ).toFixed(2),
          )
        : 0;

    const allResponseTimes = this.performanceMetrics.responseTimes;
    const sortedTimes = [...allResponseTimes].sort((a, b) => a - b);
    const p95Index = Math.ceil(sortedTimes.length * 0.95) - 1;
    const p95ResponseTime = sortedTimes.length > 0 ? sortedTimes[p95Index] : 0;

    return {
      avgCachedResponseTime: Number(avgCachedResponseTime.toFixed(2)),
      avgFetchResponseTime: Number(avgFetchResponseTime.toFixed(2)),
      performanceGain,
      p95ResponseTime: Number(p95ResponseTime.toFixed(2)),
      fastestResponse:
        allResponseTimes.length > 0 ? Math.min(...allResponseTimes) : 0,
      slowestResponse:
        allResponseTimes.length > 0 ? Math.max(...allResponseTimes) : 0,
    };
  }

  /**
   * Calculates operational metrics.
   */
  private calculateOperationalMetrics() {
    const queuedTasks = this.tasks.filter(
      (t) => t.status === CacheTaskStatusType.QUEUED,
    );

    return {
      activeRequests: this.performanceMetrics.currentConcurrentRequests,
      queuedRequests: queuedTasks.length,
      concurrencyLimit: this.concurrency,
      rejectedRequests: this.performanceMetrics.rejectedRequestsCount,
      peakConcurrency: this.performanceMetrics.maxConcurrentRequestsReached,
    };
  }

  /**
   * Calculates memory metrics.
   */
  private calculateMemoryMetrics() {
    const currentUsageBytes = this.usedMemoryBytes;
    const limitBytes = this.maxMemoryMegaByte;
    const usagePercentage =
      limitBytes > 0
        ? Number(((currentUsageBytes / limitBytes) * 100).toFixed(2))
        : 0;

    return {
      currentUsage: sizeFormat(currentUsageBytes),
      currentUsageBytes,
      usagePercentage,
      limit: sizeFormat(limitBytes),
      limitBytes,
      cleanupCount: this.performanceMetrics.overMemoryLimitCount,
      memoryReclaimed: sizeFormat(this.performanceMetrics.releasedMemoryBytes),
      memoryReclaimedBytes: this.performanceMetrics.releasedMemoryBytes,
    };
  }

  /**
   * Calculates inventory metrics.
   */
  private calculateInventoryMetrics() {
    const usedCounts = this.tasks.map((t) => t.usedCount);
    const hasData = usedCounts.length > 0;

    const avgItemUsage = hasData
      ? Number((this.performanceMetrics.usedCount / this.cacheCount).toFixed(2))
      : 0;

    const singleUseItems = usedCounts.filter((count) => count === 1).length;
    const highValueItems = usedCounts.filter(
      (count) => count > avgItemUsage,
    ).length;

    return {
      totalItems: this.cacheCount,
      avgItemUsage,
      maxItemUsage: hasData ? Math.max(...usedCounts) : 0,
      minItemUsage: hasData ? Math.min(...usedCounts) : 0,
      singleUseItems,
      highValueItems,
    };
  }

  /**
   * Calculates health metrics.
   */
  private calculateHealthMetrics(hitRate: number) {
    const { errorCount = 0, timeoutCount = 0 } = this.performanceMetrics;
    const totalRequests = this.performanceMetrics.usedCount;
    const errorRate =
      totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    // Calculate health score
    let healthScore = 100;
    if (hitRate < 50) healthScore -= 30;
    else if (hitRate < 70) healthScore -= 15;

    if (errorRate > 10) healthScore -= 30;
    else if (errorRate > 5) healthScore -= 15;

    if (this.usedMemoryBytes > this.maxMemoryMegaByte * 0.9) healthScore -= 20;

    const issues: string[] = [];
    if (hitRate < 50) issues.push('Low cache hit rate (<50%)');
    if (errorRate > 5)
      issues.push(`High error rate (${errorRate.toFixed(1)}%)`);
    if (this.usedMemoryBytes > this.maxMemoryMegaByte * 0.9)
      issues.push('Memory usage approaching limit');
    if (timeoutCount > 0) issues.push(`${timeoutCount} timeout(s) occurred`);

    let status: 'excellent' | 'good' | 'warning' | 'critical';
    if (healthScore >= 90) status = 'excellent';
    else if (healthScore >= 70) status = 'good';
    else if (healthScore >= 50) status = 'warning';
    else status = 'critical';

    return {
      status,
      score: Math.max(0, healthScore),
      issues,
      errorRate: Number(errorRate.toFixed(2)),
      recentErrors: errorCount,
      timeouts: timeoutCount,
    };
  }

  /**
   * Calculates temporal metrics.
   */
  private calculateTemporalMetrics(totalRequests: number) {
    const uptimeMs =
      Date.now() - (this.performanceMetrics.createdAt || Date.now());
    const uptimeMinutes = uptimeMs / (1000 * 60);

    const uptime = this.formatUptime(uptimeMs);
    const requestsPerMinute =
      uptimeMinutes > 0
        ? Number((totalRequests / uptimeMinutes).toFixed(2))
        : 0;

    // Simple trend analysis based on recent response times
    const { recentResponseTimes = [] } = this.performanceMetrics;
    let trend: 'improving' | 'stable' | 'declining' = 'stable';

    if (recentResponseTimes.length >= 10) {
      const firstHalf = recentResponseTimes.slice(
        0,
        Math.floor(recentResponseTimes.length / 2),
      );
      const secondHalf = recentResponseTimes.slice(
        Math.floor(recentResponseTimes.length / 2),
      );

      const firstHalfAvg =
        firstHalf.reduce((sum, time) => sum + time, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((sum, time) => sum + time, 0) / secondHalf.length;

      if (secondHalfAvg < firstHalfAvg * 0.9) trend = 'improving';
      else if (secondHalfAvg > firstHalfAvg * 1.1) trend = 'declining';
    }

    return {
      uptimeMs,
      uptime,
      requestsPerMinute,
      trend,
    };
  }

  /**
   * Formats uptime into human readable string.
   */
  private formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
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
