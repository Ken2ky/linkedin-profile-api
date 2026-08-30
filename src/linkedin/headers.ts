import type { LinkedInConfig } from "../config.js";
import type { ProfileContext } from "./types.js";

export function buildLinkedInHeaders(
  config: LinkedInConfig,
  context: ProfileContext
): Record<string, string> {
  if (!config.cookie || !config.csrfToken) {
    throw new Error("LinkedIn cookie and CSRF token are required");
  }

  const headers: Record<string, string> = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    cookie: config.cookie,
    "csrf-token": config.csrfToken,
    origin: "https://www.linkedin.com",
    priority: "u=1, i",
    referer: context.profileUrl,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-li-anchor-page-key": "d_flagship3_profile_view_base",
    "x-li-rsc-stream": "true"
  };

  add(headers, "user-agent", config.userAgent);
  add(headers, "sec-ch-ua", config.secChUa);
  add(headers, "sec-ch-ua-platform", config.secChUaPlatform);
  if (config.secChUa) headers["sec-ch-ua-mobile"] = "?0";
  add(headers, "x-li-track", config.xLiTrack);
  add(headers, "x-li-application-version", config.xLiApplicationVersion);
  add(headers, "x-li-application-instance", config.xLiApplicationInstance);
  add(headers, "x-li-pageforestid", config.xLiPageforestId);
  add(headers, "x-li-page-instance", config.xLiPageInstance);
  add(
    headers,
    "x-li-page-instance-tracking-id",
    config.xLiPageInstanceTrackingId
  );
  add(headers, "x-li-traceparent", config.xLiTraceparent);
  add(headers, "x-li-tracestate", config.xLiTracestate);

  return headers;
}

export function buildLinkedInPageHeaders(
  config: LinkedInConfig
): Record<string, string> {
  if (!config.cookie) {
    throw new Error("LinkedIn cookie is required");
  }

  const headers: Record<string, string> = {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    cookie: config.cookie,
    priority: "u=0, i",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
  };

  add(headers, "user-agent", config.userAgent);
  add(headers, "sec-ch-ua", config.secChUa);
  add(headers, "sec-ch-ua-platform", config.secChUaPlatform);
  if (config.secChUa) headers["sec-ch-ua-mobile"] = "?0";

  return headers;
}

function add(
  headers: Record<string, string>,
  name: string,
  value: string | undefined
): void {
  if (value) headers[name] = value;
}
