import { loadConfig } from "../config.js";
import { summarizeSessionConfig } from "../linkedin/session-config.js";

const summary = summarizeSessionConfig(loadConfig().linkedin);

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (
  !summary.hasLiAt ||
  !summary.hasJsessionId ||
  !summary.jsessionIdIsQuoted ||
  !summary.csrfMatchesJsessionId
) {
  process.stderr.write(
    "Session configuration is malformed. No cookie or token values were printed.\n"
  );
  process.exitCode = 1;
}
