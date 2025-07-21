import { CacheTask } from './cache-task';
import { PromiseCacher } from './promise-cacher';

/** Method signature for fetching data by key input */
export type FetchByKeyMethod<OUTPUT = any, INPUT = string> = (
  input: INPUT,
) => Promise<OUTPUT>;

/** Method signature for calculating cache value score */
export type CalcCacheValueMethod = (
  cacher: PromiseCacher,
  task: CacheTask,
) => number;

/** Cache release policy types */
export enum ReleaseCachePolicyType {
  /** Cache expires after a fixed time period (time to live) */
  EXPIRE = 'EXPIRE',
  /** Cache expires after being idle for a specific duration */
  IDLE = 'IDLE',
}

/** Error task handling policy types */
export enum ErrorTaskPolicyType {
  /** Release the cache when task encounters an error */
  RELEASE = 'RELEASE',
  /** Cache the error result when task encounters an error */
  CACHE = 'CACHE',
}

/** Cache task status types */
export enum CacheTaskStatusType {
  /** Task is waiting to be executed */
  AWAIT = 'AWAIT',
  /** Task is currently being executed */
  ACTIVE = 'ACTIVE',
  /** Task is deprecated and should be cleaned up */
  DEPRECATED = 'DEPRECATED',
}

export interface CacherConfig {
  /** Cache expiration mode => EXPIRE(default): time to live, IDLE: idle timeout */
  releaseCachePolicy?: ReleaseCachePolicyType;
  /** Cache expiration time, default 5 min */
  cacheMillisecond?: number;
  /** Error task handling policy => RELEASE(default): do not cache, CACHE: cache the error */
  errorTaskPolicy?: ErrorTaskPolicyType;
  /** Memory protection policy */
  releaseMemoryPolicy?: {
    /** Cache value calculation formula */
    calcCacheValue?: CalcCacheValueMethod;
    /** When memory usage exceeds maxMemoryByte, caches will be deleted by last access time until memory usage is below minMemoryByte, default 5 MB */
    minMemoryByte?: number;
    /** When memory usage exceeds maxMemoryByte, caches will be deleted by last access time until memory usage is below minMemoryByte, default 10 MB */
    maxMemoryByte?: number;
  };

  /** Cache flush interval, default 1 min */
  flushInterval?: number;
  /** Cache key transformation method */
  cacheKeyTransform?: CacheKeyTransformFunction;
  /** Async task timeout limit, disabled by default */
  timeoutMillisecond?: number;
  /** Async task output mode, true: use cloned instances, false(default): use shared instances */
  useClones?: boolean;
  /** Maximum concurrent requests limit, unlimited by default */
  maxConcurrentRequests?: number;
}

/** Function signature for transforming cache key from input */
export type CacheKeyTransformFunction<INPUT = any> = (input: INPUT) => string;

/** Promise cacher runtime statistics */
export interface PromiseCacherStatistics {
  /** Total number of cached items */
  cacheCount: number;
  /** Human-readable memory usage string */
  usedMemory: string;
  /** Memory usage in bytes */
  usedMemoryBytes: number;
  /** Total count of cache usage */
  usedCountTotal: number;
  /** Maximum usage count among all cached items */
  maxUsedCount: number;
  /** Minimum usage count among all cached items */
  minUsedCount: number;
  /** Average usage count across all cached items */
  avgUsedCount: number;
  /** Number of times memory limit was exceeded */
  overMemoryLimitCount: number;
  /** Total bytes of memory released due to cleanup */
  releasedMemoryBytes: number;
  /** Performance metrics */
  performance: {
    /** Average response time in milliseconds */
    avgResponseTime: number;
    /** Minimum response time in milliseconds */
    minResponseTime: number;
    /** Maximum response time in milliseconds */
    maxResponseTime: number;
    /** Total number of fetch operations */
    totalFetchCount: number;
    /** Current number of concurrent requests */
    currentConcurrentRequests: number;
    /** Maximum concurrent requests reached */
    maxConcurrentRequestsReached: number;
    /** Number of requests rejected due to concurrency limit */
    rejectedRequestsCount: number;
    /** Current number of requests in queue waiting for execution */
    currentQueueLength: number;
    /** Maximum queue length reached */
    maxQueueLengthReached: number;
  };
}
