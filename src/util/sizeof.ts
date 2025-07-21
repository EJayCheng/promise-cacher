const ECMA_SIZES = {
  STRING: 2,
  BOOLEAN: 4,
  NUMBER: 8,
};

const maxKey = 1000;
const maxDeep = 10;

let isBuffer: (obj: any) => boolean = () => false;

try {
  isBuffer = Buffer.isBuffer;
} catch (error) {
  console.warn(
    "Buffer.isBuffer is not available, using a fallback implementation."
  );
}

function sizeOfObject(object: {[x: string]: any}, used = [], deep = 0) {
  used.push(object);

  let bytes = 0;
  for (const key in object) {
    if (!Object.hasOwnProperty.call(object, key)) {
      continue;
    }

    bytes += sizeof(key, used, 1 + deep);

    try {
      bytes += sizeof(object[key], used, 1 + deep);
    } catch (ex) {
      if (ex instanceof RangeError) {
        // circular reference detected, final result might be incorrect
        // let's be nice and not throw an exception
        bytes = 0;
      }
    }
  }

  return bytes;
}

/**
 * Main module's entry point
 * Calculates Bytes for the provided parameter
 * @param object - handles object/string/boolean/buffer
 * @returns {*}
 */
export function sizeof(object: any, used = [], deep = 0) {
  if (deep > maxDeep) {
    return 0;
  }

  if (used.length > maxKey) {
    return 0;
  }

  if (used.includes(object)) {
    return 0;
  }

  used.push(object);

  if (isBuffer(object)) {
    return object.length;
  }

  const type = typeof object;
  switch (type) {
    case "string":
      return object.length * ECMA_SIZES.STRING;
    case "boolean":
      return ECMA_SIZES.BOOLEAN;
    case "number":
      return ECMA_SIZES.NUMBER;
    case "object":
      if (Array.isArray(object)) {
        if (object.length >= 50) {
          const sum = object
            .slice(0, 50)
            .map((item) => sizeof(item, used, 1 + deep))
            .reduce((acc, curr) => acc + curr, 0);
          const avg = sum / 100;
          return avg * object.length;
        } else {
          return object
            .map((item) => sizeof(item, used, 1 + deep))
            .reduce((acc, curr) => acc + curr, 0);
        }
      } else {
        return sizeOfObject(object, used, 1 + deep);
      }
    default:
      return 0;
  }
}
