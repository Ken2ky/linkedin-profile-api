import { ApplicationError } from "../../errors/application-error.js";
import { decodeRscRecords } from "../rsc/decode-records.js";
import { resolveRscValue } from "../rsc/resolve-reference.js";
import type {
  CertificationEntry,
  EducationEntry
} from "./education-certifications.js";
import type { SkillEntry } from "./skills.js";

const DOLLAR = "$";
const DATE_RANGE =
  /(?:^|\s)(?:[a-z]{3}\s+)?(?:19|20)\d{2}\s*[\u2013-]\s*(?:(?:[a-z]{3}\s+)?(?:19|20)\d{2}|present)(?:$|\s)/iu;
const SKILL_KEY = /^com\.linkedin\.sdui\.profile\.skill\([^)]+\)$/u;

export interface DetailPage<T> {
  items: T[];
  nextStart: number | null;
}

export function parseEducationDetailPage(
  stream: string
): DetailPage<EducationEntry> {
  const page = decodePage(stream);
  const candidates = findCandidateElements(page.content, (props) =>
    containsString(props.triggers, "/school/")
  );

  return {
    items: uniqueCandidates(candidates)
      .map(({ text }) => parseEducation(text))
      .filter((entry) => entry.school !== null),
    nextStart: page.nextStart
  };
}

export function parseCertificationDetailPage(
  stream: string
): DetailPage<CertificationEntry> {
  const page = decodePage(stream);
  const candidates = findCandidateElements(page.content, (props) =>
    containsString(props, "license-certifications-lockup-view")
  ).filter(({ text }) => text.some((value) => /^issued\s/iu.test(value)));

  return {
    items: minimalCandidates(uniqueCandidates(candidates)).map(({ text, value }) =>
      parseCertification(text, value)
    ),
    nextStart: page.nextStart
  };
}

export function parseSkillsDetailPage(stream: string): DetailPage<SkillEntry> {
  const page = decodePage(stream);
  const candidates = findCandidateElements(page.content, (props) =>
    typeof props.componentKey === "string" && SKILL_KEY.test(props.componentKey)
  );

  return {
    items: uniqueCandidates(candidates).flatMap(({ text }) => {
      const name = text[0];
      return name ? [{ name, associatedWith: text.slice(1) }] : [];
    }),
    nextStart: page.nextStart
  };
}

interface DecodedPage {
  content: unknown;
  nextStart: number | null;
}

function decodePage(stream: string): DecodedPage {
  const records = decodeRscRecords(stream);
  const rootRecord = records.get("0");
  if (rootRecord?.kind !== "json") throw schemaChanged();

  const root = resolveRscValue(rootRecord.value, records);
  if (!Array.isArray(root) || !Array.isArray(root[2])) throw schemaChanged();

  return {
    content: root[2],
    nextStart: parseNextStart(root[1])
  };
}

function parseNextStart(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isObject(parsed)) return null;
    const requestedArguments = parsed.requestedArguments;
    if (!isObject(requestedArguments) || !isObject(requestedArguments.payload)) {
      return null;
    }
    const start = requestedArguments.payload.start;
    return typeof start === "number" && Number.isInteger(start) && start >= 0
      ? start
      : null;
  } catch {
    throw schemaChanged();
  }
}

interface Candidate {
  text: string[];
  value: unknown;
}

function findCandidateElements(
  root: unknown,
  matches: (props: Record<string, unknown>) => boolean
): Candidate[] {
  const candidates: Candidate[] = [];

  visit(root, (value) => {
    if (!isReactElement(value)) return;
    const props = value[3];
    if (!matches(props)) return;
    const text = unique(collectVisibleText(value));
    if (text.length > 0) candidates.push({ text, value });
  });

  return candidates;
}

function uniqueCandidates(candidates: Candidate[]): Candidate[] {
  const uniqueItems = new Map<string, Candidate>();
  for (const candidate of candidates) {
    uniqueItems.set(JSON.stringify(candidate.text), candidate);
  }
  return [...uniqueItems.values()];
}

function minimalCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.text.length < candidate.text.length &&
          isContiguousSubset(other.text, candidate.text)
      )
  );
}

function isContiguousSubset(needle: string[], haystack: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  return haystack.some((_, start) =>
    needle.every((value, offset) => haystack[start + offset] === value)
  );
}

function parseEducation(text: string[]): EducationEntry {
  const school = text[0] ?? null;
  const remaining = text.slice(1);
  const dateIndex = remaining.findIndex((value) => DATE_RANGE.test(value));
  const dateRange = dateIndex >= 0 ? remaining[dateIndex] ?? null : null;
  const degreeLine = remaining.find(
    (value, index) => index !== dateIndex && !/^grade:/iu.test(value)
  );
  const degreeParts = degreeLine?.split(/,\s*/u, 2) ?? [];
  const description = remaining.filter(
    (value, index) => index !== dateIndex && value !== degreeLine
  );

  return {
    school,
    degree: degreeParts[0] ?? null,
    fieldOfStudy: degreeParts[1] ?? null,
    dateRange,
    description: description.length > 0 ? description.join("\n") : null
  };
}

function parseCertification(
  text: string[],
  value: unknown
): CertificationEntry {
  const name = text[0] ?? null;
  const issuingOrganization = text[1] ?? null;
  const dateLine = text.find((entry) => /^issued\s/iu.test(entry)) ?? null;
  const dateParts = dateLine?.split(/\s+\u00b7\s+/u) ?? [];
  const issueDate = stripPrefix(
    dateParts.find((part) => /^issued\s/iu.test(part)),
    /^Issued/iu
  );
  const expirationDate = stripPrefix(
    dateParts.find((part) => /^(?:expires|expired)\s/iu.test(part)),
    /^(?:Expires|Expired)/iu
  );
  const credentialLine = text.find((entry) => /^credential id\s/iu.test(entry));

  return {
    name,
    issuingOrganization,
    issueDate,
    expirationDate,
    credentialId: stripPrefix(credentialLine, /^Credential ID/iu),
    credentialUrl: findCredentialUrl(value),
    dateLine
  };
}

function collectVisibleText(root: unknown): string[] {
  const output: string[] = [];

  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (isReactElement(value)) {
      const props = value[3];
      if (isObject(props.textProps)) {
        collectTextValue(props.textProps.children, output);
      } else {
        collectTextValue(props.children, output);
      }
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
      .replaceAll("\u00c2\u00b7", "\u00b7")
      .replace(/\s+/gu, " ")
      .trim();
    if (normalized && !normalized.startsWith(DOLLAR)) output.push(normalized);
    return;
  }
  if (!Array.isArray(value) || isReactElement(value)) return;
  for (const entry of value) collectTextValue(entry, output);
}

function findCredentialUrl(value: unknown): string | null {
  if (typeof value === "string") {
    if (!value.startsWith("https://")) return null;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return !host.endsWith("linkedin.com") && !host.endsWith("licdn.com")
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findCredentialUrl(entry);
      if (found) return found;
    }
  } else if (isObject(value)) {
    for (const entry of Object.values(value)) {
      const found = findCredentialUrl(entry);
      if (found) return found;
    }
  }
  return null;
}

function containsString(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.includes(expected);
  if (Array.isArray(value)) {
    return value.some((entry) => containsString(entry, expected));
  }
  if (!isObject(value)) return false;
  return Object.values(value).some((entry) => containsString(entry, expected));
}

function visit(value: unknown, inspect: (value: unknown) => void): void {
  inspect(value);
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, inspect);
  } else if (isObject(value)) {
    for (const entry of Object.values(value)) visit(entry, inspect);
  }
}

function stripPrefix(
  value: string | undefined,
  prefix: string | RegExp
): string | null {
  if (!value) return null;
  const result = value.replace(prefix, "").trim();
  return result || null;
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

function schemaChanged(): ApplicationError {
  return new ApplicationError(
    "UPSTREAM_SCHEMA_CHANGED",
    "LinkedIn's detail pagination response could not be parsed.",
    502
  );
}
