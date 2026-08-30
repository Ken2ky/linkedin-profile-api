export function findStringProperties(
  root: unknown,
  propertyNames: ReadonlySet<string>
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const visited = new Set<object>();

  visit(root, (key, value) => {
    if (propertyNames.has(key) && typeof value === "string") {
      const values = found.get(key) ?? [];
      values.push(value);
      found.set(key, values);
    }
  }, visited);

  return found;
}

function visit(
  value: unknown,
  inspect: (key: string, value: unknown) => void,
  visited: Set<object>
): void {
  if (typeof value !== "object" || value === null) return;
  if (visited.has(value)) return;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, inspect, visited);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    inspect(key, entry);
    visit(entry, inspect, visited);
  }
}
