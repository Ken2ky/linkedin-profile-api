export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface LinkedInConfig {
  cookie?: string;
  csrfToken?: string;
  userAgent?: string;
  secChUa?: string;
  secChUaPlatform?: string;
  xLiTrack?: string;
  xLiApplicationVersion?: string;
  xLiApplicationInstance?: string;
  xLiPageforestId?: string;
  xLiPageInstance?: string;
  xLiPageInstanceTrackingId?: string;
  xLiTraceparent?: string;
  xLiTracestate?: string;
  parentSpanId?: string;
  requestTimeoutMs: number;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: LogLevel;
  trustProxy: boolean;
  profileRateLimit: {
    max: number;
    timeWindowMs: number;
  };
  profileCache: {
    ttlMs: number;
    maxEntries: number;
  };
  globalExtractionLimit: {
    max: number;
    timeWindowMs: number;
  };
  linkedin: LinkedInConfig;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function integer(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }

  return parsed;
}

function boolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (!(["development", "test", "production"] as const).includes(nodeEnv as never)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const logLevel = env.LOG_LEVEL ?? "info";
  if (!(["fatal", "error", "warn", "info", "debug", "trace"] as const).includes(logLevel as never)) {
    throw new Error("LOG_LEVEL is invalid");
  }

  const config: AppConfig = {
    nodeEnv: nodeEnv as AppConfig["nodeEnv"],
    host: optional(env.HOST) ?? "0.0.0.0",
    port: integer(env.PORT, 3000, "PORT", 1, 65_535),
    logLevel: logLevel as LogLevel,
    trustProxy: boolean(env.TRUST_PROXY, false, "TRUST_PROXY"),
    profileRateLimit: {
      max: integer(env.PROFILE_RATE_LIMIT_MAX, 3, "PROFILE_RATE_LIMIT_MAX", 1, 100),
      timeWindowMs: integer(
        env.PROFILE_RATE_LIMIT_WINDOW_MS,
        60_000,
        "PROFILE_RATE_LIMIT_WINDOW_MS",
        1_000,
        3_600_000
      )
    },
    profileCache: {
      ttlMs: integer(
        env.PROFILE_CACHE_TTL_MS,
        900_000,
        "PROFILE_CACHE_TTL_MS",
        1_000,
        86_400_000
      ),
      maxEntries: integer(
        env.PROFILE_CACHE_MAX_ENTRIES,
        50,
        "PROFILE_CACHE_MAX_ENTRIES",
        1,
        1_000
      )
    },
    globalExtractionLimit: {
      max: integer(
        env.GLOBAL_EXTRACTION_LIMIT_MAX,
        6,
        "GLOBAL_EXTRACTION_LIMIT_MAX",
        1,
        100
      ),
      timeWindowMs: integer(
        env.GLOBAL_EXTRACTION_LIMIT_WINDOW_MS,
        60_000,
        "GLOBAL_EXTRACTION_LIMIT_WINDOW_MS",
        60_000,
        86_400_000
      )
    },
    linkedin: {
      requestTimeoutMs: integer(
        env.LINKEDIN_REQUEST_TIMEOUT_MS,
        30_000,
        "LINKEDIN_REQUEST_TIMEOUT_MS",
        1_000,
        120_000
      )
    }
  };

  const optionalValues = {
    cookie: optional(env.LINKEDIN_COOKIE),
    csrfToken: optional(env.LINKEDIN_CSRF_TOKEN),
    userAgent: optional(env.LINKEDIN_USER_AGENT),
    secChUa: optional(env.LINKEDIN_SEC_CH_UA),
    secChUaPlatform: optional(env.LINKEDIN_SEC_CH_UA_PLATFORM),
    xLiTrack: optional(env.LINKEDIN_X_LI_TRACK),
    xLiApplicationVersion: optional(env.LINKEDIN_X_LI_APPLICATION_VERSION),
    xLiApplicationInstance: optional(env.LINKEDIN_X_LI_APPLICATION_INSTANCE),
    xLiPageforestId: optional(env.LINKEDIN_X_LI_PAGEFOREST_ID),
    xLiPageInstance: optional(env.LINKEDIN_X_LI_PAGE_INSTANCE),
    xLiPageInstanceTrackingId: optional(env.LINKEDIN_X_LI_PAGE_INSTANCE_TRACKING_ID),
    xLiTraceparent: optional(env.LINKEDIN_X_LI_TRACEPARENT),
    xLiTracestate: optional(env.LINKEDIN_X_LI_TRACESTATE),
    parentSpanId: optional(env.LINKEDIN_PARENT_SPAN_ID)
  };

  for (const [key, value] of Object.entries(optionalValues)) {
    if (value !== undefined) {
      Object.assign(config.linkedin, { [key]: value });
    }
  }

  if (config.nodeEnv === "production") {
    if (!hasLinkedInSession(config.linkedin)) {
      throw new Error("LINKEDIN_COOKIE and LINKEDIN_CSRF_TOKEN are required in production");
    }
  }

  return config;
}

export function hasLinkedInSession(config: LinkedInConfig): boolean {
  return Boolean(config.cookie && config.csrfToken);
}
