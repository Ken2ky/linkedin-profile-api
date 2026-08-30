import "fastify";
import type { AppConfig } from "../config.js";
import type { ProfileExtractor } from "../services/profile-service.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    profileExtractor: ProfileExtractor;
  }
}
