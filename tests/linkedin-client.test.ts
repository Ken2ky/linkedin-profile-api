import { describe, expect, it, vi } from "vitest";
import type { LinkedInConfig } from "../src/config.js";
import {
  LinkedInClient,
  buildComponentUrl,
  buildPaginationUrl
} from "../src/linkedin/client.js";
import { PROFILE_COMPONENTS } from "../src/linkedin/components.js";

const config: LinkedInConfig = {
  cookie: "li_at=placeholder; JSESSIONID=\"placeholder\"",
  csrfToken: "placeholder",
  parentSpanId: "parent",
  requestTimeoutMs: 30_000
};

const context = {
  profileUrl: "https://www.linkedin.com/in/example-user/",
  vanityName: "example-user",
  vieweeProfileId: "PROFILE_ID",
  isSelfView: false
};

describe("LinkedInClient", () => {
  it("builds matching componentId and sduiid parameters", () => {
    const url = buildComponentUrl(PROFILE_COMPONENTS.experience, "parent");
    expect(url.searchParams.get("componentId")).toBe(PROFILE_COMPONENTS.experience);
    expect(url.searchParams.get("sduiid")).toBe(PROFILE_COMPONENTS.experience);
    expect(url.searchParams.get("parentSpanId")).toBe("parent");
  });

  it("sends the HAR-derived request shape and returns decoded text", async () => {
    const fetchMock = vi.fn((_url: URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      if (typeof init?.body !== "string") throw new Error("Expected a JSON body");
      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body).toHaveProperty("clientArguments");
      expect(body).not.toHaveProperty("states");
      return Promise.resolve(
        new Response('0:["$","div",null,{}]\n', { status: 200 })
      );
    });

    const client = new LinkedInClient(config, fetchMock as typeof fetch);
    await expect(
      client.fetchComponent(context, PROFILE_COMPONENTS.experience)
    ).resolves.toContain('0:["$"');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends detail pagination with the matching pager and detail referer", async () => {
    const fetchMock = vi.fn((url: URL, init?: RequestInit) => {
      expect(url).toEqual(
        buildPaginationUrl(
          "com.linkedin.sdui.pagers.profile.details.skills",
          "parent"
        )
      );
      expect(new Headers(init?.headers).get("referer")).toBe(
        "https://www.linkedin.com/in/example-user/details/skills/"
      );
      if (typeof init?.body !== "string") throw new Error("Expected a JSON body");
      const body = JSON.parse(init.body) as {
        clientArguments: { payload: { start: number } };
      };
      expect(body.clientArguments.payload.start).toBe(20);
      return Promise.resolve(new Response("0:[null,null,[]]", { status: 200 }));
    });

    const client = new LinkedInClient(config, fetchMock as typeof fetch);
    await client.fetchPagination(context, "skills", 20, 10);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports the upstream authentication status without exposing response data", async () => {
    const fetchMock: typeof fetch = () =>
      Promise.resolve(new Response("private body", { status: 403 }));
    const client = new LinkedInClient(
      config,
      vi.fn(fetchMock)
    );

    await expect(
      client.fetchComponent(context, PROFILE_COMPONENTS.experience)
    ).rejects.toMatchObject({
      code: "UPSTREAM_SESSION_EXPIRED",
      details: { upstreamStatus: 403 }
    });
  });

  it("fetches the initial profile HTML as a navigation without following redirects", async () => {
    const fetchImplementation: typeof fetch = (_url, init) => {
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("sec-fetch-dest")).toBe("document");
      return Promise.resolve(new Response("<html>profile</html>", { status: 200 }));
    };
    const client = new LinkedInClient(config, vi.fn(fetchImplementation));

    await expect(client.fetchProfilePage(context.profileUrl)).resolves.toContain(
      "profile"
    );
  });

  it("classifies checkpoint redirects without following them", async () => {
    const fetchMock: typeof fetch = () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://www.linkedin.com/checkpoint/challenge/" }
        })
      );
    const client = new LinkedInClient(config, fetchMock);

    await expect(client.fetchProfilePage(context.profileUrl)).rejects.toMatchObject({
      code: "UPSTREAM_CHECKPOINT"
    });
  });

  it("classifies an externally aborted upstream request as a timeout", async () => {
    const fetchMock: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("synthetic abort"));
        });
      });
    const client = new LinkedInClient(config, fetchMock);
    const signal = AbortSignal.timeout(5);

    await expect(
      client.fetchProfilePage(context.profileUrl, signal)
    ).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", statusCode: 504 });
  });
});
