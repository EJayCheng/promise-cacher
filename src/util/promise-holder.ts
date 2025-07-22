export class PromiseHolder<T> {
  public liberatedAt?: number;

  private _promise: Promise<T>;
  private _resolveFn: (value: T | PromiseLike<T>) => void;
  private _rejectFn: (reason?: any) => void;

  public get isLiberated(): boolean {
    return !!this.liberatedAt;
  }

  constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolveFn = resolve;
      this._rejectFn = reject;
    });
  }

  public getPromise(): Promise<T> {
    return this._promise;
  }

  public get promise(): Promise<T> {
    return this._promise;
  }

  public resolve(value: T | PromiseLike<T>): void {
    if (this.isLiberated) {
      throw new Error(
        'Cannot resolve a PromiseHolder that has already been liberated.',
      );
    }
    this.liberatedAt = Date.now();
    this._resolveFn(value);
  }

  public reject(reason?: Error): void {
    if (this.isLiberated) {
      throw new Error(
        'Cannot reject a PromiseHolder that has already been liberated.',
      );
    }
    this.liberatedAt = Date.now();
    this._rejectFn(reason);
  }
}
