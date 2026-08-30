import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/errors/application-error.js";
import { parseExperienceResponse } from "../src/linkedin/parsers/experience.js";

const stream = [
  '0:["$","div",null,{"data-sdui-component":"profileCardsExperienceOnly","children":["$L1","$L2"]}]',
  '1:["$","section",null,{"componentKey":"entity-collection-item-one","children":["$L3","$L4","$L5","$L6"]}]',
  '2:["$","section",null,{"componentKey":"entity-collection-item-two","children":["$L7","$L8","$L9","$La","$Lb"]}]',
  '3:["$","p",null,{"children":["Senior Engineer"]}]',
  '4:["$","p",null,{"children":["Example Corp \u00b7 Full-time"]}]',
  '5:["$","Text",null,{"textProps":{"children":["Jan 2022 - Present \u00b7 2 yrs"]}}]',
  '6:["$","Text",null,{"textProps":{"children":["London, England \u00b7 Remote"]}}]',
  '7:["$","p",null,{"children":["Engineering Intern"]}]',
  '8:["$","p",null,{"children":["Other Corp \u00b7 Internship"]}]',
  '9:["$","Text",null,{"textProps":{"children":["Jun 2021 - Dec 2021 \u00b7 7 mos"]}}]',
  'a:["$","Text",null,{"textProps":{"children":["London, England"]}}]',
  'b:["$","p",null,{"action":{"screenId":"ProfileSkillAssociationDetailsScreen"},"children":["TypeScript and Node.js"]}]'
].join("\n");

describe("parseExperienceResponse", () => {
  it("normalizes experience fields and associated skills", () => {
    expect(parseExperienceResponse(stream)).toEqual([
      {
        title: "Senior Engineer",
        company: "Example Corp",
        employmentType: "Full-time",
        companyLine: "Example Corp \u00b7 Full-time",
        dateRange: "Jan 2022 - Present",
        duration: "2 yrs",
        dateLine: "Jan 2022 - Present \u00b7 2 yrs",
        location: "London, England",
        workplaceType: "Remote",
        description: null,
        associatedSkills: []
      },
      {
        title: "Engineering Intern",
        company: "Other Corp",
        employmentType: "Internship",
        companyLine: "Other Corp \u00b7 Internship",
        dateRange: "Jun 2021 - Dec 2021",
        duration: "7 mos",
        dateLine: "Jun 2021 - Dec 2021 \u00b7 7 mos",
        location: "London, England",
        workplaceType: null,
        description: null,
        associatedSkills: ["TypeScript and Node.js"]
      }
    ]);
  });

  it("returns an empty list for a genuinely empty section", () => {
    expect(parseExperienceResponse('0:["$","div",null,{"children":[]}]')).toEqual([]);
  });

  it("follows replaceable-component initialContent", () => {
    const nestedStream = [
      '0:["$","Replaceable",null,{"initialContent":"$L1"}]',
      '1:["$","section",null,{"componentKey":"entity-collection-item-one","children":["$L2","$L3","$L4","$L5"]}]',
      '2:["$","p",null,{"children":["Engineer"]}]',
      '3:["$","p",null,{"children":["Example \u00b7 Full-time"]}]',
      '4:["$","Text",null,{"textProps":{"children":["2024 - Present \u00b7 1 yr"]}}]',
      '5:["$","Text",null,{"textProps":{"children":["Remote"]}}]'
    ].join("\n");
    expect(parseExperienceResponse(nestedStream)).toHaveLength(1);
  });

  it("finds Experience entries in a detail-screen record outside record zero", () => {
    const detailStream = [
      '0:["$","div",null,{"children":[]}]',
      '1:{"screen":["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.experienceDetailSection","content":"$L2"}]}',
      '2:["$","section",null,{"componentKey":"entity-collection-item-detail","children":["$L3","$L4","$L5"]}]',
      '3:["$","p",null,{"children":["Detail Engineer"]}]',
      '4:["$","p",null,{"children":["Example Corp \u00b7 Full-time"]}]',
      '5:["$","p",null,{"children":["2024 - Present \u00b7 1 yr"]}]'
    ].join("\n");

    expect(parseExperienceResponse(detailStream)).toEqual([
      expect.objectContaining({
        title: "Detail Engineer",
        company: "Example Corp",
        dateRange: "2024 - Present"
      })
    ]);
  });

  it("flattens grouped company roles while preserving shared context", () => {
    const grouped = [
      '0:["$","div",null,{"children":"$L1"}]',
      '1:["$","section",null,{"componentKey":"entity-collection-item-grouped","children":["$L2","$L3","$L4","$L5","$L6","$L7","$L8","$L9","$La"]}]',
      '2:["$","p",null,{"children":["Example Corp"]}]',
      '3:["$","Text",null,{"textProps":{"children":["1 yr 4 mos"]}}]',
      '4:["$","Text",null,{"textProps":{"children":["Bengaluru, Karnataka, India \u00b7 On-site"]}}]',
      '5:["$","p",null,{"children":["Software Engineer"]}]',
      '6:["$","p",null,{"children":["Full-time"]}]',
      '7:["$","Text",null,{"textProps":{"children":["Mar 2025 - Dec 2025 \u00b7 10 mos"]}}]',
      '8:["$","p",null,{"children":["Software Intern"]}]',
      '9:["$","p",null,{"children":["Internship"]}]',
      'a:["$","Text",null,{"textProps":{"children":["Sep 2024 - Mar 2025 \u00b7 7 mos"]}}]'
    ].join("\n");

    expect(parseExperienceResponse(grouped)).toEqual([
      expect.objectContaining({
        title: "Software Engineer",
        company: "Example Corp",
        employmentType: "Full-time",
        location: "Bengaluru, Karnataka, India",
        workplaceType: "On-site",
        dateRange: "Mar 2025 - Dec 2025"
      }),
      expect.objectContaining({
        title: "Software Intern",
        company: "Example Corp",
        employmentType: "Internship",
        dateRange: "Sep 2024 - Mar 2025"
      })
    ]);
  });

  it("detects a recognizable section whose entry structure changed", () => {
    expect(() =>
      parseExperienceResponse(
        '0:["$","div",null,{"children":["experienceTopLevelSection"]}]'
      )
    ).toThrow(ApplicationError);
  });
});
