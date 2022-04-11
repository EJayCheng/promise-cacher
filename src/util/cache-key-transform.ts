export function cacheKeyTransformDefaultFn<INPUT = any>(input: INPUT): string {
  if (
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "bigint" ||
    typeof input === "boolean"
  ) {
    let key = `${input}`;
    return key;
  } else if (typeof input === "object") {
    return Object.entries(input)
      .filter(([key, value]) => value !== undefined)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join("|");
  } else {
    throw new Error(`Error cacheKeyTransform: input#${typeof input}#${input}`);
  }
}
