import { ApplicationError } from "../errors/application-error.js";
import type { LinkedInClient } from "../linkedin/client.js";
import { PROFILE_COMPONENTS } from "../linkedin/components.js";
import { parseAboutResponse } from "../linkedin/parsers/about.js";
import {
  parseCertificationDetailPage,
  parseEducationDetailPage,
  parseSkillsDetailPage
} from "../linkedin/parsers/detail-pagination.js";
import type { DetailPage } from "../linkedin/parsers/detail-pagination.js";
import type {
  CertificationEntry,
  EducationEntry
} from "../linkedin/parsers/education-certifications.js";
import type { ExperienceEntry } from "../linkedin/parsers/experience.js";
import { parseExperienceResponse } from "../linkedin/parsers/experience.js";
import type { LanguageEntry } from "../linkedin/parsers/languages.js";
import { parseLanguagesResponse } from "../linkedin/parsers/languages.js";
import type { SkillEntry } from "../linkedin/parsers/skills.js";
import { resolveProfileBootstrap } from "../linkedin/profile-resolver.js";
import type { ParsedLinkedInProfileUrl } from "../linkedin/profile-url.js";
import type { PaginatedProfileSection } from "../linkedin/payload.js";
import { extractRehydrationStream } from "../linkedin/rehydration.js";
import type { ProfileContext } from "../linkedin/types.js";

const DETAIL_PAGE_SIZE = 10;
const MAX_DETAIL_PAGES = 10;
const EXTRACTION_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX_ENTRIES = 50;
const GLOBAL_EXTRACTION_LIMIT_MAX = 6;
const GLOBAL_EXTRACTION_LIMIT_WINDOW_MS = 60_000;

export type SectionStatus = "complete" | "partial" | "unavailable" | "failed";

export interface SectionMetadata {
  status: SectionStatus;
  reason?: string;
}

export interface ProfileExtractionResult {
  profile: {
    profileUrl: string;
    name: string | null;
    headline: string | null;
    location: string | null;
    about: string | null;
    profileImages: {
      profile: string | null;
      background: string | null;
    };
    experience: ExperienceEntry[];
    education: EducationEntry[];
    skills: SkillEntry[];
    certifications: CertificationEntry[];
    languages: LanguageEntry[];
  };
  meta: {
    partial: boolean;
    extractedAt: string;
    cache: {
      status: "hit" | "miss";
      ageSeconds: number;
    };
    sections: Record<string, SectionMetadata>;
  };
}

export interface ProfileExtractor {
  extract(profile: ParsedLinkedInProfileUrl): Promise<ProfileExtractionResult>;
}

interface Captured<T> {
  value: T;
  metadata: SectionMetadata;
}

interface ProfileServiceOptions {
  extractionTimeoutMs?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  globalExtractionLimitMax?: number;
  globalExtractionLimitWindowMs?: number;
  now?: () => number;
}

interface CacheEntry {
  result: ProfileExtractionResult;
  cachedAt: number;
}

export class ProfileService implements ProfileExtractor {
  private extractionInProgress = false;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly extractionTimeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly globalExtractionLimitMax: number;
  private readonly globalExtractionLimitWindowMs: number;
  private readonly now: () => number;
  private extractionWindowStartedAt: number | null = null;
  private extractionsInWindow = 0;

