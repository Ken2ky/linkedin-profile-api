import type { LinkedInConfig } from "../config.js";
import { ApplicationError } from "../errors/application-error.js";
import { buildLinkedInHeaders, buildLinkedInPageHeaders } from "./headers.js";
import {
  buildComponentRequestBody,
  buildPaginationRequestBody,
  getPagerId
} from "./payload.js";
import type { PaginatedProfileSection } from "./payload.js";
import type { ProfileContext } from "./types.js";

const COMPONENT_ENDPOINT =
  "https://www.linkedin.com/flagship-web/rsc-action/actions/component";
const PAGINATION_ENDPOINT =
  "https://www.linkedin.com/flagship-web/rsc-action/actions/pagination";
const MAX_PROFILE_HTML_BYTES = 5 * 1024 * 1024;

export type FetchImplementation = typeof fetch;

export class LinkedInClient {
  constructor(
    private readonly config: LinkedInConfig,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {}

  async fetchProfilePage(
    profileUrl: string,
    externalSignal?: AbortSignal
  ): Promise<string> {
    const response = await fetchLinkedIn(
      this.fetchImplementation,
      profileUrl,
      {
        method: "GET",
        headers: buildLinkedInPageHeaders(this.config),
        redirect: "manual"
      },
      this.config.requestTimeoutMs,
      externalSignal
    );

    assertLinkedInResponse(response);

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PROFILE_HTML_BYTES) {
      throw responseTooLarge();
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_PROFILE_HTML_BYTES) throw responseTooLarge();
    return new TextDecoder("utf-8").decode(bytes);
  }

  async fetchComponent(
    context: ProfileContext,
    componentId: string,
    externalSignal?: AbortSignal
  ): Promise<string> {
    const url = buildComponentUrl(componentId, this.config.parentSpanId);
    const response = await fetchLinkedIn(
      this.fetchImplementation,
      url,
      {
        method: "POST",
        headers: buildLinkedInHeaders(this.config, context),
        body: JSON.stringify(buildComponentRequestBody(context)),
        redirect: "manual"
      },
      this.config.requestTimeoutMs,
      externalSignal
    );

    assertLinkedInResponse(response);

    const bytes = await response.arrayBuffer();
    return new TextDecoder("utf-8").decode(bytes);
  }

  async fetchPagination(
    context: ProfileContext,
    section: PaginatedProfileSection,
    start: number,
    count: number,
    externalSignal?: AbortSignal
  ): Promise<string> {
    const url = buildPaginationUrl(
      getPagerId(section),
      this.config.parentSpanId
    );
    const detailContext = {
      ...context,
      profileUrl: new URL(`details/${section}/`, context.profileUrl).toString()
    };
    const response = await fetchLinkedIn(
      this.fetchImplementation,
      url,
      {
        method: "POST",
        headers: buildLinkedInHeaders(this.config, detailContext),
        body: JSON.stringify(
          buildPaginationRequestBody(context, section, start, count)
        ),
        redirect: "manual"
      },
      this.config.requestTimeoutMs,
      externalSignal
    );

    assertLinkedInResponse(response);

    const bytes = await response.arrayBuffer();
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function fetchLinkedIn(
  fetchImplementation: FetchImplementation,
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetchImplementation(url, { ...init, signal });
  } catch (error: unknown) {
    if (signal.aborted) {
      throw new ApplicationError(
        "UPSTREAM_TIMEOUT",
        "LinkedIn did not complete the request within the configured deadline.",
        504
      );
    }
    throw error;
  }
}

function assertLinkedInResponse(response: Response): void {
  if (response.status === 401 || response.status === 403) {
    throw new ApplicationError(
      "UPSTREAM_SESSION_EXPIRED",
      "The upstream LinkedIn session is invalid or unavailable.",
      503,
      { upstreamStatus: response.status }
    );
  }

  if (response.status === 429) {
    throw new ApplicationError(
      "UPSTREAM_RATE_LIMITED",
      "LinkedIn temporarily rate-limited profile extraction.",
      503,
      { upstreamStatus: response.status }
    );
  }

  if (response.status === 404) {
    throw new ApplicationError(
      "PROFILE_NOT_FOUND",
      "The requested LinkedIn profile was not found.",
      404,
      { upstreamStatus: response.status }
    );
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "";
    const code = location.includes("/checkpoint/")
      ? "UPSTREAM_CHECKPOINT"
      : "UPSTREAM_SESSION_EXPIRED";
    throw new ApplicationError(
      code,
      "LinkedIn redirected the authenticated request instead of returning profile data.",
      503,
      { upstreamStatus: response.status }
    );
  }

  if (!response.ok) {
    throw new ApplicationError(
      "UPSTREAM_UNAVAILABLE",
      `LinkedIn returned HTTP ${response.status}.`,
      502,
      { upstreamStatus: response.status }
    );
  }
}

function responseTooLarge(): ApplicationError {
  return new ApplicationError(
    "UPSTREAM_RESPONSE_TOO_LARGE",
    "LinkedIn returned a profile response larger than the configured safety limit.",
    502
  );
}

export function buildComponentUrl(
  componentId: string,
  parentSpanId?: string
): URL {
  const url = new URL(COMPONENT_ENDPOINT);
  url.searchParams.set("componentId", componentId);
  url.searchParams.set("sduiid", componentId);
  if (parentSpanId) url.searchParams.set("parentSpanId", parentSpanId);
  return url;
}

export function buildPaginationUrl(
  pagerId: string,
  parentSpanId?: string
): URL {
  const url = new URL(PAGINATION_ENDPOINT);
  url.searchParams.set("sduiid", pagerId);
  if (parentSpanId) url.searchParams.set("parentSpanId", parentSpanId);
  return url;
}
