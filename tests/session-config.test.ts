import { describe, expect, it } from "vitest";
import { summarizeSessionConfig } from "../src/linkedin/session-config.js";

describe("summarizeSessionConfig", () => {
  it("validates the quoted JSESSIONID and matching CSRF token without exposing values", () => {
    const summary = summarizeSessionConfig({
      cookie: 'li_at=secret-session; JSESSIONID="ajax:123"; lang=v=2&lang=en-us',
      csrfToken: "ajax:123",
      requestTimeoutMs: 30_000
    });

    expect(summary).toMatchObject({
      cookieNames: ["JSESSIONID", "lang", "li_at"],
      cookieCount: 3,
      hasLiAt: true,
      hasJsessionId: true,
      jsessionIdIsQuoted: true,
      csrfMatchesJsessionId: true,
      liAtLength: 14,
      jsessionIdInnerLength: 8,
      csrfTokenLength: 8
    });
    expect(JSON.stringify(summary)).not.toContain("secret-session");
    expect(JSON.stringify(summary)).not.toContain("ajax:123");
  });
});
