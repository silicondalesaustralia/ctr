export function pickBranch<T extends string>(
  branches: Record<T, number>,
  random = Math.random(),
): T {
  const entries = Object.entries(branches) as [T, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    return entries[0]![0];
  }

  let cursor = random * total;
  for (const [name, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) {
      return name;
    }
  }

  return entries[entries.length - 1]![0];
}

export function normalizeWeights<T extends string>(
  branches: Record<T, number>,
): Record<T, number> {
  const total = (Object.values(branches) as number[]).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return branches;
  }

  return Object.fromEntries(
    Object.entries(branches).map(([key, weight]) => [key, (weight as number) / total]),
  ) as Record<T, number>;
}
