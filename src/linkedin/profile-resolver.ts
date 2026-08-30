import { decodeRscRecords } from "./rsc/decode-records.js";
import { extractVieweeProfileId } from "./profile-id.js";
import { extractRehydrationStream } from "./rehydration.js";
import type { LinkedInClient } from "./client.js";
import { parseTopCard, type TopCard } from "./parsers/top-card.js";
import type { ProfileContext } from "./types.js";

export interface ProfileBootstrap {
  context: ProfileContext;
  topCard: TopCard;
}

export async function resolveProfileContext(
  client: LinkedInClient,
  profileUrl: string,
  vanityName: string,
  signal?: AbortSignal
): Promise<ProfileContext> {
  return (await loadProfileBootstrap(client, profileUrl, vanityName, signal)).context;
}

export async function resolveProfileBootstrap(
  client: LinkedInClient,
  profileUrl: string,
  vanityName: string,
  signal?: AbortSignal
): Promise<ProfileBootstrap> {
  const bootstrap = await loadProfileBootstrap(
    client,
    profileUrl,
    vanityName,
    signal
  );
  return { ...bootstrap, topCard: parseTopCard(bootstrap.records) };
}

async function loadProfileBootstrap(
  client: LinkedInClient,
  profileUrl: string,
  vanityName: string,
  signal?: AbortSignal
): Promise<{ context: ProfileContext; records: ReturnType<typeof decodeRscRecords> }> {
  const html = await client.fetchProfilePage(profileUrl, signal);
  const stream = extractRehydrationStream(html);
  const records = decodeRscRecords(stream);
  const vieweeProfileId = extractVieweeProfileId(records);

  return {
    context: {
      profileUrl,
      vanityName,
      vieweeProfileId,
      isSelfView: false
    },
    records
  };
}
