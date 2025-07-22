import { ExpirePolicyType, PromiseCacher } from '../';

// 使用範例和最佳實踐
console.log('=== Promise Cacher 使用範例和最佳實踐 ===\n');

// 1. 基本使用範例
console.log('1. 基本 API 快取');
const apiCacher = new PromiseCacher<
  { data: string; timestamp: number },
  string
>(
  async (endpoint: string) => {
    console.log(`Fetching: ${endpoint}`);
    // 模擬 API 呼叫
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { data: `Data from ${endpoint}`, timestamp: Date.now() };
  },
  {
    cacheMillisecond: 30 * 1000, // 30 秒快取
  },
);

async function basicExample(): Promise<void> {
  const result1 = await apiCacher.get('/api/users');
  console.log('First call result:', result1.data);

  const result2 = await apiCacher.get('/api/users');
  console.log('Second call result (cached):', result2.data);

  console.log('Cache statistics:', apiCacher.statistics());
}

// 2. 進階配置範例
console.log('\n2. 進階配置範例');
const advancedCacher = new PromiseCacher<string, string>(
  async (key: string) => {
    // 模擬不同延遲的操作
    const delay = key.includes('slow') ? 500 : 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return `Result for ${key}`;
  },
  {
    // 使用閒置過期策略
    expirePolicy: ExpirePolicyType.IDLE,
    cacheMillisecond: 10 * 1000, // 10 秒閒置過期

    // 記憶體管理
    freeUpMemoryPolicy: {
      maxMemoryByte: 1024 * 1024, // 1MB 限制
      minMemoryByte: 512 * 1024, // 清理到 512KB
    },

    // 並發控制
    maxConcurrentRequests: 5,

    // 超時控制
    timeoutMillisecond: 2000, // 2 秒超時

    // 定期清理
    flushInterval: 5 * 1000, // 5 秒清理間隔
  },
);

// 3. 錯誤處理範例
console.log('\n3. 錯誤處理範例');
const errorHandlingCacher = new PromiseCacher<string, string>(
  async (key: string) => {
    if (key === 'error') {
      throw new Error('Simulated error');
    }
    return `Success: ${key}`;
  },
);

async function errorExample(): Promise<void> {
  try {
    await errorHandlingCacher.get('error');
  } catch (error) {
    console.log('Caught error:', (error as Error).message);
  }

  const success = await errorHandlingCacher.get('success');
  console.log('Success result:', success);
}

// 4. 效能監控範例
console.log('\n4. 效能監控範例');
async function performanceExample(): Promise<void> {
  interface DataItem {
    id: number;
    data: string;
    size: number;
  }

  const perfCacher = new PromiseCacher<DataItem, number>(async (id: number) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 200 + 50),
    );
    return { id, data: `Data-${id}`, size: Math.floor(Math.random() * 1000) };
  });

  // 執行一些操作
  const promises: Promise<DataItem>[] = [];
  for (let i = 0; i < 20; i++) {
    promises.push(perfCacher.get(i % 5)); // 重複一些鍵以測試快取效果
  }

  await Promise.all(promises);

  const stats = perfCacher.statistics();
  console.log('Performance Statistics:');
  console.log(`- Cache entries: ${stats.cacheCount}`);
  console.log(`- Memory usage: ${stats.usedMemory}`);
  console.log(`- Total requests: ${stats.usedCountTotal}`);
  console.log(
    `- Average response time: ${stats.performance.avgResponseTime.toFixed(2)}ms`,
  );
  console.log(
    `- Cache hit ratio: ${(((stats.usedCountTotal - stats.performance.totalFetchCount) / stats.usedCountTotal) * 100).toFixed(1)}%`,
  );

  perfCacher.clear();
}

// 5. 最佳實踐建議
console.log('\n5. 最佳實踐建議');

// 配置建議
interface ProductionConfig {
  cacheMillisecond: number;
  releaseMemoryPolicy: {
    maxMemoryByte: number;
    minMemoryByte: number;
  };
  maxConcurrentRequests: number;
  flushInterval: number;
  timeoutMillisecond: number;
}

