const ECMA_SIZES = {
  STRING: 2,
  BOOLEAN: 4,
  NUMBER: 8,
};

const DefaultMaxKeyLimit = 1000;
const DefaultMaxDepth = 10;

export interface SizeofOptions {
  maxKeyLimit: number;
  maxDepth: number;
}

function sizeOfObject(
  object: any,
  used: any[],
  depth: number,
  options: SizeofOptions
): number {
  let nextDepth = 1 + depth;
  let bytes = 0;
  used.push(object);
  for (let key in object) {
    if (!Object.hasOwnProperty.call(object, key)) {
      continue;
    }

    bytes += sizeof(key, used, nextDepth);

    try {
      bytes += sizeof(object[key], used, nextDepth, options);
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

function sizeOfArray(
  object: any,
  used: any[],
  depth: number,
  options: SizeofOptions
): number {
  let nextDepth = 1 + depth;
  if (object.length >= 50) {
    let sum = object
      .slice(0, 50)
      .map((item) => sizeof(item, used, nextDepth, options))
      .reduce((total, num) => total + num, 0);
    let avg = sum / 100;
    return avg * object.length;
  } else {
    return object
      .map((item) => sizeof(item, used, nextDepth, options))
      .reduce((total, num) => total + num, 0);
  }
}

/**
 * Main module's entry point
 * Calculates Bytes for the provided parameter
 * @param object - handles object/string/boolean/buffer
 * @returns {*}
 */
export function sizeof(
  object: any,
  used: any[] = [],
  depth: number = 0,
  options?: SizeofOptions
): number {
  options = Object.assign(
    { maxKeyLimit: DefaultMaxKeyLimit, maxDepth: DefaultMaxDepth },
    options
  );

  if (depth > options.maxDepth) {
    return 0;
  }

  if (used.length > options.maxKeyLimit) {
    return 0;
  }

  if (used.includes(object)) {
    return 0;
  }

  used.push(object);

  if (object instanceof Buffer) {
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
      if (object instanceof Array) {
        return sizeOfArray(object, used, 1 + depth, options);
      } else {
        return sizeOfObject(object, used, 1 + depth, options);
      }
    default:
      return 0;
  }
}

export function sizeFormat(bytes: number): string {
  if (bytes < 1024) {
    return bytes + " B";
  } else if (bytes < 1048576) {
    return parseFloat((bytes / 1024).toFixed(3)) + " KB";
  } else if (bytes < 1073741824) {
    return parseFloat((bytes / 1024 / 1024).toFixed(3)) + " MB";
  } else {
    return parseFloat((bytes / 1024 / 1024 / 1024).toFixed(3)) + " GB";
  }
}
