import { ApplicationError } from "../../errors/application-error.js";
import { decodeRscRecords } from "../rsc/decode-records.js";
import type { RscRecordMap } from "../rsc/types.js";

const ABOUT_COMPONENT = "com.linkedin.sdui.impl.profile.components.aboutSection";
const DOLLAR = "$";

export function parseAboutResponse(stream: string): string | null {
  const records = decodeRscRecords(stream);
  const about = findAboutElement(records);
  if (!about) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's About component marker was not found.",
      502
    );
  }

  const initialContent = findInitialContent(about);
  if (!initialContent.found) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's About component did not expose its content state.",
      502
    );
  }
  if (
    initialContent.value === undefined ||
    initialContent.value === "$undefined"
  ) {
    return null;
  }

  const text = unique(collectVisibleText(initialContent.value, records))
    .filter((value) => !/^about$/iu.test(value))
    .filter((value) => !/^see (?:more|less)$/iu.test(value));

  return text.length > 0 ? text.join("\n") : null;
}

function findAboutElement(records: RscRecordMap): ReactElement | undefined {
  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    const found = findElement(record.value, (props) =>
      props.observabilityIdentifier === ABOUT_COMPONENT
    );
    if (found) return found;
  }
  return undefined;
}

interface FoundContent {
  found: boolean;
  value?: unknown;
}

function findInitialContent(root: unknown): FoundContent {
  if (Array.isArray(root)) {
    if (isReactElement(root) && Object.hasOwn(root[3], "initialContent")) {
      return { found: true, value: root[3].initialContent };
    }
    for (const entry of root) {
      const found = findInitialContent(entry);
      if (found.found) return found;
    }
  } else if (isObject(root)) {
    for (const entry of Object.values(root)) {
      const found = findInitialContent(entry);
      if (found.found) return found;
    }
  }
  return { found: false };
}

function collectVisibleText(root: unknown, records: RscRecordMap): string[] {
  const output: string[] = [];
  const visited = new Set<string>();

  const walk = (value: unknown): void => {
    const id = getReferenceId(value);
    if (id) {
      if (visited.has(id)) return;
      visited.add(id);
      const record = records.get(id);
      if (record?.kind === "json") walk(record.value);
      return;
    }

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
    const normalized = value.replace(/\s+/gu, " ").trim();
    if (normalized && !normalized.startsWith(DOLLAR)) output.push(normalized);
    return;
  }
  if (!Array.isArray(value) || isReactElement(value)) return;
  for (const entry of value) collectTextValue(entry, output);
}

function findElement(
  value: unknown,
  predicate: (props: Record<string, unknown>) => boolean
): ReactElement | undefined {
  if (Array.isArray(value)) {
    if (isReactElement(value) && predicate(value[3])) return value;
    for (const entry of value) {
      const found = findElement(entry, predicate);
      if (found) return found;
    }
  } else if (isObject(value)) {
    for (const entry of Object.values(value)) {
      const found = findElement(entry, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

function getReferenceId(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(DOLLAR)) return null;
  const offset = value.startsWith("$L") ? 2 : 1;
  const id = value.slice(offset).split(":")[0];
  return id && /^[0-9a-f]+$/iu.test(id) ? id.toLowerCase() : null;
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
