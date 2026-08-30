import { describe, expect, it } from "vitest";
import { hasLinkedInSession, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads safe development defaults", () => {
    const config = loadConfig({ NODE_ENV: "test" });
    expect(config.port).toBe(3000);
    expect(config.trustProxy).toBe(false);
    expect(config.profileRateLimit).toEqual({ max: 3, timeWindowMs: 60_000 });
    expect(config.profileCache).toEqual({ ttlMs: 900_000, maxEntries: 50 });
    expect(config.globalExtractionLimit).toEqual({
      max: 6,
      timeWindowMs: 60_000
    });
    expect(config.linkedin.requestTimeoutMs).toBe(30_000);
    expect(hasLinkedInSession(config.linkedin)).toBe(false);
  });

  it("loads and validates the global extraction limit", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      GLOBAL_EXTRACTION_LIMIT_MAX: "4",
      GLOBAL_EXTRACTION_LIMIT_WINDOW_MS: "600000"
    });

    expect(config.globalExtractionLimit).toEqual({
      max: 4,
      timeWindowMs: 600_000
    });
    expect(() =>
      loadConfig({ NODE_ENV: "test", GLOBAL_EXTRACTION_LIMIT_MAX: "0" })
    ).toThrow(/GLOBAL_EXTRACTION_LIMIT_MAX/);
  });

  it("loads and validates profile cache settings", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PROFILE_CACHE_TTL_MS: "60000",
      PROFILE_CACHE_MAX_ENTRIES: "25"
    });

    expect(config.profileCache).toEqual({ ttlMs: 60_000, maxEntries: 25 });
    expect(() =>
      loadConfig({ NODE_ENV: "test", PROFILE_CACHE_MAX_ENTRIES: "0" })
    ).toThrow(/PROFILE_CACHE_MAX_ENTRIES/);
  });

  it("loads and validates trusted-proxy configuration", () => {
    expect(loadConfig({ NODE_ENV: "test", TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(() => loadConfig({ NODE_ENV: "test", TRUST_PROXY: "yes" })).toThrow(
      /TRUST_PROXY/
    );
  });

  it("loads and validates the profile rate limit", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PROFILE_RATE_LIMIT_MAX: "5",
      PROFILE_RATE_LIMIT_WINDOW_MS: "120000"
    });

    expect(config.profileRateLimit).toEqual({ max: 5, timeWindowMs: 120_000 });
    expect(() =>
      loadConfig({ NODE_ENV: "test", PROFILE_RATE_LIMIT_MAX: "0" })
    ).toThrow(/PROFILE_RATE_LIMIT_MAX/);
  });

  it("requires secrets in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
      /LINKEDIN_COOKIE/
    );
  });
});
