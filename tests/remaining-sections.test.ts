import { describe, expect, it } from "vitest";
import { parseEducationAndCertificationsResponse } from "../src/linkedin/parsers/education-certifications.js";
import { parseLanguagesResponse } from "../src/linkedin/parsers/languages.js";
import { parseSkillsResponse } from "../src/linkedin/parsers/skills.js";

const educationAndCertifications = [
  '0:["$","div",null,{"children":[["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.educationTopLevelSection"}],["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.certificationTopLevelSection"}]]}]',
  '1:["$","Collection",null,{"collectionId":"profile_EducationTopLevelSection_example","initialItems":[{"key":"education-1","item":"$L3"}]}]',
  '2:["$","Collection",null,{"collectionId":"profile_CertificationTopLevel_example","initialItems":[{"key":"certification-1","item":"$L4"}]}]',
  '3:["$","div",null,{"children":[["$","p",null,{"children":["Example University"]}],["$","p",null,{"children":["Bachelor of Science, Computer Science"]}],["$","Text",null,{"textProps":{"children":["2020 – 2024"]}}]]}]',
  '4:["$","div",null,{"credentialLink":"https://credentials.example.org/ABC123","logo":"https://media.licdn.com/company-logo_100","children":[["$","p",null,{"children":["Cloud Certificate"]}],["$","p",null,{"children":["Example Issuer"]}],["$","Text",null,{"textProps":{"children":["Issued Jan 2024 · Expires Jan 2027"]}}],["$","p",null,{"children":["Credential ID ABC123"]}]]}]'
].join("\n");

describe("remaining section parsers", () => {
  it("normalizes Education and Certifications from their shared component", () => {
    expect(parseEducationAndCertificationsResponse(educationAndCertifications)).toEqual({
      education: [
        {
          school: "Example University",
          degree: "Bachelor of Science",
          fieldOfStudy: "Computer Science",
          dateRange: "2020 – 2024",
          description: null
        }
      ],
      certifications: [
        {
          name: "Cloud Certificate",
          issuingOrganization: "Example Issuer",
          issueDate: "Jan 2024",
          expirationDate: "Jan 2027",
          credentialId: "ABC123",
          credentialUrl: "https://credentials.example.org/ABC123",
          dateLine: "Issued Jan 2024 · Expires Jan 2027"
        }
      ]
    });
  });

  it("normalizes skills and their displayed associations", () => {
    const stream = [
      '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.skillsSection"}]',
      '1:["$","Collection",null,{"collectionId":"profile_Skills_example","initialItems":[{"item":"$L2"}]}]',
      '2:["$","div",null,{"children":[["$","p",null,{"children":["TypeScript"]}],["$","p",null,{"children":["Software Engineer at Example"]}]]}]'
    ].join("\n");
    expect(parseSkillsResponse(stream)).toEqual([
      {
        name: "TypeScript",
        associatedWith: ["Software Engineer at Example"]
      }
    ]);
  });

  it("handles populated and explicitly empty language sections", () => {
    const populated = [
      '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.languageTopLevelSection"}]',
      '1:["$","Collection",null,{"collectionId":"profile_LanguageTopLevel_example","initialItems":[{"item":"$L2"}]}]',
      '2:["$","div",null,{"children":[["$","p",null,{"children":["English"]}],["$","p",null,{"children":["Professional working proficiency"]}]]}]'
    ].join("\n");
    const empty =
      '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.languageTopLevelSection","children":["$","Replaceable",null,{"initialContent":"$undefined"}]}]';

    expect(parseLanguagesResponse(populated)).toEqual([
      { name: "English", proficiency: "Professional working proficiency" }
    ]);
    expect(parseLanguagesResponse(empty)).toEqual([]);
  });

  it("does not treat a Languages marker without data state as complete", () => {
    expect(() =>
      parseLanguagesResponse(
        '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.languageTopLevelSection"}]'
      )
    ).toThrow();
  });
});
