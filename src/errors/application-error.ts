export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
