import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/errors/application-error.js";
import { extractVieweeProfileId } from "../src/linkedin/profile-id.js";
import { decodeRscRecords } from "../src/linkedin/rsc/decode-records.js";

describe("extractVieweeProfileId", () => {
  it("deduplicates matching profile ID fields", () => {
    const records = decodeRscRecords(
      '0:{"vieweeProfileId":"PROFILE_ID","nested":{"nonIterableProfileId":"PROFILE_ID"}}'
    );
    expect(extractVieweeProfileId(records)).toBe("PROFILE_ID");
  });

  it("rejects ambiguous profile IDs", () => {
    const records = decodeRscRecords(
      '0:{"vieweeProfileId":"PROFILE_A","nonIterableProfileId":"PROFILE_B"}'
    );
    expect(() => extractVieweeProfileId(records)).toThrow(ApplicationError);
  });
});
