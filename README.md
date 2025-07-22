# Promise Cacher

A sophisticated promise caching system that provides automatic memory management, configurable expiration policies, and performance monitoring for TypeScript/JavaScript applications.

[![npm version](https://badge.fury.io/js/promise-cacher.svg)](https://www.npmjs.com/package/promise-cacher)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Project Overview

Promise Cacher is a high-performance library that manages cached promises with features including:

- **Automatic memory cleanup** when limits are exceeded
- **Configurable cache expiration** (time-based or idle-based)
- **Performance statistics and monitoring**
- **Timeout handling** for long-running operations
- **Error handling policies** (cache or release errors)
- **Concurrent request limiting**
- **Memory usage tracking** and optimization
- **TypeScript support** with full type safety

### Key Problems Solved

1. **Memory Management**: Prevents memory leaks by automatically cleaning up expired or low-priority cache entries
2. **Performance Optimization**: Reduces redundant API calls and expensive computations
3. **Concurrent Request Control**: Manages parallel requests to prevent overwhelming backend services
4. **Error Handling**: Provides flexible strategies for handling and caching errors
5. **Monitoring**: Offers comprehensive statistics for performance analysis

## 🏗️ Technical Architecture

### Technology Stack

- **Language**: TypeScript 5.0+
- **Runtime**: Node.js (ES2016+)
- **Target**: ES5 with CommonJS modules
- **Dependencies**:
  - `lodash ^4.17.21` - Object manipulation and cloning
  - `md5 ^2.3.0` - Cache key hashing
- **Development Tools**:
  - TypeScript for compilation
  - Jest for testing
  - ESLint + Prettier for code quality
  - Rimraf for build cleanup

### Core Architecture

```
PromiseCacher
├── CacheTask (manages individual cache entries)
├── PromiseHolder (handles promise lifecycle)
├── RequestQueue (manages concurrent requests)
└── Utilities
    ├── Cache scoring and memory management
    ├── Size calculation and formatting
    └── Timeout and delay handling
```

## 📁 File System Structure

```
src/
├── index.ts                    # Main exports
├── promise-cacher.ts           # Core caching implementation
├── cache-task.ts              # Individual cache task management
├── define.ts                  # Type definitions and interfaces
├── constants.ts               # Default configuration values
├── examples/                  # Usage examples and demos
│   ├── best-practices-example.ts
│   ├── performance-analysis.ts
│   └── queue-demo.ts
└── util/                      # Utility functions
    ├── cache-key-transform-default-fn.ts
    ├── calc-cache-score.ts
    ├── delay.ts
    ├── json-to-string-for-console.ts
    ├── promise-holder.ts
    ├── request-queue.ts
    ├── size-format.ts
    ├── sizeof.ts
    └── timeout.ts
```

## 🔧 Development Setup

### Prerequisites

- Node.js 16+
- npm or yarn package manager

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage
```

### Code Quality Tools

The project uses the following tools for maintaining code quality:

- **ESLint**: TypeScript-ESLint with recommended rules
- **Prettier**: Code formatting (integrated with ESLint)
- **Jest**: Unit testing with TypeScript support
- **TypeScript**: Strict type checking with ES5 target

Configuration files:

- `eslint.config.mjs` - ESLint configuration
- `tsconfig.json` - TypeScript compiler options
- `jest` configuration in `package.json`

## 📚 Usage

### Basic Usage

```typescript
import { PromiseCacher } from 'promise-cacher';

// Create a cacher instance
const cacher = new PromiseCacher<UserData, string>(async (userId: string) => {
  // Your fetch function
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
});

// Use the cacher
const user = await cacher.get('user123'); // First call - fetches from API
const userCached = await cacher.get('user123'); // Second call - returns cached result
```

### Advanced Configuration

```typescript
import {
  PromiseCacher,
  ExpirationStrategyType,
  ErrorTaskPolicyType,
} from 'promise-cacher';

const cacher = new PromiseCacher<ApiResponse, string>(fetchFunction, {
  // Cache Policy
  cachePolicy: {
    ttlMs: 5 * 60 * 1000, // 5 minutes
    expirationStrategy: ExpirationStrategyType.IDLE, // or EXPIRE
    errorTaskPolicy: ErrorTaskPolicyType.CACHE, // or IGNORE
    flushIntervalMs: 60 * 1000, // 1 minute cleanup interval
  },

  // Fetching Policy
  fetchingPolicy: {
    useClones: true, // Return cloned objects for safety
    timeoutMs: 30 * 1000, // 30 second timeout
    concurrency: 10, // Max 10 concurrent requests
  },

  // Memory Management
  freeUpMemoryPolicy: {
    maxMemoryBytes: 50 * 1024 * 1024, // 50MB limit
    minMemoryBytes: 25 * 1024 * 1024, // Clean to 25MB
  },
});
```

### Configuration Parameters

#### Cache Policy

- **`ttlMs`**: Cache duration in milliseconds (default: 300,000ms / 5 minutes)
- **`expirationStrategy`**: `EXPIRE` (absolute TTL) or `IDLE` (idle timeout)
- **`errorTaskPolicy`**: `CACHE` (store errors) or `IGNORE` (don't cache errors)
- **`flushIntervalMs`**: Cleanup interval (default: 60,000ms / 1 minute)

#### Fetching Policy

- **`useClones`**: Return deep clones for data safety (default: false)
- **`timeoutMs`**: Request timeout limit (default: undefined)
- **`concurrency`**: Max concurrent requests (default: unlimited)

#### Memory Policy

- **`maxMemoryBytes`**: Trigger cleanup threshold (default: 10MB)
- **`minMemoryBytes`**: Target after cleanup (default: 5MB)

### Performance Monitoring

Promise Cacher provides comprehensive statistics organized by importance and usability:

```typescript
// Get comprehensive statistics
const stats = cacher.statistics();

// 🎯 Core efficiency metrics (most important)
console.log(`Hit Rate: ${stats.efficiency.hitRate}%`);
console.log(`Time Saved: ${stats.efficiency.timeSavedMs}ms`);

// ⚡ Performance insights
console.log(`Performance Gain: ${stats.performance.performanceGain}%`);
console.log(`95th Percentile: ${stats.performance.p95ResponseTime}ms`);

// 🔄 Current operations
console.log(`Active Requests: ${stats.operations.activeRequests}`);
console.log(`Queue Length: ${stats.operations.queuedRequests}`);

// 💾 Memory management
console.log(
  `Memory Usage: ${stats.memory.currentUsage} (${stats.memory.usagePercentage}%)`,
);
console.log(`Cleanup Count: ${stats.memory.cleanupCount}`);

// 📈 Cache inventory
console.log(`Total Items: ${stats.inventory.totalItems}`);
console.log(`High-Value Items: ${stats.inventory.highValueItems}`);

// ⚠️ System health
console.log(
  `Health Status: ${stats.health.status} (${stats.health.score}/100)`,
);
console.log(`Error Rate: ${stats.health.errorRate}%`);

// 🕒 Temporal patterns
console.log(`Uptime: ${stats.temporal.uptime}`);
console.log(`Requests/Min: ${stats.temporal.requestsPerMinute}`);
console.log(`Trend: ${stats.temporal.trend}`);
```

#### Statistics Categories

**🎯 Efficiency** - Core cache performance metrics

- Hit rate percentage and absolute numbers
- Time saved through caching
- Total requests processed

**⚡ Performance** - Response time analytics

- Average response times (cached vs fresh)
- Performance improvement ratios
- 95th percentile and response time ranges

**🔄 Operations** - Real-time operational status

- Current active and queued requests
- Concurrency limits and rejections
- Peak concurrency reached

**💾 Memory** - Memory usage and management

- Current usage vs limits with percentages
- Cleanup triggers and memory reclaimed
- Human-readable memory sizes

**📈 Inventory** - Cache content analysis

- Item counts and usage patterns
- High-value vs single-use items
- Average item usage statistics

**⚠️ Health** - System health monitoring

- Overall health status and score
- Error rates and recent issues
- Actionable warnings and alerts

**🕒 Temporal** - Time-based patterns

- Cache uptime and request rates
- Performance trends over time
- Usage pattern analysis

## 🧪 Testing

The project uses Jest for comprehensive testing:

```bash
# Run all tests
npm run test

# Run tests with coverage report
npm run test:coverage

# Watch mode for development
npm run test -- --watch
```

Testing includes:

- Unit tests for all core functionality
- Memory management tests
- Concurrency and timeout tests
- Performance benchmark tests
- Error handling validation

## 🚀 Deployment

### Build Process

```bash
# Clean and build
npm run build
```

This process:

1. Cleans the `dist/` directory
2. Compiles TypeScript to JavaScript (ES5/CommonJS)
3. Generates type declaration files
4. Creates source maps for debugging

### Publishing

The package is configured for npm registry:

```bash
npm publish
```

Build artifacts:

- `dist/index.js` - Main entry point
- `dist/index.d.ts` - Type definitions
- `dist/**/*.map` - Source maps

### Integration

Install in your project:

```bash
npm install promise-cacher
```

Import and use:

```typescript
import { PromiseCacher } from 'promise-cacher';
// or
const { PromiseCacher } = require('promise-cacher');
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test`
5. Ensure code quality: ESLint will check on commit
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📊 Performance Characteristics

- **Memory Efficiency**: Automatic cleanup prevents memory leaks
- **CPU Optimization**: Efficient scoring algorithms for cache eviction
- **Network Reduction**: Significantly reduces redundant API calls
- **Concurrency Control**: Prevents overwhelming backend services
- **Type Safety**: Full TypeScript support with generics

## 🔍 Examples

Check the `src/examples/` directory for comprehensive usage examples:

- `best-practices-example.ts` - Production-ready configurations
- `performance-analysis.ts` - Performance monitoring and optimization
- `queue-demo.ts` - Concurrent request management

---

For more detailed documentation and advanced usage patterns, please refer to the TypeScript definitions and example files in the repository.
