import { ApplicationError } from "../../errors/application-error.js";
import type { RscRecord, RscRecordMap } from "./types.js";

const RECORD_PATTERN = /^([0-9a-f]+):(.*)$/i;

export function decodeRscRecords(stream: string): RscRecordMap {
  const records = new Map<string, RscRecord>();

  for (const rawLine of stream.split(/\r?\n/)) {
    if (rawLine === "") continue;

    const match = RECORD_PATTERN.exec(rawLine);
    if (!match?.[1] || match[2] === undefined) {
      throw invalidRsc("LinkedIn returned an unsupported RSC record framing.");
    }

    const id = match[1].toLowerCase();
    const encodedValue = match[2];
    const kind = encodedValue.startsWith("I") ? "import" : "json";
    const json = kind === "import" ? encodedValue.slice(1) : encodedValue;

    if (records.has(id)) {
      throw invalidRsc(`LinkedIn returned duplicate RSC record ${id}.`);
    }

    try {
      records.set(id, { id, kind, value: JSON.parse(json) as unknown });
    } catch {
      throw invalidRsc(`LinkedIn returned invalid JSON in RSC record ${id}.`);
    }
  }

  if (records.size === 0) {
    throw invalidRsc("LinkedIn returned an empty RSC response.");
  }

  return records;
}

function invalidRsc(message: string): ApplicationError {
  return new ApplicationError("UPSTREAM_SCHEMA_CHANGED", message, 502);
}
