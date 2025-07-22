import { CacheTask } from './cache-task';
import { PromiseCacher } from './promise-cacher';

/**
 * Method signature for fetching data by key input
 * @template OUTPUT - The type of data returned by the fetch operation
 * @template INPUT - The type of input parameter used for fetching
 * @param input - The input parameter for the fetch operation
 * @returns A promise that resolves to the fetched data
 */
export type FetchByKeyMethod<OUTPUT = any, INPUT = string> = (
  input: INPUT,
) => Promise<OUTPUT>;

/**
 * Method signature for calculating cache value score
 * @param cacher - The PromiseCacher instance
 * @param task - The CacheTask to calculate score for
 * @returns The calculated cache score as a number
 */
export type CalcCacheScoreFn = (
  cacher: PromiseCacher,
  task: CacheTask,
) => number;

/**
 * Cache release policy types
 * Defines when cached data should be released from memory
 */
export enum ExpirationStrategyType {
  /** Cache expires after a fixed time period (time to live) */
  EXPIRE = 'EXPIRE',
  /** Cache expires after being idle for a specific duration */
  IDLE = 'IDLE',
}

/**
 * Error task handling policy types
 * Defines how errors should be handled in cache operations
 */
export enum ErrorTaskPolicyType {
  /** Release the cache when task encounters an error */
  IGNORE = 'IGNORE',
  /** Cache the error result when task encounters an error */
  CACHE = 'CACHE',
}

/**
 * Cache task status types
 * Represents the current state of a cache task
 */
export enum CacheTaskStatusType {
  QUEUED = 'QUEUED',
  /** Task is waiting to be executed */
  AWAIT = 'AWAIT',
  /** Task is currently being executed */
  ACTIVE = 'ACTIVE',
  /** Task has failed and should be cleaned up */
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/**
 * Configuration interface for PromiseCacher
 * Defines all available options for cache behavior customization
 */
export interface CacherConfig {
  cachePolicy?: {
    /**
     * Cache key transformation method
     * Function to transform input into cache key string
     */
    cacheKeyTransform?: CacheKeyTransformFunction;
    /**
     * Cache expiration mode
     * @default ExpirationStrategyType.EXPIRE
     * - EXPIRE: time to live
     * - IDLE: idle timeout
     */
    expirationStrategy?: ExpirationStrategyType;
    /**
     * Cache expiration time in milliseconds
     * @default 300000 (5 minutes)
     */
    ttlMs?: number;

    /**
     * Error task handling policy
     * @default ErrorTaskPolicyType.RELEASE
     * - RELEASE: do not cache errors
     * - CACHE: cache the error result
     */
    errorTaskPolicy?: ErrorTaskPolicyType;

    /**
     * Cache flush interval in milliseconds
     * How often to check for expired cache entries
     * @default 60000 (1 minute)
     */
    flushIntervalMs?: number;
  };

  fetchingPolicy?: {
    /**
     * Async task output mode
     * @default false
     * - true: use cloned instances (safer but slower)
     * - false: use shared instances (faster but requires careful handling)
     */
    useClones?: boolean;

    /**
     * Async task timeout limit in milliseconds
     * @default undefined (disabled)
     * If set, operations exceeding this time will be cancelled
     */
    timeoutMs?: number;

    /**
     * Maximum concurrent requests limit
     * @default undefined (unlimited)
     * Limits the number of simultaneous async operations
     */
    concurrency?: number;
  };

  /**
   * Memory protection policy configuration
   * Helps prevent memory leaks by managing cache size
   */
  freeUpMemoryPolicy?: {
    /**
     * Cache value calculation formula
     * Custom function to calculate cache importance score
     */
    calcCacheScoreFn?: CalcCacheScoreFn;

    /**
     * Minimum memory threshold in bytes
     * When memory usage exceeds maxMemoryByte, caches will be deleted
     * by last access time until memory usage is below this value
     * @default 5242880 (5 MB)
     */
    minMemoryBytes?: number;

    /**
     * Maximum memory threshold in bytes
     * When memory usage exceeds this value, cache cleanup will be triggered
     * @default 10485760 (10 MB)
     */
    maxMemoryBytes?: number;
  };
}

/**
 * Function signature for transforming cache key from input
 * @template INPUT - The type of input to transform
 * @param input - The input to transform into a cache key
 * @returns A string representation of the cache key
 */
export type CacheKeyTransformFunction<INPUT = any> = (input: INPUT) => string;

/**
 * Promise cacher runtime statistics
 * Provides comprehensive metrics about cache performance and usage
 * Reorganized to focus on metrics that users truly care about
 */
export interface PromiseCacherStatistics {
  // ========== 🎯 CORE CACHE EFFICIENCY ==========
  /** Cache effectiveness metrics - the most important indicators */
  efficiency: {
    /** Cache hit rate as a percentage (0-100) - PRIMARY METRIC */
    hitRate: number;
    /** Number of cache hits (requests served from cache) */
    hits: number;
    /** Number of cache misses (requests that required fresh fetches) */
    misses: number;
    /** Total requests processed */
    totalRequests: number;
    /** Estimated time saved by caching (based on avg response times) */
    timeSavedMs?: number;
  };

