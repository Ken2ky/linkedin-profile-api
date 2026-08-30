import { describe, expect, it, vi } from "vitest";
import type { LinkedInClient } from "../src/linkedin/client.js";
import {
  resolveProfileBootstrap,
  resolveProfileContext
} from "../src/linkedin/profile-resolver.js";

describe("resolveProfileContext", () => {
  it("extracts the internal ID from the initial profile rehydration stream", async () => {
    const html = `
      <script id="rehydrate-data">
        window.__como_rehydration__ = ["0:{\\"vieweeProfileId\\":\\"PROFILE_ID\\",\\"nonIterableProfileId\\":\\"PROFILE_ID\\"}\\n"];
      </script>
    `;
    const client = {
      fetchProfilePage: vi.fn(() => Promise.resolve(html))
    } as unknown as LinkedInClient;

    await expect(
      resolveProfileContext(
        client,
        "https://www.linkedin.com/in/example-user/",
        "example-user"
      )
    ).resolves.toEqual({
      profileUrl: "https://www.linkedin.com/in/example-user/",
      vanityName: "example-user",
      vieweeProfileId: "PROFILE_ID",
      isSelfView: false
    });
  });

  it("returns top-card data from the same profile fetch used for ID resolution", async () => {
    const stream = [
      '0:{"vieweeProfileId":"PROFILE_ID"}',
      '1:["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L2","$L3","$L4"]}]',
      '2:["$","h2",null,{"children":["Example Person"]}]',
      '3:["$","p",null,{"children":["Example Headline"]}]',
      '4:["$","Text",null,{"textProps":{"children":["Example City"]}}]'
    ].join("\n");
    const html = `<script id="rehydrate-data">window.__como_rehydration__ = ${JSON.stringify([`${stream}\n`])};</script>`;
    const fetchProfilePage = vi.fn(() => Promise.resolve(html));
    const client = { fetchProfilePage } as unknown as LinkedInClient;

    const result = await resolveProfileBootstrap(
      client,
      "https://www.linkedin.com/in/example-user/",
      "example-user"
    );

    expect(fetchProfilePage).toHaveBeenCalledOnce();
    expect(result.context.vieweeProfileId).toBe("PROFILE_ID");
    expect(result.topCard).toMatchObject({
      name: "Example Person",
      headline: "Example Headline",
      location: "Example City"
    });
  });
});