  constructor(
    private readonly client: LinkedInClient,
    options: ProfileServiceOptions = {}
  ) {
    this.extractionTimeoutMs = options.extractionTimeoutMs ?? EXTRACTION_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
    this.cacheMaxEntries = options.cacheMaxEntries ?? CACHE_MAX_ENTRIES;
    this.globalExtractionLimitMax =
      options.globalExtractionLimitMax ?? GLOBAL_EXTRACTION_LIMIT_MAX;
    this.globalExtractionLimitWindowMs =
      options.globalExtractionLimitWindowMs ?? GLOBAL_EXTRACTION_LIMIT_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  async extract(profile: ParsedLinkedInProfileUrl): Promise<ProfileExtractionResult> {
    const cached = this.getCached(profile.canonicalUrl);
    if (cached) return cached;

    if (this.extractionInProgress) {
      throw new ApplicationError(
        "SERVICE_BUSY",
        "Another profile extraction is already in progress.",
        429
      );
    }
    this.consumeExtractionBudget();
    this.extractionInProgress = true;
    const signal = AbortSignal.timeout(this.extractionTimeoutMs);

    try {
      const result = await this.extractSequentially(profile, signal);
      if (isCacheable(result)) this.setCached(profile.canonicalUrl, result);
      return result;
    } catch (error: unknown) {
      if (signal.aborted) throw extractionTimeout();
      throw error;
    } finally {
      this.extractionInProgress = false;
    }
  }

  private consumeExtractionBudget(): void {
    const now = this.now();
    if (
      this.extractionWindowStartedAt === null ||
      now - this.extractionWindowStartedAt >= this.globalExtractionLimitWindowMs
    ) {
      this.extractionWindowStartedAt = now;
      this.extractionsInWindow = 0;
    }

    if (this.extractionsInWindow >= this.globalExtractionLimitMax) {
      const remainingMs =
        this.globalExtractionLimitWindowMs -
        (now - this.extractionWindowStartedAt);
      throw new ApplicationError(
        "GLOBAL_EXTRACTION_LIMITED",
        "The server-wide LinkedIn extraction limit has been reached.",
        429,
        undefined,
        Math.max(1, Math.ceil(remainingMs / 1_000))
      );
    }

    this.extractionsInWindow += 1;
  }

  private getCached(key: string): ProfileExtractionResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const ageMs = this.now() - entry.cachedAt;
    if (ageMs >= this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return {
      profile: entry.result.profile,
      meta: {
        ...entry.result.meta,
        cache: {
          status: "hit",
          ageSeconds: Math.max(0, Math.floor(ageMs / 1_000))
        }
      }
    };
  }

  private setCached(key: string, result: ProfileExtractionResult): void {
    const now = this.now();
    for (const [cachedKey, entry] of this.cache) {
      if (now - entry.cachedAt >= this.cacheTtlMs) this.cache.delete(cachedKey);
    }

    if (this.cache.has(key)) this.cache.delete(key);
    while (this.cache.size >= this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { result, cachedAt: now });
  }

  private async extractSequentially(
    profile: ParsedLinkedInProfileUrl,
    signal: AbortSignal
  ): Promise<ProfileExtractionResult> {
    const bootstrap = await resolveProfileBootstrap(
      this.client,
      profile.canonicalUrl,
      profile.vanityName,
      signal
    );
    const context = bootstrap.context;

    const about = await capture(null, async () => {
      const response = await this.client.fetchComponent(
        context,
        PROFILE_COMPONENTS.about,
        signal
      );
      return parseAboutResponse(response);
    }, signal);
    if (about.metadata.status === "complete" && about.value === null) {
      about.metadata = { status: "unavailable", reason: "NOT_AVAILABLE" };
    }

    const experience = await capture([], async () => {
      const detailUrl = new URL(
        "details/experience/",
        context.profileUrl
      ).toString();
      const html = await this.client.fetchProfilePage(detailUrl, signal);
      return parseExperienceResponse(extractRehydrationStream(html));
    }, signal);

    const educationResult = await capture(
      { items: [] as EducationEntry[], truncated: false },
      () =>
        paginateDetails(
          this.client,
          context,
          "education",
          parseEducationDetailPage,
          signal
        ),
      signal
    );
    const education: Captured<EducationEntry[]> = {
      value: educationResult.value.items,
      metadata: paginationMetadata(educationResult)
    };

    const certificationResult = await capture(
      { items: [] as CertificationEntry[], truncated: false },
      () =>
        paginateDetails(
          this.client,
          context,
          "certifications",
          parseCertificationDetailPage,
          signal
        ),
      signal
    );
    const certifications: Captured<CertificationEntry[]> = {
      value: certificationResult.value.items,
      metadata: paginationMetadata(certificationResult)
    };

    const skillsResult = await capture(
      { items: [] as SkillEntry[], truncated: false },
      () =>
        paginateDetails(
          this.client,
          context,
          "skills",
          parseSkillsDetailPage,
          signal
        ),
      signal
    );
    const skills: Captured<SkillEntry[]> = {
      value: skillsResult.value.items,
      metadata: paginationMetadata(skillsResult)
    };

    const languages = await capture([], async () => {
      const response = await this.client.fetchComponent(
        context,
        PROFILE_COMPONENTS.languages,
        signal
      );
      return parseLanguagesResponse(response);
    }, signal);
    markPossiblePreview(languages);

    const sections: Record<string, SectionMetadata> = {
      topCard: { status: "complete" },
      about: about.metadata,
      experience: experience.metadata,
      education: education.metadata,
      certifications: certifications.metadata,
      skills: skills.metadata,
      languages: languages.metadata
    };

    return {
      profile: {
        profileUrl: context.profileUrl,
        name: bootstrap.topCard.name,
        headline: bootstrap.topCard.headline,
        location: bootstrap.topCard.location,
        about: about.value,
        profileImages: {
          profile: bootstrap.topCard.profileImage,
          background: bootstrap.topCard.backgroundImage
        },
        experience: experience.value,
        education: education.value,
        skills: skills.value,
        certifications: certifications.value,
        languages: languages.value
      },
      meta: {
        partial: Object.values(sections).some((section) => section.status !== "complete"),
        extractedAt: new Date().toISOString(),
        cache: { status: "miss", ageSeconds: 0 },
        sections
      }
    };
  }
}

function isCacheable(result: ProfileExtractionResult): boolean {
  return !Object.values(result.meta.sections).some(
    (section) => section.status === "failed"
  );
}

async function capture<T>(
  fallback: T,
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<Captured<T>> {
  try {
    return { value: await operation(), metadata: { status: "complete" } };
  } catch (error: unknown) {
    if (signal?.aborted) throw extractionTimeout();
    return {
      value: fallback,
      metadata: {
        status: "failed",
        reason: error instanceof ApplicationError ? error.code : "INTERNAL_SECTION_ERROR"
      }
    };
  }
}

function markPossiblePreview<T>(captured: Captured<T[]>): void {
  if (captured.metadata.status === "complete" && captured.value.length >= 2) {
    captured.metadata = { status: "partial", reason: "PROFILE_CARD_PREVIEW" };
  }
}

interface PaginationResult<T> {
  items: T[];
  truncated: boolean;
}

async function paginateDetails<T>(
  client: LinkedInClient,
  context: ProfileContext,
  section: PaginatedProfileSection,
  parse: (stream: string) => DetailPage<T>,
  signal: AbortSignal
): Promise<PaginationResult<T>> {
  const items: T[] = [];
  let start = 0;

  for (let pageNumber = 0; pageNumber < MAX_DETAIL_PAGES; pageNumber += 1) {
    const response = await client.fetchPagination(
      context,
      section,
      start,
      DETAIL_PAGE_SIZE,
      signal
    );
    const page = parse(response);
    items.push(...page.items);

    if (page.nextStart === null) {
      return { items: uniqueObjects(items), truncated: false };
    }
    if (page.nextStart <= start) {
      throw new ApplicationError(
        "UPSTREAM_SCHEMA_CHANGED",
        "LinkedIn returned an invalid detail pagination cursor.",
        502
      );
    }
    start = page.nextStart;
  }

  return { items: uniqueObjects(items), truncated: true };
}

function extractionTimeout(): ApplicationError {
  return new ApplicationError(
    "EXTRACTION_TIMEOUT",
    "Profile extraction exceeded the 60-second safety deadline.",
    504
  );
}

function paginationMetadata<T>(
  captured: Captured<PaginationResult<T>>
): SectionMetadata {
  if (captured.metadata.status !== "complete") return captured.metadata;
  return captured.value.truncated
    ? { status: "partial", reason: "PAGINATION_LIMIT_REACHED" }
    : { status: "complete" };
}

function uniqueObjects<T>(items: T[]): T[] {
  const uniqueItems = new Map<string, T>();
  for (const item of items) uniqueItems.set(JSON.stringify(item), item);
  return [...uniqueItems.values()];
}
