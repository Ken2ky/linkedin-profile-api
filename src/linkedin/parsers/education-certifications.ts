import { ApplicationError } from "../../errors/application-error.js";
import { decodeRscRecords } from "../rsc/decode-records.js";
import {
  findCollectionItems,
  hasObservabilityIdentifier
} from "./collection.js";

const EDUCATION_COMPONENT =
  "com.linkedin.sdui.impl.profile.components.educationTopLevelSection";
const CERTIFICATION_COMPONENT =
  "com.linkedin.sdui.impl.profile.components.certificationTopLevelSection";
const DATE_RANGE = /(?:^|\s)(?:19|20)\d{2}\s*[–-]\s*(?:(?:19|20)\d{2}|present)(?:$|\s)/iu;

export interface EducationEntry {
  school: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  dateRange: string | null;
  description: string | null;
}

export interface CertificationEntry {
  name: string | null;
  issuingOrganization: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  dateLine: string | null;
}

export interface EducationAndCertifications {
  education: EducationEntry[];
  certifications: CertificationEntry[];
}

export function parseEducationAndCertificationsResponse(
  stream: string
): EducationAndCertifications {
  const records = decodeRscRecords(stream);
  if (
    !hasObservabilityIdentifier(records, EDUCATION_COMPONENT) ||
    !hasObservabilityIdentifier(records, CERTIFICATION_COMPONENT)
  ) {
    throw schemaChanged();
  }

  const education = findCollectionItems(records, "EducationTopLevelSection").map(
    ({ text }) => parseEducation(text)
  );
  const certifications = findCollectionItems(records, "CertificationTopLevel").map(
    ({ text, value }) => parseCertification(text, value)
  );

  return { education, certifications };
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

function parseCertification(text: string[], value: unknown): CertificationEntry {
  const name = text[0] ?? null;
  const issuingOrganization = text[1] ?? null;
  const dateLine = text.find((entry) => /^issued\s/iu.test(entry)) ?? null;
  const dateParts = dateLine?.split(/\s+·\s+/u) ?? [];
  const issueDate = stripPrefix(dateParts.find((part) => /^issued\s/iu.test(part)), "Issued");
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

function findCredentialUrl(value: unknown): string | null {
  if (typeof value === "string") {
    if (!value.startsWith("https://")) return null;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" &&
        !host.endsWith("linkedin.com") &&
        !host.endsWith("licdn.com")
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
  } else if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) {
      const found = findCredentialUrl(entry);
      if (found) return found;
    }
  }
  return null;
}

function stripPrefix(
  value: string | undefined,
  prefix: string | RegExp
): string | null {
  if (!value) return null;
  const result = value.replace(prefix, "").trim();
  return result || null;
}

function schemaChanged(): ApplicationError {
  return new ApplicationError(
    "UPSTREAM_SCHEMA_CHANGED",
    "LinkedIn's education or certification component marker was not found.",
    502
  );
}
