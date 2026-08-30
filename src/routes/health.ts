import type { FastifyPluginCallbackTypebox } from "@fastify/type-provider-typebox";
import { hasLinkedInSession } from "../config.js";
import { HealthResponseSchema, ReadyResponseSchema } from "../schemas/common.js";

export const healthRoutes: FastifyPluginCallbackTypebox = (app, _options, done) => {
  app.get(
    "/health",
    { schema: { response: { 200: HealthResponseSchema } } },
    () => ({ status: "ok" as const, version: "0.1.0" })
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: ReadyResponseSchema,
          503: ReadyResponseSchema
        }
      }
    },
    (_request, reply) => {
      const readiness = {
        linkedinSession: hasLinkedInSession(app.config.linkedin)
      };
      const ready = readiness.linkedinSession;
      reply.code(ready ? 200 : 503).send({
        status: ready ? "ready" : "not_ready",
        configuration: readiness
      });
    }
  );

  done();
};
