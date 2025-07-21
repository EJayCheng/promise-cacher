import { PromiseCacher } from '../promise-cacher';
import { delay } from '../util/delay';

// 創建一個示例來演示新的排隊功能
async function demonstrateQueueingFeature() {
  console.log('開始演示 maxConcurrentRequests 排隊功能\n');

  // 創建一個有並發限制的 cacher
  const cacher = new PromiseCacher(
    async (key: string) => {
      console.log(`🔄 開始處理: ${key}`);
      await delay(1000); // 模擬耗時操作
      console.log(`✅ 完成處理: ${key}`);
      return `result-${key}`;
    },
    {
      maxConcurrentRequests: 2, // 最多同時處理 2 個請求
    },
  );

  console.log('📊 發送 5 個並發請求 (限制: 2 個同時執行)...\n');

  const startTime = Date.now();

  // 同時發送 5 個請求
  const promises = [
    cacher.get('request-1'),
    cacher.get('request-2'),
    cacher.get('request-3'), // 這個會被排隊
    cacher.get('request-4'), // 這個會被排隊
    cacher.get('request-5'), // 這個會被排隊
  ];

  // 檢查初始狀態
  setTimeout(() => {
    const stats = cacher.statistics();
    console.log(`📈 當前狀態:`);
    console.log(
      `   - 正在執行的請求: ${stats.performance.currentConcurrentRequests}`,
    );
    console.log(`   - 排隊中的請求: ${stats.performance.currentQueueLength}`);
    console.log(
      `   - 最大排隊長度: ${stats.performance.maxQueueLengthReached}\n`,
    );
  }, 100);

  // 等待所有請求完成
  const results = await Promise.all(promises);
  const endTime = Date.now();

  console.log(`🎉 所有請求完成! 總耗時: ${endTime - startTime}ms\n`);

  // 檢查最終狀態
  const finalStats = cacher.statistics();
  console.log(`📊 最終統計:`);
  console.log(`   - 總請求數: ${finalStats.performance.totalFetchCount}`);
  console.log(
    `   - 當前並發請求: ${finalStats.performance.currentConcurrentRequests}`,
  );
  console.log(
    `   - 當前排隊長度: ${finalStats.performance.currentQueueLength}`,
  );
  console.log(
    `   - 最大並發請求: ${finalStats.performance.maxConcurrentRequestsReached}`,
  );
  console.log(
    `   - 最大排隊長度: ${finalStats.performance.maxQueueLengthReached}`,
  );
  console.log(
    `   - 被拒絕的請求: ${finalStats.performance.rejectedRequestsCount}`,
  );

  console.log(`\n✨ 結果:`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ${result}`);
  });

  console.log(`\n🔍 注意: 沒有任何請求被拒絕，全部都通過排隊機制成功處理了！`);
}

demonstrateQueueingFeature();
