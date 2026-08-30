import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { ApplicationError } from "../src/errors/application-error.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("API foundation", () => {
  it("reports process health without contacting LinkedIn", async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "fatal" }));
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("reports missing runtime secrets as not ready", async () => {
    const app = await buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "fatal" }));
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "not_ready" });
  });

  it("rejects an invalid profile URL before extraction", async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "fatal",
        LINKEDIN_COOKIE: "placeholder",
        LINKEDIN_CSRF_TOKEN: "placeholder"
      })
    );
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/profile",
      payload: { url: "https://notlinkedin.com/in/example/" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "INVALID_PROFILE_URL" }
    });
  });

  it("returns the injected normalized profile result", async () => {
    const profileExtractor = {
      extract: () => Promise.resolve({
        profile: {
          profileUrl: "https://www.linkedin.com/in/example-user/",
          name: "Example Person",
          headline: null,
          location: null,
          about: null,
          profileImages: { profile: null, background: null },
          experience: [],
          education: [],
          skills: [],
          certifications: [],
          languages: []
        },
        meta: {
          partial: true,
          extractedAt: "2026-08-30T00:00:00.000Z",
          cache: { status: "miss" as const, ageSeconds: 0 },
          sections: {
            topCard: { status: "complete" as const },
            about: { status: "unavailable" as const, reason: "NOT_AVAILABLE" }
          }
        }
      })
    };
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "fatal",
        LINKEDIN_COOKIE: "placeholder",
        LINKEDIN_CSRF_TOKEN: "placeholder"
      }),
      { profileExtractor }
    );
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/profile",
      payload: { url: "https://www.linkedin.com/in/example-user/" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      profile: { name: "Example Person" },
      meta: { partial: true }
    });
  });

  it("returns a structured 429 at the configured profile request limit", async () => {
    const result = {
      profile: {
        profileUrl: "https://www.linkedin.com/in/example-user/",
        name: "Example Person",
        headline: null,
        location: null,
        about: null,
        profileImages: { profile: null, background: null },
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        languages: []
      },
      meta: {
        partial: false,
        extractedAt: "2026-08-30T00:00:00.000Z",
        cache: { status: "miss" as const, ageSeconds: 0 },
        sections: { topCard: { status: "complete" as const } }
      }
    };
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "fatal",
        LINKEDIN_COOKIE: "placeholder",
        LINKEDIN_CSRF_TOKEN: "placeholder",
        PROFILE_RATE_LIMIT_MAX: "1",
        PROFILE_RATE_LIMIT_WINDOW_MS: "60000"
      }),
      { profileExtractor: { extract: () => Promise.resolve(result) } }
    );
    apps.push(app);

    const request = () =>
      app.inject({
        method: "POST",
        url: "/api/profile",
        payload: { url: "https://www.linkedin.com/in/example-user/" }
      });

    expect((await request()).statusCode).toBe(200);
    const limited = await request();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("returns Retry-After for a global extraction limit error", async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "fatal",
        LINKEDIN_COOKIE: "placeholder",
        LINKEDIN_CSRF_TOKEN: "placeholder"
      }),
      {
        profileExtractor: {
          extract: () =>
            Promise.reject(
              new ApplicationError(
                "GLOBAL_EXTRACTION_LIMITED",
                "The server-wide LinkedIn extraction limit has been reached.",
                429,
                undefined,
                120
              )
            )
        }
      }
    );
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/profile",
      payload: { url: "https://www.linkedin.com/in/example-user/" }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("120");
    expect(response.json()).toMatchObject({
      error: { code: "GLOBAL_EXTRACTION_LIMITED" }
    });
  });
});
