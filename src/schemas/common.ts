import { Type } from "@fastify/type-provider-typebox";

export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String())
  })
});

export const HealthResponseSchema = Type.Object({
  status: Type.Literal("ok"),
  version: Type.String()
});

export const ReadyResponseSchema = Type.Object({
  status: Type.Union([Type.Literal("ready"), Type.Literal("not_ready")]),
  configuration: Type.Object({
    linkedinSession: Type.Boolean()
  })
});
