import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { TypeBoxValidatorCompiler } from "@fastify/type-provider-typebox";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { LogController } from "fastify";
import type { AppConfig } from "./config.js";
import { ApplicationError } from "./errors/application-error.js";
import { healthRoutes } from "./routes/health.js";
import { profileRoutes } from "./routes/profile.js";
import { LinkedInClient } from "./linkedin/client.js";
import {
  ProfileService,
  type ProfileExtractor
} from "./services/profile-service.js";

export interface AppDependencies {
  profileExtractor?: ProfileExtractor;
}

export async function buildApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.csrf-token",
          "request.headers.cookie",
          "request.headers.csrf-token"
        ],
        censor: "[REDACTED]"
      }
    },
    bodyLimit: 16 * 1024,
    requestIdHeader: "x-request-id",
    logController: new LogController({
      disableRequestLogging: config.nodeEnv === "test"
    })
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.setValidatorCompiler(TypeBoxValidatorCompiler);
  app.decorate("config", config);
  app.decorate(
    "profileExtractor",
    dependencies.profileExtractor ??
      new ProfileService(new LinkedInClient(config.linkedin), {
        cacheTtlMs: config.profileCache.ttlMs,
        cacheMaxEntries: config.profileCache.maxEntries,
        globalExtractionLimitMax: config.globalExtractionLimit.max,
        globalExtractionLimitWindowMs: config.globalExtractionLimit.timeWindowMs
      })
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApplicationError) {
      if (error.retryAfterSeconds !== undefined) {
        reply.header("retry-after", String(error.retryAfterSeconds));
      }
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id
        }
      });
    }

    if (hasValidationErrors(error)) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "The request body is invalid.",
          requestId: request.id
        }
      });
    }

    if (hasStatusCode(error, 429)) {
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "The profile API rate limit has been exceeded.",
          requestId: request.id
        }
      });
    }

    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: request.id
      }
    });
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "LinkedIn Profile API",
        version: "0.1.0"
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(rateLimit, { global: true, max: 60, timeWindow: "1 minute" });
  await app.register(healthRoutes);
  await app.register(profileRoutes);

  return app;
}

function hasValidationErrors(error: unknown): error is { validation: unknown } {
  return typeof error === "object" && error !== null && "validation" in error;
}

function hasStatusCode(
  error: unknown,
  statusCode: number
): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}
