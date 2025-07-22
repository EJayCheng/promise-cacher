import { jsonToStringForConsole } from './json-to-string-for-console';

describe('jsonToStringForConsole', () => {
  describe('valid JSON objects', () => {
    it('should stringify simple objects', () => {
      const input = { name: 'test', value: 123 };
      const result = jsonToStringForConsole(input);
      expect(result).toBe('{"name":"test","value":123}');
    });

    it('should stringify arrays', () => {
      const input = [1, 2, 'test', true];
      const result = jsonToStringForConsole(input);
      expect(result).toBe('[1,2,"test",true]');
    });

    it('should stringify nested objects', () => {
      const input = {
        user: {
          name: 'John',
          details: {
            age: 30,
            active: true,
          },
        },
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '{"user":{"name":"John","details":{"age":30,"active":true}}}',
      );
    });

    it('should handle primitive values', () => {
      expect(jsonToStringForConsole('string')).toBe('"string"');
      expect(jsonToStringForConsole(123)).toBe('123');
      expect(jsonToStringForConsole(true)).toBe('true');
      expect(jsonToStringForConsole(false)).toBe('false');
    });

    it('should handle null and undefined', () => {
      expect(jsonToStringForConsole(null)).toBe('null');
      expect(jsonToStringForConsole(undefined)).toBe('undefined');
    });

    it('should handle empty objects and arrays', () => {
      expect(jsonToStringForConsole({})).toBe('{}');
      expect(jsonToStringForConsole([])).toBe('[]');
    });

    it('should handle objects with null and undefined properties', () => {
      const input = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'test',
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe('{"nullValue":null,"normalValue":"test"}');
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const result = jsonToStringForConsole(date);
      expect(result).toBe('"2023-01-01T00:00:00.000Z"');
    });
  });

  describe('circular references', () => {
    it('should handle circular object references', () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference

      const result = jsonToStringForConsole(obj);
      expect(result).toBe('[Circular Reference]');
    });

    it('should handle circular array references', () => {
      const arr: any[] = [1, 2, 3];
      arr.push(arr); // Create circular reference

      const result = jsonToStringForConsole(arr);
      expect(result).toBe('[Circular Reference]');
    });

    it('should handle deep circular references', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2' };
      obj1.ref = obj2;
      obj2.ref = obj1; // Create circular reference

      const result = jsonToStringForConsole(obj1);
      expect(result).toBe('[Circular Reference]');
    });

    it('should handle mixed circular references', () => {
      const parent: any = { children: [] };
      const child: any = { parent: parent };
      parent.children.push(child);

      const result = jsonToStringForConsole(parent);
      expect(result).toBe('[Circular Reference]');
    });
  });

  describe('special values and edge cases', () => {
    it('should handle functions', () => {
      const func = () => 'test';
      const result = jsonToStringForConsole(func);
      expect(result).toBe(func.toString());
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      const result = jsonToStringForConsole(sym);
      expect(result).toBe(sym.toString());
    });

    it('should handle BigInt values', () => {
      const bigInt = BigInt(123456789);
      const result = jsonToStringForConsole(bigInt);
      expect(result).toBe(bigInt.toString());
    });

    it('should handle objects with functions', () => {
      const input = {
        name: 'test',
        method: () => 'hello',
        value: 123,
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe('{"name":"test","value":123}');
    });

    it('should handle objects with symbols', () => {
      const sym = Symbol('key');
      const input = {
        name: 'test',
        [sym]: 'symbol-value',
        value: 123,
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe('{"name":"test","value":123}');
    });

    it('should handle regex objects', () => {
      const regex = /test/gi;
      const result = jsonToStringForConsole(regex);
      expect(result).toBe('{}');
    });

    it('should handle Map objects', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);
      const result = jsonToStringForConsole(map);
      expect(result).toBe('{}');
    });

    it('should handle Set objects', () => {
      const set = new Set([1, 2, 3, 2, 1]);
      const result = jsonToStringForConsole(set);
      expect(result).toBe('{}');
    });

    it('should handle WeakMap and WeakSet', () => {
      const weakMap = new WeakMap();
      const weakSet = new WeakSet();

      expect(jsonToStringForConsole(weakMap)).toBe('{}');
      expect(jsonToStringForConsole(weakSet)).toBe('{}');
    });
  });

  describe('complex nested structures', () => {
    it('should handle deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '{"level1":{"level2":{"level3":{"level4":{"value":"deep"}}}}}',
      );
    });

    it('should handle mixed data types in arrays', () => {
      const input = [
        'string',
        123,
        true,
        null,
        { nested: 'object' },
        [1, 2, 3],
      ];
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '["string",123,true,null,{"nested":"object"},[1,2,3]]',
      );
    });

    it('should handle objects with array properties', () => {
      const input = {
        numbers: [1, 2, 3],
        strings: ['a', 'b', 'c'],
        mixed: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '{"numbers":[1,2,3],"strings":["a","b","c"],"mixed":[{"id":1,"name":"first"},{"id":2,"name":"second"}]}',
      );
    });
  });

  describe('error handling', () => {
    it('should handle objects that throw during serialization', () => {
      const problematicObject = {
        get badProperty() {
          throw new Error('Cannot access this property');
        },
      };

      const result = jsonToStringForConsole(problematicObject);
      expect(result).toBe('[object Object]');
    });

    it('should handle objects with toJSON that throws', () => {
      const obj = {
        name: 'test',
        toJSON() {
          throw new Error('toJSON error');
        },
      };

      const result = jsonToStringForConsole(obj);
      expect(result).toBe('[object Object]');
    });

    it('should handle non-circular TypeError', () => {
      // Mock JSON.stringify to throw a non-circular TypeError
      const originalStringify = JSON.stringify;
      jest.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new TypeError('Some other error');
      });

      const input = { test: 'value' };
      const result = jsonToStringForConsole(input);
      expect(result).toBe('[object Object]');

      // Restore original
      JSON.stringify = originalStringify;
    });

    it('should handle other types of errors', () => {
      // Mock JSON.stringify to throw a different error
      const originalStringify = JSON.stringify;
      jest.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new RangeError('Some range error');
      });

      const input = { test: 'value' };
      const result = jsonToStringForConsole(input);
      expect(result).toBe('[object Object]');

      // Restore original
      JSON.stringify = originalStringify;
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle very large numbers', () => {
      const input = {
        maxSafeInteger: Number.MAX_SAFE_INTEGER,
        minSafeInteger: Number.MIN_SAFE_INTEGER,
        infinity: Infinity,
        negativeInfinity: -Infinity,
        notANumber: NaN,
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '{"maxSafeInteger":9007199254740991,"minSafeInteger":-9007199254740991,"infinity":null,"negativeInfinity":null,"notANumber":null}',
      );
    });

    it('should handle empty strings and whitespace', () => {
      const input = {
        empty: '',
        spaces: '   ',
        newlines: '\n\n',
        tabs: '\t\t',
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '{"empty":"","spaces":"   ","newlines":"\\n\\n","tabs":"\\t\\t"}',
      );
    });

    it('should handle unicode characters', () => {
      const input = {
        emoji: '😀🎉',
        chinese: '你好',
        arabic: 'مرحبا',
        unicode: '\u0048\u0065\u006C\u006C\u006F', // "Hello"
      };
      const result = jsonToStringForConsole(input);
      expect(result).toBe(
        '{"emoji":"😀🎉","chinese":"你好","arabic":"مرحبا","unicode":"Hello"}',
      );
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(10000);
      const input = { longString };
      const result = jsonToStringForConsole(input);
      expect(result).toContain(longString);
      expect(result.length).toBeGreaterThan(10000);
    });

    it('should handle class instances', () => {
      class TestClass {
        constructor(
          public name: string,
          public value: number,
        ) {}

        method() {
          return 'test';
        }
      }

      const instance = new TestClass('test', 123);
      const result = jsonToStringForConsole(instance);
      expect(result).toBe('{"name":"test","value":123}');
    });
  });
});
