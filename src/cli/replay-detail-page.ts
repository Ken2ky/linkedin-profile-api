import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hasLinkedInSession, loadConfig } from "../config.js";
import { ApplicationError } from "../errors/application-error.js";
import { LinkedInClient } from "../linkedin/client.js";
import { parseLinkedInProfileUrl } from "../linkedin/profile-url.js";
import { extractRehydrationStream } from "../linkedin/rehydration.js";
import { decodeRscRecords } from "../linkedin/rsc/decode-records.js";

const SECTIONS = [
  "experience",
  "education",
  "certifications",
  "skills",
  "languages"
] as const;
type DetailSection = (typeof SECTIONS)[number];

await main();

async function main(): Promise<void> {
  try {
    const { url, section } = parseArguments(process.argv.slice(2));
    const config = loadConfig();
    if (!hasLinkedInSession(config.linkedin)) {
      throw new Error("LINKEDIN_COOKIE and LINKEDIN_CSRF_TOKEN must be set in .env");
    }

    const profile = parseLinkedInProfileUrl(url);
    const detailUrl = new URL(`details/${section}/`, profile.canonicalUrl).toString();
    const client = new LinkedInClient(config.linkedin);
    const html = await client.fetchProfilePage(detailUrl);
    const stream = extractRehydrationStream(html);
    const records = decodeRscRecords(stream);
    const scratchDirectory = resolve(process.cwd(), "scratch");
    const outputPath = resolve(scratchDirectory, `${section}-details.rsc.txt`);
    await mkdir(scratchDirectory, { recursive: true });
    await writeFile(outputPath, stream, { encoding: "utf8", flag: "w" });

    process.stdout.write(
      [
        "LinkedIn detail-page compatibility check succeeded.",
        `Section: ${section}`,
        `RSC records: ${records.size}`,
        `Private output: ${outputPath}`,
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

function parseArguments(argv: string[]): { url: string; section: DetailSection } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) usage();
    values.set(key.slice(2), value);
  }
  const url = values.get("url");
  const section = values.get("section");
  if (!url || !section || values.size !== 2 || !isDetailSection(section)) usage();
  return { url, section };
}

function isDetailSection(value: string): value is DetailSection {
  return (SECTIONS as readonly string[]).includes(value);
}

function usage(): never {
  throw new Error(
    "Usage: npm run replay:detail -- --url <LinkedIn profile URL> --section <experience|education|certifications|skills|languages>"
  );
}
