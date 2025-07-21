# Promise Cacher

A sophisticated TypeScript promise caching library that provides automatic memory management, configurable expiration policies, and comprehensive performance monitoring.

## 🚀 Features

- **Smart Memory Management**: Automatic cleanup when memory limits are exceeded
- **Flexible Expiration Policies**: Time-based (TTL) or idle-based cache expiration
- **Performance Monitoring**: Comprehensive statistics and metrics tracking
- **Concurrent Request Management**: Deduplication and concurrent request limiting
- **TypeScript Support**: Full type safety with generic type parameters
- **Error Handling**: Configurable error caching policies
- **WeakMap Optimization**: Efficient memory usage for object keys
- **Timeout Control**: Prevent long-running operations from blocking cache

## 📦 Installation

```bash
npm install promise-cacher
```

## 🏗️ Technical Architecture

### Core Technologies

- **Language**: TypeScript 5.x
- **Runtime**: Node.js (ES5 target for broad compatibility)
- **Dependencies**:
  - `lodash` (^4.17.21) - Utility functions
  - `md5` (^2.3.0) - Hash generation for cache keys

### Development Tools

- **Testing**: Jest with TypeScript support
- **Code Quality**: ESLint with TypeScript and Prettier integration
- **Build**: TypeScript compiler with CommonJS modules
- **Package Management**: npm

## 📁 Project Structure

```
src/
├── index.ts                    # Main entry point
├── promise-cacher.ts          # Core PromiseCacher class
├── cache-task.ts              # Individual cache task management
├── define.ts                  # Type definitions and interfaces
├── constants.ts               # Default configuration values
├── examples/                  # Usage examples and demos
│   ├── best-practices-example.ts
│   ├── performance-analysis.ts
│   └── queue-demo.ts
└── util/                      # Utility modules
    ├── cache-key-transform-default-fn.ts
    ├── calc-cache-score.ts
    ├── delay.ts
    ├── request-queue.ts
    ├── size-format.ts
    ├── sizeof.ts
    └── timeout.ts
```

## 🛠️ Code Quality Tools

### ESLint Configuration

- **Parser**: TypeScript ESLint with type checking
- **Rules**: Recommended TypeScript rules with custom overrides
- **Integration**: Prettier for code formatting
- **Globals**: Node.js and Jest environments

### Prettier Settings

- Integrated with ESLint for consistent code formatting
- Configured via ESLint plugin for seamless development experience

### Jest Testing

- **Preset**: `ts-jest` for TypeScript support
- **Environment**: Node.js
- **Coverage**: Available via `npm run test:coverage`
- **Pattern**: Tests use `.spec.ts` or `.test.ts` extensions

## 🔧 Usage

### Basic Example

```typescript
import { PromiseCacher } from 'promise-cacher';

// Create a cacher for API calls
const apiCacher = new PromiseCacher<UserData, string>(
  async (userId: string) => {
    // Your fetch logic here
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
  {
    cacheMillisecond: 5 * 60 * 1000, // 5 minutes cache
  },
);

// Use the cache
const user = await apiCacher.get('user123');
const sameUser = await apiCacher.get('user123'); // Returns cached result
```

### Advanced Configuration

```typescript
import {
  PromiseCacher,
  ReleaseCachePolicyType,
  ErrorTaskPolicyType,
} from 'promise-cacher';

const advancedCacher = new PromiseCacher<string, string>(
  async (key: string) => {
    // Simulate API call
    const response = await fetch(`/api/data/${key}`);
    return response.text();
  },
  {
    // Cache expiration strategy
    releaseCachePolicy: ReleaseCachePolicyType.IDLE, // or EXPIRE
    cacheMillisecond: 10 * 60 * 1000, // 10 minutes

    // Error handling
    errorTaskPolicy: ErrorTaskPolicyType.RELEASE, // or CACHE

    // Memory management
    releaseMemoryPolicy: {
      maxMemoryByte: 50 * 1024 * 1024, // 50MB max
      minMemoryByte: 25 * 1024 * 1024, // Clean down to 25MB
    },

    // Performance settings
    timeoutMillisecond: 30000, // 30 second timeout
    maxConcurrentRequests: 10, // Limit concurrent requests
    useClones: false, // Use shared instances for better performance

    // Cache cleanup interval
    flushInterval: 60 * 1000, // Check every minute
  },
);
```

### API Methods

