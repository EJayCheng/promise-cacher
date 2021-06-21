import { CacheTask } from "../cache-task";
import { PromiseCacher } from "../promise-cacher";

export function calcCacheScoreDefaultFn<OUTPUT = any, INPUT = string>(
  cacher: PromiseCacher<OUTPUT, INPUT>,
  task: CacheTask<OUTPUT, INPUT>
): number {
  let usedBytes = Math.max(task.usedBytes, 1);
  let now = Date.now();
  let timeScore =
    (now * 2 - task.createdAt - task.lastAccessedAt) /
    2 /
    cacher.cacheMillisecond;
  if (timeScore === 0) timeScore = 1;

  return (task.usedCount * 1024) / usedBytes / timeScore;
}
