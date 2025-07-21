import * as md5 from 'md5';
import { cacheKeyTransformDefaultFn } from './cache-key-transform-default-fn';

describe('CacheKeyTransform', () => {
  it('string', async () => {
    for (let i = 1; i <= 32; i++) {
      const key = 'a'.repeat(i);
      expect(cacheKeyTransformDefaultFn(key)).toEqual(md5(key));
    }
  });

  it('long string', async () => {
    expect(cacheKeyTransformDefaultFn('')).toEqual(md5(''));
    for (let i = 33; i <= 50; i++) {
      const key = 'a'.repeat(i);
      expect(cacheKeyTransformDefaultFn(key)).toEqual(md5(key));
    }
  });

  it('number', async () => {
    expect(cacheKeyTransformDefaultFn(Number.MAX_SAFE_INTEGER)).toEqual(
      md5(`${Number.MAX_SAFE_INTEGER}`),
    );
    expect(cacheKeyTransformDefaultFn(Number.MAX_SAFE_INTEGER)).toEqual(
      md5(`${Number.MAX_SAFE_INTEGER}`),
    );
    expect(cacheKeyTransformDefaultFn(0)).toEqual(md5('0'));
  });

  it('boolean', async () => {
    expect(cacheKeyTransformDefaultFn(true)).toEqual(md5('true'));
    expect(cacheKeyTransformDefaultFn(false)).toEqual(md5('false'));
  });

  it('bigint', async () => {
    expect(cacheKeyTransformDefaultFn(BigInt(0))).toEqual(md5('0'));
    for (let i = 1; i <= 32; i++) {
      const key = '9'.repeat(i);
      const bigInt = BigInt(key);
      expect(cacheKeyTransformDefaultFn(bigInt)).toEqual(md5(key));
    }
  });

  it('long bigint', async () => {
    for (let i = 33; i <= 50; i++) {
      const key = BigInt('9'.repeat(i));
      expect(cacheKeyTransformDefaultFn(key)).toEqual(md5('9'.repeat(i)));
    }
  });

  it('json', async () => {
    const key = { a: 'QWE', b: '123' };
    const key2 = { b: '123', a: 'QWE' };
    expect(cacheKeyTransformDefaultFn(key)).toEqual(
      cacheKeyTransformDefaultFn(key2),
    );
  });

  it('long json', async () => {
    const key = { abc: 'Q'.repeat(50) };
    const key2 = { abc: 'Q'.repeat(50) };
    expect(cacheKeyTransformDefaultFn(key)).toEqual(
      cacheKeyTransformDefaultFn(key2),
    );
  });

  it('null & undefined', async () => {
    expect(cacheKeyTransformDefaultFn(null)).toEqual(md5('null'));
    expect(cacheKeyTransformDefaultFn(undefined)).toEqual(md5('undefined'));
  });

  it('depth limit', async () => {
    // 創建一個深度超過 10 層的物件
    const deepObject: any = {};
    let current = deepObject;
    for (let i = 0; i < 12; i++) {
      current.next = {};
      current = current.next;
    }

    expect(() => cacheKeyTransformDefaultFn(deepObject)).toThrow(
      'Object depth exceeds 10 levels',
    );
  });

  it('array handling', async () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2, 3];
    expect(cacheKeyTransformDefaultFn(arr1)).toEqual(
      cacheKeyTransformDefaultFn(arr2),
    );

    // 測試包含物件的陣列
    const arr3 = [{ a: 1, b: 2 }, { c: 3 }];
    const arr4 = [{ b: 2, a: 1 }, { c: 3 }];
    expect(cacheKeyTransformDefaultFn(arr3)).toEqual(
      cacheKeyTransformDefaultFn(arr4),
    );
  });
});
