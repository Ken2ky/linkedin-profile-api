import { ApplicationError } from "../../errors/application-error.js";
import type { RscRecordMap } from "../rsc/types.js";

const TOP_CARD_VIEW = "profile-top-card";
const MEMBER_PHOTO_VIEW = "profile-top-card-member-photo";
const DOLLAR = "$";
const RELATIONSHIP_BADGE = /^·\s*(?:1st|2nd|3rd|\d)/iu;

export interface TopCard {
  name: string | null;
  headline: string | null;
  location: string | null;
  profileImage: string | null;
  backgroundImage: string | null;
}

interface TextCandidate {
  value: string;
  tag: string | null;
  depth: number;
}

interface ImageCandidate {
  url: string;
  rootUrl: string;
}

export function parseTopCard(records: RscRecordMap): TopCard {
  const topCards = findElements(
    records,
    (props) => viewName(props) === TOP_CARD_VIEW
  );
  if (topCards.length === 0) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's profile top card was not found.",
      502
    );
  }

  const candidates = topCards.map((topCard) => {
    const text = collectTextCandidates(topCard, records);
    const name =
      text.find((candidate) => candidate.tag === "h1" || candidate.tag === "h2") ??
      findReachableHeading(topCard, records);
    return { topCard, text, name };
  });
  const selected = candidates.find((candidate) => candidate.name) ?? candidates[0];
  const nameCandidate = selected?.name ?? findDocumentTitle(records);
  if (!selected || !nameCandidate) {
    throw new ApplicationError(
      "UPSTREAM_SCHEMA_CHANGED",
      "LinkedIn's profile top card did not expose a recognizable name.",
      502
    );
  }

  const { topCard, text } = selected;
  const headlineCandidate = text
    .filter(
      (candidate) =>
        candidate.tag === "p" &&
        candidate !== nameCandidate &&
        !/^view .+ verifications?$/iu.test(candidate.value)
    )
    .sort((left, right) => left.depth - right.depth)[0];
  const location = findLocation(text, headlineCandidate);

  const memberPhoto = findElement(
    records,
    (props) => viewName(props) === MEMBER_PHOTO_VIEW
  );
  const memberImages = memberPhoto ? collectImages(memberPhoto, records) : [];
  const topCardImages = collectImages(topCard, records);
  const profileImage = memberImages[0]?.url ?? findImage(topCardImages, "profile")?.url ?? null;
  const backgroundImage = findImage(topCardImages, "background")?.url ?? null;

  return {
    name: nameCandidate?.value ?? null,
    headline: headlineCandidate?.value ?? null,
    location,
    profileImage,
    backgroundImage
  };
}

function findDocumentTitle(records: RscRecordMap): TextCandidate | undefined {
  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    const title = findElementByTag(record.value, "title");
    if (!title) continue;
    const documentTitle = normalizeText(
      collectDirectText(title[3].children).join(" ")
    );
    const name = documentTitle.replace(/\s+\|\s+LinkedIn$/iu, "").trim();
    if (name && name !== documentTitle) {
      return { value: name, tag: "title", depth: 0 };
    }
  }
  return undefined;
}

function findElementByTag(
  value: unknown,
  expectedTag: string
): ReactElement | undefined {
  if (Array.isArray(value)) {
    if (isReactElement(value)) {
      if (value[1] === expectedTag) return value;
      for (const entry of Object.values(value[3])) {
        const found = findElementByTag(entry, expectedTag);
        if (found) return found;
      }
      return undefined;
    }
    for (const entry of value) {
      const found = findElementByTag(entry, expectedTag);
      if (found) return found;
    }
    return undefined;
  }

  if (isObject(value)) {
    for (const entry of Object.values(value)) {
      const found = findElementByTag(entry, expectedTag);
      if (found) return found;
    }
  }
  return undefined;
}

function findReachableHeading(
  root: ReactElement,
  records: RscRecordMap
): TextCandidate | undefined {
  for (const id of collectReachableRecordIds(root, records)) {
    const record = records.get(id);
    if (record?.kind !== "json" || !isReactElement(record.value)) continue;
    const tag = record.value[1];
    if (tag !== "h1" && tag !== "h2") continue;
    const value = normalizeText(collectDirectText(record.value[3].children).join(" "));
    if (value) return { value, tag, depth: 0 };
  }
  return undefined;
}

function collectReachableRecordIds(
  root: unknown,
  records: RscRecordMap
): Set<string> {
  const reachable = new Set<string>();

  const inspect = (value: unknown): void => {
    const id = getReferenceId(value);
    if (id) {
      if (reachable.has(id)) return;
      reachable.add(id);
      const record = records.get(id);
      if (record?.kind === "json") inspect(record.value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) inspect(entry);
    } else if (isObject(value)) {
      for (const entry of Object.values(value)) inspect(entry);
    }
  };

  inspect(root);
  return reachable;
}

function findLocation(
  candidates: TextCandidate[],
  headline: TextCandidate | undefined
): string | null {
  if (!headline) return null;
  const headlineIndex = candidates.indexOf(headline);
  const following = candidates.slice(headlineIndex + 1).filter((candidate) => {
    const value = candidate.value;
    return (
      value !== "·" &&
      !value.includes("·") &&
      !RELATIONSHIP_BADGE.test(value) &&
      !/^contact info$/iu.test(value)
    );
  });

  return (
    following.find((candidate) => candidate.value.includes(","))?.value ??
    following[0]?.value ??
    null
  );
}

