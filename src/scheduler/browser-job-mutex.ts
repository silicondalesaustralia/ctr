/**
 * Campaign + warmup BullMQ workers both use concurrency=1 in one process.
 * Without this, they can overlap (one waiting on GoLogin slot while the other
 * runs Orbita) and spike Railway memory into OOM.
 */
let tail: Promise<unknown> = Promise.resolve();

export async function withBrowserJobExclusive<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = tail;
  tail = gate;

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}
