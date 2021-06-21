export async function delay<T = void>(ms: number, output?: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      resolve(output);
    }, ms);
  });
}

export async function limitTimeout<T = any>(
  task: Promise<T>,
  timeoutMillisecond: number,
  timeoutError: Error
): Promise<T> {
  if (timeoutMillisecond > 0) {
    let timer = delay(timeoutMillisecond, timeoutError);
    return Promise.race([task, timer]).then((res) => {
      if (res instanceof Error) {
        throw res;
      } else {
        return res;
      }
    });
  } else {
    return task;
  }
}
