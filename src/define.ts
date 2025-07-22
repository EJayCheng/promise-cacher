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
  RELEASE = 'RELEASE',
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
    expirationStrategy: ExpirationStrategyType;
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
 */
export interface PromiseCacherStatistics {
  /** Total number of cached items currently in memory */
  cacheCount: number;

  /** Human-readable memory usage string (e.g., "1.5 MB") */
  usedMemory: string;

  /** Memory usage in bytes (raw number) */
  usedMemoryBytes: number;

  /** Total count of cache usage across all cached items */
  usedCountTotal: number;

  /** Maximum usage count among all cached items */
  maxUsedCount: number;

  /** Minimum usage count among all cached items */
  minUsedCount: number;

  /** Average usage count across all cached items */
  avgUsedCount: number;

  /** Number of times memory limit was exceeded */
  overMemoryLimitCount: number;

  /** Total bytes of memory released due to cleanup operations */
  releasedMemoryBytes: number;

  /**
   * Performance metrics for monitoring cache efficiency
   */
  performance?: {
    /** Average response time in milliseconds */
    avgResponseTime: number;

    /** Minimum response time in milliseconds */
    minResponseTime: number;

    /** Maximum response time in milliseconds */
    maxResponseTime: number;

    /** Total number of fetch operations performed */
    totalFetchCount: number;

    /** Current number of concurrent requests being processed */
    currentConcurrentRequests: number;

    /** Maximum concurrent requests reached during runtime */
    maxConcurrentRequestsReached: number;

    /** Number of requests rejected due to concurrency limit */
    rejectedRequestsCount: number;

    /** Current number of requests in queue waiting for execution */
    currentQueueLength: number;

    /** Maximum queue length reached during runtime */
    maxQueueLengthReached: number;
  };
}

export interface PerformanceMetrics {
  /** Array storing response times in milliseconds for calculating performance statistics */
  responseTimes: number[];
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
}