function collectTextCandidates(
  root: ReactElement,
  records: RscRecordMap
): TextCandidate[] {
  const candidates: TextCandidate[] = [];
  walkVisibleGraph(root, records, (element, depth) => {
    const props = element[3];
    const directText = isObject(props.textProps)
      ? collectDirectText(props.textProps.children)
      : collectDirectText(props.children);
    const value = normalizeText(directText.join(" "));
    if (value) {
      candidates.push({
        value,
        tag: typeof element[1] === "string" && !element[1].startsWith(DOLLAR)
          ? element[1]
          : null,
        depth
      });
    }
  });
  return uniqueCandidates(candidates);
}

function collectImages(root: ReactElement, records: RscRecordMap): ImageCandidate[] {
  const images: ImageCandidate[] = [];
  walkVisibleGraph(root, records, (element) => {
    const renderPayload = element[3].renderPayload;
    if (!isObject(renderPayload)) return;
    const rootUrl = renderPayload.rootUrl;
    const renditions = renderPayload.imageRenditions;
    if (typeof rootUrl !== "string" || !Array.isArray(renditions)) return;

    const best = renditions
      .filter(isRendition)
      .sort((left, right) => right.width * right.height - left.width * left.height)[0];
    if (!best) return;
    const url = `${rootUrl}${best.suffixUrl}`;
    if (isAllowedImageUrl(url)) images.push({ url, rootUrl });
  });
  return uniqueImages(images);
}

function walkVisibleGraph(
  root: unknown,
  records: RscRecordMap,
  inspect: (element: ReactElement, depth: number) => void
): void {
  const visitedRecords = new Set<string>();

  const walk = (value: unknown, depth: number): void => {
    const referenceId = getReferenceId(value);
    if (referenceId) {
      if (visitedRecords.has(referenceId)) return;
      visitedRecords.add(referenceId);
      const record = records.get(referenceId);
      if (record?.kind === "json") walk(record.value, depth + 1);
      return;
    }

    if (!Array.isArray(value)) return;
    if (isReactElement(value)) {
      inspect(value, depth);
      walk(value[3].children, depth);
      walk(value[3].initialContent, depth);
      return;
    }
    for (const entry of value) walk(entry, depth);
  };

  walk(root, 0);
}

function findElement(
  records: RscRecordMap,
  predicate: (props: Record<string, unknown>) => boolean
): ReactElement | undefined {
  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    const found = findElementInValue(record.value, predicate);
    if (found) return found;
  }
  return undefined;
}

function findElements(
  records: RscRecordMap,
  predicate: (props: Record<string, unknown>) => boolean
): ReactElement[] {
  const elements: ReactElement[] = [];
  const seen = new Set<ReactElement>();

  for (const record of records.values()) {
    if (record.kind !== "json") continue;
    collectElementsInValue(record.value, predicate, elements, seen);
  }

  return elements;
}

function collectElementsInValue(
  value: unknown,
  predicate: (props: Record<string, unknown>) => boolean,
  elements: ReactElement[],
  seen: Set<ReactElement>
): void {
  if (Array.isArray(value)) {
    if (isReactElement(value)) {
      if (predicate(value[3]) && !seen.has(value)) {
        seen.add(value);
        elements.push(value);
      }
      for (const entry of Object.values(value[3])) {
        collectElementsInValue(entry, predicate, elements, seen);
      }
      return;
    }
    for (const entry of value) {
      collectElementsInValue(entry, predicate, elements, seen);
    }
    return;
  }

  if (isObject(value)) {
    for (const entry of Object.values(value)) {
      collectElementsInValue(entry, predicate, elements, seen);
    }
  }
}

function findElementInValue(
  value: unknown,
  predicate: (props: Record<string, unknown>) => boolean
): ReactElement | undefined {
  if (!Array.isArray(value)) return undefined;
  if (isReactElement(value)) {
    if (predicate(value[3])) return value;
    return (
      findElementInValue(value[3].children, predicate) ??
      findElementInValue(value[3].initialContent, predicate)
    );
  }
  for (const entry of value) {
    const found = findElementInValue(entry, predicate);
    if (found) return found;
  }
  return undefined;
}

function collectDirectText(value: unknown): string[] {
  if (typeof value === "string") {
    return value.startsWith(DOLLAR) ? [] : [value];
  }
  if (!Array.isArray(value) || isReactElement(value)) return [];
  return value.flatMap(collectDirectText);
}

function getReferenceId(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(DOLLAR)) return null;
  const offset = value.startsWith("$L") ? 2 : 1;
  const id = value.slice(offset).split(":")[0];
  return id && /^[0-9a-f]+$/iu.test(id) ? id.toLowerCase() : null;
}

function viewName(props: Record<string, unknown>): string | null {
  const specs = props.viewTrackingSpecs;
  return isObject(specs) && typeof specs.viewName === "string" ? specs.viewName : null;
}

function findImage(images: ImageCandidate[], kind: "profile" | "background") {
  const marker = kind === "profile" ? "profile-" : "background";
  return images.find((image) => image.rootUrl.toLowerCase().includes(marker));
}

function isRendition(
  value: unknown
): value is { width: number; height: number; suffixUrl: string } {
  return (
    isObject(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.suffixUrl === "string"
  );
}

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".licdn.com");
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.replaceAll("Â·", "·").replace(/\s+/gu, " ").trim();
}

function uniqueCandidates(values: TextCandidate[]): TextCandidate[] {
  const seen = new Set<string>();
  return values.filter((candidate) => {
    const key = `${candidate.tag ?? ""}\u0000${candidate.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueImages(values: ImageCandidate[]): ImageCandidate[] {
  return [...new Map(values.map((image) => [image.url, image])).values()];
}

type ReactElement = ["$", unknown, unknown, Record<string, unknown>];

function isReactElement(value: unknown): value is ReactElement {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value[0] === DOLLAR &&
    isObject(value[3])
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
