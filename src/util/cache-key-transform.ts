import * as md5 from "md5";

export function cacheKeyTransformDefaultFn<INPUT = any>(input: INPUT): string {
  if (typeof input === "string") {
    return input.length > 32 || input.length === 0 ? md5(input) : input;
  } else if (
    typeof input === "number" ||
    typeof input === "bigint" ||
    typeof input === "boolean"
  ) {
    let key = `${input}`;
    if (key.length > 32) {
      key = md5(key);
    }
    return key;
  } else if (typeof input === "object") {
    let key = JSON.stringify(input);
    if (key.length > 32) {
      key = md5(key);
    }
    return key;
  } else {
    throw new Error(`Error cacheKeyTransform: input#${typeof input}#${input}`);
  }
}
