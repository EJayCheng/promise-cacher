import { CacheTask } from "./cache-task";
import { PromiseCacher } from "./promise-cacher";

export type FetchByKeyMethod<OUTPUT = any, INPUT = string> = (
  input: INPUT
) => Promise<OUTPUT>;

export type CalcCacheValueMethod = (
  cacher: PromiseCacher,
  task: CacheTask
) => number;
export type ReleaseCachePolicyType = "EXPIRE" | "IDLE";
export interface CacherConfig<OUTPUT = any, INPUT = string> {
  /** 快取過期模式 => EXPIRE: 生存時間, IDLE: 閒置時間 */
  releaseCachePolicy?: ReleaseCachePolicyType;
  /** 快取過期模式之有效時間 */
  cacheMillisecond?: number;
  /** 當非同步任務發生錯誤時如何處理 => RELEASE: 不快取, CACHE: 將錯誤快取 */
  errorTaskPolicy?: "RELEASE" | "CACHE";
  /** 記憶體保護政策 */
  releaseMemoryPolicy?: {
    /** 快取價值計算公式 */
    calcCacheValue?: CalcCacheValueMethod;
    /** 當使用的記憶體大於 maxMemoryByte 後，將會把依照最後存取時間刪除快取，直到記憶體用量少於 minMemoryByte */
    minMemoryByte?: number;
    /** 當使用的記憶體大於 maxMemoryByte 後，將會把依照最後存取時間刪除快取，直到記憶體用量少於 minMemoryByte */
    maxMemoryByte?: number;
  };

  /** 釋放快取的時間間隔 */
  flushInterval?: number;
  /** 快取依據轉換方式 */
  cacheKeyTransform?: CacheKeyTransformFunction;
  /** 非同步任務超時限制 */
  timeoutMillisecond?: number;
  /** 非同步任務輸出方式， true: 複製新實例使用, false: 使用共同實例 */
  useClones?: boolean;
}
export type CacheKeyTransformFunction<INPUT = any> = (input: INPUT) => string;
export type CacheTaskStatusType = "await" | "active" | "deprecated";
export interface PromiseCacherStatistics {
  cacheCount: number;
  usedMemory: string;
  usedMemoryBytes: number;
  usedCountTotal: number;
  maxUsedCount: number;
  minUsedCount: number;
  avgUsedCount: number;
  overMemoryLimitCount: number;
  releasedMemoryBytes: number;
}