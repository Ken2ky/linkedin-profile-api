import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hasLinkedInSession, loadConfig } from "../config.js";
import { ApplicationError } from "../errors/application-error.js";
import { LinkedInClient } from "../linkedin/client.js";
import { parseLinkedInProfileUrl } from "../linkedin/profile-url.js";
import { ProfileService } from "../services/profile-service.js";

await main();

async function main(): Promise<void> {
  try {
    const url = parseArguments(process.argv.slice(2));
    const config = loadConfig();
    if (!hasLinkedInSession(config.linkedin)) {
      throw new Error("LINKEDIN_COOKIE and LINKEDIN_CSRF_TOKEN must be set in .env");
    }

    const profile = parseLinkedInProfileUrl(url);
    const service = new ProfileService(new LinkedInClient(config.linkedin));
    const result = await service.extract(profile);
    const scratchDirectory = resolve(process.cwd(), "scratch");
    const outputPath = resolve(scratchDirectory, "profile-response.json");
    await mkdir(scratchDirectory, { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, {
      encoding: "utf8",
      flag: "w"
    });

    process.stdout.write(
      [
        "LinkedIn profile extraction succeeded.",
        `Profile: ${profile.canonicalUrl}`,
        `Experience: ${result.profile.experience.length}`,
        `Education: ${result.profile.education.length}`,
        `Certifications: ${result.profile.certifications.length}`,
        `Skills: ${result.profile.skills.length}`,
        `Languages: ${result.profile.languages.length}`,
        `Partial: ${result.meta.partial}`,
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

function parseArguments(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--url" || !argv[1]) {
    throw new Error(
      "Usage: npm run extract:profile -- --url <LinkedIn profile URL>"
    );
  }
  return argv[1];
}
