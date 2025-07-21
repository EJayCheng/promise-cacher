# Promise Cacher

A sophisticated TypeScript library that provides asynchronous memory caching with intelligent memory management, configurable expiration policies, and comprehensive performance monitoring.

[![npm version](https://badge.fury.io/js/promise-cacher.svg)](https://www.npmjs.com/package/promise-cacher)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Project Overview

**Promise Cacher** solves the problem of redundant asynchronous operations and memory management in JavaScript/TypeScript applications. It provides:

### Key Features

- **🚀 Promise Deduplication**: Prevents multiple identical async operations from running simultaneously
- **💾 Intelligent Memory Management**: Automatic cleanup when memory limits are exceeded
- **⏰ Flexible Expiration Policies**: Time-based (EXPIRE) or idle-based (IDLE) cache expiration
- **📊 Performance Monitoring**: Comprehensive statistics and cache hit/miss tracking
- **🔧 Configurable Timeout Handling**: Prevents long-running operations from blocking the cache
- **🛡️ Error Handling Policies**: Choose whether to cache errors or release them immediately
- **🎯 TypeScript Support**: Full type safety with generic support

### Problems It Solves

1. **Redundant API Calls**: Eliminates duplicate requests for the same data
2. **Memory Leaks**: Automatic memory cleanup based on configurable policies
3. **Performance Bottlenecks**: Reduces load on external services and improves response times
4. **Resource Management**: Intelligent cache scoring for optimal memory utilization

## Technical Architecture

### Technology Stack

- **Language**: TypeScript 5.0+
- **Runtime**: Node.js (ES2016+ compatible)
- **Build Target**: ES5 with CommonJS modules
- **Testing Framework**: Jest 30.0+ with ts-jest
- **Code Quality**: ESLint 9.31+ with TypeScript ESLint rules
- **Code Formatting**: Prettier 3.6+

### Key Dependencies

```json
{
  "lodash": "^4.17.21", // Deep cloning and utility functions
  "md5": "^2.3.0" // Default cache key transformation
}
```

### Development Dependencies

- **@types/jest**: Type definitions for Jest testing framework
- **@types/lodash**: Type definitions for Lodash utilities
- **@types/md5**: Type definitions for MD5 hashing
- **eslint-config-prettier**: Integration between ESLint and Prettier
- **typescript-eslint**: TypeScript-specific linting rules

## File System Structure

```
promise-cacher/
├── src/                           # Source code directory
│   ├── index.ts                   # Main entry point - exports all public APIs
│   ├── promise-cacher.ts          # Core PromiseCacher class implementation
│   ├── cache-task.ts              # CacheTask class - manages individual cache entries
│   ├── define.ts                  # Type definitions and interfaces
│   ├── constants.ts               # Default configuration constants
│   │
│   ├── util/                      # Utility functions directory
│   │   ├── cache-key-transform-default-fn.ts  # Default cache key transformation
│   │   ├── calc-cache-score.ts               # Cache scoring algorithm for cleanup
│   │   ├── delay.ts                          # Testing utility for delays
│   │   ├── size-format.ts                    # Memory size formatting utilities
│   │   ├── sizeof.ts                         # Memory usage calculation
│   │   └── timeout.ts                        # Timeout handling utilities
│   │
│   └── *.spec.ts                  # Test files (Jest unit tests)
│
├── dist/                          # Compiled output directory (generated)
├── package.json                   # Package configuration and dependencies
├── tsconfig.json                  # TypeScript compiler configuration
├── eslint.config.mjs              # ESLint configuration (ESM format)
├── .prettierrc                    # Prettier code formatting rules
├── jest.config.js                 # Jest testing configuration (in package.json)
├── LICENSE                        # MIT License
└── README.md                      # Project documentation
```

### Architecture Components

1. **PromiseCacher**: Main caching engine with memory management
2. **CacheTask**: Individual cache entry lifecycle management
3. **Utility Functions**: Supporting functions for key transformation, memory calculation, and scoring
4. **Type Definitions**: Comprehensive TypeScript interfaces for type safety

## Syntax Checking and Code Formatting

### ESLint Configuration

The project uses ESLint 9.31+ with TypeScript-specific rules:

- **Config File**: `eslint.config.mjs` (ESM format)
- **Parser**: `@typescript-eslint/parser` with project service
- **Extends**:
  - `@eslint/js` recommended rules
  - `@typescript-eslint` recommended type-checked rules
  - `eslint-plugin-prettier` for Prettier integration

### Key ESLint Rules

```javascript
{
  "@typescript-eslint/no-explicit-any": "off",           // Allows any type when needed
  "@typescript-eslint/no-floating-promises": "warn",    // Warns about unhandled promises
  "@typescript-eslint/require-await": "off",            // Allows non-async functions marked as async
  "prettier/prettier": "off"                            // Disabled in favor of separate Prettier runs
}
```

### Prettier Configuration

- **Config File**: `.prettierrc`
- **Settings**:
  ```json
  {
    "singleQuote": true, // Use single quotes
    "trailingComma": "all" // Add trailing commas everywhere possible
  }
  ```

### TypeScript Configuration

- **Target**: ES5 for broad compatibility
- **Module System**: CommonJS
- **Output Directory**: `./dist`
- **Features**: Decorators enabled, source maps generated, declaration files included

## Environment Variables

This library **does not require any environment variables** for operation. All configuration is handled through the `CacherConfig` interface passed to the constructor.

### Optional Runtime Configuration

All configuration is provided programmatically:

```typescript
const config: CacherConfig = {
  cacheMillisecond: 300000, // 5 minutes (default)
  timeoutMillisecond: 30000, // 30 seconds timeout
  flushInterval: 60000, // 1 minute cleanup interval
  releaseMemoryPolicy: {
    maxMemoryByte: 10 * 1024 * 1024, // 10MB max memory
    minMemoryByte: 5 * 1024 * 1024, // 5MB target after cleanup
  },
};
```

## Deployment

### As an NPM Package

This library is published to NPM registry and can be deployed in any Node.js environment:

```bash
npm install promise-cacher
```

### Build Process

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build for production (generates ./dist folder)
npm run prepublish
```

### Distribution

- **Built Files**: Located in `./dist` directory after compilation
- **Entry Point**: `dist/index.js` (CommonJS)
- **Type Definitions**: `dist/index.d.ts` for TypeScript consumers
- **Registry**: Published to `https://registry.npmjs.org/`

### CI/CD Considerations

While no CI/CD configuration is present, recommended pipeline would include:

1. **Install Dependencies**: `npm ci`
2. **Run Linting**: `npm run lint` (if configured)
3. **Run Tests**: `npm test`
4. **Run Coverage**: `npm run test:coverage`
5. **Build Package**: `npm run prepublish`
6. **Publish**: `npm publish` (on version tags)

## Testing

### Testing Framework

- **Framework**: Jest 30.0+ with TypeScript support
- **Preprocessor**: ts-jest for TypeScript compilation
- **Environment**: Node.js environment
- **Coverage**: Available via `npm run test:coverage`

### Test Configuration

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testRegex": "(/__tests__/.*|\\.(test|spec))\\.(ts|tsx|js)$",
  "moduleFileExtensions": ["ts", "tsx", "js"]
}
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npx jest src/promise-cacher.spec.ts
```

### Test Structure

Each main source file has a corresponding `.spec.ts` file:

- `promise-cacher.spec.ts` - Core functionality tests
- `cache-task.spec.ts` - Individual cache task tests
- `util/*.spec.ts` - Utility function tests

## Usage

### Basic Usage

```typescript
import { PromiseCacher } from 'promise-cacher';

// Create a cacher with a fetch function
const apiCacher = new PromiseCacher<UserData, string>(
  async (userId: string) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
);

// Use the cache
const user1 = await apiCacher.get('user123'); // Fetches from API
const user2 = await apiCacher.get('user123'); // Returns cached result
const user3 = await apiCacher.get('user123', true); // Forces fresh fetch
```

### Advanced Configuration

```typescript
import {
  PromiseCacher,
  ReleaseCachePolicyType,
  ErrorTaskPolicyType,
} from 'promise-cacher';

const advancedCacher = new PromiseCacher<ApiResponse, ApiRequest>(
  async (request: ApiRequest) => {
    // Your async operation
    return await apiCall(request);
  },
  {
    // Cache for 10 minutes
    cacheMillisecond: 10 * 60 * 1000,

    // Use idle-based expiration (resets timer on each access)
    releaseCachePolicy: ReleaseCachePolicyType.IDLE,

    // Cache errors instead of rethrowing immediately
    errorTaskPolicy: ErrorTaskPolicyType.CACHE,

    // Memory management
    releaseMemoryPolicy: {
      maxMemoryByte: 50 * 1024 * 1024, // 50MB limit
      minMemoryByte: 25 * 1024 * 1024, // Clean down to 25MB
    },

    // Cleanup every 30 seconds
    flushInterval: 30 * 1000,

    // Timeout requests after 15 seconds
    timeoutMillisecond: 15 * 1000,

    // Custom cache key transformation
    cacheKeyTransform: (input) => `custom_${JSON.stringify(input)}`,

    // Return cloned objects instead of shared references
    useClones: true,
  },
);
```

### Manual Cache Management

```typescript
// Check if key exists
if (cacher.has('user123')) {
  console.log('User is cached');
}

// Get all cached keys
const allKeys = cacher.keys();

// Manually set cache value
cacher.set('user456', userData);

// Remove specific entry
cacher.delete('user123');

// Clear entire cache
cacher.clear();

// Get cache statistics
const stats = cacher.statistics();
console.log(`Cache hit ratio: ${stats.usedCountTotal / stats.cacheCount}`);
console.log(`Memory usage: ${stats.usedMemory}`);
```

### Error Handling

```typescript
try {
  const result = await cacher.get('might-fail');
} catch (error) {
  // Handle error based on errorTaskPolicy configuration
  console.error('Cache operation failed:', error);
}
```

### Performance Monitoring

```typescript
const stats = cacher.statistics();
console.log({
  cacheCount: stats.cacheCount,
  memoryUsage: stats.usedMemory,
  totalRequests: stats.usedCountTotal,
  memoryCleanups: stats.overMemoryLimitCount,
  avgUsagePerEntry: stats.avgUsedCount,
});
```

## API Reference

### PromiseCacher Class

#### Constructor

```typescript
new PromiseCacher<OUTPUT, INPUT>(fetchFn, config?)
```

#### Methods

- `get(key, forceUpdate?)`: Retrieve cached value or fetch if not available
- `set(key, value)`: Manually set cache value
- `has(key)`: Check if key exists in cache
- `delete(key)`: Remove specific cache entry
- `clear()`: Remove all cache entries
- `keys()`: Get all cached keys
- `statistics()`: Get comprehensive cache statistics

#### Properties

- `cacheCount`: Number of cached entries
- `cacheMillisecond`: Cache expiration time
- `timeoutMillisecond`: Operation timeout limit

For detailed API documentation, refer to the TypeScript definitions in the source code.

## Getting Started

[GitHub](https://github.com/EJayCheng/promise-cacher) / [npm](https://www.npmjs.com/package/promise-cacher)

```bash
npm install promise-cacher
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code style (ESLint + Prettier)
4. Add tests for your changes
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add some amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/EJayCheng/promise-cacher/issues)
- NPM Package: [View on NPM](https://www.npmjs.com/package/promise-cacher)
