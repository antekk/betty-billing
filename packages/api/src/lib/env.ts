import { z } from "zod";

import { createLogger } from "@/lib/logger";

const log = createLogger({ module: "env" });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  ENCRYPTION_KEY: z.string().length(64),
  SMS_PROVIDER: z.enum(["mock", "twilio"]).default("mock"),
  // Twilio (optional for v1)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      log.error({ errors: result.error.flatten().fieldErrors }, "Invalid environment variables");
      throw new Error("Invalid environment variables");
    }
    _env = result.data;
  }
  return _env;
}
