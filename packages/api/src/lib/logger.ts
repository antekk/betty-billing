import pino from "pino";

/**
 * Structured logger for Betty Billing.
 *
 * In production (GCP Cloud Run), outputs JSON that Cloud Logging
 * automatically parses for structured search and filtering.
 *
 * In development, outputs JSON to stdout (use `pino-pretty` for
 * human-readable output: `bun run dev | npx pino-pretty`).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

/**
 * Create a child logger with bound context fields.
 * Use for request-scoped or module-scoped logging.
 *
 * @example
 * const log = createLogger({ module: "batch" });
 * log.info({ claimCount: 5 }, "Processing batch");
 */
export function createLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
