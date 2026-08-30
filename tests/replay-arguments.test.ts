import { describe, expect, it } from "vitest";
import { parseLinkedInProfileUrl } from "../src/linkedin/profile-url.js";

describe("experience replay inputs", () => {
  it("accepts the same canonical URL shape used by the replay command", () => {
    expect(parseLinkedInProfileUrl("https://www.linkedin.com/in/example-user/")).toEqual(
      {
        vanityName: "example-user",
        canonicalUrl: "https://www.linkedin.com/in/example-user/"
      }
    );
  });
});
