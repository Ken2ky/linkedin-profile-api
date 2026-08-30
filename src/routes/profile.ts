import type { FastifyPluginCallbackTypebox } from "@fastify/type-provider-typebox";
import { parseLinkedInProfileUrl } from "../linkedin/profile-url.js";
import { ErrorResponseSchema } from "../schemas/common.js";
import { ProfileRequestSchema, ProfileResponseSchema } from "../schemas/profile.js";

export const profileRoutes: FastifyPluginCallbackTypebox = (app, _options, done) => {
  app.post(
    "/api/profile",
    {
      config: {
        rateLimit: {
          max: app.config.profileRateLimit.max,
          timeWindow: app.config.profileRateLimit.timeWindowMs
        }
      },
      schema: {
        body: ProfileRequestSchema,
        response: {
          200: ProfileResponseSchema,
          400: ErrorResponseSchema,
          429: ErrorResponseSchema,
          502: ErrorResponseSchema,
          503: ErrorResponseSchema,
          504: ErrorResponseSchema
        }
      }
    },
    async (request) => {
      const profile = parseLinkedInProfileUrl(request.body.url);
      return app.profileExtractor.extract(profile);
    }
  );

  done();
};
