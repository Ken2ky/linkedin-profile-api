export interface ProfileContext {
  profileUrl: string;
  vanityName: string;
  vieweeProfileId: string;
  isSelfView: boolean;
}

export type ProfileSection =
  | "about"
  | "experience"
  | "educationAndCertifications"
  | "skills"
  | "languages";
