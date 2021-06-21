import { PromiseCacher } from "./promise-cacher";
import { delay } from "./util/timeout";
describe("PromiseCacher", () => {
  const fetchCount: { [key: string]: number } = {};
  const cacher = new PromiseCacher<string, string>(async (key: string) => {
    await delay(500);
    if (!fetchCount[key]) fetchCount[key] = 0;
    return `${key}_${fetchCount[key]++}`;
  });

  it("get", async () => {
    let res = cacher.get("a");
    let res2 = cacher.get("a");
    expect(await res).toEqual("a_0");
    expect(await res2).toEqual("a_0");
    let res3 = await cacher.get("a", true);
    expect(res3).toEqual("a_1");
  });

  it("has", async () => {
    let key = "b";
    expect(cacher.has(key)).toEqual(false);
    let res = await cacher.get(key);
    expect(res).toEqual("b_0");
    expect(cacher.has(key)).toEqual(true);
    cacher.delete(key);
    expect(cacher.has(key)).toEqual(false);
  });

  it("set", async () => {
    let key = "c";
    cacher.set(key, "c_0");
    let res = await cacher.get(key);
    expect(res).toEqual("c_0");
  });

  it("delete", async () => {
    let key = "d";
    cacher.set(key, "d_0");
    expect(cacher.has(key)).toEqual(true);
    cacher.delete(key);
    expect(cacher.has(key)).toEqual(false);
  });

  it("statistics", async () => {
    let statistics = cacher.statistics();
    let keys = [
      "cacheCount",
      "usedMemory",
      "usedMemoryBytes",
      "usedCountTotal",
      "maxUsedCount",
      "minUsedCount",
      "avgUsedCount",
      "overMemoryLimitCount",
      "releasedMemoryBytes",
    ];
    for (let key of keys) {
      expect(statistics).toHaveProperty(key);
    }
  });

  afterAll(() => {
    cacher.clear();
  });
});
