import { resolveRscValue } from "../rsc/resolve-reference.js";
import type { RscRecordMap } from "../rsc/types.js";

const DOLLAR = "$";

export interface CollectionItem {
  key: string | null;
  text: string[];
  value: unknown;
}

export function hasObservabilityIdentifier(
  records: RscRecordMap,
  identifier: string
): boolean {
  for (const record of records.values()) {
    if (record.kind === "json" && containsProperty(record.value, "observabilityIdentifier", identifier)) {
      return true;
    }
  }
  return false;
}

export function findCollectionItems(
  records: RscRecordMap,
  collectionMarker: string
): CollectionItem[] {
  const collections = new Map<string, unknown[]>();

  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    visit(record.value, (value) => {
      if (!isReactElement(value)) return;
      const props = value[3];
      const collectionId = props.collectionId;
      const initialItems = props.initialItems;
      if (
        typeof collectionId === "string" &&
        collectionId.toLowerCase().includes(collectionMarker.toLowerCase()) &&
        Array.isArray(initialItems)
      ) {
        collections.set(collectionId, initialItems);
      }
    });
  }

  return [...collections.values()].flatMap((initialItems) =>
    initialItems.flatMap((entry) => parseCollectionItem(entry, records))
  );
}

export function hasCollection(
  records: RscRecordMap,
  collectionMarker: string
): boolean {
  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    let found = false;
    visit(record.value, (value) => {
      if (!isReactElement(value)) return;
      const props = value[3];
      if (
        typeof props.collectionId === "string" &&
        props.collectionId
          .toLowerCase()
          .includes(collectionMarker.toLowerCase()) &&
        Array.isArray(props.initialItems)
      ) {
        found = true;
      }
    });
    if (found) return true;
  }
  return false;
}

export function hasExplicitlyUnavailableContent(
  records: RscRecordMap,
  observabilityIdentifier: string
): boolean {
  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    let unavailable = false;
    visit(record.value, (value) => {
      if (
        isReactElement(value) &&
        value[3].observabilityIdentifier === observabilityIdentifier &&
        containsProperty(value, "initialContent", "$undefined")
      ) {
        unavailable = true;
      }
    });
    if (unavailable) return true;
  }
  return false;
}

function parseCollectionItem(
  entry: unknown,
  records: RscRecordMap
): CollectionItem[] {
  if (!isObject(entry) || !("item" in entry)) return [];
  const value = resolveRscValue(entry.item, records);
  const text = unique(collectVisibleText(value));
  return [
    {
      key: typeof entry.key === "string" ? entry.key : null,
      text,
      value
    }
  ];
}

function collectVisibleText(root: unknown): string[] {
  const output: string[] = [];

  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (isReactElement(value)) {
      const props = value[3];
      if (isObject(props.textProps)) collectTextValue(props.textProps.children, output);
      collectTextValue(props.children, output);
      walk(props.children);
      walk(props.initialContent);
      return;
    }
    for (const entry of value) walk(entry);
  };

  walk(root);
  return output;
}

function collectTextValue(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const normalized = value
      .replaceAll("Â·", "·")
      .replace(/\s+/gu, " ")
      .trim();
    if (normalized && !normalized.startsWith(DOLLAR)) output.push(normalized);
    return;
  }
  if (!Array.isArray(value) || isReactElement(value)) return;
  for (const entry of value) collectTextValue(entry, output);
}

function containsProperty(
  value: unknown,
  property: string,
  expected: string
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsProperty(entry, property, expected));
  }
  if (!isObject(value)) return false;
  if (value[property] === expected) return true;
  return Object.values(value).some((entry) =>
    containsProperty(entry, property, expected)
  );
}

function visit(value: unknown, inspect: (value: unknown) => void): void {
  inspect(value);
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, inspect);
  } else if (isObject(value)) {
    for (const entry of Object.values(value)) visit(entry, inspect);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

type ReactElement = ["$", unknown, unknown, Record<string, unknown>];

function isReactElement(value: unknown): value is ReactElement {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value[0] === DOLLAR &&
    isObject(value[3])
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
