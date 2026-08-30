import type { ProfileContext } from "./types.js";

export type PaginatedProfileSection = "education" | "certifications" | "skills";

const PAGERS: Record<PaginatedProfileSection, string> = {
  education: "com.linkedin.sdui.pagers.profile.details.education",
  certifications: "com.linkedin.sdui.pagers.profile.details.certifications",
  skills: "com.linkedin.sdui.pagers.profile.details.skills"
};

const SCREENS: Record<PaginatedProfileSection, string> = {
  education: "com.linkedin.sdui.flagshipnav.profile.ProfileEducationDetails",
  certifications:
    "com.linkedin.sdui.flagshipnav.profile.ProfileCertificationDetails",
  skills: "com.linkedin.sdui.flagshipnav.profile.ProfileSkillDetails"
};

const BINDING_TYPE = "com.linkedin.sdui.components.core.BindingImpl";
const MEMORY_NAMESPACE = "MemoryNamespace";

function binding(key: string) {
  return {
    type: BINDING_TYPE,
    value: { key, namespace: MEMORY_NAMESPACE }
  };
}

export function buildProfileComponentState(vanityName: string) {
  const suffix = `${vanityName}ProfileComponentState`;

  return {
    profileId: vanityName,
    shouldRefreshScreenOnReappear: binding(
      `ProfileComponentStateShouldRefreshScreen${suffix}`
    ),
    shouldFetchFromCache: binding(`ProfileComponentStateFetchFromCache${suffix}`),
    shouldDisplayTabAnchors: binding(
      `ProfileComponentStateShouldDisplayTabAnchors${suffix}`
    ),
    shouldReloadTopCardOnReappear: binding(
      `ProfileComponentStateShouldReloadTopCardOnReappear${suffix}`
    ),
    deferredTopCardReloadProfileId: binding(
      `ProfileComponentStateDeferredTopCardReloadProfileId${suffix}`
    ),
    shouldDisplayStickyHeader: binding(
      `ProfileComponentStateShouldDisplayStickyHeader${suffix}`
    ),
    shouldRefreshLanguageDetailScreen: binding(
      `ProfileComponentStateShouldRefreshLanguageDetails${suffix}`
    ),
    lastPerformedActionRef: binding(
      `ProfileComponentStateLastPerformedActionRef${suffix}`
    ),
    shouldFocusOnReappear: binding(
      `ProfileComponentStateShouldFocusOnReappear${suffix}`
    ),
    shouldFocusFeaturedOnReappear: binding(
      `ProfileComponentStateShouldFocusFeaturedOnReappear${suffix}`
    ),
    lastFeaturedActionRef: binding(
      `ProfileComponentStateLastFeaturedActionRef${suffix}`
    ),
    shouldHideProfileCards: binding(`ProfileComponentStateProfileHideCards${suffix}`)
  };
}

export function buildComponentRequestBody(context: ProfileContext) {
  return {
    clientArguments: {
      payload: {
        isSelfView: context.isSelfView,
        vanityName: context.vanityName,
        replaceableSectionArgs: {
          vanityName: context.vanityName,
          hideCardsForGoldenGate: false,
          shouldSetupReplaceableComponent: true,
          vieweeProfileId: context.vieweeProfileId,
          isSelfView: context.isSelfView,
          isSelfViewResolved: false
        },
        profileComponentState: buildProfileComponentState(context.vanityName)
      },
      states: [],
      requestMetadata: {
        $type: "proto.sdui.common.RequestMetadata"
      },
      screenId: "com.linkedin.sdui.flagshipnav.profile.Profile",
      knownTemplateIds: []
    }
  };
}

export function getPagerId(section: PaginatedProfileSection): string {
  return PAGERS[section];
}

export function buildPaginationRequestBody(
  context: ProfileContext,
  section: PaginatedProfileSection,
  start: number,
  count: number
) {
  const pagerId = PAGERS[section];
  const payload: Record<string, string | number> = {
    vanityName: context.vanityName,
    profileId: context.vieweeProfileId,
    start,
    count
  };

  if (section === "skills") {
    payload.filter = "ProfileSkillCategory_ALL";
  } else if (section === "education") {
    payload.detailSectionReplaceableComponentRef =
      `com.linkedin.sdui.profile.card.ref${context.vieweeProfileId}EducationDetailsSection`;
  }

  const requestedArguments = {
    $type: "proto.sdui.actions.requests.RequestedArguments",
    requestedStateKeys: [],
    payload,
    requestMetadata: {
      $type: "proto.sdui.common.RequestMetadata"
    }
  };

  return {
    pagerId,
    clientArguments: {
      ...requestedArguments,
      states: [],
      screenId: SCREENS[section],
      knownTemplateIds: []
    },
    paginationRequest: {
      $type: "proto.sdui.actions.requests.PaginationRequest",
      pagerId,
      trigger: {
        $case: "itemDistanceTrigger",
        itemDistanceTrigger: {
          $type: "proto.sdui.actions.requests.ItemDistanceTrigger",
          preloadDistance: 3,
          preloadLength: 250
        }
      },
      retryCount: 2,
      requestedArguments
    }
  };
}
