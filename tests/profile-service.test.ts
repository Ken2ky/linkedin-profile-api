import { describe, expect, it, vi } from "vitest";
import type { LinkedInClient } from "../src/linkedin/client.js";
import { PROFILE_COMPONENTS } from "../src/linkedin/components.js";
import { ProfileService } from "../src/services/profile-service.js";

const bootstrapStream = [
  '0:{"vieweeProfileId":"PROFILE_ID"}',
  '1:["$","Section",null,{"viewTrackingSpecs":{"viewName":"profile-top-card"},"children":["$L2","$L3","$L4"]}]',
  '2:["$","h2",null,{"children":["Example Person"]}]',
  '3:["$","p",null,{"children":["Example Headline"]}]',
  '4:["$","Text",null,{"textProps":{"children":["Example City"]}}]'
].join("\n");

const experienceDetailStream = [
  '0:["$","div",null,{"children":[]}]',
  '1:{"screen":["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.experienceDetailSection","content":"$L2"}]}',
  '2:["$","section",null,{"componentKey":"entity-collection-item-detail","children":["$L3","$L4","$L5","$L6"]}]',
  '3:["$","p",null,{"children":["Engineer"]}]',
  '4:["$","p",null,{"children":["Example Corp \u00b7 Full-time"]}]',
  '5:["$","p",null,{"children":["2024 - Present \u00b7 1 yr"]}]',
  '6:["$","p",null,{"children":["Example City"]}]'
].join("\n");

function rehydrationHtml(stream: string): string {
  return `<script id="rehydrate-data">window.__como_rehydration__ = ${JSON.stringify([`${stream}\n`])};</script>`;
}

const responses: Record<string, string> = {
  [PROFILE_COMPONENTS.about]: [
    '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.aboutSection","children":["$","Replaceable",null,{"initialContent":"$L1"}]}]',
    '1:["$","p",null,{"children":["Example About"]}]'
  ].join("\n"),
  [PROFILE_COMPONENTS.experience]: [
    '0:["$","div",null,{"data-sdui-component":"profileCardsExperienceOnly","observabilityIdentifier":"experienceTopLevelSection","children":"$L1"}]',
    '1:["$","section",null,{"componentKey":"entity-collection-item-one","children":["$L2","$L3","$L4","$L5"]}]',
    '2:["$","p",null,{"children":["Engineer"]}]',
    '3:["$","p",null,{"children":["Example Corp · Full-time"]}]',
    '4:["$","Text",null,{"textProps":{"children":["2024 - Present · 1 yr"]}}]',
    '5:["$","Text",null,{"textProps":{"children":["Example City"]}}]'
  ].join("\n"),
  [PROFILE_COMPONENTS.educationAndCertifications]: [
    '0:["$","div",null,{"children":[["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.educationTopLevelSection"}],["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.certificationTopLevelSection"}]]}]',
    '1:["$","Collection",null,{"collectionId":"profile_EducationTopLevelSection_example","initialItems":[{"item":"$L3"}]}]',
    '2:["$","Collection",null,{"collectionId":"profile_CertificationTopLevel_example","initialItems":[{"item":"$L4"}]}]',
    '3:["$","p",null,{"children":["Example University"]}]',
    '4:["$","div",null,{"children":[["$","p",null,{"children":["Example Certificate"]}],["$","p",null,{"children":["Example Issuer"]}]]}]'
  ].join("\n"),
  [PROFILE_COMPONENTS.skills]: [
    '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.skillsSection"}]',
    '1:["$","Collection",null,{"collectionId":"profile_Skills_example","initialItems":[{"item":"$L2"}]}]',
    '2:["$","p",null,{"children":["TypeScript"]}]'
  ].join("\n"),
  [PROFILE_COMPONENTS.languages]: [
    '0:["$","Observed",null,{"observabilityIdentifier":"com.linkedin.sdui.impl.profile.components.languageTopLevelSection"}]',
    '1:["$","Collection",null,{"collectionId":"profile_LanguageTopLevel_example","initialItems":[{"item":"$L2"}]}]',
    '2:["$","p",null,{"children":["English"]}]'
  ].join("\n")
};

const paginationResponses: Record<string, string> = {
  education: [
    '0:[null,null,[["metadata","$L1"]]]',
    '1:["$","div",null,{"triggers":{"url":"https://www.linkedin.com/school/123/"},"children":[["$","p",null,{"children":["Example University"]}],["$","p",null,{"children":["2020 – 2024"]}]]}]'
  ].join("\n"),
  certifications: [
    '0:[null,null,[["metadata","$L1"]]]',
    '1:["$","div",null,{"viewTrackingSpecs":{"viewName":"license-certifications-lockup-view"},"children":[["$","p",null,{"children":["Example Certificate"]}],["$","p",null,{"children":["Example Issuer"]}],["$","p",null,{"children":["Issued Jan 2024"]}]]}]'
  ].join("\n"),
  skills: [
    '0:[null,null,[["metadata","$L1"]]]',
    '1:["$","Replaceable",null,{"componentKey":"com.linkedin.sdui.profile.skill(PROFILE_ID, 1)","initialContent":["$","p",null,{"children":["TypeScript"]}]}]'
  ].join("\n")
};

