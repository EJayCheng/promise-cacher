import { PromiseCacher } from './promise-cacher';
import { delay } from './util/delay';
describe('PromiseCacher', () => {
  const fetchCount: { [key: string]: number } = {};
  const cacher = new PromiseCacher<string, string>(async (key: string) => {
    await delay(500);
    if (!fetchCount[key]) fetchCount[key] = 0;
    return `${key}_${fetchCount[key]++}`;
  });

  it('get', async () => {
    const res = cacher.get('a');
    const res2 = cacher.get('a');
    expect(await res).toEqual('a_0');
    expect(await res2).toEqual('a_0');
    const res3 = await cacher.get('a', true);
    expect(res3).toEqual('a_1');
  });

  it('has', async () => {
    const key = 'b';
    expect(cacher.has(key)).toEqual(false);
    const res = await cacher.get(key);
    expect(res).toEqual('b_0');
    expect(cacher.has(key)).toEqual(true);
    cacher.delete(key);
    expect(cacher.has(key)).toEqual(false);
  });

  it('set', async () => {
    const key = 'c';
    cacher.set(key, 'c_0');
    const res = await cacher.get(key);
    expect(res).toEqual('c_0');
  });

  it('delete', async () => {
    const key = 'd';
    cacher.set(key, 'd_0');
    expect(cacher.has(key)).toEqual(true);
    cacher.delete(key);
    expect(cacher.has(key)).toEqual(false);
  });

  it('statistics', async () => {
    const statistics = cacher.statistics();
    const keys = [
      'cacheCount',
      'usedMemory',
      'usedMemoryBytes',
      'usedCountTotal',
      'maxUsedCount',
      'minUsedCount',
      'avgUsedCount',
      'overMemoryLimitCount',
      'releasedMemoryBytes',
    ];
    for (const key of keys) {
      expect(statistics).toHaveProperty(key);
    }
  });

  afterAll(() => {
    cacher.clear();
  });
});
