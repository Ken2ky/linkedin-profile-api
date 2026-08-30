import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hasLinkedInSession, loadConfig } from "../config.js";
import { ApplicationError } from "../errors/application-error.js";
import { LinkedInClient } from "../linkedin/client.js";
import { PROFILE_COMPONENTS } from "../linkedin/components.js";
import { parseExperienceResponse } from "../linkedin/parsers/experience.js";
import { resolveProfileBootstrap } from "../linkedin/profile-resolver.js";
import { parseLinkedInProfileUrl } from "../linkedin/profile-url.js";
import { decodeRscRecords } from "../linkedin/rsc/decode-records.js";

interface ReplayArguments {
  url: string;
  profileId?: string;
}

await main();

async function main(): Promise<void> {
  try {
    const args = parseArguments(process.argv.slice(2));
    const config = loadConfig();

    if (!hasLinkedInSession(config.linkedin)) {
      throw new Error("LINKEDIN_COOKIE and LINKEDIN_CSRF_TOKEN must be set in .env");
    }

    const profile = parseLinkedInProfileUrl(args.url);
    const client = new LinkedInClient(config.linkedin);
    const bootstrap = args.profileId
      ? null
      : await resolveProfileBootstrap(
          client,
          profile.canonicalUrl,
          profile.vanityName
        );
    const context = args.profileId
      ? {
          profileUrl: profile.canonicalUrl,
          vanityName: profile.vanityName,
          vieweeProfileId: args.profileId,
          isSelfView: false
        }
      : bootstrap!.context;
    const response = await client.fetchComponent(
      context,
      PROFILE_COMPONENTS.experience
    );

    const records = decodeRscRecords(response);
    const experiences = parseExperienceResponse(response);
    if (!response.includes("profileCardsExperienceOnly")) {
      throw new Error("The response did not contain the experience component marker");
    }
    if (!response.includes("experienceTopLevelSection")) {
      throw new Error("The response did not contain the experience section marker");
    }

    const scratchDirectory = resolve(process.cwd(), "scratch");
    const outputPath = resolve(scratchDirectory, "experience-response.rsc.txt");
    const normalizedOutputPath = resolve(scratchDirectory, "experience-response.json");
    const topCardOutputPath = resolve(scratchDirectory, "top-card.json");
    await mkdir(scratchDirectory, { recursive: true });
    await writeFile(outputPath, response, { encoding: "utf8", flag: "w" });
    await writeFile(normalizedOutputPath, `${JSON.stringify(experiences, null, 2)}\n`, {
      encoding: "utf8",
      flag: "w"
    });
    if (bootstrap) {
      await writeFile(topCardOutputPath, `${JSON.stringify(bootstrap.topCard, null, 2)}\n`, {
        encoding: "utf8",
        flag: "w"
      });
    }

    process.stdout.write(
      [
        "LinkedIn experience compatibility check succeeded.",
        `Profile: ${profile.canonicalUrl}`,
        `RSC records: ${records.size}`,
        `Experience entries: ${experiences.length}`,
        `Response characters: ${response.length}`,
        `Private output: ${outputPath}`,
        `Private normalized output: ${normalizedOutputPath}`,
        ...(bootstrap ? [`Private top-card output: ${topCardOutputPath}`] : []),
        "The output contains profile data and must remain under the git-ignored scratch directory."
      ].join("\n") + "\n"
    );
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      const upstreamStatus = error.details?.upstreamStatus;
      process.stderr.write(
        `${error.code}: ${error.message}${typeof upstreamStatus === "number" ? ` (upstream HTTP ${upstreamStatus})` : ""}\n`
      );
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : "Unknown error"}\n`);
    }
    process.exitCode = 1;
  }
}

function parseArguments(argv: string[]): ReplayArguments {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) usage();
    values.set(key.slice(2), value);
  }

  const url = values.get("url");
  const profileId = values.get("profile-id");
  if (!url || values.size > 2 || (profileId === undefined && values.size !== 1)) usage();
  if (profileId !== undefined && !/^[A-Za-z0-9_-]{10,200}$/.test(profileId)) {
    throw new Error("--profile-id has an unsupported format");
  }

  return profileId === undefined ? { url } : { url, profileId };
}

function usage(): never {
  throw new Error(
    "Usage: npm run replay:experience -- --url <LinkedIn profile URL> [--profile-id <internal profile ID>]"
  );
}
