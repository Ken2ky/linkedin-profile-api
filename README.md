# LinkedIn Profile API

A TypeScript/Fastify service that accepts a LinkedIn profile URL and returns available profile data as normalized JSON. Authentication stays on the backend through a private LinkedIn browser session.

## Features

- Name, headline, location, about, profile image, and background image.
- Full experience, education, certifications, and skills when LinkedIn exposes them.
- Languages with proficiency when available.
- Per-section completion metadata instead of silently treating extraction failures as empty data.
- Bounded process-wide cache for normalized profiles that completed without failed sections.
- Process-wide quota for real LinkedIn extraction attempts; cache hits remain available.
- Strict LinkedIn URL validation, request timeouts, response-size limits, rate limiting, and secret-redacted logs.
- OpenAPI documentation through Swagger UI.
- Docker image and GitHub Actions CI configuration.

## Tech stack

- Node.js 24 and TypeScript 6
- Fastify 5 and TypeBox
- Native `fetch` and Cheerio
- Custom React Server Component/SDUI decoder and parsers
- Vitest, ESLint, and Prettier

## Requirements

- Node.js 24 LTS
- npm 11 or later
- A valid LinkedIn browser session for live extraction

## Local setup

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

On macOS or Linux, use `cp .env.example .env`. If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

Configure these private values in `.env`:

```env
LINKEDIN_COOKIE='li_at=...; JSESSIONID="ajax:..."'
LINKEDIN_CSRF_TOKEN=ajax:...
```

`LINKEDIN_CSRF_TOKEN` must equal the inner `JSESSIONID` value without quotes. Never commit `.env`, cookies, HAR files, or raw authenticated responses.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `HOST` | No | `0.0.0.0` | HTTP bind address |
| `PORT` | No | `3000` | HTTP port; hosting platforms may provide it |
| `LOG_LEVEL` | No | `info` | Fastify/Pino log level |
| `TRUST_PROXY` | No | `false` | Set `true` only behind a trusted reverse proxy so client-IP rate limiting works |
| `PROFILE_RATE_LIMIT_MAX` | No | `3` | Profile calls allowed per client IP and window |
| `PROFILE_RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window in milliseconds |
| `PROFILE_CACHE_TTL_MS` | No | `900000` | Fresh profile-cache lifetime in milliseconds |
| `PROFILE_CACHE_MAX_ENTRIES` | No | `50` | Maximum normalized profiles retained in memory |
| `GLOBAL_EXTRACTION_LIMIT_MAX` | No | `6` | Real LinkedIn extraction attempts allowed server-wide per window |
| `GLOBAL_EXTRACTION_LIMIT_WINDOW_MS` | No | `60000` | Server-wide extraction-limit window in milliseconds |
| `LINKEDIN_COOKIE` | Production | — | Cookie header containing `li_at` and `JSESSIONID` |
| `LINKEDIN_CSRF_TOKEN` | Production | — | Inner `JSESSIONID`/CSRF value |
| `LINKEDIN_REQUEST_TIMEOUT_MS` | No | `30000` | Deadline for each LinkedIn request |

The code supports additional captured compatibility headers, but they are intentionally omitted because they are not proven requirements.

## Run and verify

Run all checks without contacting LinkedIn:

```powershell
npm run check
```

This runs linting, strict type checking, 69 tests, and a production build. Then validate the configured session shape:

```powershell
npm run check:session
```

Start the development server:

```powershell
npm run dev
```

For the production-style runtime:

```powershell
npm run build
npm start
```

Verify the service in another terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/ready
```

`/health` checks the process. `/ready` returns HTTP 200 only when the required LinkedIn session configuration is present. Swagger UI is available at `http://localhost:3000/docs/`.

## API

### `POST /api/profile`

Request:

```json
{
  "url": "https://www.linkedin.com/in/example-user/"
}
```

PowerShell example:

```powershell
$body = @{ url = "https://www.linkedin.com/in/example-user/" } | ConvertTo-Json
$response = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/profile" `
  -ContentType "application/json" `
  -Body $body

$response | ConvertTo-Json -Depth 20
```

Example response shape:

```json
{
  "profile": {
    "profileUrl": "https://www.linkedin.com/in/example-user/",
    "name": "Example Person",
    "headline": "Software Engineer",
    "location": "Bengaluru, Karnataka, India",
    "about": null,
    "profileImages": {
      "profile": "https://media.licdn.com/dms/image/v2/...",
      "background": null
    },
    "experience": [
      {
        "title": "Software Engineer",
        "company": "Example Company",
        "employmentType": "Full-time",
        "companyLine": "Example Company · Full-time",
        "dateRange": "Jan 2024 - Present",
        "duration": "2 yrs",
        "dateLine": "Jan 2024 - Present · 2 yrs",
        "location": "Bengaluru, Karnataka, India",
        "workplaceType": null,
        "description": null,
        "associatedSkills": ["TypeScript"]
      }
    ],
    "education": [],
    "skills": [],
    "certifications": [],
    "languages": []
  },
  "meta": {
    "partial": true,
    "extractedAt": "2026-08-30T00:00:00.000Z",
    "cache": {
      "status": "miss",
      "ageSeconds": 0
    },
    "sections": {
      "topCard": { "status": "complete" },
      "about": { "status": "unavailable", "reason": "NOT_AVAILABLE" },
      "experience": { "status": "complete" }
    }
  }
}
```

Section status can be `complete`, `partial`, `unavailable`, or `failed`. Consumers should inspect `meta.partial` and `meta.sections`; an empty array can mean a genuinely empty section, while a failed section includes a reason.