```typescript
// Get cached value or fetch if not exists
const result = await cacher.get(key);
const freshResult = await cacher.get(key, true); // Force refresh

// Set a value directly
cacher.set(key, value);

// Check if key exists in cache
const exists = cacher.has(key);

// Remove specific key
cacher.delete(key);

// Clear all cache
cacher.clear();

// Get comprehensive statistics
const stats = cacher.statistics();
```

## 📊 Configuration Options

### CacherConfig Interface

| Option                  | Type                     | Default   | Description                                    |
| ----------------------- | ------------------------ | --------- | ---------------------------------------------- |
| `releaseCachePolicy`    | `ReleaseCachePolicyType` | `EXPIRE`  | Cache expiration strategy (`EXPIRE` or `IDLE`) |
| `cacheMillisecond`      | `number`                 | `300000`  | Cache duration in milliseconds (5 minutes)     |
| `errorTaskPolicy`       | `ErrorTaskPolicyType`    | `RELEASE` | Error handling (`RELEASE` or `CACHE`)          |
| `releaseMemoryPolicy`   | `object`                 | -         | Memory management configuration                |
| `flushInterval`         | `number`                 | `60000`   | Cache cleanup interval (1 minute)              |
| `cacheKeyTransform`     | `function`               | -         | Custom key transformation function             |
| `timeoutMillisecond`    | `number`                 | -         | Operation timeout limit                        |
| `useClones`             | `boolean`                | `false`   | Whether to clone cached objects                |
| `maxConcurrentRequests` | `number`                 | -         | Maximum concurrent requests                    |

### Memory Policy Options

| Option           | Type       | Default    | Description                     |
| ---------------- | ---------- | ---------- | ------------------------------- |
| `maxMemoryByte`  | `number`   | `10485760` | Maximum memory threshold (10MB) |
| `minMemoryByte`  | `number`   | `5242880`  | Cleanup target threshold (5MB)  |
| `calcCacheValue` | `function` | -          | Custom cache value calculation  |

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- cache-task.spec.ts
```

### Test Structure

- Unit tests for all core components
- Integration tests for complex scenarios
- Performance benchmarks in examples
- Comprehensive coverage of edge cases

## 🚀 Build and Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Generate coverage report
npm run test:coverage
```

### Build Output

- **Target**: ES5 for broad compatibility
- **Module**: CommonJS
- **Output**: `dist/` directory with compiled JavaScript and type definitions
- **Source Maps**: Generated for debugging support

## 📈 Performance Statistics

The `statistics()` method provides comprehensive metrics:

```typescript
interface PromiseCacherStatistics {
  cacheCount: number; // Current cached items
  usedMemory: string; // Human-readable memory usage
  usedMemoryBytes: number; // Raw memory usage in bytes
  usedCountTotal: number; // Total cache access count
  maxUsedCount: number; // Highest access count
  minUsedCount: number; // Lowest access count
  avgUsedCount: number; // Average access count
  overMemoryLimitCount: number; // Memory limit exceeded count
  releasedMemoryBytes: number; // Total memory released
  performance: {
    avgResponseTime: number; // Average response time
    minResponseTime: number; // Fastest response time
    maxResponseTime: number; // Slowest response time
    totalFetchCount: number; // Total fetch operations
    currentConcurrentRequests: number; // Active requests
    maxConcurrentRequestsReached: number; // Peak concurrency
    rejectedRequestsCount: number; // Rejected requests
  };
}
```

## 🔍 Memory Management

The library includes intelligent memory management:

1. **Automatic Monitoring**: Continuously tracks memory usage
2. **Smart Cleanup**: Uses scoring algorithm considering:
   - Access frequency
   - Memory footprint
   - Time since last access
   - Cache age
3. **Configurable Thresholds**: Set custom memory limits
4. **WeakMap Optimization**: Efficient garbage collection for object keys

## ⚡ Performance Characteristics

- **Request Deduplication**: Multiple concurrent requests for the same key execute only once
- **Near-Zero Cache Hits**: Cached responses return in ~0ms
- **High Throughput**: Handles 1000+ requests in under 200ms
- **Memory Efficient**: Automatic cleanup prevents memory leaks
- **Concurrent Control**: Prevents resource exhaustion through request limiting

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👥 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## 🔗 Repository

[https://github.com/EJayCheng/promise-cacher](https://github.com/EJayCheng/promise-cacher)

---

**Author**: EJay Cheng  
**Version**: 2.0.0
