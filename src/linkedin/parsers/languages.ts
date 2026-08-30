import { ApplicationError } from "../../errors/application-error.js";
import { decodeRscRecords } from "../rsc/decode-records.js";
import {
  findCollectionItems,
  hasCollection,
  hasExplicitlyUnavailableContent,
  hasObservabilityIdentifier
} from "./collection.js";

const LANGUAGE_COMPONENT =
  "com.linkedin.sdui.impl.profile.components.languageTopLevelSection";

export interface LanguageEntry {
  name: string;
  proficiency: string | null;
}

export function parseLanguagesResponse(stream: string): LanguageEntry[] {
  const records = decodeRscRecords(stream);
  if (!hasObservabilityIdentifier(records, LANGUAGE_COMPONENT)) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's Languages component marker was not found.",
      502
    );
  }

  const items = findCollectionItems(records, "LanguageTopLevel").flatMap(({ text }) => {
    const name = text[0];
    return name ? [{ name, proficiency: text[1] ?? null }] : [];
  });

  if (
    items.length === 0 &&
    !hasCollection(records, "LanguageTopLevel") &&
    !hasExplicitlyUnavailableContent(records, LANGUAGE_COMPONENT)
  ) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's Languages component exposed neither entries nor an explicit empty state.",
      502
    );
  }

  return items;
}
