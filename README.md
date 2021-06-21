# Promise Cacher

promise-cacher is a library that supports asynchronous memory caching.

## Getting Started

[GitHub](https://github.com/EJayCheng/promise-cacher) / [npm](https://www.npmjs.com/package/promise-cacher)

`npm i promise-cacher --save`

```typescript
import { PromiseCacher } from "promise-cacher";
const cacher = new PromiseCacher(
  async (key: string) => {
    // do async task
  },
  {
    // CacherConfig
  }
);
cacher.set("test", "1234");
await cacher.get("test"); // 1234;
cacher.has("test"); // true
cacher.delete("test");
```

## Interface

```typescript
export type FetchByKeyMethod<OUTPUT = any, INPUT = string> = (
  input: INPUT
) => Promise<OUTPUT>;

export type CalcCacheValueMethod = (
  cacher: PromiseCacher,
  task: CacheTask
) => number;

export type ReleaseCachePolicyType = "EXPIRE" | "IDLE";

export type CacheKeyTransformFunction<INPUT = any> = (input: INPUT) => string;

export interface CacherConfig {
  /** 快取過期模式 => EXPIRE(default): 生存時間, IDLE: 閒置時間 */
  releaseCachePolicy?: ReleaseCachePolicyType;
  /** 快取過期模式之有效時間, 預設 5 min */
  cacheMillisecond?: number;
  /** 當非同步任務發生錯誤時如何處理 => RELEASE(default): 不快取, CACHE: 將錯誤快取 */
  errorTaskPolicy?: "RELEASE" | "CACHE";
  /** 記憶體保護政策 */
  releaseMemoryPolicy?: {
    /** 快取價值計算公式 */
    calcCacheValue?: CalcCacheValueMethod;
    /** 當使用的記憶體大於 maxMemoryByte 後，將會把依照最後存取時間刪除快取，直到記憶體用量少於 minMemoryByte, 預設 5 MB */
    minMemoryByte?: number;
    /** 當使用的記憶體大於 maxMemoryByte 後，將會把依照最後存取時間刪除快取，直到記憶體用量少於 minMemoryByte, 預設 10 MB */
    maxMemoryByte?: number;
  };

  /** 釋放快取的時間間隔, 預設 1 min */
  flushInterval?: number;
  /** 快取依據轉換方式 */
  cacheKeyTransform?: CacheKeyTransformFunction;
  /** 非同步任務超時限制, 預設不啟用 */
  timeoutMillisecond?: number;
  /** 非同步任務輸出方式， true: 複製新實例使用, false(default): 使用共同實例 */
  useClones?: boolean;
}

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
```
