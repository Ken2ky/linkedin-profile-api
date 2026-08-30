import { describe, expect, it } from "vitest";
import {
  parseCertificationDetailPage,
  parseEducationDetailPage,
  parseSkillsDetailPage
} from "../src/linkedin/parsers/detail-pagination.js";

function page(itemReference: string, nextStart?: number): string {
  const next =
    nextStart === undefined
      ? null
      : JSON.stringify({ requestedArguments: { payload: { start: nextStart } } });
  return `0:[null,${JSON.stringify(next)},[["metadata","${itemReference}"]]]`;
}

describe("detail pagination parsers", () => {
  it("parses Education detail cards", () => {
    const stream = [
      page("$L1"),
      '1:["$","div",null,{"triggers":{"url":"https://www.linkedin.com/school/123/"},"children":[["$","p",null,{"children":["Example University"]}],["$","p",null,{"children":["Bachelor of Science, Computer Science"]}],["$","p",null,{"children":["2020 – 2024"]}]]}]'
    ].join("\n");

    expect(parseEducationDetailPage(stream)).toMatchObject({
      nextStart: null,
      items: [
        {
          school: "Example University",
          degree: "Bachelor of Science",
          fieldOfStudy: "Computer Science",
          dateRange: "2020 – 2024"
        }
      ]
    });
  });

  it("parses Certification detail cards", () => {
    const stream = [
      page("$L1"),
      '1:["$","div",null,{"viewTrackingSpecs":{"viewName":"license-certifications-lockup-view"},"credential":"https://credentials.example.org/ABC","children":[["$","p",null,{"children":["Cloud Certificate"]}],["$","p",null,{"children":["Example Issuer"]}],["$","p",null,{"children":["Issued Jan 2024 · Expires Jan 2027"]}],["$","p",null,{"children":["Credential ID ABC"]}]]}]'
    ].join("\n");

    expect(parseCertificationDetailPage(stream).items).toEqual([
      {
        name: "Cloud Certificate",
        issuingOrganization: "Example Issuer",
        issueDate: "Jan 2024",
        expirationDate: "Jan 2027",
        credentialId: "ABC",
        credentialUrl: "https://credentials.example.org/ABC",
        dateLine: "Issued Jan 2024 · Expires Jan 2027"
      }
    ]);
  });

  it("parses Skills cards and exposes the next cursor", () => {
    const stream = [
      page("$L1", 10),
      '1:["$","Replaceable",null,{"componentKey":"com.linkedin.sdui.profile.skill(PROFILE_ID, 1)","initialContent":["$","div",null,{"children":[["$","p",null,{"children":["TypeScript"]}],["$","p",null,{"children":["Engineer at Example"]}]]}]}]'
    ].join("\n");

    expect(parseSkillsDetailPage(stream)).toEqual({
      items: [{ name: "TypeScript", associatedWith: ["Engineer at Example"] }],
      nextStart: 10
    });
  });
});
