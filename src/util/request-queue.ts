/** Type definition for queued request */
export interface QueuedRequest<INPUT, OUTPUT> {
  taskKey: string;
  key: INPUT;
  resolve: (result: OUTPUT) => void;
  reject: (error: any) => void;
}

/** Performance metrics for the request queue */
export interface RequestQueueMetrics {
  currentQueueLength: number;
  maxQueueLengthReached: number;
}

/**
 * A specialized queue for managing concurrent request limits in the Promise Cacher.
 *
 * This class handles:
 * - Queuing requests when concurrent limits are reached
 * - Processing queued requests when slots become available
 * - Tracking queue performance metrics
 * - Efficient batch processing of multiple requests
 *
 * @template INPUT - The type of keys used to identify cache entries
 * @template OUTPUT - The type of values returned by cached promises
 */
export class RequestQueue<INPUT, OUTPUT> {
  /** Internal queue storage for pending requests */
  private queue: QueuedRequest<INPUT, OUTPUT>[] = [];

  /** Performance metrics tracking */
  private metrics: RequestQueueMetrics = {
    currentQueueLength: 0,
    maxQueueLengthReached: 0,
  };

  /**
   * Gets the current number of queued requests.
   */
  public get length(): number {
    return this.queue.length;
  }

  /**
   * Gets the current queue performance metrics.
   */
  public get performanceMetrics(): RequestQueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Checks if the queue is empty.
   */
  public get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Adds a request to the queue and returns a promise that resolves when the request is processed.
   *
   * @param taskKey - The transformed cache key
   * @param key - The original input key
   * @returns Promise that resolves to the cached or freshly fetched value
   */
  public enqueue(taskKey: string, key: INPUT): Promise<OUTPUT> {
    return new Promise<OUTPUT>((resolve, reject) => {
      this.queue.push({ taskKey, key, resolve, reject });
      this.updateMetrics();
    });
  }

  /**
   * Processes queued requests when concurrent slots become available.
   * Returns an array of requests ready for processing.
   *
   * @param availableSlots - Number of concurrent slots available for processing
   * @returns Array of requests to process
   */
  public dequeue(availableSlots: number): QueuedRequest<INPUT, OUTPUT>[] {
    if (this.queue.length === 0 || availableSlots <= 0) {
      return [];
    }

    // Process multiple requests at once if slots are available
    const requestsToProcess = this.queue.splice(0, availableSlots);
    this.updateMetrics();

    return requestsToProcess;
  }

  /**
   * Removes all requests from the queue.
   * This should be called when clearing the cache to prevent memory leaks.
   */
  public clear(): void {
    this.queue = [];
    this.resetMetrics();
  }

  /**
   * Gets all queued requests without removing them from the queue.
   * Useful for debugging or monitoring purposes.
   */
  public peek(): ReadonlyArray<QueuedRequest<INPUT, OUTPUT>> {
    return Object.freeze([...this.queue]);
  }

  /**
   * Updates the performance metrics after queue operations.
   */
  private updateMetrics(): void {
    this.metrics.currentQueueLength = this.queue.length;
    this.metrics.maxQueueLengthReached = Math.max(
      this.metrics.maxQueueLengthReached,
      this.queue.length,
    );
  }

  /**
   * Resets all performance metrics to their initial state.
   */
  private resetMetrics(): void {
    this.metrics = {
      currentQueueLength: 0,
      maxQueueLengthReached: 0,
    };
  }
}
