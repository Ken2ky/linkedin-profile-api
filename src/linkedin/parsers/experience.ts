import { ApplicationError } from "../../errors/application-error.js";
import { decodeRscRecords } from "../rsc/decode-records.js";
import { resolveRscRecord } from "../rsc/resolve-reference.js";
import type { RscRecordMap } from "../rsc/types.js";

const ITEM_PREFIX = "entity-collection-item-";
const EXPERIENCE_MARKERS = [
  "experienceTopLevelSection",
  "com.linkedin.sdui.impl.profile.components.experienceDetailSection"
] as const;
const SKILLS_SCREEN = "ProfileSkillAssociationDetailsScreen";
const WORKPLACE_TYPES = new Set(["hybrid", "on-site", "onsite", "remote"]);
const EMPLOYMENT_TYPES = new Set([
  "full-time",
  "part-time",
  "self-employed",
  "freelance",
  "contract",
  "internship",
  "apprenticeship",
  "seasonal",
  "temporary"
]);

export interface ExperienceEntry {
  title: string | null;
  company: string | null;
  employmentType: string | null;
  companyLine: string | null;
  dateRange: string | null;
  duration: string | null;
  dateLine: string | null;
  location: string | null;
  workplaceType: string | null;
  description: string | null;
  associatedSkills: string[];
}

export function parseExperienceResponse(stream: string): ExperienceEntry[] {
  const records = decodeRscRecords(stream);
  const items = findExperienceRoots(records).flatMap(findExperienceItems);
  const uniqueItems = uniqueExperienceItems(items);
  if (
    uniqueItems.length === 0 &&
    EXPERIENCE_MARKERS.some((marker) => stream.includes(marker))
  ) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's experience section no longer contains recognizable entries.",
      502
    );
  }
  return uniqueItems.flatMap(parseExperienceItem);
}

function findExperienceRoots(records: RscRecordMap): unknown[] {
  const roots: unknown[] = [resolveRscRecord("0", records)];

  for (const [id, record] of records) {
    if (id === "0" || record.kind !== "json") continue;
    const serialized = JSON.stringify(record.value);
    if (EXPERIENCE_MARKERS.some((marker) => serialized.includes(marker))) {
      roots.push(resolveRscRecord(id, records));
    }
  }

  return roots;
}

function uniqueExperienceItems(items: ReactElement[]): ReactElement[] {
  const uniqueItems = new Map<string, ReactElement>();
  for (const item of items) {
    const componentKey = item[3].componentKey;
    const key =
      typeof componentKey === "string" ? componentKey : JSON.stringify(item);
    uniqueItems.set(key, item);
  }
  return [...uniqueItems.values()];
}

function parseExperienceItem(item: ReactElement): ExperienceEntry[] {
  const allText = unique(collectVisibleText(item));
  const associatedSkills = unique(collectAssociatedSkills(item));
  const contentText = allText.filter((value) => !associatedSkills.includes(value));

  if (isGroupedExperience(contentText)) {
    const grouped = parseGroupedExperience(contentText, associatedSkills);
    if (grouped.length > 0) return grouped;
  }

  const title = contentText[0] ?? null;
  const companyLine = contentText[1] ?? null;
  const dateLine = contentText[2] ?? null;
  const locationLine = contentText[3] ?? null;
  const descriptions = contentText.slice(4);
  const companyParts = splitCompoundLine(companyLine);
  const dateParts = splitCompoundLine(dateLine);
  const parsedLocation = parseLocationLine(locationLine);

  return [{
    title,
    company: companyParts[0] ?? null,
    employmentType: companyParts.length > 1 ? companyParts.at(-1) ?? null : null,
    companyLine,
    dateRange: dateParts[0] ?? null,
    duration: dateParts.length > 1 ? dateParts.at(-1) ?? null : null,
    dateLine,
    location: parsedLocation.location,
    workplaceType: parsedLocation.workplaceType,
    description: descriptions.length > 0 ? descriptions.join("\n") : null,
    associatedSkills
  }];
}

function isGroupedExperience(text: string[]): boolean {
  return (
    text.length >= 6 &&
    /^\d+\s+(?:(?:yr|yrs|mo|mos)\b)/iu.test(text[1] ?? "") &&
    isEmploymentType(text[4]) &&
    isDateLine(text[5])
  );
}

