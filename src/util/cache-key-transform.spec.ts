import * as md5 from "md5";
import { cacheKeyTransformDefaultFn } from "./cache-key-transform";

describe("CacheKeyTransform", () => {
  it("string", async () => {
    for (let i = 1; i <= 32; i++) {
      let key = "a".repeat(i);
      expect(cacheKeyTransformDefaultFn(key)).toEqual(key);
    }
  });

  it("long string", async () => {
    expect(cacheKeyTransformDefaultFn("")).toEqual(md5(""));
    for (let i = 33; i <= 50; i++) {
      let key = "a".repeat(i);
      expect(cacheKeyTransformDefaultFn(key)).toEqual(md5(key));
    }
  });

  it("number", async () => {
    expect(cacheKeyTransformDefaultFn(Number.MAX_SAFE_INTEGER)).toEqual(
      `${Number.MAX_SAFE_INTEGER}`
    );
    expect(cacheKeyTransformDefaultFn(Number.MAX_SAFE_INTEGER)).toEqual(
      `${Number.MAX_SAFE_INTEGER}`
    );
    expect(cacheKeyTransformDefaultFn(0)).toEqual("0");
  });

  it("boolean", async () => {
    expect(cacheKeyTransformDefaultFn(true)).toEqual("true");
    expect(cacheKeyTransformDefaultFn(false)).toEqual("false");
  });

  it("bigint", async () => {
    expect(cacheKeyTransformDefaultFn(BigInt(0))).toEqual("0");
    for (let i = 1; i <= 32; i++) {
      let key = BigInt("9".repeat(i));
      expect(cacheKeyTransformDefaultFn(key)).toEqual(`${key}`);
    }
  });

  it("long bigint", async () => {
    for (let i = 33; i <= 50; i++) {
      let key = BigInt("9".repeat(i));
      expect(cacheKeyTransformDefaultFn(key)).toEqual(md5(`${key}`));
    }
  });

  it("json", async () => {
    let key = { abc: "QWE" };
    expect(cacheKeyTransformDefaultFn(key)).toEqual(JSON.stringify(key));
  });

  it("long json", async () => {
    let key = { abc: "Q".repeat(50) };
    expect(cacheKeyTransformDefaultFn(key)).toEqual(md5(JSON.stringify(key)));
  });

  it("null & undefined", async () => {
    expect(cacheKeyTransformDefaultFn(null)).toEqual("null");
    expect(() => cacheKeyTransformDefaultFn(undefined)).toThrow();
  });
});