  // ========== ⚡ PERFORMANCE INSIGHTS ==========
  /** Response time analytics for performance optimization */
  performance: {
    /** Average response time for cached requests (ms) */
    avgCachedResponseTime: number;
    /** Average response time for fresh fetches (ms) */
    avgFetchResponseTime: number;
    /** Performance improvement ratio (cached vs fresh) */
    performanceGain: number;
    /** 95th percentile response time (ms) */
    p95ResponseTime: number;
    /** Fastest response time recorded (ms) */
    fastestResponse: number;
    /** Slowest response time recorded (ms) */
    slowestResponse: number;
  };

  // ========== 🔄 CURRENT OPERATIONS ==========
  /** Real-time operational status */
  operations: {
    /** Current number of requests being processed */
    activeRequests: number;
    /** Requests waiting in queue */
    queuedRequests: number;
    /** Maximum concurrent requests allowed (0 = unlimited) */
    concurrencyLimit: number;
    /** Requests rejected due to concurrency limits */
    rejectedRequests: number;
    /** Peak concurrent requests reached */
    peakConcurrency: number;
  };

  // ========== 💾 MEMORY MANAGEMENT ==========
  /** Memory usage and optimization data */
  memory: {
    /** Current memory usage (human readable, e.g., "2.5 MB") */
    currentUsage: string;
    /** Current memory usage in bytes */
    currentUsageBytes: number;
    /** Memory usage percentage of configured limit */
    usagePercentage: number;
    /** Maximum memory limit (human readable) */
    limit: string;
    /** Maximum memory limit in bytes */
    limitBytes: number;
    /** Times memory cleanup was triggered */
    cleanupCount: number;
    /** Total memory reclaimed through cleanup (human readable) */
    memoryReclaimed: string;
    /** Total memory reclaimed in bytes */
    memoryReclaimedBytes: number;
  };

  // ========== 📈 CACHE INVENTORY ==========
  /** Cache content and usage patterns */
  inventory: {
    /** Total number of cached items */
    totalItems: number;
    /** Average times each cache item has been accessed */
    avgItemUsage: number;
    /** Most frequently accessed item usage count */
    maxItemUsage: number;
    /** Least accessed item usage count */
    minItemUsage: number;
    /** Items that have never been reused (usage = 1) */
    singleUseItems: number;
    /** High-value items (above average usage) */
    highValueItems: number;
  };

  // ========== ⚠️ HEALTH & ISSUES ==========
  /** System health and potential issues */
  health: {
    /** Overall system health status */
    status: 'excellent' | 'good' | 'warning' | 'critical';
    /** Health score (0-100) */
    score: number;
    /** List of current issues or warnings */
    issues: string[];
    /** Error rate percentage */
    errorRate: number;
    /** Recent errors count */
    recentErrors: number;
    /** Timeout occurrences */
    timeouts: number;
  };

  // ========== 🕒 TEMPORAL DATA ==========
  /** Time-based usage patterns */
  temporal: {
    /** Cache uptime in milliseconds */
    uptimeMs: number;
    /** Cache uptime in human readable format */
    uptime: string;
    /** Average requests per minute */
    requestsPerMinute: number;
    /** Cache effectiveness trend (improving/stable/declining) */
    trend: 'improving' | 'stable' | 'declining';
  };
}

export interface PerformanceMetrics {
  /** Array storing response times in milliseconds for calculating performance statistics */
  responseTimes: number[];
  /** Array storing response times specifically for cached requests */
  cachedResponseTimes: number[];
  /** Array storing response times specifically for fresh fetch requests */
  fetchResponseTimes: number[];
  /** Total number of fetch operations executed (including both cache hits and misses) */
  totalFetchCount: number;
  /** Number of concurrent requests currently being processed */
  currentConcurrentRequests: number;
  /** Maximum number of concurrent requests reached during the lifecycle */
  maxConcurrentRequestsReached: number;
  /** Number of requests that were rejected due to system constraints */
  rejectedRequestsCount: number;
  /** Counter tracking how many times memory usage exceeded the configured limit */
  overMemoryLimitCount: number;
  /** Total number of cache access attempts (get method calls) */
  usedCount: number;
  /** Total bytes of memory released through cache cleanup operations */
  releasedMemoryBytes: number;
  /** Number of timeouts that occurred during fetch operations */
  timeoutCount: number;
  /** Number of errors that occurred during fetch operations */
  errorCount: number;
  /** Timestamp when the cache was created */
  createdAt: number;
  /** Array to store recent response times for trend analysis */
  recentResponseTimes: number[];
}
