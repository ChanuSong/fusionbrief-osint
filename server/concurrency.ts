/** Refill a free slot immediately; preserve result order and drain all workers on error. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid concurrency limit');
  const output: R[] = new Array(items.length);
  let next = 0;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await work(items[index], index);
    }
  }));
  const failed = workers.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  return output;
}
