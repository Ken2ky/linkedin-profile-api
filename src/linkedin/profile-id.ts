import { ApplicationError } from "../errors/application-error.js";
import { findStringProperties } from "./rsc/traversal.js";
import type { RscRecordMap } from "./rsc/types.js";

const PROFILE_ID_FIELDS = new Set(["vieweeProfileId", "nonIterableProfileId"]);

export function extractVieweeProfileId(records: RscRecordMap): string {
  const values = new Set<string>();

  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    const found = findStringProperties(record.value, PROFILE_ID_FIELDS);
    for (const fieldValues of found.values()) {
      for (const value of fieldValues) values.add(value);
    }
  }

  if (values.size === 0) {
    throw new ApplicationError(
      "PROFILE_NOT_ACCESSIBLE",
      "The target profile identifier was not available.",
      404
    );
  }

  if (values.size > 1) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn returned ambiguous target profile identifiers.",
      502
    );
  }

  return [...values][0] as string;
}