function parseGroupedExperience(
  text: string[],
  associatedSkills: string[]
): ExperienceEntry[] {
  const company = text[0] ?? null;
  const parsedLocation = parseLocationLine(text[2] ?? null);
  const roleText = text.slice(3);
  const roles: ExperienceEntry[] = [];
  let index = 0;

  while (index + 2 < roleText.length) {
    const title = roleText[index];
    const employmentType = roleText[index + 1];
    const dateLine = roleText[index + 2];
    if (!title || !isEmploymentType(employmentType) || !isDateLine(dateLine)) {
      index += 1;
      continue;
    }

    let nextRole = index + 3;
    while (
      nextRole + 2 < roleText.length &&
      !(isEmploymentType(roleText[nextRole + 1]) && isDateLine(roleText[nextRole + 2]))
    ) {
      nextRole += 1;
    }
    const descriptions = roleText.slice(index + 3, nextRole);
    const dateParts = splitCompoundLine(dateLine);
    const skill = associatedSkills[roles.length];

    roles.push({
      title,
      company,
      employmentType,
      companyLine: company ? `${company} \u00b7 ${employmentType}` : employmentType,
      dateRange: dateParts[0] ?? null,
      duration: dateParts.length > 1 ? dateParts.at(-1) ?? null : null,
      dateLine,
      location: parsedLocation.location,
      workplaceType: parsedLocation.workplaceType,
      description: descriptions.length > 0 ? descriptions.join("\n") : null,
      associatedSkills: skill ? [skill] : []
    });
    index = nextRole;
  }

  return roles;
}

function parseLocationLine(value: string | null): {
  location: string | null;
  workplaceType: string | null;
} {
  const parts = splitCompoundLine(value);
  const potentialWorkplaceType = parts.at(-1) ?? null;
  const hasWorkplaceType =
    parts.length > 1 &&
    potentialWorkplaceType !== null &&
    WORKPLACE_TYPES.has(potentialWorkplaceType.toLowerCase());
  return {
    location: hasWorkplaceType ? parts.slice(0, -1).join(" \u00b7 ") : value,
    workplaceType: hasWorkplaceType ? potentialWorkplaceType : null
  };
}

function isEmploymentType(value: string | undefined): value is string {
  return value !== undefined && EMPLOYMENT_TYPES.has(value.toLowerCase());
}

function isDateLine(value: string | undefined): value is string {
  return value !== undefined &&
    /(?:19|20)\d{2}\s*[-\u2013]\s*(?:present|(?:[a-z]{3,9}\s+)?(?:19|20)\d{2})/iu.test(value);
}

function findExperienceItems(root: unknown): ReactElement[] {
  const items: ReactElement[] = [];
  walkElements(root, (element) => {
    const componentKey = element[3].componentKey;
    if (typeof componentKey === "string" && componentKey.startsWith(ITEM_PREFIX)) {
      items.push(element);
      return false;
    }
    return true;
  });
  return items;
}

function collectVisibleText(root: unknown): string[] {
  const text: string[] = [];
  walkElements(root, (element) => {
    const props = element[3];
    if (isObject(props.textProps)) collectTextValue(props.textProps.children, text);
    collectTextValue(props.children, text);
    return false;
  });
  return text;
}

function collectAssociatedSkills(root: unknown): string[] {
  const skills: string[] = [];
  walkElements(root, (element) => {
    const metadata = Object.fromEntries(
      Object.entries(element[3]).filter(([key]) => key !== "children")
    );
    if (containsString(metadata, SKILLS_SCREEN)) {
      skills.push(...collectVisibleText(element));
      return false;
    }
    return true;
  });
  return skills;
}

function collectTextValue(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (normalized && !normalized.startsWith("$")) output.push(normalized);
    return;
  }
  if (Array.isArray(value)) {
    if (isReactElement(value)) {
      const props = value[3];
      if (isObject(props.textProps)) collectTextValue(props.textProps.children, output);
      collectTextValue(props.children, output);
      return;
    }
    for (const entry of value) collectTextValue(entry, output);
  }
}

function walkElements(
  value: unknown,
  inspect: (element: ReactElement) => boolean
): void {
  if (isObject(value)) {
    for (const entry of Object.values(value)) walkElements(entry, inspect);
    return;
  }
  if (!Array.isArray(value)) return;
  if (isReactElement(value)) {
    if (inspect(value)) {
      for (const entry of Object.values(value[3])) {
        walkElements(entry, inspect);
      }
    }
    return;
  }
  for (const entry of value) walkElements(entry, inspect);
}

function containsString(value: unknown, target: string): boolean {
  if (typeof value === "string") return value.includes(target);
  if (Array.isArray(value)) return value.some((entry) => containsString(entry, target));
  if (isObject(value)) {
    return Object.values(value).some((entry) => containsString(entry, target));
  }
  return false;
}

function splitCompoundLine(value: string | null): string[] {
  return value
    ? value.split(/\s+\u00b7\s+/u).map((part) => part.trim()).filter(Boolean)
    : [];
}

function normalizeText(value: string): string {
  return value
    .replaceAll("\u00c3\u0082\u00c2\u00b7", "\u00b7")
    .replaceAll("\u00c2\u00b7", "\u00b7")
    .replaceAll("\u00e2\u20ac\u00a2", "\u2022")
    .replaceAll("\u00e2\u20ac\u201c", "\u2013")
    .replaceAll("\u00e2\u20ac\u201d", "\u2014")
    .replaceAll("\u00e2\u20ac\u2122", "\u2019")
    .replace(/\s+/gu, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

type ReactElement = ["$", unknown, unknown, Record<string, unknown>];

function isReactElement(value: unknown): value is ReactElement {
  return Array.isArray(value) && value.length >= 4 && value[0] === "$" &&
    isObject(value[3]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
