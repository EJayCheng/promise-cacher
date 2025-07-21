import * as md5 from 'md5';

export function cacheKeyTransformDefaultFn<INPUT = any>(input: INPUT): string {
  return md5(objectToSortedString(input, 0));
}

function objectToSortedString(obj: any, depth: number = 0): string {
  // 檢查深度限制
  if (depth > 10) {
    throw new Error('Object depth exceeds 10 levels');
  }

  // 處理 null 和 undefined
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';

  // 處理基本類型
  if (['string', 'number', 'bigint', 'boolean'].includes(typeof obj)) {
    return `${obj}`;
  }

  // 處理陣列
  if (Array.isArray(obj)) {
    const arrayString = obj
      .map((item) => objectToSortedString(item, depth + 1))
      .join(',');
    return `[${arrayString}]`;
  }

  // 處理物件
  if (typeof obj === 'object') {
    const sortedEntries = Object.entries(obj)
      .filter(([key, value]) => value !== undefined)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}:${objectToSortedString(value, depth + 1)}`)
      .join(',');
    return `{${sortedEntries}}`;
  }

  // 其他類型
  throw new Error(
    `Error cacheKeyTransformDefaultFn: unsupported type ${typeof obj}`,
  );
}
