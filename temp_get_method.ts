  /**
   * Retrieves a cached value or fetches it if not available.
   * This is the primary method for accessing cached data.
   *
   * @param key - The key to identify the cached item
   * @param forceUpdate - If true, bypasses cache and fetches fresh data
   * @returns Promise resolving to the cached or freshly fetched value
   */
  public async get(key: INPUT, forceUpdate: boolean = false): Promise<OUTPUT> {
    this.usedCount++;
    const taskKey = this.transformCacheKey(key);
    
    if (forceUpdate) {
      this.taskMap.delete(taskKey);
      this.concurrentRequests.delete(taskKey);
    }
    
    const isExist = this.taskMap.has(taskKey);
    let task: CacheTask<OUTPUT, INPUT>;
    
    if (isExist) {
      task = this.taskMap.get(taskKey);
      if (task.status === CacheTaskStatusType.DEPRECATED) {
        task.release();
        task = null;
        this.concurrentRequests.delete(taskKey);
      }
    }
    
    if (!task) {
      // Check concurrent request limit
      const maxConcurrent = this.config.maxConcurrentRequests;
      if (maxConcurrent && this.concurrentRequests.size >= maxConcurrent) {
        this.performanceMetrics.rejectedRequestsCount++;
        throw new Error(`Maximum concurrent requests limit reached: ${maxConcurrent}`);
      }

      // Track concurrent request
      this.concurrentRequests.add(taskKey);
      this.performanceMetrics.currentConcurrentRequests = this.concurrentRequests.size;
      this.performanceMetrics.maxConcurrentRequestsReached = Math.max(
        this.performanceMetrics.maxConcurrentRequestsReached,
        this.concurrentRequests.size
      );
      this.performanceMetrics.totalFetchCount++;

      // Create wrapped fetch function that handles concurrency tracking
      const wrappedFetch = this.fetchFn(key).finally(() => {
        this.concurrentRequests.delete(taskKey);
        this.performanceMetrics.currentConcurrentRequests = this.concurrentRequests.size;
      });

      task = new CacheTask(this, key, wrappedFetch);
      this.taskMap.set(taskKey, task);
      // Only set timer when creating new tasks to reduce unnecessary calls
      this.setTimer();
    }
    
    const result = await task.output();
    
    // Track performance metrics
    if (task.responseTime) {
      this.performanceMetrics.responseTimes.push(task.responseTime);
      // Keep only last 1000 response times for memory efficiency
      if (this.performanceMetrics.responseTimes.length > 1000) {
        this.performanceMetrics.responseTimes = this.performanceMetrics.responseTimes.slice(-1000);
      }
    }
    
    return result;
  }
