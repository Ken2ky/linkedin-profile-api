import { ApplicationError } from "../errors/application-error.js";
import type { RscRecordMap } from "./rsc/types.js";

const VIEWEE_PROFILE_ID = "vieweeProfileId";
const FALLBACK_PROFILE_ID = "nonIterableProfileId";

export function extractVieweeProfileId(
  records: RscRecordMap,
  vanityName?: string
): string {
  const vieweeIds = collectPropertyValues(records, VIEWEE_PROFILE_ID);
  if (vieweeIds.size === 1) return first(vieweeIds);

  if (vieweeIds.size > 1 && vanityName) {
    const contextualIds = collectContextualIds(
      records,
      VIEWEE_PROFILE_ID,
      vanityName
    );
    if (contextualIds.size === 1) return first(contextualIds);
  }

  if (vieweeIds.size > 1) throw ambiguousProfileId();

  const fallbackIds = collectPropertyValues(records, FALLBACK_PROFILE_ID);
  if (fallbackIds.size === 1) return first(fallbackIds);

  if (fallbackIds.size > 1 && vanityName) {
    const contextualIds = collectContextualIds(
      records,
      FALLBACK_PROFILE_ID,
      vanityName
    );
    if (contextualIds.size === 1) return first(contextualIds);
  }

  if (fallbackIds.size > 1) throw ambiguousProfileId();

  throw new ApplicationError(
    "PROFILE_NOT_ACCESSIBLE",
    "The target profile identifier was not available.",
    404
  );
}

function collectPropertyValues(
  records: RscRecordMap,
  propertyName: string
): Set<string> {
  const values = new Set<string>();

  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    visitObjects(record.value, (object) => {
      const value = object[propertyName];
      if (typeof value === "string" && value.length > 0) values.add(value);
    });
  }

  return values;
}

function collectContextualIds(
  records: RscRecordMap,
  propertyName: string,
  vanityName: string
): Set<string> {
  const values = new Set<string>();
  const normalizedVanityName = vanityName.toLowerCase();

  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    visitObjects(record.value, (object) => {
      const candidateVanityName = object.vanityName;
      const candidateId = object[propertyName];
      if (
        typeof candidateVanityName === "string" &&
        candidateVanityName.toLowerCase() === normalizedVanityName &&
        typeof candidateId === "string" &&
        candidateId.length > 0
      ) {
        values.add(candidateId);
      }
    });
  }

  return values;
}

function visitObjects(
  value: unknown,
  inspect: (object: Record<string, unknown>) => void
): void {
  if (Array.isArray(value)) {
    for (const entry of value) visitObjects(entry, inspect);
    return;
  }
  if (!isObject(value)) return;

  inspect(value);
  for (const entry of Object.values(value)) visitObjects(entry, inspect);
}

function first(values: Set<string>): string {
  return values.values().next().value as string;
}

function ambiguousProfileId(): ApplicationError {
  return new ApplicationError(
    "UPSTREAM_SCHEMA_CHANGED",
    "LinkedIn returned ambiguous target profile identifiers.",
    502
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
