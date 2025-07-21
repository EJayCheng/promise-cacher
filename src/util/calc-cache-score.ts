import { CacheTask } from '../cache-task';
import { PromiseCacher } from '../promise-cacher';

/**
 * Default function to calculate cache score for determining cache eviction priority.
 * Higher scores indicate higher priority for keeping in cache.
 *
 * The score is calculated based on:
 * - Usage frequency (usedCount): More frequently used items get higher scores
 * - Memory efficiency (usedBytes): Smaller items get higher scores per byte
 * - Time relevance (timeScore): Recently created/accessed items get higher scores
 *
 * Formula: (usedCount * 1024) / usedBytes / timeScore
 *
 * @template OUTPUT - The type of the cached output value
 * @template INPUT - The type of the cache key input
 * @param cacher - The PromiseCacher instance containing cache configuration
 * @param task - The CacheTask to calculate score for
 * @returns A numeric score where higher values indicate higher cache retention priority
 */
export function calcCacheScoreDefaultFn<OUTPUT = any, INPUT = string>(
  cacher: PromiseCacher<OUTPUT, INPUT>,
  task: CacheTask<OUTPUT, INPUT>,
): number {
  const usedBytes = Math.max(task.usedBytes, 1);
  const now = Date.now();
  let timeScore =
    (now * 2 - task.createdAt - task.lastAccessedAt) /
    2 /
    cacher.cacheMillisecond;
  if (timeScore === 0) timeScore = 1;

  return (task.usedCount * 1024) / usedBytes / timeScore;
}
