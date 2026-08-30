import type { RscRecordMap } from "./types.js";

const LAZY_REFERENCE = /^\$L([0-9a-f]+)$/i;
const RECORD_REFERENCE = /^\$([0-9a-f]+)(?::(.+))?$/i;

export function resolveRscRecord(
  id: string,
  records: RscRecordMap
): unknown {
  return resolveRecordId(id.toLowerCase(), records, new Set());
}

export function resolveRscValue(value: unknown, records: RscRecordMap): unknown {
  return resolveValue(value, records, new Set());
}

function resolveRecordId(
  id: string,
  records: RscRecordMap,
  resolving: Set<string>
): unknown {
  const record = records.get(id);
  if (!record || record.kind === "import") return `$L${id}`;
  if (resolving.has(id)) return `$L${id}`;

  resolving.add(id);
  const result = resolveValue(record.value, records, resolving);
  resolving.delete(id);
  return result;
}

function resolveValue(
  value: unknown,
  records: RscRecordMap,
  resolving: Set<string>
): unknown {
  if (typeof value === "string") {
    if (value === "$undefined") return undefined;

    const lazy = LAZY_REFERENCE.exec(value);
    if (lazy?.[1]) {
      const target = records.get(lazy[1].toLowerCase());
      return target?.kind === "json"
        ? resolveRecordId(lazy[1].toLowerCase(), records, resolving)
        : value;
    }

    const direct = RECORD_REFERENCE.exec(value);
    if (direct?.[1]) {
      const resolved = resolveRecordId(direct[1].toLowerCase(), records, resolving);
      return direct[2] ? resolvePath(resolved, direct[2]) : resolved;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveValue(entry, records, resolving));
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const resolved = resolveValue(entry, records, resolving);
      if (resolved !== undefined) result[key] = resolved;
    }
    return result;
  }

  return value;
}

function resolvePath(root: unknown, path: string): unknown {
  let current = root;

  for (const segment of path.split(":")) {
    if (segment === "props" && isReactElement(current)) {
      current = current[3];
      continue;
    }

    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }

    if (isObject(current)) {
      current = current[segment];
      continue;
    }

    return undefined;
  }

  return current;
}

function isReactElement(value: unknown): value is unknown[] {
  return Array.isArray(value) && value[0] === "$" && value.length >= 4;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