describe("ProfileService", () => {
  it("runs all upstream requests sequentially and assembles the API response", async () => {
    const calls: string[] = [];
    const client = {
      fetchProfilePage: vi.fn((url: string) => {
        const isExperience = url.endsWith("/details/experience/");
        calls.push(isExperience ? "experienceDetail" : "bootstrap");
        return Promise.resolve(
          rehydrationHtml(isExperience ? experienceDetailStream : bootstrapStream)
        );
      }),
      fetchComponent: vi.fn((_context, componentId: string) => {
        calls.push(componentId);
        return Promise.resolve(responses[componentId] as string);
      }),
      fetchPagination: vi.fn((_context, section: string, start: number) => {
        calls.push(`pagination:${section}:${start}`);
        return Promise.resolve(paginationResponses[section] as string);
      })
    } as unknown as LinkedInClient;

    let now = 10_000;
    const service = new ProfileService(client, {
      cacheTtlMs: 1_000,
      globalExtractionLimitMax: 2,
      globalExtractionLimitWindowMs: 5_000,
      now: () => now
    });
    const profile = {
      canonicalUrl: "https://www.linkedin.com/in/example-user/",
      vanityName: "example-user"
    };
    const result = await service.extract(profile);

    expect(calls).toEqual([
      "bootstrap",
      PROFILE_COMPONENTS.about,
      "experienceDetail",
      "pagination:education:0",
      "pagination:certifications:0",
      "pagination:skills:0",
      PROFILE_COMPONENTS.languages
    ]);
    expect(result.profile).toMatchObject({
      name: "Example Person",
      about: "Example About",
      experience: [{ title: "Engineer" }],
      education: [{ school: "Example University" }],
      certifications: [{ name: "Example Certificate" }],
      skills: [{ name: "TypeScript" }],
      languages: [{ name: "English" }]
    });
    expect(result.meta.partial).toBe(false);
    expect(result.meta.cache).toEqual({ status: "miss", ageSeconds: 0 });

    const cached = await service.extract(profile);
    expect(cached.meta.cache).toEqual({ status: "hit", ageSeconds: 0 });
    expect(calls).toHaveLength(7);

    now += 1_001;
    const refreshed = await service.extract(profile);
    expect(refreshed.meta.cache).toEqual({ status: "miss", ageSeconds: 0 });
    expect(calls).toHaveLength(14);

    await expect(
      service.extract({
        canonicalUrl: "https://www.linkedin.com/in/another-user/",
        vanityName: "another-user"
      })
    ).rejects.toMatchObject({
      code: "GLOBAL_EXTRACTION_LIMITED",
      statusCode: 429,
      retryAfterSeconds: 4
    });
    expect(calls).toHaveLength(14);

    now += 4_000;
    await service.extract({
      canonicalUrl: "https://www.linkedin.com/in/another-user/",
      vanityName: "another-user"
    });
    expect(calls).toHaveLength(21);
  });

  it("counts failed upstream extraction attempts against the global limit", async () => {
    const fetchProfilePage = vi.fn(() =>
      Promise.reject(new Error("synthetic failure"))
    );
    const client = {
      fetchProfilePage
    } as unknown as LinkedInClient;
    const service = new ProfileService(client, {
      globalExtractionLimitMax: 1,
      globalExtractionLimitWindowMs: 60_000
    });

    await expect(
      service.extract({
        canonicalUrl: "https://www.linkedin.com/in/first-user/",
        vanityName: "first-user"
      })
    ).rejects.toThrow("synthetic failure");
    await expect(
      service.extract({
        canonicalUrl: "https://www.linkedin.com/in/second-user/",
        vanityName: "second-user"
      })
    ).rejects.toMatchObject({ code: "GLOBAL_EXTRACTION_LIMITED" });
    expect(fetchProfilePage).toHaveBeenCalledTimes(1);
  });

  it("preserves successful sections when one optional component fails", async () => {
    const fetchProfilePage = vi.fn((url: string) => {
      return Promise.resolve(
        rehydrationHtml(
          url.endsWith("/details/experience/")
            ? experienceDetailStream
            : bootstrapStream
        )
      );
    });
    const client = {
      fetchProfilePage,
      fetchComponent: vi.fn((_context, componentId: string) => {
        return Promise.resolve(responses[componentId] as string);
      }),
      fetchPagination: vi.fn((_context, section: string) => {
        return section === "skills"
          ? Promise.reject(new Error("synthetic failure"))
          : Promise.resolve(paginationResponses[section] as string);
      })
    } as unknown as LinkedInClient;

    const service = new ProfileService(client);
    const profile = {
      canonicalUrl: "https://www.linkedin.com/in/example-user/",
      vanityName: "example-user"
    };
    const result = await service.extract(profile);

    expect(result.profile.experience).toHaveLength(1);
    expect(result.profile.skills).toEqual([]);
    expect(result.meta.sections.skills).toEqual({
      status: "failed",
      reason: "INTERNAL_SECTION_ERROR"
    });
    expect(result.meta.partial).toBe(true);
    expect(result.meta.cache).toEqual({ status: "miss", ageSeconds: 0 });
    await service.extract(profile);
    expect(fetchProfilePage).toHaveBeenCalledTimes(4);
  });

  it("enforces the overall extraction deadline", async () => {
    const client = {
      fetchProfilePage: vi.fn((_url: string, signal?: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new Error("synthetic abort"))
          );
        })
      )
    } as unknown as LinkedInClient;

    await expect(
      new ProfileService(client, { extractionTimeoutMs: 5 }).extract({
        canonicalUrl: "https://www.linkedin.com/in/example-user/",
        vanityName: "example-user"
      })
    ).rejects.toMatchObject({
      code: "EXTRACTION_TIMEOUT",
      statusCode: 504
    });
  });
});
