import { describe, expect, it } from "vitest";
import { decodeRscRecords } from "../src/linkedin/rsc/decode-records.js";
import { extractRehydrationStream } from "../src/linkedin/rehydration.js";

describe("extractRehydrationStream", () => {
  it("extracts JSON string chunks without evaluating JavaScript", () => {
    const html = `
      <html><body>
        <script id="rehydrate-data" type="text/javascript">
          window.__como_rehydration__ = ["0:{\\"vieweeProfileId\\":\\"PROFILE_ID\\"}\\n"];
        </script>
      </body></html>
    `;
    const stream = extractRehydrationStream(html);
    expect(decodeRscRecords(stream).get("0")?.value).toEqual({
      vieweeProfileId: "PROFILE_ID"
    });
  });
});
