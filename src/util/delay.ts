export async function delay<T = void>(ms: number, output?: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      resolve(output);
    }, ms);
  });
}
