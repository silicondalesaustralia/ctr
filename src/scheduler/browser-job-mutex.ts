/**
 * Campaign + warmup BullMQ workers both use concurrency=1 in one process.
 * Without this, they can overlap (one waiting on GoLogin slot while the other
 * runs Orbita) and spike Railway memory into OOM.
 *
 * Priority waiters (dashboard validations, where a user is watching) run as soon as
 * the current job finishes, ahead of queued sessions and warmups.
 */
let locked = false;
const normalWaiters: Array<() => void> = [];
const priorityWaiters: Array<() => void> = [];

function handOff(): void {
  const next = priorityWaiters.shift() ?? normalWaiters.shift();
  if (next) next();
  else locked = false;
}

export async function withBrowserJobExclusive<T>(
  fn: () => Promise<T>,
  options: { priority?: boolean } = {},
): Promise<T> {
  if (locked) {
    await new Promise<void>((resolve) => {
      (options.priority ? priorityWaiters : normalWaiters).push(resolve);
    });
  } else {
    locked = true;
  }
  try {
    return await fn();
  } finally {
    handOff();
  }
}
