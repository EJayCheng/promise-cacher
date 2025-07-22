import { ExpirePolicyType, PromiseCacher } from '../';

interface PerformanceTestResult {
  testName: string;
  duration: number;
  apiCalls: number;
  cacheHits: number;
  avgResponseTime: number;
  memoryUsage: string;
  cacheCount: number;
}

class PerformanceAnalyzer {
  private results: PerformanceTestResult[] = [];
  private totalApiCalls = 0;

  async runComprehensiveAnalysis(): Promise<void> {
    console.log('=== Promise Cacher 進階性能分析 ===\n');

    await this.testBasicCaching();
    await this.testConcurrentDeduplication();
    await this.testMemoryManagement();
    await this.testHighVolumePerformance();
    await this.testErrorHandling();
    await this.testDifferentStrategies();

    this.printSummary();
  }

  private async testBasicCaching(): Promise<void> {
    console.log('1. 基本快取性能測試');
    let apiCallCount = 0;

    const simulateApiCall = async (
      key: string,
    ): Promise<{ id: string; data: string; timestamp: number }> => {
      apiCallCount++;
      this.totalApiCalls++;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 100 + 50),
      );
      return {
        id: key,
        data: `Data for ${key}`,
        timestamp: Date.now(),
      };
    };

    const cacher = new PromiseCacher(simulateApiCall, {
      cacheMillisecond: 10 * 1000,
    });

    const start = Date.now();

    // 第一次調用 - 應該觸發 API
    await cacher.get('user1');

    // 10 次相同調用 - 應該全部來自快取
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(cacher.get('user1'));
    }
    await Promise.all(promises);

    const duration = Date.now() - start;
    const stats = cacher.statistics();

    const result: PerformanceTestResult = {
      testName: 'Basic Caching',
      duration,
      apiCalls: apiCallCount,
      cacheHits: stats.usedCountTotal - apiCallCount,
      avgResponseTime: stats.performance.avgResponseTime,
      memoryUsage: stats.usedMemory,
      cacheCount: stats.cacheCount,
    };

    this.results.push(result);
    console.log(
      `完成: ${duration}ms, API calls: ${apiCallCount}/11, Cache hits: ${result.cacheHits}\n`,
    );

    cacher.clear();
  }

  private async testConcurrentDeduplication(): Promise<void> {
    console.log('2. 並發請求去重測試');
    let apiCallCount = 0;

    const cacher = new PromiseCacher(async (key: string) => {
      apiCallCount++;
      this.totalApiCalls++;
      await new Promise((resolve) => setTimeout(resolve, 200)); // 較長延遲以測試並發
      return `Result-${key}`;
    });

    const start = Date.now();

    // 同時發出 50 個相同請求
    const promises: Promise<string>[] = [];
    for (let i = 0; i < 50; i++) {
      promises.push(cacher.get('concurrent-test'));
    }

    const results = await Promise.all(promises);
    const duration = Date.now() - start;
    const stats = cacher.statistics();

    // 驗證所有結果相同
    const allSame = results.every((r) => r === results[0]);

    const result: PerformanceTestResult = {
      testName: 'Concurrent Deduplication',
      duration,
      apiCalls: apiCallCount,
      cacheHits: stats.usedCountTotal - apiCallCount,
      avgResponseTime: stats.performance.avgResponseTime,
      memoryUsage: stats.usedMemory,
      cacheCount: stats.cacheCount,
    };

    this.results.push(result);
    console.log(
      `完成: ${duration}ms, API calls: ${apiCallCount}/50, All same: ${allSame}\n`,
    );

    cacher.clear();
  }

  private async testMemoryManagement(): Promise<void> {
    console.log('3. 記憶體管理測試');
    let apiCallCount = 0;

    const cacher = new PromiseCacher(
      async (key: string) => {
        apiCallCount++;
        this.totalApiCalls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'x'.repeat(2000); // 2KB 每個條目
      },
      {
        freeUpMemoryPolicy: {
          maxMemoryByte: 20 * 1024, // 20KB 限制
          minMemoryByte: 10 * 1024, // 清理到 10KB
        },
        flushInterval: 500,
      },
    );

    const start = Date.now();

    // 創建超過記憶體限制的快取條目
    for (let i = 0; i < 30; i++) {
      await cacher.get(`memory-test-${i}`);
    }

    // 等待記憶體清理
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const duration = Date.now() - start;
    const stats = cacher.statistics();

    const result: PerformanceTestResult = {
      testName: 'Memory Management',
      duration,
      apiCalls: apiCallCount,
      cacheHits: stats.usedCountTotal - apiCallCount,
      avgResponseTime: stats.performance.avgResponseTime,
      memoryUsage: stats.usedMemory,
      cacheCount: stats.cacheCount,
    };

    this.results.push(result);
    console.log(
      `完成: ${duration}ms, Memory cleanups: ${stats.overMemoryLimitCount}, Final entries: ${stats.cacheCount}\n`,
    );

    cacher.clear();
  }

  private async testHighVolumePerformance(): Promise<void> {
    console.log('4. 大量操作性能測試');
    let apiCallCount = 0;

    const cacher = new PromiseCacher(
      async (id: number) => {
        apiCallCount++;
        this.totalApiCalls++;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 50 + 25),
        );
        return {
          id,
          data: `Data-${id}`,
          size: Math.floor(Math.random() * 1000),
        };
      },
      {
        maxConcurrentRequests: 20,
        freeUpMemoryPolicy: {
          maxMemoryByte: 5 * 1024 * 1024, // 5MB
        },
      },
    );

    const start = Date.now();

    // 1000 個請求，其中有重複
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 1000; i++) {
      const id = Math.floor(i / 2); // 50% 重複率
      promises.push(cacher.get(id));
    }

    await Promise.all(promises);
    const duration = Date.now() - start;
    const stats = cacher.statistics();

    const result: PerformanceTestResult = {
      testName: 'High Volume Performance',
      duration,
      apiCalls: apiCallCount,
      cacheHits: stats.usedCountTotal - apiCallCount,
      avgResponseTime: stats.performance.avgResponseTime,
      memoryUsage: stats.usedMemory,
      cacheCount: stats.cacheCount,
    };

    this.results.push(result);
    console.log(
      `完成: ${duration}ms, Cache hit rate: ${((result.cacheHits / 1000) * 100).toFixed(1)}%\n`,
    );

    cacher.clear();
  }

  private async testErrorHandling(): Promise<void> {
    console.log('5. 錯誤處理性能測試');
    let apiCallCount = 0;
    let errorCount = 0;

    const cacher = new PromiseCacher(async (key: string) => {
      apiCallCount++;
      this.totalApiCalls++;
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (key.includes('error')) {
        errorCount++;
        throw new Error(`Error for ${key}`);
      }

      return `Success: ${key}`;
    });

    const start = Date.now();

    const promises: Promise<any>[] = [];
    for (let i = 0; i < 100; i++) {
      const key = i % 10 === 0 ? `error-${i}` : `success-${i}`;
      promises.push(
        cacher.get(key).catch((error) => ({ error: error.message })),
      );
    }

    const results = await Promise.all(promises);
    const duration = Date.now() - start;
    const stats = cacher.statistics();

    const successCount = results.filter((r) => !('error' in r)).length;

    const result: PerformanceTestResult = {
      testName: 'Error Handling',
      duration,
      apiCalls: apiCallCount,
      cacheHits: stats.usedCountTotal - apiCallCount,
      avgResponseTime: stats.performance.avgResponseTime,
      memoryUsage: stats.usedMemory,
      cacheCount: stats.cacheCount,
    };

    this.results.push(result);
    console.log(
      `完成: ${duration}ms, Success: ${successCount}, Errors: ${errorCount}\n`,
    );

    cacher.clear();
  }

  private async testDifferentStrategies(): Promise<void> {
    console.log('6. 不同策略比較測試');

    // TTL 策略
    const ttlCacher = new PromiseCacher(
      async (key: string) => {
        this.totalApiCalls++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return `TTL-${key}`;
      },
      {
        expirePolicy: ExpirePolicyType.EXPIRE,
        cacheMillisecond: 2000,
      },
    );

    // IDLE 策略
    const idleCacher = new PromiseCacher(
      async (key: string) => {
        this.totalApiCalls++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return `IDLE-${key}`;
      },
      {
        expirePolicy: ExpirePolicyType.IDLE,
        cacheMillisecond: 2000,
      },
    );

    // TTL 測試
    const ttlStart = Date.now();
    await ttlCacher.get('test');
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待 1 秒
    await ttlCacher.get('test'); // 應該命中快取
    await new Promise((resolve) => setTimeout(resolve, 1500)); // 再等待 1.5 秒，總共 2.5 秒
    await ttlCacher.get('test'); // 應該過期，重新獲取
    const ttlDuration = Date.now() - ttlStart;

    // IDLE 測試
    const idleStart = Date.now();
    await idleCacher.get('test');
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待 1 秒
    await idleCacher.get('test'); // 命中快取，重置 idle 時間
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 再等待 1 秒
    await idleCacher.get('test'); // 仍然命中快取
    const idleDuration = Date.now() - idleStart;

    console.log(`TTL 策略完成: ${ttlDuration}ms`);
    console.log(`IDLE 策略完成: ${idleDuration}ms\n`);

    ttlCacher.clear();
    idleCacher.clear();
  }

  private printSummary(): void {
    console.log('=== 性能分析總結 ===');
    console.log(`總 API 調用次數: ${this.totalApiCalls}`);
    console.log('');

    console.log('測試結果詳情:');
    console.log(
      '┌─────────────────────────┬──────────┬───────────┬─────────────┬──────────────┬─────────────┬─────────────┐',
    );
    console.log(
      '│ 測試名稱                │ 持續時間  │ API 調用   │ 快取命中     │ 平均響應時間  │ 記憶體使用   │ 快取條目     │',
    );
    console.log(
      '├─────────────────────────┼──────────┼───────────┼─────────────┼──────────────┼─────────────┼─────────────┤',
    );

    this.results.forEach((result) => {
      const name = result.testName.padEnd(23);
      const duration = `${result.duration}ms`.padEnd(8);
      const apiCalls = result.apiCalls.toString().padEnd(9);
      const cacheHits = result.cacheHits.toString().padEnd(11);
      const avgTime = `${result.avgResponseTime.toFixed(1)}ms`.padEnd(12);
      const memory = result.memoryUsage.padEnd(11);
      const count = result.cacheCount.toString().padEnd(11);

      console.log(
        `│ ${name} │ ${duration} │ ${apiCalls} │ ${cacheHits} │ ${avgTime} │ ${memory} │ ${count} │`,
      );
    });

    console.log(
      '└─────────────────────────┴──────────┴───────────┴─────────────┴──────────────┴─────────────┴─────────────┘',
    );

    // 計算總體統計
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const totalCacheHits = this.results.reduce(
      (sum, r) => sum + r.cacheHits,
      0,
    );
    const totalRequests = this.results.reduce(
      (sum, r) => sum + r.apiCalls + r.cacheHits,
      0,
    );
    const overallCacheHitRate = (
      (totalCacheHits / totalRequests) *
      100
    ).toFixed(1);

    console.log('');
    console.log('總體統計:');
    console.log(`- 總測試時間: ${totalDuration}ms`);
    console.log(`- 總請求數: ${totalRequests}`);
    console.log(`- 總 API 調用: ${this.totalApiCalls}`);
    console.log(`- 總快取命中: ${totalCacheHits}`);
    console.log(`- 整體快取命中率: ${overallCacheHitRate}%`);
    console.log(
      `- 性能提升: ${(totalRequests / this.totalApiCalls).toFixed(1)}x`,
    );
  }
}

// 如果直接執行此檔案
if (require.main === module) {
  const analyzer = new PerformanceAnalyzer();
  analyzer.runComprehensiveAnalysis().catch(console.error);
}

export { PerformanceAnalyzer, PerformanceTestResult };
