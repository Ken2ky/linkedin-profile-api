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

  it("prefers the viewed-profile ID over a different fallback ID", () => {
    const records = decodeRscRecords(
      '0:{"vieweeProfileId":"TARGET_ID","nonIterableProfileId":"SECONDARY_ID"}'
    );
    expect(extractVieweeProfileId(records)).toBe("TARGET_ID");
  });

  it("matches an ambiguous viewed-profile ID using the requested vanity name", () => {
    const records = decodeRscRecords(
      '0:{"items":[{"vanityName":"other-user","vieweeProfileId":"OTHER_ID"},{"vanityName":"target-user","vieweeProfileId":"TARGET_ID"}]}'
    );
    expect(extractVieweeProfileId(records, "target-user")).toBe("TARGET_ID");
  });

  it("falls back to nonIterableProfileId when vieweeProfileId is absent", () => {
    const records = decodeRscRecords(
      '0:{"nonIterableProfileId":"FALLBACK_ID"}'
    );
    expect(extractVieweeProfileId(records)).toBe("FALLBACK_ID");
  });

  it("rejects ambiguous profile IDs", () => {
    const records = decodeRscRecords(
      '0:{"items":[{"vieweeProfileId":"PROFILE_A"},{"vieweeProfileId":"PROFILE_B"}]}'
    );
    expect(() => extractVieweeProfileId(records)).toThrow(ApplicationError);
  });
});
