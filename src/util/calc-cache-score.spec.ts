import { CacheTask } from '../cache-task';
import { PromiseCacher } from '../promise-cacher';
import { calcCacheScoreDefaultFn } from './calc-cache-score';

describe('calcCacheScoreDefaultFn', () => {
  // Mock objects for testing
  const createMockCacher = (ttlMs: number = 60000): PromiseCacher<any, any> => {
    return {
      ttlMs,
    } as PromiseCacher<any, any>;
  };

  const createMockTask = (
    usedCount: number,
    usedBytes: number,
    createdAt: number,
    lastAccessedAt: number,
  ): CacheTask<any, any> => {
    return {
      usedCount,
      usedBytes,
      createdAt,
      lastAccessedAt,
    } as CacheTask<any, any>;
  };

  it('should calculate score correctly with basic values', () => {
    const cacher = createMockCacher(60000); // 1 minute
    const task = createMockTask(10, 1024, 1000, 2000);
    const now = 10000;

    // Mock Date.now()
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const score = calcCacheScoreDefaultFn(cacher, task);

    // Expected calculation:
    // timeScore = (10000 * 2 - 1000 - 2000) / 2 / 60000 = 17000 / 2 / 60000 = 0.14166...
    // score = (10 * 1024) / 1024 / 0.14166... = 10 / 0.14166... ≈ 70.59

    expect(score).toBeCloseTo(70.59, 1);

    // Restore Date.now
    Date.now = originalDateNow;
  });

  it('should handle minimum usedBytes (prevents division by zero)', () => {
    const cacher = createMockCacher(60000);
    const task = createMockTask(5, 0, 1000, 2000); // usedBytes = 0
    const now = 10000;

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const score = calcCacheScoreDefaultFn(cacher, task);

    // usedBytes should be Math.max(0, 1) = 1
    // timeScore = (10000 * 2 - 1000 - 2000) / 2 / 60000 = 0.14166...
    // score = (5 * 1024) / 1 / 0.14166... ≈ 36141

    expect(score).toBeCloseTo(36141, 0);

    Date.now = originalDateNow;
  });

  it('should handle zero timeScore (prevents division by zero)', () => {
    const cacher = createMockCacher(60000);
    const now = 5000;
    // Create a scenario where timeScore would be 0
    const task = createMockTask(8, 512, now, now);

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const score = calcCacheScoreDefaultFn(cacher, task);

    // timeScore = (5000 * 2 - 5000 - 5000) / 2 / 60000 = 0 / 2 / 60000 = 0
    // But it should be set to 1 to prevent division by zero
    // score = (8 * 1024) / 512 / 1 = 16

    expect(score).toBe(16);

    Date.now = originalDateNow;
  });

  it('should give higher scores to frequently used items', () => {
    const cacher = createMockCacher(60000);
    const now = 10000;

    const highUsageTask = createMockTask(100, 1024, 1000, 2000);
    const lowUsageTask = createMockTask(10, 1024, 1000, 2000);

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const highScore = calcCacheScoreDefaultFn(cacher, highUsageTask);
    const lowScore = calcCacheScoreDefaultFn(cacher, lowUsageTask);

    expect(highScore).toBeGreaterThan(lowScore);
    expect(highScore / lowScore).toBeCloseTo(10, 0); // Should be 10x higher

    Date.now = originalDateNow;
  });

  it('should give higher scores to memory-efficient items', () => {
    const cacher = createMockCacher(60000);
    const now = 10000;

    const smallTask = createMockTask(10, 512, 1000, 2000); // Small memory usage
    const largeTask = createMockTask(10, 2048, 1000, 2000); // Large memory usage

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const smallScore = calcCacheScoreDefaultFn(cacher, smallTask);
    const largeScore = calcCacheScoreDefaultFn(cacher, largeTask);

    expect(smallScore).toBeGreaterThan(largeScore);
    expect(smallScore / largeScore).toBeCloseTo(4, 0); // Should be 4x higher (2048/512)

    Date.now = originalDateNow;
  });

  it('should give higher scores to recently accessed items', () => {
    const cacher = createMockCacher(60000);
    const now = 100000;

    const recentTask = createMockTask(10, 1024, 90000, 95000); // Recently accessed
    const oldTask = createMockTask(10, 1024, 10000, 20000); // Old access

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const recentScore = calcCacheScoreDefaultFn(cacher, recentTask);
    const oldScore = calcCacheScoreDefaultFn(cacher, oldTask);

    expect(recentScore).toBeGreaterThan(oldScore);

    Date.now = originalDateNow;
  });

  it('should work with different cache timeouts', () => {
    const shortCacheCacher = createMockCacher(30000); // 30 seconds
    const longCacheCacher = createMockCacher(300000); // 5 minutes

    const task = createMockTask(10, 1024, 1000, 2000);
    const now = 10000;

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const shortCacheScore = calcCacheScoreDefaultFn(shortCacheCacher, task);
    const longCacheScore = calcCacheScoreDefaultFn(longCacheCacher, task);

    // Shorter cache timeout results in larger timeScore (divides by smaller number)
    // which results in smaller final score (divides by larger timeScore)
    expect(longCacheScore).toBeGreaterThan(shortCacheScore);

    Date.now = originalDateNow;
  });

  it('should return positive scores for valid inputs', () => {
    const cacher = createMockCacher(60000);
    const task = createMockTask(1, 1, 1000, 2000);
    const now = 10000;

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const score = calcCacheScoreDefaultFn(cacher, task);

    expect(score).toBeGreaterThan(0);

    Date.now = originalDateNow;
  });

  it('should handle edge case with very small numbers', () => {
    const cacher = createMockCacher(1); // Very small cache timeout
    const task = createMockTask(1, 1, 0, 0);
    const now = 1;

    const originalDateNow = Date.now;
    Date.now = jest.fn(() => now);

    const score = calcCacheScoreDefaultFn(cacher, task);

    expect(score).toBeGreaterThan(0);
    expect(Number.isFinite(score)).toBe(true);

    Date.now = originalDateNow;
  });
});
