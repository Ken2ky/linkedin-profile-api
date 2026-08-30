import { ApplicationError } from "../errors/application-error.js";

export interface ParsedLinkedInProfileUrl {
  vanityName: string;
  canonicalUrl: string;
}

const VANITY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,98}[A-Za-z0-9])?$/;

export function parseLinkedInProfileUrl(input: string): ParsedLinkedInProfileUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalidProfileUrl();
  }

  const hostname = url.hostname.toLowerCase();
  const linkedinHost = hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");

  if (
    url.protocol !== "https:" ||
    !linkedinHost ||
    url.username !== "" ||
    url.password !== "" ||
    (url.port !== "" && url.port !== "443")
  ) {
    throw invalidProfileUrl();
  }

  const match = /^\/in\/([^/]+)\/?$/.exec(url.pathname);
  if (!match?.[1]) throw invalidProfileUrl();

  let vanityName: string;
  try {
    vanityName = decodeURIComponent(match[1]);
  } catch {
    throw invalidProfileUrl();
  }

  if (!VANITY_PATTERN.test(vanityName)) throw invalidProfileUrl();

  return {
    vanityName,
    canonicalUrl: `https://www.linkedin.com/in/${encodeURIComponent(vanityName)}/`
  };
}

function invalidProfileUrl(): ApplicationError {
  return new ApplicationError(
    "INVALID_PROFILE_URL",
    "A valid HTTPS LinkedIn /in/ profile URL is required.",
    400
  );
}