`meta.cache.status` is `miss` when LinkedIn was contacted and `hit` when a fresh process-wide cache entry was returned. Cache entries are keyed by canonical profile URL, shared by all callers of one running instance, and are not stored when any section has `failed`. The cache is bounded and disappears on process restart, redeploy, or Render free-tier sleep.

Image URLs may contain `\u0026` in raw JSON, which is the valid JSON escape for `&`. Parse the response as JSON before using an image URL. LinkedIn image URLs are temporary and should not be stored indefinitely.

### Other endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process liveness |
| `GET` | `/ready` | Required configuration readiness |
| `GET` | `/docs/` | Swagger UI |

### Error format

```json
{
  "error": {
    "code": "INVALID_PROFILE_URL",
    "message": "A valid LinkedIn profile URL is required.",
    "requestId": "req-1"
  }
}
```

| HTTP | Typical codes | Meaning |
| --- | --- | --- |
| `400` | `INVALID_REQUEST`, `INVALID_PROFILE_URL` | Invalid body or URL |
| `404` | `PROFILE_NOT_FOUND` | LinkedIn reported no profile |
| `429` | `RATE_LIMITED`, `SERVICE_BUSY`, `GLOBAL_EXTRACTION_LIMITED` | Client request limit, concurrent extraction, or server-wide upstream quota reached |
| `502` | `UPSTREAM_UNAVAILABLE`, `UPSTREAM_SCHEMA_CHANGED`, `UPSTREAM_RESPONSE_TOO_LARGE` | LinkedIn response could not be used |
| `503` | `UPSTREAM_SESSION_EXPIRED`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_CHECKPOINT` | Backend session or LinkedIn access problem |
| `504` | `UPSTREAM_TIMEOUT`, `EXTRACTION_TIMEOUT` | Upstream or full extraction deadline exceeded |

## Approach

1. Validate and canonicalize the supplied `/in/{vanityName}` URL.
2. Return a fresh normalized cache entry when one exists.
3. Enforce the process-wide extraction quota before contacting LinkedIn.
4. Fetch the authenticated profile HTML and extract its embedded RSC rehydration stream.
5. Decode line-oriented RSC records, resolve references, parse the top card, and resolve LinkedIn's internal profile ID.
6. Fetch Experience plus About and Languages component data.
7. Page through Education, Certifications, and Skills in groups of 10, capped at 10 pages per section.
8. Normalize fields, cache responses without failed sections, and return successful sections even when an optional section is unavailable.

Upstream calls are sequential, have no automatic HTTP retries, and share a 60-second extraction deadline. Only one profile extraction runs per process at a time to reduce pressure on the configured LinkedIn session. The default global quota permits six actual extraction attempts per minute; failed attempts count, while cache hits, invalid requests, and busy responses do not. The in-memory quota resets when the process restarts.

## Docker and deployment

Build and run locally after starting Docker Desktop:

```powershell
docker build -t linkedin-profile-api .
docker run --rm --env-file .env -e NODE_ENV=production -p 3000:3000 linkedin-profile-api
```

For a public HTTPS deployment:

1. Deploy the included `Dockerfile` on a container hosting service.
2. Store `LINKEDIN_COOKIE` and `LINKEDIN_CSRF_TOKEN` in the platform's secret manager, never in the image or repository.
3. Set `NODE_ENV=production` and set `TRUST_PROXY=true` only if the service is behind the platform's trusted reverse proxy.
4. Configure the platform health check as `/health` and confirm `/ready` returns HTTP 200.
5. Test one `POST /api/profile` request against the assigned HTTPS URL.

### Recommended Render deployment

The included `render.yaml` creates a Docker web service in Singapore, configures `/health`, and prompts for the two LinkedIn secrets without storing their values in Git:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint and select the repository.
3. Enter `LINKEDIN_COOKIE` and `LINKEDIN_CSRF_TOKEN` when prompted.
4. Wait for the deploy, then verify `https://<service>.onrender.com/ready` and `/docs/`.
5. Use `https://<service>.onrender.com` as the public API base URL.

The Blueprint defaults to Render's free plan to avoid accidental charges. Free web services sleep after 15 idle minutes and can take about one minute to wake; use a paid instance when consistent response time matters.

The GitHub Actions workflow runs `npm ci` and `npm run check` for pushes and pull requests.

## Known limitations

- LinkedIn's web endpoints, component identifiers, payloads, and response formats are undocumented and can change without notice.
- Session cookies expire, may trigger checkpoints, and require manual rotation.
- LinkedIn may rate-limit or reject requests from cloud-hosting IP addresses.
- Extraction availability depends on profile visibility and the authenticated account's access.
- Education, Certifications, and Skills are capped at 100 items per section.
- Languages may be marked partial when LinkedIn exposes only a profile-card preview.
- A cache miss can take several seconds because upstream requests are sequential; fresh cache hits return without contacting LinkedIn.
- The cache is in-memory and per process, so it is cleared by restarts, redeploys, and free-tier sleep and is not shared across multiple replicas.
- Rate limiting and the single-extraction guard are in-memory and apply per process; multiple replicas need shared coordination for stronger guarantees.
- Image URLs are externally hosted and temporary.
- This is an unofficial integration that relies on undocumented LinkedIn web behavior. Review LinkedIn's terms and applicable privacy requirements before any production use.

## Private diagnostics

For parser debugging, authenticated replay commands write data under Git-ignored `scratch/`:

```powershell
npm run replay:experience -- --url "https://www.linkedin.com/in/example-user/"
npm run replay:detail -- --url "https://www.linkedin.com/in/example-user/" --section skills
npm run extract:profile -- --url "https://www.linkedin.com/in/example-user/"
```

Do not commit `scratch/`, `.env`, HAR files, cookies, or raw profile responses.
