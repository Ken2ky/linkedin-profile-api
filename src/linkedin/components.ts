import type { ProfileSection } from "./types.js";

const PREFIX = "com.linkedin.sdui.generated.profile.dsl.impl.";

export const PROFILE_COMPONENTS: Readonly<Record<ProfileSection, string>> = {
  about: `${PREFIX}profileCardsAboveActivity`,
  experience: `${PREFIX}profileCardsExperienceOnly`,
  educationAndCertifications: `${PREFIX}profileCardsBelowActivityPart1WithoutExp`,
  skills: `${PREFIX}profileCardsBelowActivityPart7`,
  languages: `${PREFIX}profileCardsBelowActivityPart4`
};
