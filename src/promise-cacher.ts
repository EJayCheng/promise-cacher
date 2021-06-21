import { CacheTask } from "./cache-task";
import {
  CacheKeyTransformFunction,
  CacherConfig,
  FetchByKeyMethod,
  PromiseCacherStatistics,
} from "./define";
import { cacheKeyTransformDefaultFn } from "./util/cache-key-transform";
import { sizeFormat } from "./util/sizeof";
const DefaultFlushInterval = 1 * 60 * 1000; // 1 min
const MinFlushInterval = 1 * 1000; // 1 sec
const DefaultMaxMemoryByte = 10 * 1024 * 1024; // 10 MB
const DefaultCacheMillisecond = 1 * 60 * 1000; // 5 min
export class PromiseCacher<OUTPUT = any, INPUT = any> {
  private taskMap = new Map<string, CacheTask<OUTPUT, INPUT>>();
  private overMemoryLimitCount: number = 0;
  private usedCount: number = 0;
  private releasedMemoryBytes: number = 0;
  private timer: any;
  public constructor(
    public fetchFn: FetchByKeyMethod<OUTPUT, INPUT>,
    public config: CacherConfig = {}
  ) {}

  private get maxMemoryMegaByte(): number {
    return (
      this.config?.releaseMemoryPolicy?.maxMemoryByte || DefaultMaxMemoryByte
    );
  }

  private get minMemoryByte(): number {
    let value = this.config?.releaseMemoryPolicy?.minMemoryByte;
    if (value && value < this.maxMemoryMegaByte) return value;
    return this.maxMemoryMegaByte / 2;
  }

  private get flushInterval(): number {
    if (!this.config.flushInterval) return DefaultFlushInterval;
    return Math.max(MinFlushInterval, this.config.flushInterval);
  }

  public get cacheMillisecond(): number {
    return this.config.cacheMillisecond || DefaultCacheMillisecond;
  }

  public get timeoutMillisecond(): number {
    if (this.config.timeoutMillisecond) {
      return Math.min(this.cacheMillisecond, this.config.timeoutMillisecond);
    }
    return;
  }

  private get tasks(): CacheTask<OUTPUT, INPUT>[] {
    return Array.from(this.taskMap.values());
  }

  private get usedMemoryBytes(): number {
    return this.tasks.reduce((total, task) => total + task.usedBytes, 0);
  }

  private transformCacheKey(key: INPUT): string {
    let fn: CacheKeyTransformFunction =
      this.config.cacheKeyTransform || cacheKeyTransformDefaultFn;
    return fn(key);
  }

  public async get(key: INPUT, forceUpdate: boolean = false): Promise<OUTPUT> {
    this.usedCount++;
    let taskKey = this.transformCacheKey(key);
    if (forceUpdate) {
      this.taskMap.delete(taskKey);
    }
    let isExist = this.taskMap.has(taskKey);
    let task: CacheTask<OUTPUT, INPUT>;
    if (isExist) {
      task = this.taskMap.get(taskKey);
      if (task.status === "deprecated") {
        task.releaseSelf();
        task = null;
      }
    }
    if (!task) {
      task = new CacheTask(this, key, this.fetchFn(key));
      this.taskMap.set(taskKey, task);
    }
    this.setTimer();
    return task.output();
  }

  private setTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  public set(key: INPUT, value: OUTPUT | Promise<OUTPUT>): void {
    let promiseValue =
      value instanceof Promise ? value : Promise.resolve(value);
    let taskKey = this.transformCacheKey(key);
    let task = new CacheTask(this, key, promiseValue);
    this.taskMap.set(taskKey, task);
  }

  public delete(key: INPUT): void {
    let taskKey = this.transformCacheKey(key);
    if (this.taskMap.has(taskKey)) {
      this.releasedMemoryBytes += this.taskMap.get(taskKey).usedBytes;
    }
    this.taskMap.delete(taskKey);
  }

  public has(key: INPUT): boolean {
    let taskKey = this.transformCacheKey(key);
    return this.taskMap.has(taskKey);
  }

  public clear(): void {
    this.taskMap.clear();
    clearInterval(this.timer);
  }

  public keys(): INPUT[] {
    return this.tasks.map((task) => task.input);
  }

  public get cacheCount(): number {
    return this.taskMap.size;
  }

  public statistics(): PromiseCacherStatistics {
    let usedCounts = this.tasks.map((t) => t.usedCount);
    return {
      cacheCount: this.cacheCount,
      usedMemory: sizeFormat(this.usedMemoryBytes),
      usedMemoryBytes: this.usedMemoryBytes,
      usedCountTotal: this.usedCount,
      maxUsedCount: Math.max(...usedCounts),
      minUsedCount: Math.min(...usedCounts),
      avgUsedCount: this.usedCount / this.cacheCount,
      overMemoryLimitCount: this.overMemoryLimitCount,
      releasedMemoryBytes: this.releasedMemoryBytes,
    };
  }

  private flush(): void {
    this.tasks
      .filter((task) => task.status === "deprecated")
      .forEach((task) => task.releaseSelf());

    if (this.usedMemoryBytes > this.maxMemoryMegaByte) {
      this.overMemoryLimitCount++;
      this.flushMemory(this.usedMemoryBytes - this.minMemoryByte);
    }
  }

  private flushMemory(releaseMemoryBytes: number): void {
    let list = this.tasks
      .filter((task) => task.status === "active")
      .map((task) => {
        return { task, score: task.score() };
      })
      .slice()
      .sort((a, b) => a.score - b.score);
    for (let { task } of list) {
      releaseMemoryBytes -= task.usedBytes;
      task.releaseSelf();
      if (releaseMemoryBytes <= 0) break;
    }
  }
}
