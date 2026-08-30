import { describe, expect, it } from "vitest";
import {
  buildComponentRequestBody,
  buildPaginationRequestBody
} from "../src/linkedin/payload.js";

const context = {
  profileUrl: "https://www.linkedin.com/in/example-user/",
  vanityName: "example-user",
  vieweeProfileId: "PROFILE_ID",
  isSelfView: false
};

describe("buildComponentRequestBody", () => {
  it("places shared arguments under clientArguments and parameterizes bindings", () => {
    const body = buildComponentRequestBody(context);

    expect(body.clientArguments.payload.replaceableSectionArgs).toMatchObject({
      vanityName: "example-user",
      vieweeProfileId: "PROFILE_ID",
      isSelfView: false
    });
    expect(
      body.clientArguments.payload.profileComponentState.shouldFetchFromCache.value.key
    ).toContain("example-user");
    expect(body.clientArguments.states).toEqual([]);
    expect(body.clientArguments.knownTemplateIds).toEqual([]);
  });

  it("builds the captured Skills pager arguments", () => {
    const body = buildPaginationRequestBody(context, "skills", 10, 10);

    expect(body.pagerId).toBe(
      "com.linkedin.sdui.pagers.profile.details.skills"
    );
    expect(body.clientArguments.payload).toEqual({
      vanityName: "example-user",
      profileId: "PROFILE_ID",
      start: 10,
      count: 10,
      filter: "ProfileSkillCategory_ALL"
    });
    expect(body.paginationRequest.requestedArguments.payload).toEqual(
      body.clientArguments.payload
    );
  });

  it("adds the Education detail component reference", () => {
    const body = buildPaginationRequestBody(context, "education", 0, 10);

    expect(body.clientArguments.payload).toMatchObject({
      detailSectionReplaceableComponentRef:
        "com.linkedin.sdui.profile.card.refPROFILE_IDEducationDetailsSection"
    });
  });
});
