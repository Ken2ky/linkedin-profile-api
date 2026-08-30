import type { LinkedInConfig } from "../config.js";

export interface SessionConfigSummary {
  cookieNames: string[];
  cookieCount: number;
  hasLiAt: boolean;
  hasJsessionId: boolean;
  jsessionIdIsQuoted: boolean;
  csrfMatchesJsessionId: boolean;
  liAtLength: number;
  jsessionIdInnerLength: number;
  csrfTokenLength: number;
}

export function summarizeSessionConfig(config: LinkedInConfig): SessionConfigSummary {
  const cookies = parseCookieHeader(config.cookie ?? "");
  const liAt = cookies.get("li_at") ?? "";
  const jsessionId = cookies.get("JSESSIONID") ?? "";
  const jsessionIdIsQuoted =
    jsessionId.length >= 2 && jsessionId.startsWith('"') && jsessionId.endsWith('"');
  const jsessionIdInner = jsessionIdIsQuoted ? jsessionId.slice(1, -1) : jsessionId;
  const csrfToken = config.csrfToken ?? "";

  return {
    cookieNames: [...cookies.keys()].sort(),
    cookieCount: cookies.size,
    hasLiAt: liAt.length > 0,
    hasJsessionId: jsessionId.length > 0,
    jsessionIdIsQuoted,
    csrfMatchesJsessionId: csrfToken.length > 0 && csrfToken === jsessionIdInner,
    liAtLength: liAt.length,
    jsessionIdInnerLength: jsessionIdInner.length,
    csrfTokenLength: csrfToken.length
  };
}

function parseCookieHeader(header: string): Map<string, string> {
  const cookies = new Map<string, string>();

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }

  return cookies;
}
