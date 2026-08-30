import { load } from "cheerio";
import { ApplicationError } from "../errors/application-error.js";

const ASSIGNMENT_PATTERN =
  /^\s*window\.__como_rehydration__\s*=\s*([\s\S]*?)\s*;?\s*$/;

export function extractRehydrationStream(html: string): string {
  const $ = load(html);
  const script = $("script#rehydrate-data").text();
  const match = ASSIGNMENT_PATTERN.exec(script);

  if (!match?.[1]) {
    throw schemaChanged("LinkedIn profile rehydration data was not found.");
  }

  let chunks: unknown;
  try {
    chunks = JSON.parse(match[1]) as unknown;
  } catch {
    throw schemaChanged("LinkedIn profile rehydration data is not valid JSON.");
  }

  if (!Array.isArray(chunks) || !chunks.every((chunk) => typeof chunk === "string")) {
    throw schemaChanged("LinkedIn profile rehydration data has an unsupported shape.");
  }

  return chunks.join("");
}

function schemaChanged(message: string): ApplicationError {
  return new ApplicationError("UPSTREAM_SCHEMA_CHANGED", message, 502);
}
