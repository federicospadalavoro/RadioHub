import { config } from "./config.js";

export async function withServiceTimeout<T>(operation: PromiseLike<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Service timeout");
          error.name = "ServiceTimeoutError";
          reject(error);
        }, config.serviceTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