const productionConfig: ProductionConfig = {
  // 根據應用類型調整快取時間
  cacheMillisecond: 5 * 60 * 1000, // 5 分鐘適合大部分 API

  // 記憶體限制建議
  releaseMemoryPolicy: {
    maxMemoryByte: 50 * 1024 * 1024, // 50MB (根據可用記憶體調整)
    minMemoryByte: 25 * 1024 * 1024, // 50% 的最大值
  },

  // 並發控制 (根據後端服務能力調整)
  maxConcurrentRequests: 10,

  // 定期清理 (不要太頻繁以免影響效能)
  flushInterval: 60 * 1000, // 1 分鐘

  // 超時設定 (不要超過快取時間)
  timeoutMillisecond: 30 * 1000, // 30 秒
};

console.log('Production configuration example:', productionConfig);

// 6. 記憶體效率技巧
console.log('\n6. 記憶體效率技巧');

// 使用適當的鍵值轉換
const efficientCacher = new PromiseCacher<string, any>(
  async (data: any) => {
    return `Processed: ${JSON.stringify(data)}`;
  },
  {
    // 自定義鍵值轉換以避免重複
    cacheKeyTransform: (data: any) => {
      if (typeof data === 'object' && data !== null) {
        // 對物件使用穩定的序列化
        return JSON.stringify(data, Object.keys(data).sort());
      }
      return String(data);
    },
  },
);

console.log('Memory efficiency tips:');
console.log('- Use appropriate cache key transformation');
console.log('- Set reasonable memory limits');
console.log('- Monitor cache statistics regularly');
console.log('- Use IDLE policy for frequently accessed data');
console.log('- Use EXPIRE policy for time-sensitive data');

// 7. 類型安全的使用範例
console.log('\n7. 類型安全的使用範例');

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

class CachedUserRepository implements UserRepository {
  private userByIdCache = new PromiseCacher<User | null, string>(
    async (id: string) => {
      // 模擬資料庫查詢
      console.log(`Fetching user by ID: ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (id === 'not-found') return null;

      return {
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`,
        createdAt: new Date(),
      };
    },
    {
      cacheMillisecond: 5 * 60 * 1000, // 5 分鐘
      freeUpMemoryPolicy: {
        maxMemoryByte: 10 * 1024 * 1024, // 10MB
        minMemoryByte: 5 * 1024 * 1024, // 5MB
      },
    },
  );

  private userByEmailCache = new PromiseCacher<User | null, string>(
    async (email: string) => {
      console.log(`Fetching user by email: ${email}`);
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (email === 'notfound@example.com') return null;

      const id = email.split('@')[0];
      return {
        id,
        name: `User ${id}`,
        email,
        createdAt: new Date(),
      };
    },
    {
      cacheMillisecond: 3 * 60 * 1000, // 3 分鐘 (email 查詢較少快取時間)
    },
  );

  async findById(id: string): Promise<User | null> {
    return this.userByIdCache.get(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userByEmailCache.get(email);
  }

  getStatistics() {
    return {
      userByIdCache: this.userByIdCache.statistics(),
      userByEmailCache: this.userByEmailCache.statistics(),
    };
  }

  clearCaches(): void {
    this.userByIdCache.clear();
    this.userByEmailCache.clear();
  }
}

async function typeSafeExample(): Promise<void> {
  const userRepo = new CachedUserRepository();

  // 類型安全的使用
  const user1 = await userRepo.findById('123');
  console.log('User by ID:', user1?.name);

  const user2 = await userRepo.findByEmail('test@example.com');
  console.log('User by email:', user2?.email);

  // 快取命中
  const user3 = await userRepo.findById('123');
  console.log('Cached user:', user3?.name);

  console.log('Repository statistics:', userRepo.getStatistics());

  userRepo.clearCaches();
}

// 執行所有範例
async function runAllExamples(): Promise<void> {
  try {
    await basicExample();
    await errorExample();
    await performanceExample();
    await typeSafeExample();

    console.log('\n=== 所有範例執行完成 ===');
    console.log('Promise Cacher 提供了強大且靈活的快取解決方案！');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// 如果直接執行此檔案，則運行所有範例
if (require.main === module) {
  runAllExamples();
}

export {
  basicExample,
  CachedUserRepository,
  errorExample,
  performanceExample,
  runAllExamples,
  typeSafeExample,
};
