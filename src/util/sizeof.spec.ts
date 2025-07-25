import { sizeFormat } from './size-format';
import { sizeof } from './sizeof';

describe('Sizeof', () => {
  it('sizeof Bytes', async () => {
    const size = sizeof('def');
    expect(size).toEqual(6);
    expect(sizeFormat(size)).toEqual('6 B');
  });

  it('sizeof KB', async () => {
    const size = sizeof('a'.repeat(512));
    expect(size).toEqual(1024);
    expect(sizeFormat(size)).toEqual('1 KB');
  });

  it('sizeof MB', async () => {
    const size = sizeof('a'.repeat(524288));
    expect(size).toEqual(1024 * 1024);
    expect(sizeFormat(size)).toEqual('1 MB');
  });

  it('sizeof MB', async () => {
    expect(sizeFormat(1024 * 1024 * 1024)).toEqual('1 GB');
  });

  it('sizeof number', async () => {
    const size = sizeof(Number.MAX_SAFE_INTEGER);
    expect(size).toEqual(8);
  });

  it('sizeof string', async () => {
    const size = sizeof('a');
    expect(size).toEqual(2);
  });

  it('sizeof boolean', async () => {
    const trueSize = sizeof(true);
    const falseSize = sizeof(false);
    expect(trueSize).toEqual(4);
    expect(falseSize).toEqual(4);
  });

  it('sizeof boolean', async () => {
    const trueSize = sizeof(true);
    const falseSize = sizeof(false);
    expect(trueSize).toEqual(4);
    expect(falseSize).toEqual(4);
  });

  it('sizeof object', async () => {
    const size = sizeof({ abc: 'def', test: { ttt: 123 } });
    expect(size).toEqual(34);
  });

  it('sizeof array', async () => {
    const size = sizeof(['a', 'b', 1, 2]);
    expect(size).toEqual(20);
  });

  it('sizeof object', async () => {
    const size = sizeof({ abc: 'def' });
    expect(size).toEqual(12);
  });

  it('sizeof recursive defense', async () => {
    const a = { name: 'A', b: null };
    const b = { name: 'B', a };
    a.b = b;
    expect(sizeof(a)).toEqual(16);
  });
});
