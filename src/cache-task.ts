import { cloneDeep } from "lodash";
import {
  CacherConfig,
  CacheTaskStatusType,
  CalcCacheValueMethod,
} from "./define";
import { PromiseCacher } from "./promise-cacher";
import { calcCacheScoreDefaultFn } from "./util/calc-cache-score";
import { sizeof } from "./util/sizeof";
import { limitTimeout } from "./util/timeout";
export class CacheTask<OUTPUT = any, INPUT = string> {
  public usedBytes: number = 0;
  public usedCount: number = 0;
  public createdAt: number = Date.now();
  public lastAccessedAt: number = Date.now();
  public resolvedAt: number;
  private timeoutError = new Error(
    `Error CacheTask timeout: key#${JSON.stringify(this.input)}`
  );
  private taskError: Error;

  public constructor(
    private cacher: PromiseCacher<OUTPUT, INPUT>,
    public input: INPUT,
    private asyncOutput: Promise<OUTPUT>
  ) {
    if (!(asyncOutput instanceof Promise)) {
      this.asyncOutput = Promise.resolve(this.asyncOutput);
    }
    this.asyncHandle();
  }

  private get config(): CacherConfig {
    return this.cacher.config;
  }

  public releaseSelf(): void {
    this.cacher.delete(this.input);
  }

  private asyncHandle(): void {
    this.asyncOutput
      .then((value) => {
        this.usedBytes = sizeof(value);
        this.resolvedAt = Date.now();
      })
      .catch((error) => {
        this.taskError = error;
        this.resolvedAt = Date.now();
        if (this.config.errorTaskPolicy !== "CACHE") {
          this.releaseSelf();
        }
      });
  }

  public get status(): CacheTaskStatusType {
    if (this.taskError && this.config.errorTaskPolicy !== "CACHE") {
      return "deprecated";
    }
    if (this.resolvedAt) {
      let now = Date.now();
      if (this.config.releaseCachePolicy === "IDLE") {
        if (now - this.lastAccessedAt > this.cacher.cacheMillisecond) {
          return "deprecated";
        }
      } else {
        if (now - this.resolvedAt > this.cacher.cacheMillisecond) {
          return "deprecated";
        }
      }
      return "active";
    }
    return "await";
  }

  public output(): Promise<OUTPUT> {
    this.usedCount++;
    this.lastAccessedAt = Date.now();
    if (this.taskError) {
      throw this.taskError;
    }
    let task: Promise<OUTPUT> = this.asyncOutput;
    if (this.config.useClones) {
      task = this.asyncOutput.then((output) => cloneDeep(output));
    }
    return limitTimeout(
      task,
      this.cacher.timeoutMillisecond,
      this.timeoutError
    );
  }

  public score(): number {
    let fn: CalcCacheValueMethod =
      this.config?.releaseMemoryPolicy?.calcCacheValue ||
      calcCacheScoreDefaultFn;
    return fn(this.cacher, this as any);
  }
}
