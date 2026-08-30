import { ApplicationError } from "../../errors/application-error.js";
import { decodeRscRecords } from "../rsc/decode-records.js";
import {
  findCollectionItems,
  hasObservabilityIdentifier
} from "./collection.js";

const SKILLS_COMPONENT = "com.linkedin.sdui.impl.profile.components.skillsSection";

export interface SkillEntry {
  name: string;
  associatedWith: string[];
}

export function parseSkillsResponse(stream: string): SkillEntry[] {
  const records = decodeRscRecords(stream);
  if (!hasObservabilityIdentifier(records, SKILLS_COMPONENT)) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's Skills component marker was not found.",
      502
    );
  }

  return findCollectionItems(records, "_Skills_").flatMap(({ text }) => {
    const name = text[0];
    return name ? [{ name, associatedWith: text.slice(1) }] : [];
  });
}
