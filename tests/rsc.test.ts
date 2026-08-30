import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/errors/application-error.js";
import { decodeRscRecords } from "../src/linkedin/rsc/decode-records.js";
import { resolveRscRecord } from "../src/linkedin/rsc/resolve-reference.js";

const syntheticStream = [
  '1:I["module-hash",[],"default"]',
  '0:["$","div",null,{"children":"$L2","missing":"$undefined"}]',
  '2:["$","p",null,{"children":["Software Engineer"]}]',
  '3:"$2:props:children:0"',
  "4:null"
].join("\n");

describe("RSC decoding", () => {
  it("parses import, JSON, string, and null records", () => {
    const records = decodeRscRecords(syntheticStream);
    expect(records).toHaveLength(5);
    expect(records.get("1")?.kind).toBe("import");
    expect(records.get("4")?.value).toBeNull();
  });

  it("resolves lazy records, paths, and undefined sentinels", () => {
    const records = decodeRscRecords(syntheticStream);
    expect(resolveRscRecord("0", records)).toEqual([
      "$",
      "div",
      null,
      {
        children: ["$", "p", null, { children: ["Software Engineer"] }]
      }
    ]);
    expect(resolveRscRecord("3", records)).toBe("Software Engineer");
  });

  it("rejects malformed records", () => {
    expect(() => decodeRscRecords("not-a-record")).toThrow(ApplicationError);
  });
});
