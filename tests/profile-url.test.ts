import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/errors/application-error.js";
import { parseLinkedInProfileUrl } from "../src/linkedin/profile-url.js";

describe("parseLinkedInProfileUrl", () => {
  it.each([
    "https://www.linkedin.com/in/example-user/",
    "https://linkedin.com/in/example-user",
    "https://in.linkedin.com/in/example-user/?trk=public_profile"
  ])("normalizes %s", (input) => {
    expect(parseLinkedInProfileUrl(input)).toEqual({
      vanityName: "example-user",
      canonicalUrl: "https://www.linkedin.com/in/example-user/"
    });
  });

  it.each([
    "http://www.linkedin.com/in/example-user/",
    "https://notlinkedin.com/in/example-user/",
    "https://www.linkedin.com/company/example/",
    "https://user:password@www.linkedin.com/in/example-user/",
    "https://www.linkedin.com:444/in/example-user/",
    "https://www.linkedin.com/in/example%2Fadmin/",
    "not-a-url"
  ])("rejects %s", (input) => {
    expect(() => parseLinkedInProfileUrl(input)).toThrow(ApplicationError);
  });
});
